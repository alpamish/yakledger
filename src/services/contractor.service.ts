// Shared server-side helpers for the contractor module.
// Kept free of request/auth concerns so routes and tests can both use it.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type DbClient = Prisma.TransactionClient | typeof db;

// Counts that mark a contractor as having operational/financial history.
// Deleting a contractor cascade-deletes timesheets, fuel usages, and machinery
// (and unlinks expenses/fuel transactions), so any non-zero count means the
// contractor must be archived instead of hard-deleted.
// Phase 4/5 financial rows (contracts, claims, advances, payments, ledger
// entries) are Restrict-onDelete — hard-deleting over them would throw — so
// they count as history too (plan §2.5: archive when ANY history exists).
const HISTORY_COUNT_SELECT = {
  timesheets: true,
  fuelUsages: true,
  machinery: true,
  fuelTransactions: true,
  expensesPaidTo: true,
  expensesPaidBy: true,
  contracts: true,
  claims: true,
  advances: true,
  payments: true,
  ledgerEntries: true,
} as const;

export interface ContractorHistoryCounts {
  timesheets: number;
  fuelUsages: number;
  machinery: number;
  fuelTransactions: number;
  expensesPaidTo: number;
  expensesPaidBy: number;
  contracts: number;
  claims: number;
  advances: number;
  payments: number;
  ledgerEntries: number;
}

export function totalHistory(counts: ContractorHistoryCounts): number {
  return (
    counts.timesheets +
    counts.fuelUsages +
    counts.machinery +
    counts.fuelTransactions +
    counts.expensesPaidTo +
    counts.expensesPaidBy +
    counts.contracts +
    counts.claims +
    counts.advances +
    counts.payments +
    counts.ledgerEntries
  );
}

export async function getContractorHistoryCounts(
  client: DbClient,
  contractorId: string
): Promise<ContractorHistoryCounts> {
  const contractor = await client.contractor.findUnique({
    where: { id: contractorId },
    select: { _count: { select: HISTORY_COUNT_SELECT } },
  });
  return contractor?._count ?? {
    timesheets: 0,
    fuelUsages: 0,
    machinery: 0,
    fuelTransactions: 0,
    expensesPaidTo: 0,
    expensesPaidBy: 0,
    contracts: 0,
    claims: 0,
    advances: 0,
    payments: 0,
    ledgerEntries: 0,
  };
}

export type ContractorDeleteOutcome =
  | { outcome: "DELETED" }
  | { outcome: "ARCHIVED"; history: ContractorHistoryCounts };

/**
 * Archive-or-delete semantics: a contractor with any operational or financial
 * history is archived (status=ARCHIVED) so history is preserved; only a truly
 * clean contractor is hard-deleted. Caller is responsible for permission
 * checks, scoping, and the audit log; this function only performs the
 * status change / deletion inside the given client (transaction).
 */
export async function archiveOrDeleteContractor(
  client: DbClient,
  contractorId: string
): Promise<ContractorDeleteOutcome> {
  const history = await getContractorHistoryCounts(client, contractorId);
  if (totalHistory(history) > 0) {
    await client.contractor.update({
      where: { id: contractorId },
      data: { status: "ARCHIVED" },
    });
    return { outcome: "ARCHIVED", history };
  }
  await client.contractor.delete({ where: { id: contractorId } });
  return { outcome: "DELETED" };
}
