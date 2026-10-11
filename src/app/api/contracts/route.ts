import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, checkUserPermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { createContractSchema } from "@/lib/validation/contract";
import { generateContractNumber } from "@/lib/contract-number";

// GET /api/contracts - list contracts (scoped, filterable)
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contracts:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const contractorId = searchParams.get("contractorId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50));

    const scope = await buildAccessScope(user, "contract");

    const where: Record<string, unknown> = {};
    if (contractorId) where.contractorId = contractorId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { contractNumber: { contains: search } },
        { title: { contains: search } },
        { projectName: { contains: search } },
        { contractor: { contractorName: { contains: search } } },
      ];
    }

    const scopedWhere = withScope(where, scope);

    const [total, contracts] = await Promise.all([
      db.contractorContract.count({ where: scopedWhere }),
      db.contractorContract.findMany({
        where: scopedWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contractor: {
            select: { id: true, contractorName: true, contractorNumber: true, status: true },
          },
          _count: { select: { rates: true, variations: true, timesheets: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { data: contracts, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    console.error("GET /api/contracts error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contracts - create a contract
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contracts:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createContractSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }
    const data = parsed.data;

    // The contractor must exist and be visible to the caller.
    const scope = await buildAccessScope(user, "contractor");
    const contractor = await db.contractor.findFirst({
      where: withScope({ id: data.contractorId }, scope),
      select: { id: true, status: true },
    });
    if (!contractor) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }
    if (contractor.status === "ARCHIVED") {
      return NextResponse.json(
        { success: false, error: "Cannot create a contract for an archived contractor" },
        { status: 400 }
      );
    }

    if (data.endDate && data.endDate < data.startDate) {
      return NextResponse.json(
        { success: false, error: "endDate must be on or after startDate" },
        { status: 400 }
      );
    }

    const contract = await db.$transaction(async (tx) => {
      const contractNumber = await generateContractNumber(tx);
      // Approvers' contracts take effect immediately; others start as drafts.
      const canApprove = await checkUserPermission(user.id, user.role, "contracts:approve");
      const created = await tx.contractorContract.create({
        data: {
          contractNumber,
          contractorId: data.contractorId,
          title: data.title,
          projectName: data.projectName ?? null,
          contractType: data.contractType,
          value: data.value,
          startDate: data.startDate,
          endDate: data.endDate ?? null,
          paymentTerms: data.paymentTerms ?? null,
          retentionPercent: data.retentionPercent,
          advanceAllowed: data.advanceAllowed,
          workHoursPerDay: data.workHoursPerDay,
          contractDaysPerMonth: data.contractDaysPerMonth,
          overtimeRatePercent: data.overtimeRatePercent ?? null,
          penaltyTerms: data.penaltyTerms ?? null,
          companyProvidesFuel: data.companyProvidesFuel,
          contractorProvidesOperator: data.contractorProvidesOperator,
          companyHandlesMaintenance: data.companyHandlesMaintenance,
          downtimeChargeable: data.downtimeChargeable,
          notes: data.notes ?? null,
          status: canApprove ? "ACTIVE" : "DRAFT",
          createdBy: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entity: "ContractorContract",
          entityId: created.id,
          details: `Created contract ${contractNumber} (${data.title})`,
          userId: user.id,
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: contract }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contracts error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
