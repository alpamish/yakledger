// Sequence-based business numbers for the contractor financial subsystem:
// CLM-00001, PAY-00001, ADV-00001. Same pattern as contract numbers — issued
// from the shared `Sequence` table inside the caller's transaction so a
// number is never reused.
import type { Prisma } from "@prisma/client";

interface NumberSpec {
  prefix: string;
  sequenceName: string;
  /** Model delegate key on the tx client, e.g. "contractorClaim". */
  modelKey: string;
  /** Column holding the number, e.g. "claimNumber". */
  column: string;
}

const PAD = 5;

export const CLAIM_NUMBER: NumberSpec = {
  prefix: "CLM",
  sequenceName: "claimNumber",
  modelKey: "contractorClaim",
  column: "claimNumber",
};

export const PAYMENT_NUMBER: NumberSpec = {
  prefix: "PAY",
  sequenceName: "paymentNumber",
  modelKey: "contractorPayment",
  column: "paymentNumber",
};

export const ADVANCE_NUMBER: NumberSpec = {
  prefix: "ADV",
  sequenceName: "advanceNumber",
  modelKey: "contractorAdvance",
  column: "advanceNumber",
};

export const AUTHORIZATION_NUMBER: NumberSpec = {
  prefix: "AUTH",
  sequenceName: "authorizationNumber",
  modelKey: "paymentAuthorization",
  column: "authorizationNumber",
};

export function formatBusinessNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(PAD, "0")}`;
}

/** Next business number, computed inside the caller's transaction. */
export async function generateBusinessNumber(
  tx: Prisma.TransactionClient,
  spec: NumberSpec
): Promise<string> {
  const existing = await tx.sequence.findUnique({
    where: { name: spec.sequenceName },
  });

  if (existing) {
    const updated = await tx.sequence.update({
      where: { name: spec.sequenceName },
      data: { value: { increment: 1 } },
    });
    return formatBusinessNumber(spec.prefix, updated.value);
  }

  // Seed from the highest existing number (backfill safety).
  const delegate = tx[spec.modelKey as keyof Prisma.TransactionClient] as {
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
  const last = await delegate.findFirst({
    orderBy: { [spec.column]: "desc" },
    select: { [spec.column]: true },
  });

  let next = 1;
  const lastNumber = last?.[spec.column] as string | undefined;
  if (lastNumber) {
    const match = lastNumber.match(new RegExp(`^${spec.prefix}-(\\d+)$`));
    if (match) next = parseInt(match[1], 10) + 1;
  }

  await tx.sequence.create({
    data: { name: spec.sequenceName, value: next },
  });
  return formatBusinessNumber(spec.prefix, next);
}
