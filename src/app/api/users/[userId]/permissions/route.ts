import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { z } from "zod";

const setPermissionSchema = z.object({
  permissionName: z.string().min(1),
  granted: z.boolean(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requirePermission(request, "users:managePermissions");
    if ("status" in auth) return auth;
    const { userId } = await params;

    const permissions = await db.permission.findMany({ orderBy: { module: "asc" } });

    const userOverrides = await db.userPermission.findMany({
      where: { userId },
      select: { permissionId: true, granted: true },
    });

    const userOverrideMap = new Map(
      userOverrides.map((o) => [o.permissionId, o.granted])
    );

    const result = permissions.map((p) => ({
      ...p,
      granted: userOverrideMap.get(p.id) ?? null,
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Get user permissions error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch user permissions" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requirePermission(request, "users:managePermissions");
    if ("status" in auth) return auth;
    const { userId } = await params;

    const body = await request.json();
    const parsed = setPermissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const perm = await db.permission.findUnique({
      where: { name: parsed.data.permissionName },
    });
    if (!perm) {
      return NextResponse.json(
        { success: false, error: "Permission not found" },
        { status: 404 }
      );
    }

    await db.userPermission.upsert({
      where: {
        userId_permissionId: { userId, permissionId: perm.id },
      },
      update: { granted: parsed.data.granted },
      create: {
        userId,
        permissionId: perm.id,
        granted: parsed.data.granted,
      },
    });

    return NextResponse.json({
      success: true,
      message: parsed.data.granted
        ? "Permission granted"
        : "Permission revoked",
    });
  } catch (error) {
    console.error("Set user permission error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to set permission" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requirePermission(request, "users:managePermissions");
    if ("status" in auth) return auth;
    const { userId } = await params;

    const body = await request.json();
    const perm = await db.permission.findUnique({
      where: { name: body.permissionName },
    });
    if (!perm) {
      return NextResponse.json(
        { success: false, error: "Permission not found" },
        { status: 404 }
      );
    }

    await db.userPermission.deleteMany({
      where: { userId, permissionId: perm.id },
    });

    return NextResponse.json({
      success: true,
      message: "Permission override removed (now inherits role default)",
    });
  } catch (error) {
    console.error("Remove user permission error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove permission" },
      { status: 500 }
    );
  }
}
