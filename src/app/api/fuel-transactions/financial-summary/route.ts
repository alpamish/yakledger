import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const transactionIncludes = {
  asset: { select: { id: true, name: true, category: true } },
  container: { select: { id: true, name: true, fuelLocation: true, isMainContainer: true } },
  destinationContainer: { select: { id: true, name: true, fuelLocation: true } },
  contractor: { select: { id: true, contractorName: true } },
  machinery: { select: { id: true, machineryName: true, machineryType: true, plateNumber: true } },
};

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "fuelUsage:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const dateFilter: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      dateFilter.date = {};
      if (dateFrom) (dateFilter.date as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (dateFilter.date as Record<string, unknown>).lte = new Date(dateTo + "T23:59:59.999Z");
    }

    const allTransactions = await db.fuelTransaction.findMany({
      where: dateFilter,
      include: transactionIncludes,
      orderBy: { date: "desc" },
    });

    const purchases = allTransactions.filter((t) => t.type === "PURCHASE");
    const issues = allTransactions.filter((t) => t.type === "ISSUE");

    const totalPurchasedQty = purchases.reduce((s, t) => s + t.quantity, 0);
    const totalPurchasedCost = purchases.reduce((s, t) => s + (t.totalCost || 0), 0);
    const totalIssuedQty = issues.reduce((s, t) => s + t.quantity, 0);
    const avgUnitPrice = totalPurchasedQty > 0 ? totalPurchasedCost / totalPurchasedQty : 0;
    const totalIssuedCost = issues.reduce((s, t) => s + (t.totalCost || t.quantity * avgUnitPrice), 0);
    const remainingQty = totalPurchasedQty - totalIssuedQty;
    const remainingValue = remainingQty * avgUnitPrice;

    const machineryMap: Record<string, {
      machineryId: string;
      machineryName: string;
      machineryType: string;
      contractorName: string;
      plateNumber: string | null;
      totalQty: number;
      totalCost: number;
      issues: typeof allTransactions;
    }> = {};

    const categoryMap: Record<string, { totalQty: number; totalCost: number; machinerySet: Set<string> }> = {};

    for (const issue of issues) {
      if (!issue.machineryId) continue;
      const key = issue.machineryId;
      if (!machineryMap[key]) {
        machineryMap[key] = {
          machineryId: issue.machineryId,
          machineryName: issue.machinery?.machineryName || "Unknown",
          machineryType: issue.machinery?.machineryType || "Unknown",
          contractorName: issue.contractor?.contractorName || "Unknown",
          plateNumber: issue.machinery?.plateNumber || null,
          totalQty: 0,
          totalCost: 0,
          issues: [],
        };
      }
      machineryMap[key].totalQty += issue.quantity;
      machineryMap[key].totalCost += issue.totalCost || issue.quantity * avgUnitPrice;
      machineryMap[key].issues.push(issue);

      const type = issue.machinery?.machineryType || "Unknown";
      if (!categoryMap[type]) {
        categoryMap[type] = { totalQty: 0, totalCost: 0, machinerySet: new Set() };
      }
      categoryMap[type].totalQty += issue.quantity;
      categoryMap[type].totalCost += issue.totalCost || issue.quantity * avgUnitPrice;
      categoryMap[type].machinerySet.add(issue.machineryId);
    }

    const byMachineryCategory = Object.entries(categoryMap)
      .map(([machineryType, v]) => ({
        machineryType,
        machineryCount: v.machinerySet.size,
        totalQty: v.totalQty,
        totalCost: v.totalCost,
      }))
      .sort((a, b) => b.totalQty - a.totalQty);

    const allMachinery = await db.machinery.findMany({
      include: {
        assignedContractor: { select: { contractorName: true } },
      },
    });

    const issueQtyMap: Record<string, number> = {};
    const issueCostMap: Record<string, number> = {};
    for (const issue of issues) {
      if (!issue.machineryId) continue;
      issueQtyMap[issue.machineryId] = (issueQtyMap[issue.machineryId] || 0) + issue.quantity;
      issueCostMap[issue.machineryId] = (issueCostMap[issue.machineryId] || 0) + (issue.totalCost || issue.quantity * avgUnitPrice);
    }

    const allMachineryUsage = allMachinery.map((m) => ({
      machineryId: m.id,
      machineryName: m.machineryName,
      machineryType: m.machineryType,
      plateNumber: m.plateNumber,
      contractorName: m.assignedContractor?.contractorName || "—",
      status: m.status,
      totalQty: issueQtyMap[m.id] || 0,
      totalCost: issueCostMap[m.id] || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        totalPurchasedQty,
        totalPurchasedCost,
        totalIssuedQty,
        totalIssuedCost,
        remainingQty: Math.max(0, remainingQty),
        remainingValue: Math.max(0, remainingValue),
        avgUnitPrice,
        byMachinery: Object.values(machineryMap).sort((a, b) => b.totalQty - a.totalQty),
        byMachineryCategory,
        allMachineryUsage,
        purchaseTransactions: purchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        allTransactions,
      },
    });
  } catch (error) {
    console.error("Fuel financial summary error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch fuel financial summary" }, { status: 500 });
  }
}
