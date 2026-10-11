/**
 * Contract number helpers — `CON-00001`, issued from the shared `Sequence`
 * table (same pattern as contractor numbers, so a number is never reused).
 */
import type { Prisma } from "@prisma/client";

export const CONTRACT_NUMBER_PREFIX = "CON";
export const CONTRACT_SEQUENCE_NAME = "contractNumber";
const PAD = 5;
const PATTERN = /^CON-(\d+)$/;

export function formatContractNumber(seq: number): string {
  return `${CONTRACT_NUMBER_PREFIX}-${String(seq).padStart(PAD, "0")}`;
}

/** Next contract number, computed inside the caller's transaction. */
export async function generateContractNumber(
  tx: Pick<Prisma.TransactionClient, "contractorContract" | "sequence">
): Promise<string> {
  const existing = await tx.sequence.findUnique({
    where: { name: CONTRACT_SEQUENCE_NAME },
  });

  if (existing) {
    const updated = await tx.sequence.update({
      where: { name: CONTRACT_SEQUENCE_NAME },
      data: { value: { increment: 1 } },
    });
    return formatContractNumber(updated.value);
  }

  // Seed from the highest existing contract number (backfill safety).
  const last = await tx.contractorContract.findFirst({
    orderBy: { contractNumber: "desc" },
    select: { contractNumber: true },
  });

  let next = 1;
  if (last?.contractNumber) {
    const match = last.contractNumber.match(PATTERN);
    if (match) next = parseInt(match[1], 10) + 1;
  }

  await tx.sequence.create({
    data: { name: CONTRACT_SEQUENCE_NAME, value: next },
  });
  return formatContractNumber(next);
}

/** Variation number, e.g. VAR-CON-00001-1 (contract-scoped, 1-based). */
export function formatVariationNumber(contractNumber: string, seq: number): string {
  return `VAR-${contractNumber}-${seq}`;
}
