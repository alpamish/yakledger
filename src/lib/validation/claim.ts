// Shared Zod schemas for the claim subsystem (Phase 4).
import { z } from "zod";

export const CLAIM_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "VERIFIED",
  "FINANCE_REVIEW",
  "APPROVED",
  "POSTED",
  "PARTIALLY_PAID",
  "PAID",
  "REJECTED",
  "VOID",
] as const;
export type ClaimStatusValue = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_LABELS: Record<ClaimStatusValue, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  VERIFIED: "Verified",
  FINANCE_REVIEW: "Finance Review",
  APPROVED: "Approved",
  POSTED: "Posted",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  REJECTED: "Rejected",
  VOID: "Void",
};

export const CLAIM_DEDUCTION_TYPES = [
  "FUEL",
  "PENALTY",
  "MATERIALS",
  "ACCOMMODATION",
  "FOOD",
  "TRANSPORT",
  "TAX",
  "OTHER",
] as const;
export type ClaimDeductionTypeValue = (typeof CLAIM_DEDUCTION_TYPES)[number];

const dateString = z
  .string()
  .min(1, "Date is required")
  .transform((s) => new Date(s))
  .refine((d) => !isNaN(d.getTime()), "Invalid date");

/** Draft-only edits: title/period/notes. Money fields are derived. */
export const updateClaimSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  periodStart: dateString.optional(),
  periodEnd: dateString.optional(),
  notes: z.string().max(5000).nullish(),
});

export type UpdateClaimInput = z.infer<typeof updateClaimSchema>;
