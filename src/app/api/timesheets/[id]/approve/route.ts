import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "timesheets:approve");
    if ("status" in result) return result;
    const user = result.user;
    const { id } = await params;

    const timesheet = await db.timesheet.findUnique({
      where: { id },
      select: { approvedBy: true },
    });

    if (!timesheet) {
      return NextResponse.json(
        { success: false, error: "Timesheet not found" },
        { status: 404 }
      );
    }

    if (timesheet.approvedBy) {
      return NextResponse.json(
        { success: false, error: "Timesheet is already approved" },
        { status: 400 }
      );
    }

    const updated = await db.timesheet.update({
      where: { id },
      data: {
        approvedBy: user.id,
        approvedAt: new Date(),
      },
      include: {
        contractor: {
          select: { id: true, contractorName: true, contractorType: true },
        },
        machinery: {
          select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
        },
        approver: {
          select: { id: true, name: true },
        },
      },
    });

    await db.auditLog.create({
      data: {
        action: "APPROVE",
        entity: "Timesheet",
        entityId: id,
        details: `Approved timesheet for ${updated.operatorName || "contractor"}`,
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Timesheet approved successfully",
    });
  } catch (error) {
    console.error("Approve timesheet error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to approve timesheet" },
      { status: 500 }
    );
  }
}
