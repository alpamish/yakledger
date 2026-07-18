import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "machinery:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));
    const search = searchParams.get("search") || undefined;

    const where: Prisma.MachineryWhereInput = {
      timesheets: { some: {} },
    };

    if (search) {
      const contractorIds = await db.contractor
        .findMany({
          where: { contractorName: { contains: search } },
          select: { id: true },
        })
        .then((r) => r.map((c) => c.id));

      const orConditions: Prisma.MachineryWhereInput[] = [
        { machineryName: { contains: search } },
        { driverName: { contains: search } },
      ];

      if (contractorIds.length > 0) {
        orConditions.push({ assignedContractorId: { in: contractorIds } });
      }

      where.OR = orConditions;
    }

    const [machinery, total] = await Promise.all([
      db.machinery.findMany({
        where,
        select: {
          id: true,
          machineryName: true,
          driverName: true,
          assignedContractorId: true,
          hourlyRate: true,
          dailyRate: true,
          monthlyRate: true,
          workHoursPerDay: true,
          contractDaysPerMonth: true,
          assignedContractor: {
            select: { id: true, contractorName: true },
          },
        },
        orderBy: { machineryName: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.machinery.count({ where }),
    ]);

    const machineryIds = machinery.map((m) => m.id);

    // Fetch all timesheets with their machineryRateId for these machinery
    const timesheets = await db.timesheet.findMany({
      where: { machineryId: { in: machineryIds } },
      select: {
        machineryId: true,
        totalHours: true,
        machineryRateId: true,
      },
    });

    // Batch-load all rates referenced by these timesheets
    const rateIds = [...new Set(timesheets.map((t) => t.machineryRateId).filter(Boolean))] as string[];
    const rates = rateIds.length > 0
      ? await db.machineryRate.findMany({
          where: { id: { in: rateIds } },
          select: { id: true, hourlyRate: true, rateName: true },
        })
      : [];
    const rateMap = new Map<string, { hourlyRate: number; rateName: string | null }>(rates.map((r) => [r.id, { hourlyRate: r.hourlyRate, rateName: r.rateName }]));

    // Build per-machinery aggregates: totalHours, totalCost, rateName
    const costMap = new Map<string, { totalHours: number; totalCost: number; rateNames: Set<string> }>();
    for (const ts of timesheets) {
      if (!ts.machineryId) continue;
      const entry = costMap.get(ts.machineryId) ?? { totalHours: 0, totalCost: 0, rateNames: new Set<string>() };
      entry.totalHours += ts.totalHours;
      const rate = ts.machineryRateId ? rateMap.get(ts.machineryRateId) : undefined;
      const hr = rate?.hourlyRate ?? 0;
      entry.totalCost += ts.totalHours * hr;
      if (rate?.rateName) entry.rateNames.add(rate.rateName);
      costMap.set(ts.machineryId, entry);
    }

    const data = machinery.map((m) => {
      const agg = costMap.get(m.id) ?? { totalHours: 0, totalCost: 0, rateNames: new Set<string>() };
      return {
        machineryId: m.id,
        machineryName: m.machineryName,
        driverName: m.driverName ?? null,
        contractorName: m.assignedContractor?.contractorName ?? null,
        totalHours: agg.totalHours,
        hourlyRate: m.hourlyRate,
        dailyRate: m.dailyRate,
        monthlyRate: m.monthlyRate,
        workHoursPerDay: m.workHoursPerDay,
        contractDaysPerMonth: m.contractDaysPerMonth,
        efficiency: m.workHoursPerDay > 0 ? agg.totalHours / m.workHoursPerDay : 0,
        totalCost: agg.totalCost,
        rateName: agg.rateNames.size > 0 ? [...agg.rateNames].join(", ") : undefined,
      };
    });

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: { data, total, page, pageSize, totalPages },
    });
  } catch (error) {
    console.error("Machinery work hours summary error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machinery work hours summary" },
      { status: 500 }
    );
  }
}
