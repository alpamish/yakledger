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
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));
    const search = searchParams.get("search") || undefined;

    const where: Prisma.MachineryWhereInput = {
      fuelUsages: { some: {} },
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

    const [fuelAggs, hoursAggs] = await Promise.all([
      db.fuelUsage.groupBy({
        by: ["machineryId"],
        where: { machineryId: { in: machineryIds } },
        _sum: { quantity: true, totalCost: true },
      }),
      db.timesheet.groupBy({
        by: ["machineryId"],
        where: { machineryId: { in: machineryIds } },
        _sum: { totalHours: true },
      }),
    ]);

    const fuelMap = new Map<string, { qty: number; cost: number }>();
    for (const f of fuelAggs) {
      if (f.machineryId) {
        fuelMap.set(f.machineryId, {
          qty: f._sum.quantity ?? 0,
          cost: f._sum.totalCost ?? 0,
        });
      }
    }

    const hoursMap = new Map<string, number>();
    for (const h of hoursAggs) {
      if (h.machineryId) {
        hoursMap.set(h.machineryId, h._sum.totalHours ?? 0);
      }
    }

    const data = machinery.map((m) => {
      const fuel = fuelMap.get(m.id) ?? { qty: 0, cost: 0 };
      const hours = hoursMap.get(m.id) ?? 0;
      return {
        machineryId: m.id,
        machineryName: m.machineryName,
        driverName: m.driverName ?? null,
        contractorName: m.assignedContractor?.contractorName ?? null,
        totalFuelQuantity: fuel.qty,
        totalFuelCost: fuel.cost,
        totalHours: hours,
        litersPerHour: hours > 0 ? fuel.qty / hours : 0,
      };
    });

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: { data, total, page, pageSize, totalPages },
    });
  } catch (error) {
    console.error("Machinery fuel summary error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machinery fuel summary" },
      { status: 500 }
    );
  }
}
