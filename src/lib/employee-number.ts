/**
 * Employee number helpers.
 *
 * Employees get a unique, human-readable ID in the form `EMP-001`,
 * mirroring the `Contractor.contractorNumber` (e.g. `CTR-00001`) convention.
 *
 * Numbers are issued from a monotonically-increasing `Sequence` row so a
 * number is never reused, even after an employee is deleted. If the sequence
 * has not been seeded yet (e.g. after a backfill of pre-existing employees),
 * it is seeded from the highest existing employee number + 1.
 */
import type { Prisma } from "@prisma/client";

export const EMPLOYEE_NUMBER_PREFIX = "EMP";
export const EMPLOYEE_SEQUENCE_NAME = "employeeNumber";
const PAD = 3;
const PATTERN = /^EMP-(\d+)$/;

export function formatEmployeeNumber(seq: number): string {
  return `${EMPLOYEE_NUMBER_PREFIX}-${String(seq).padStart(PAD, "0")}`;
}

/**
 * Compute the next employee number inside a transaction.
 * Safe against concurrent creates because it is called within a
 * `db.$transaction` (serialized for SQLite).
 */
export async function generateEmployeeNumber(
  tx: Pick<Prisma.TransactionClient, "employee" | "sequence">
): Promise<string> {
  const existing = await tx.sequence.findUnique({
    where: { name: EMPLOYEE_SEQUENCE_NAME },
  });

  if (existing) {
    const updated = await tx.sequence.update({
      where: { name: EMPLOYEE_SEQUENCE_NAME },
      data: { value: { increment: 1 } },
    });
    return formatEmployeeNumber(updated.value);
  }

  // Seed the sequence from the highest existing employee number.
  const last = await tx.employee.findFirst({
    where: { employeeNumber: { not: null } },
    orderBy: { employeeNumber: "desc" },
    select: { employeeNumber: true },
  });

  let next = 1;
  if (last?.employeeNumber) {
    const match = last.employeeNumber.match(PATTERN);
    if (match) next = parseInt(match[1], 10) + 1;
  }

  await tx.sequence.create({
    data: { name: EMPLOYEE_SEQUENCE_NAME, value: next },
  });
  return formatEmployeeNumber(next);
}

/** Extract the numeric suffix of an employee number, or null if unparseable. */
export function parseEmployeeNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(PATTERN);
  return match ? parseInt(match[1], 10) : null;
}
