import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { z } from "zod";

const SETTINGS_ID = "default";

const updateSettingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyLogo: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  website: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  allowSignup: z.boolean().optional(),
});

// GET /api/settings - Fetch app settings
export async function GET(request: NextRequest) {
  try {
    const settings = await db.appSettings.findUnique({
      where: { id: SETTINGS_ID },
    });

    return NextResponse.json({
      success: true,
      data: settings ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

// PUT /api/settings - Update app settings
export async function PUT(request: NextRequest) {
  try {
    const result = await requirePermission(request, "settings:edit");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const updateData: any = {
      companyName: data.companyName,
      companyLogo: data.companyLogo ?? null,
      address: data.address ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      taxId: data.taxId ?? null,
    };
    if (data.allowSignup !== undefined) {
      updateData.allowSignup = data.allowSignup;
    }

    const settings = await db.appSettings.upsert({
      where: { id: SETTINGS_ID },
      update: updateData,
      create: {
        id: SETTINGS_ID,
        ...updateData,
      },
    });

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Settings saved successfully",
    });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
