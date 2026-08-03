import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

interface ApprovalItem {
  entity: string;
  id: string;
  summary: string;
  amount?: number;
  date?: string;
  status: string;
  approvalNote: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

// GET /api/approvals?status=PENDING&entity=expense - List records awaiting approval
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "expenses:approve");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PENDING";
    const entityFilter = searchParams.get("entity");

    const where = { approvalStatus: status } as const;

    const fetchExpenses = entityFilter && entityFilter !== "expense"
      ? Promise.resolve<ApprovalItem[]>([])
      : db.expense.findMany({
          where,
          include: { creator: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        }).then((rows) =>
          rows.map((r) => ({
            entity: "expense",
            id: r.id,
            summary: `${r.title} (${r.category})`,
            amount: r.amount,
            date: r.expenseDate.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          }))
        );

    const fetchTimesheets = entityFilter && entityFilter !== "timesheet"
      ? Promise.resolve<ApprovalItem[]>([])
      : db.timesheet.findMany({
          where,
          include: {
            creator: { select: { id: true, name: true } },
            contractor: { select: { contractorName: true } },
            machinery: { select: { machineryName: true } },
          },
          orderBy: { createdAt: "asc" },
        }).then((rows) =>
          rows.map((r) => ({
            entity: "timesheet",
            id: r.id,
            summary: `${r.contractor?.contractorName ?? "Contractor"} - ${r.machinery?.machineryName ?? "Machinery"} (${r.totalHours}h)`,
            date: r.date.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          }))
        );

    const fetchFuelUsage = entityFilter && entityFilter !== "fuelUsage"
      ? Promise.resolve<ApprovalItem[]>([])
      : db.fuelUsage.findMany({
          where,
          include: {
            creator: { select: { id: true, name: true } },
            contractor: { select: { contractorName: true } },
          },
          orderBy: { createdAt: "asc" },
        }).then((rows) =>
          rows.map((r) => ({
            entity: "fuelUsage",
            id: r.id,
            summary: `${r.contractor?.contractorName ?? "Contractor"} - ${r.quantity}L ${r.fuelType}`,
            amount: r.totalCost,
            date: r.date.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          }))
        );

    const fetchCashTransactions = entityFilter && entityFilter !== "cashTransaction"
      ? Promise.resolve<ApprovalItem[]>([])
      : db.cashTransaction.findMany({
          where,
          include: {
            creator: { select: { id: true, name: true } },
            employee: { select: { fullName: true } },
          },
          orderBy: { createdAt: "asc" },
        }).then((rows) =>
          rows.map((r) => ({
            entity: "cashTransaction",
            id: r.id,
            summary: `${r.type} - ${r.employee?.fullName ?? "Employee"}`,
            amount: r.amount,
            date: r.createdAt.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          }))
        );

    const fetchTransfers = entityFilter && entityFilter !== "transfer"
      ? Promise.resolve<ApprovalItem[]>([])
      : db.transfer.findMany({
          where,
          include: {
            creator: { select: { id: true, name: true } },
            fromEmployee: { select: { fullName: true } },
            toEmployee: { select: { fullName: true } },
          },
          orderBy: { createdAt: "asc" },
        }).then((rows) =>
          rows.map((r) => ({
            entity: "transfer",
            id: r.id,
            summary: `${r.fromEmployee?.fullName ?? "?"} → ${r.toEmployee?.fullName ?? "?"}`,
            amount: r.amount,
            date: r.createdAt.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          }))
        );

    const fetchAttendance = entityFilter && entityFilter !== "attendance"
      ? Promise.resolve<ApprovalItem[]>([])
      : db.attendance.findMany({
          where,
          include: {
            creator: { select: { id: true, name: true } },
            employee: { select: { fullName: true } },
          },
          orderBy: { createdAt: "asc" },
        }).then((rows) =>
          rows.map((r) => ({
            entity: "attendance",
            id: r.id,
            summary: `${r.employee?.fullName ?? "Employee"} - ${r.status}`,
            date: r.date.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          }))
        );

    const fetchAssetLogs = entityFilter && entityFilter !== "assetLog"
      ? Promise.resolve<ApprovalItem[]>([])
      : db.assetLog.findMany({
          where,
          include: {
            creator: { select: { id: true, name: true } },
            asset: { select: { assetName: true } },
          },
          orderBy: { createdAt: "asc" },
        }).then((rows) =>
          rows.map((r) => ({
            entity: "assetLog",
            id: r.id,
            summary: `${r.asset?.assetName ?? "Asset"} - ${r.status}`,
            date: r.date.toISOString(),
            status: r.approvalStatus,
            approvalNote: r.approvalNote,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.creator,
          }))
        );

    const [expenses, timesheets, fuelUsage, cashTransactions, transfers, attendance, assetLogs] =
      await Promise.all([
        fetchExpenses,
        fetchTimesheets,
        fetchFuelUsage,
        fetchCashTransactions,
        fetchTransfers,
        fetchAttendance,
        fetchAssetLogs,
      ]);

    const items: ApprovalItem[] = [
      ...expenses,
      ...timesheets,
      ...fuelUsage,
      ...cashTransactions,
      ...transfers,
      ...attendance,
      ...assetLogs,
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const counts = {
      expense: expenses.length,
      timesheet: timesheets.length,
      fuelUsage: fuelUsage.length,
      cashTransaction: cashTransactions.length,
      transfer: transfers.length,
      attendance: attendance.length,
      assetLog: assetLogs.length,
    };

    return NextResponse.json({ success: true, data: { items, counts, total: items.length } });
  } catch (error) {
    console.error("Get approvals error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch approvals" },
      { status: 500 }
    );
  }
}
