import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "machinery:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));
    const search = searchParams.get("search") || undefined;

    let contractorIdFilter: string[] | undefined;

    if (search) {
      const matchingContractors = await db.contractor.findMany({
        where: { contractorName: { contains: search } },
        select: { id: true },
      });
      contractorIdFilter = matchingContractors.map((c) => c.id);

      if (contractorIdFilter && contractorIdFilter.length === 0) {
        return NextResponse.json({
          success: true,
          data: { data: [], total: 0, page, pageSize, totalPages: 0 },
        });
      }
    }

    const whereFilter = contractorIdFilter
      ? { assignedContractorId: { in: contractorIdFilter } }
      : undefined;

    const [grouped, total] = await Promise.all([
      db.machinery.groupBy({
        by: ["assignedContractorId"],
        where: whereFilter,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.machinery
        .groupBy({ by: ["assignedContractorId"], where: whereFilter })
        .then((r) => r.length),
    ]);

    const contractorIds = grouped
      .map((g) => g.assignedContractorId)
      .filter(Boolean);

    const contractors = contractorIds.length > 0
      ? await db.contractor.findMany({
          where: { id: { in: contractorIds } },
          select: { id: true, contractorName: true },
        })
      : [];

    const contractorNameMap = new Map(contractors.map((c) => [c.id, c.contractorName]));

    const machineryIdsPerContractor = new Map<string, string[]>();
    for (const g of grouped) {
      if (g.assignedContractorId) {
        const machines = await db.machinery.findMany({
          where: { assignedContractorId: g.assignedContractorId },
          select: { id: true },
        });
        machineryIdsPerContractor.set(g.assignedContractorId, machines.map((m) => m.id));
      }
    }

    const data = await Promise.all(
      grouped
        .filter((g) => g.assignedContractorId)
        .map(async (g) => {
          const ids = machineryIdsPerContractor.get(g.assignedContractorId!) ?? [];

          const [hoursAgg, fuelAgg] = await Promise.all([
            db.timesheet.aggregate({
              where: { machineryId: { in: ids } },
              _sum: { totalHours: true },
            }),
            db.fuelUsage.aggregate({
              where: { machineryId: { in: ids } },
              _sum: { quantity: true, totalCost: true },
            }),
          ]);

          return {
            contractorId: g.assignedContractorId,
            contractorName: contractorNameMap.get(g.assignedContractorId) ?? "Unknown",
            machineryCount: g._count.id,
            totalHours: hoursAgg._sum.totalHours ?? 0,
            totalFuelQuantity: fuelAgg._sum.quantity ?? 0,
            totalFuelCost: fuelAgg._sum.totalCost ?? 0,
          };
        })
    );

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: { data, total, page, pageSize, totalPages },
    });
  } catch (error) {
    console.error("Machinery contractor summary error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machinery contractor summary" },
      { status: 500 }
    );
  }
}
