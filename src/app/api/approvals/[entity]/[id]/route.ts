import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";
import { APPROVED, REJECTED, APPROVAL_ENTITIES } from "@/lib/access-control";

const ENTITY_CONFIG: Record<
  string,
  {
    model: string;
    permission: string;
    auditEntity: string;
    amountField?: string;
    wallet?: { type: string };
  }
> = {
  expense: { model: "expense", permission: "expenses:approve", auditEntity: "Expense", amountField: "amount", wallet: { type: "expense" } },
  timesheet: { model: "timesheet", permission: "timesheets:approve", auditEntity: "Timesheet" },
  fuelUsage: { model: "fuelUsage", permission: "fuelUsage:approve", auditEntity: "FuelUsage", amountField: "totalCost" },
  cashTransaction: { model: "cashTransaction", permission: "cashAdvance:approve", auditEntity: "CashTransaction", amountField: "amount", wallet: { type: "cashTransaction" } },
  transfer: { model: "transfer", permission: "cashAdvance:approve", auditEntity: "Transfer", amountField: "amount", wallet: { type: "transfer" } },
  attendance: { model: "attendance", permission: "employees:approve", auditEntity: "Attendance" },
  assetLog: { model: "assetLog", permission: "assets:approve", auditEntity: "AssetLog" },
};

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().optional().nullable(),
});

async function applyWalletEffect(
  entity: string,
  record: Record<string, unknown>,
  userId: string
): Promise<void> {
  const cfg = ENTITY_CONFIG[entity]?.wallet;
  if (!cfg) return;

  try {
    if (cfg.type === "expense") {
      const paidById = record.paidById as string | null;
      const amount = record.amount as number;
      if (paidById && amount) {
        await walletService.deductFromWallet(paidById, amount, userId);
      }
    } else if (cfg.type === "cashTransaction") {
      const employeeId = record.employeeId as string;
      const amount = record.amount as number;
      const type = record.type as string;
      if (!employeeId || !amount) return;
      if (type === "ADVANCE" || type === "ADJUSTMENT") {
        await walletService.addBackToWallet(employeeId, amount, userId);
      } else if (type === "RETURN") {
        await walletService.deductFromWallet(employeeId, amount, userId);
      }
    } else if (cfg.type === "transfer") {
      const fromEmployeeId = record.fromEmployeeId as string;
      const toEmployeeId = record.toEmployeeId as string;
      const amount = record.amount as number;
      if (fromEmployeeId && amount) {
        await walletService.deductFromWallet(fromEmployeeId, amount, userId);
      }
      if (toEmployeeId && amount) {
        await walletService.addBackToWallet(toEmployeeId, amount, userId);
      }
    }
  } catch (err) {
    console.warn(`Wallet effect for ${entity} approval failed:`, err);
  }
}

// POST /api/approvals/[entity]/[id] - Approve or reject a pending record
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
) {
  try {
    const { entity, id } = await params;

    if (!APPROVAL_ENTITIES.has(entity) || !ENTITY_CONFIG[entity]) {
      return NextResponse.json({ success: false, error: "Unknown entity" }, { status: 400 });
    }

    const cfg = ENTITY_CONFIG[entity];
    const result = await requirePermission(request, cfg.permission);
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { action, note } = parsed.data;

    const model = db[cfg.model as keyof typeof db] as unknown as {
      findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };

    const record = await model.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 });
    }

    if (record.approvalStatus === APPROVED) {
      return NextResponse.json({ success: false, error: "Record is already approved" }, { status: 400 });
    }

    const newStatus = action === "approve" ? APPROVED : REJECTED;

    const updated = await model.update({
      where: { id },
      data: {
        approvalStatus: newStatus,
        approvedById: user.id,
        approvedAt: new Date(),
        approvalNote: note ?? null,
      },
    });

    await db.auditLog.create({
      data: {
        action: action === "approve" ? "APPROVE" : "REJECT",
        entity: cfg.auditEntity,
        entityId: id,
        details: `${action === "approve" ? "Approved" : "Rejected"} ${entity} ${id}${note ? ` - ${note}` : ""}`,
        userId: user.id,
      },
    });

    if (action === "approve") {
      await applyWalletEffect(entity, record, user.id);
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: action === "approve" ? "Record approved successfully" : "Record rejected",
    });
  } catch (error) {
    console.error("Approval action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process approval" },
      { status: 500 }
    );
  }
}
