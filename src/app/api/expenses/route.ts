import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { walletService } from "@/services/wallet.service";

// Schema for creating an expense
const createExpenseSchema = z.object({
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
});

// GET /api/expenses - Get all expenses with filtering, pagination, sorting
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "expenses:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);

    // Parse pagination params
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50"))
    );

    // Parse filter params
    const search = searchParams.get("search") || undefined;
    const searchField = searchParams.get("searchField") || undefined;
    // Support both "category" (repeated) and "categories" (comma-separated) formats
    const categoryValues = searchParams.getAll("category");
    const categoriesParam = searchParams.get("categories");
    const categories = categoryValues.length > 0
      ? categoryValues
      : categoriesParam
        ? categoriesParam.split(",").filter(Boolean)
        : undefined;
    const paymentMethodValues = searchParams.getAll("paymentMethod");
    const paymentMethodsParam = searchParams.get("paymentMethods");
    const paymentMethods = paymentMethodValues.length > 0
      ? paymentMethodValues
      : paymentMethodsParam
        ? paymentMethodsParam.split(",").filter(Boolean)
        : undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const amountMin = searchParams.get("amountMin")
      ? parseFloat(searchParams.get("amountMin")!)
      : undefined;
    const amountMax = searchParams.get("amountMax")
      ? parseFloat(searchParams.get("amountMax")!)
      : undefined;
    const paidBy = searchParams.get("paidBy") || undefined;
    const paidTo = searchParams.get("paidTo") || undefined;
    const paidById = searchParams.get("paidById") || undefined;
    const paidToId = searchParams.get("paidToId") || undefined;

    // Parse sorting params
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build dynamic where clause
    const where: Prisma.ExpenseWhereInput = {};

    if (search) {
      if (searchField && searchField !== "all" && ["title", "description", "paidTo", "paidBy", "notes"].includes(searchField)) {
        (where as Record<string, unknown>)[searchField] = { contains: search };
      } else {
        where.OR = [
          { title: { contains: search } },
          { description: { contains: search } },
          { paidTo: { contains: search } },
          { paidBy: { contains: search } },
          { notes: { contains: search } },
        ];
      }
    }

    if (categories && categories.length > 0) {
      where.category = { in: categories as Prisma.EnumCategoryFilter["in"] };
    }

    if (paymentMethods && paymentMethods.length > 0) {
      where.paymentMethod = {
        in: paymentMethods as Prisma.EnumPaymentMethodFilter["in"],
      };
    }

    if (dateFrom || dateTo) {
      where.expenseDate = {};
      if (dateFrom) {
        (where.expenseDate as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      }
      if (dateTo) {
        (where.expenseDate as Prisma.DateTimeFilter).lte = new Date(dateTo);
      }
    }

    if (amountMin !== undefined || amountMax !== undefined) {
      where.amount = {};
      if (amountMin !== undefined) {
        (where.amount as Prisma.FloatFilter).gte = amountMin;
      }
      if (amountMax !== undefined) {
        (where.amount as Prisma.FloatFilter).lte = amountMax;
      }
    }

    if (paidBy) {
      where.paidBy = { contains: paidBy };
    }

    if (paidTo) {
      where.paidTo = { contains: paidTo };
    }

    if (paidById) {
      where.paidById = paidById;
    }

    if (paidToId) {
      where.paidToId = paidToId;
    }

    // Validate sort field
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "title",
      "amount",
      "expenseDate",
      "category",
      "paymentMethod",
      "paidTo",
      "paidBy",
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = sortOrder === "asc" ? "asc" : "desc";

    // Execute queries
    const [expenses, total] = await Promise.all([
      db.expense.findMany({
        where,
        include: {
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
        },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.expense.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: {
        data: expenses,
        total,
        page,
        pageSize,
        totalPages,
      },
      headers: {
        "Cache-Control": "private, max-age=10, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Get expenses error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}

// POST /api/expenses - Create a new expense
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "expenses:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createExpenseSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Convert expenseDate: handle both timestamp strings and ISO date strings
    let expenseDate: Date;
    if (!isNaN(Number(data.expenseDate))) {
      expenseDate = new Date(Number(data.expenseDate));
    } else {
      expenseDate = new Date(data.expenseDate);
    }

    const expense = await db.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          title: data.title,
          description: data.description ?? null,
          category: data.category,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          paidTo: data.paidTo,
          paidBy: data.paidBy,
          expenseDate,
          attachment: data.attachment ?? null,
          tags: data.tags ?? null,
          notes: data.notes ?? null,
          currency: data.currency,
          paidById: data.paidById ?? null,
          paidToId: data.paidToId ?? null,
          paidToContractorId: data.paidToContractorId ?? null,
          paidByContractorId: data.paidByContractorId ?? null,
          createdBy: user.id,
        },
        include: {
          creator: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              avatar: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entity: "Expense",
          entityId: created.id,
          details: `Created expense: ${created.title} ($${created.amount})`,
          userId: user.id,
        },
      });

      return created;
    });

    // If expense is paid by an employee, auto-deduct from their wallet (best-effort)
    if (data.paidById) {
      try {
        await walletService.deductFromWallet(data.paidById, data.amount, user.id);
      } catch (walletErr) {
        console.warn("Wallet deduction failed (wallet may not exist yet):", walletErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: expense,
        message: "Expense created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create expense error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create expense" },
      { status: 500 }
    );
  }
}
