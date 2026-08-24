import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission } from "@/lib/permissions";

interface ApprovalItem {
  entity: string;
  id: string;
  summary: string;
  amount?: number;
  totalHours?: number;
  date?: string;
  status: string;
  approvalNote: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

const APPROVE_PERMISSIONS = [
  "expenses:approve",
  "timesheets:approve",
  "fuelUsage:approve",
  "cashAdvance:approve",
  "employees:approve",
  "assets:approve",
];

const MAX_PAGE_SIZE = 200;
const MAX_SKIP = 5000;

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

// GET /api/approvals?status=PENDING&entity=expense&page=1&pageSize=50
export async function GET(request: NextRequest) {
  try {
    const result = await requireAnyPermission(request, APPROVE_PERMISSIONS);
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PENDING";
    const entityFilter = searchParams.get("entity");
    const page = parsePositiveInt(searchParams.get("page"), 1, 1_000_000);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 50, MAX_PAGE_SIZE);
    const take = Math.min(page * pageSize, MAX_SKIP);

    const where = { approvalStatus: status } as const;

    const fetchExpenses = entityFilter && entityFilter !== "expense"
      ? Promise.resolve<{ rows: ApprovalItem[]; count: number }>({ rows: [], count: 0 })
      : Promise.all([
          db.expense.count({ where }),
          db.expense.findMany({
            where,
            include: { creator: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
            take,
          }),
        ]).then(([count, rows]) => ({
          count,
          rows: rows.map((r) => ({
            entity: "expense",
            id: r.id,
            summary: `${r.title} (${r.category})`,
            amount: r.amount,
            date: r.expenseDate.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          })),
        }));

    const fetchTimesheets = entityFilter && entityFilter !== "timesheet"
      ? Promise.resolve<{ rows: ApprovalItem[]; count: number }>({ rows: [], count: 0 })
      : Promise.all([
          db.timesheet.count({ where }),
          db.timesheet.findMany({
            where,
            include: {
              creator: { select: { id: true, name: true } },
              contractor: { select: { contractorName: true } },
              machinery: { select: { machineryName: true } },
            },
            orderBy: { createdAt: "asc" },
            take,
          }),
        ]).then(([count, rows]) => ({
          count,
          rows: rows.map((r) => ({
            entity: "timesheet",
            id: r.id,
            summary: `${r.contractor?.contractorName ?? "Contractor"} - ${r.machinery?.machineryName ?? "Machinery"}`,
            totalHours: r.totalHours,
            date: r.date.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          })),
        }));

    const fetchFuelUsage = entityFilter && entityFilter !== "fuelUsage"
      ? Promise.resolve<{ rows: ApprovalItem[]; count: number }>({ rows: [], count: 0 })
      : Promise.all([
          db.fuelUsage.count({ where }),
          db.fuelUsage.findMany({
            where,
            include: {
              creator: { select: { id: true, name: true } },
              contractor: { select: { contractorName: true } },
            },
            orderBy: { createdAt: "asc" },
            take,
          }),
        ]).then(([count, rows]) => ({
          count,
          rows: rows.map((r) => ({
            entity: "fuelUsage",
            id: r.id,
            summary: `${r.contractor?.contractorName ?? "Contractor"} - ${r.quantity}L ${r.fuelType}`,
            amount: r.totalCost,
            date: r.date.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          })),
        }));

    const fetchCashTransactions = entityFilter && entityFilter !== "cashTransaction"
      ? Promise.resolve<{ rows: ApprovalItem[]; count: number }>({ rows: [], count: 0 })
      : Promise.all([
          db.cashTransaction.count({ where }),
          db.cashTransaction.findMany({
            where,
            include: {
              creator: { select: { id: true, name: true } },
              employee: { select: { fullName: true } },
            },
            orderBy: { createdAt: "asc" },
            take,
          }),
        ]).then(([count, rows]) => ({
          count,
          rows: rows.map((r) => ({
            entity: "cashTransaction",
            id: r.id,
            summary: `${r.type} - ${r.employee?.fullName ?? "Employee"}`,
            amount: r.amount,
            date: r.createdAt.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          })),
        }));

    const fetchTransfers = entityFilter && entityFilter !== "transfer"
      ? Promise.resolve<{ rows: ApprovalItem[]; count: number }>({ rows: [], count: 0 })
      : Promise.all([
          db.transfer.count({ where }),
          db.transfer.findMany({
            where,
            include: {
              creator: { select: { id: true, name: true } },
              fromEmployee: { select: { fullName: true } },
              toEmployee: { select: { fullName: true } },
            },
            orderBy: { createdAt: "asc" },
            take,
          }),
        ]).then(([count, rows]) => ({
          count,
          rows: rows.map((r) => ({
            entity: "transfer",
            id: r.id,
            summary: `${r.fromEmployee?.fullName ?? "?"} → ${r.toEmployee?.fullName ?? "?"}`,
            amount: r.amount,
            date: r.createdAt.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          })),
        }));

    const fetchAttendance = entityFilter && entityFilter !== "attendance"
      ? Promise.resolve<{ rows: ApprovalItem[]; count: number }>({ rows: [], count: 0 })
      : Promise.all([
          db.attendance.count({ where }),
          db.attendance.findMany({
            where,
            include: {
              creator: { select: { id: true, name: true } },
              employee: { select: { fullName: true } },
            },
            orderBy: { createdAt: "asc" },
            take,
          }),
        ]).then(([count, rows]) => ({
          count,
          rows: rows.map((r) => ({
            entity: "attendance",
            id: r.id,
            summary: `${r.employee?.fullName ?? "Employee"} - ${r.status}`,
            date: r.date.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          })),
        }));

    const fetchAssetLogs = entityFilter && entityFilter !== "assetLog"
      ? Promise.resolve<{ rows: ApprovalItem[]; count: number }>({ rows: [], count: 0 })
      : Promise.all([
          db.assetLog.count({ where }),
          db.assetLog.findMany({
            where,
            include: {
              creator: { select: { id: true, name: true } },
              asset: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
            take,
          }),
        ]).then(([count, rows]) => ({
          count,
          rows: rows.map((r) => ({
            entity: "assetLog",
            id: r.id,
            summary: `${r.asset?.name ?? "Asset"} - ${r.status}`,
            date: r.date.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          })),
        }));

    const [
      expenses,
      timesheets,
      fuelUsage,
      cashTransactions,
      transfers,
      attendance,
      assetLogs,
    ] = await Promise.all([
      fetchExpenses,
      fetchTimesheets,
      fetchFuelUsage,
      fetchCashTransactions,
      fetchTransfers,
      fetchAttendance,
      fetchAssetLogs,
    ]);

    const allItems: ApprovalItem[] = [
      ...expenses.rows,
      ...timesheets.rows,
      ...fuelUsage.rows,
      ...cashTransactions.rows,
      ...transfers.rows,
      ...attendance.rows,
      ...assetLogs.rows,
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const total =
      expenses.count +
      timesheets.count +
      fuelUsage.count +
      cashTransactions.count +
      transfers.count +
      attendance.count +
      assetLogs.count;

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = allItems.slice(start, start + pageSize);

    const counts = {
      expense: expenses.count,
      timesheet: timesheets.count,
      fuelUsage: fuelUsage.count,
      cashTransaction: cashTransactions.count,
      transfer: transfers.count,
      attendance: attendance.count,
      assetLog: assetLogs.count,
    };

    return NextResponse.json({
      success: true,
      data: { items, counts, total, totalPages, page: safePage, pageSize },
    });
  } catch (error) {
    console.error("Get approvals error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch approvals" },
      { status: 500 }
    );
  }
}