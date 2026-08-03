import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { RECORD_ENTITIES, canManageRecord } from "@/lib/access-control";

const createAccessSchema = z.object({
  entity: z.string().min(1, "Entity is required"),
  entityId: z.string().min(1, "Record id is required"),
  userId: z.string().min(1, "User is required"),
  accessType: z.enum(["view", "edit"]).default("view"),
});

// GET /api/access?entity=expense&entityId=xxx - List grants for a record
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "expenses:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity");
    const entityId = searchParams.get("entityId");

    if (!entity || !entityId) {
      return NextResponse.json(
        { success: false, error: "entity and entityId query params are required" },
        { status: 400 }
      );
    }

    if (!RECORD_ENTITIES.includes(entity as (typeof RECORD_ENTITIES)[number])) {
      return NextResponse.json({ success: false, error: "Unknown entity" }, { status: 400 });
    }

    const grants = await db.recordAccess.findMany({
      where: { entity, entityId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: grants });
  } catch (error) {
    console.error("List access grants error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch access grants" },
      { status: 500 }
    );
  }
}

// POST /api/access - Grant a user access to a record (owner or admin only)
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "expenses:edit");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createAccessSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (!RECORD_ENTITIES.includes(data.entity as (typeof RECORD_ENTITIES)[number])) {
      return NextResponse.json({ success: false, error: "Unknown entity" }, { status: 400 });
    }

    if (data.userId === user.id) {
      return NextResponse.json(
        { success: false, error: "You already have access to your own records" },
        { status: 400 }
      );
    }

    const modelMap: Record<string, { model: string; ownerField: string }> = {
      expense: { model: "expense", ownerField: "createdBy" },
      employee: { model: "employee", ownerField: "createdBy" },
      contractor: { model: "contractor", ownerField: "createdBy" },
      timesheet: { model: "timesheet", ownerField: "createdBy" },
      fuelUsage: { model: "fuelUsage", ownerField: "createdBy" },
      machinery: { model: "machinery", ownerField: "createdBy" },
      machineryRate: { model: "machineryRate", ownerField: "createdBy" },
      attendance: { model: "attendance", ownerField: "createdBy" },
      cashTransaction: { model: "cashTransaction", ownerField: "createdById" },
      transfer: { model: "transfer", ownerField: "createdById" },
      asset: { model: "asset", ownerField: "createdBy" },
      fuelTransaction: { model: "fuelTransaction", ownerField: "createdBy" },
      maintenance: { model: "maintenanceRecord", ownerField: "createdBy" },
      assetLog: { model: "assetLog", ownerField: "createdBy" },
    };

    const map = modelMap[data.entity];
    if (!map) {
      return NextResponse.json({ success: false, error: "Unknown entity" }, { status: 400 });
    }

    const model = db[map.model as keyof typeof db] as unknown as {
      findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };

    const record = await model.findUnique({ where: { id: data.entityId } });
    if (!record) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 });
    }

    const canManage = await canManageRecord(
      user,
      data.entity,
      { id: data.entityId, createdBy: String(record[map.ownerField]) }
    );
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: "Forbidden: only the record owner or an admin can share access" },
        { status: 403 }
      );
    }

    const grant = await db.recordAccess.upsert({
      where: {
        entity_entityId_userId: {
          entity: data.entity,
          entityId: data.entityId,
          userId: data.userId,
        },
      },
      create: {
        entity: data.entity,
        entityId: data.entityId,
        userId: data.userId,
        accessType: data.accessType,
        grantedBy: user.id,
      },
      update: {
        accessType: data.accessType,
        grantedBy: user.id,
      },
    });

    await db.auditLog.create({
      data: {
        action: "GRANT",
        entity: "RecordAccess",
        entityId: data.entityId,
        details: `Granted ${data.accessType} access on ${data.entity} ${data.entityId} to user ${data.userId}`,
        userId: user.id,
      },
    });

    return NextResponse.json(
      { success: true, data: grant, message: "Access granted successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create access grant error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to grant access" },
      { status: 500 }
    );
  }
}
