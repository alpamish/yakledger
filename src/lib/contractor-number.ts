/**
 * Contractor ID (contract number) helpers.
 *
 * Contractors get a unique, human-readable ID in the form `CTR-00001`,
 * mirroring the `Employee.employeeNumber` (e.g. `EMP-00042`) convention.
 *
 * Numbers are issued from a monotonically-increasing `Sequence` row so a
 * number is never reused, even after a contractor is deleted. If the sequence
 * has not been seeded yet (e.g. after a backfill of pre-existing contractors),
 * it is seeded from the highest existing contractor number + 1.
 */
import type { Prisma } from "@prisma/client";

export const CONTRACTOR_NUMBER_PREFIX = "CTR";
export const CONTRACTOR_SEQUENCE_NAME = "contractorNumber";
const PAD = 5;
const PATTERN = /^CTR-(\d+)$/;

export function formatContractorNumber(seq: number): string {
  return `${CONTRACTOR_NUMBER_PREFIX}-${String(seq).padStart(PAD, "0")}`;
}

/**
 * Compute the next contractor number inside a transaction.
 * Safe against concurrent-ish creates because it is called within a
 * `db.$transaction` (serialized for SQLite).
 */
export async function generateContractorNumber(
  tx: Pick<Prisma.TransactionClient, "contractor" | "sequence">
): Promise<string> {
  const existing = await tx.sequence.findUnique({
    where: { name: CONTRACTOR_SEQUENCE_NAME },
  });

  if (existing) {
    const updated = await tx.sequence.update({
      where: { name: CONTRACTOR_SEQUENCE_NAME },
      data: { value: { increment: 1 } },
    });
    return formatContractorNumber(updated.value);
  }

  // Seed the sequence from the highest existing contractor number.
  const last = await tx.contractor.findFirst({
    where: { contractorNumber: { not: null } },
    orderBy: { contractorNumber: "desc" },
    select: { contractorNumber: true },
  });

  let next = 1;
  if (last?.contractorNumber) {
    const match = last.contractorNumber.match(PATTERN);
    if (match) next = parseInt(match[1], 10) + 1;
  }

  await tx.sequence.create({
    data: { name: CONTRACTOR_SEQUENCE_NAME, value: next },
  });
  return formatContractorNumber(next);
}

/** Extract the numeric suffix of a contractor number, or null if unparseable. */
export function parseContractorNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(PATTERN);
  return match ? parseInt(match[1], 10) : null;
}
