import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";
import { companyWalletService } from "@/services/company-wallet.service";
import { resolveApprovalStatusOnCreate, APPROVED } from "@/lib/access-control";

// Per-record schema mirrors the single-create schema in /api/expenses/route.ts
const bulkExpenseRecordSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().max(2000, "Description too long").optional().nullable(),
  category: z.enum([
    "FUEL",
    "SALARY",
    "MAINTENANCE",
    "TRANSPORTATION",
    "MACHINERY",
    "MACHINERY_TRANSPORTATION",
    "FOOD",
    "MATERIALS",
    "EQUIPMENT_RENTAL",
    "OFFICE_EXPENSE",
    "REWARD",
    "BONUS",
    "MEDICATION",
    "MISCELLANEOUS",
  ]),
  amount: z.number().positive("Amount must be positive").max(999_999_999, "Amount too large"),
  paymentMethod: z.enum([
    "CASH",
    "BANK_TRANSFER",
    "CHECK",
    "CREDIT_CARD",
    "DEBIT_CARD",
    "MOBILE_PAYMENT",
    "OTHER",
  ]),
  paidTo: z.string().min(1, "Paid to is required").max(200, "Paid to too long"),
  paidBy: z.string().min(1, "Paid by is required").max(200, "Paid by too long"),
  expenseDate: z.string().min(1, "Expense date is required"),
  attachment: z.string().max(500).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000, "Notes too long").optional().nullable(),
  currency: z.string().max(10).optional().default("AFN"),
  paidById: z.string().max(100).optional().nullable(),
  paidToId: z.string().max(100).optional().nullable(),
  paidToContractorId: z.string().max(100).optional().nullable(),
  paidByContractorId: z.string().max(100).optional().nullable(),
  walletId: z.string().max(100).optional().nullable(),
  deductFromWallet: z.boolean().optional().default(true),
}).refine(
  (data) => data.walletId || data.paidById,
  { message: "Select either a company wallet or a paying employee." }
);

const bulkCreateSchema = z.object({
  records: z.array(bulkExpenseRecordSchema).min(1, "At least one record is required").max(200, "Too many records"),
});

function parseExpenseDate(value: string): Date {
  if (!isNaN(Number(value))) {
    return new Date(Number(value));
  }
  return new Date(value);
}

// POST /api/expenses/bulk - Create multiple expenses at once
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "expenses:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = bulkCreateSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const { records } = parsed.data;

    // Company wallet and employee-wallet deductions are mutually exclusive.
    for (const record of records) {
      if (record.walletId && record.deductFromWallet !== false) {
        return NextResponse.json(
          {
            success: false,
            error: "Select either a company wallet or an employee wallet deduction, not both.",
          },
          { status: 400 }
        );
      }
    }

    const includes = {
      creator: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
        },
      },
      paidToEmployee: {
        select: {
          id: true,
          fullName: true,
          jobTitle: true,
          department: true,
        },
      },
      paidToContractor: {
        select: {
          id: true,
          contractorName: true,
          fatherName: true,
          contractorType: true,
        },
      },
    } as const;

    const approvalStatus = resolveApprovalStatusOnCreate(user);
    const approvedById = approvalStatus === APPROVED ? user.id : null;
    const approvedAt = approvalStatus === APPROVED ? new Date() : null;

    const created = await db.$transaction(async (tx) => {
      const results: Array<{ id: string }> = [];

      for (const record of records) {
        const expense = await tx.expense.create({
          data: {
            title: record.title,
            description: record.description ?? null,
            category: record.category,
            amount: record.amount,
            paymentMethod: record.paymentMethod,
            paidTo: record.paidTo,
            paidBy: record.paidBy,
            expenseDate: parseExpenseDate(record.expenseDate),
            attachment: record.attachment ?? null,
            tags: record.tags ?? null,
            notes: record.notes ?? null,
            currency: record.currency,
            paidById: record.paidById ?? null,
            paidToId: record.paidToId ?? null,
            paidToContractorId: record.paidToContractorId ?? null,
            paidByContractorId: record.paidByContractorId ?? null,
            walletId: record.walletId ?? null,
            deductFromWallet: record.deductFromWallet,
            createdBy: user.id,
            approvalStatus,
            approvedById,
            approvedAt,
          },
          include: includes,
        });

        await tx.auditLog.create({
          data: {
            action: "CREATE",
            entity: "Expense",
            entityId: expense.id,
            details: `Created expense: ${expense.title} ($${expense.amount})`,
            userId: user.id,
          },
        });

        // Deduct approved expenses from the selected company wallet, atomically
        // with the expense creation.
        if (approvalStatus === APPROVED && record.walletId) {
          await companyWalletService.deductForExpense(
            tx,
            record.walletId,
            record.amount,
            user.id,
            expense.id,
            `Expense: ${expense.title}`
          );
        }

        results.push(expense);
      }

      return results;
    });

    // Refresh paying employees' wallet balances to reflect the new expenses.
    if (approvalStatus === APPROVED) {
      const seen = new Set<string>();
      for (const record of records) {
        if (record.paidById && record.deductFromWallet !== false && !seen.has(record.paidById)) {
          seen.add(record.paidById);
          try {
            await walletService.reconcileForExpense(record.paidById);
          } catch (walletErr) {
            console.warn("Wallet reconcile failed:", walletErr);
          }
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: { created: created.length, records: created },
        message: `${created.length} expense${created.length > 1 ? "s" : ""} created successfully`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Bulk create expenses error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create expenses" },
      { status: 500 }
    );
  }
}
