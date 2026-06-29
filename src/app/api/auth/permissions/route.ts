import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-middleware";
import { getEffectivePermissions } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const permissions = await getEffectivePermissions(user.id, user.role);

    return NextResponse.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    console.error("Get permissions error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch permissions" },
      { status: 500 }
    );
  }
}
