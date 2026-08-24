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

    // Resolve effective permissions in the same request so the client boot
    // needs a single roundtrip instead of two (me + permissions).
    const permissions = await getEffectivePermissions(user.id, user.role);

    return NextResponse.json(
      {
        success: true,
        data: { user, permissions },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Get current user error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get user info" },
      { status: 500 }
    );
  }
}