import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMonthLabel(month: number): string {
  return MONTH_LABELS[month - 1] || `Month ${month}`;
}

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "fuelUsage:view");
  if ("status" in result) return result;

  try {
    const { searchParams } = new URL(request.url);
    const machineryId = searchParams.get("machineryId") || undefined;
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const fuelTypeParam = searchParams.get("fuelType") || undefined;
    const dateFromParam = searchParams.get("dateFrom") || undefined;
    const dateToParam = searchParams.get("dateTo") || undefined;

    let startDate: Date;
    let endDate: Date;

    if (dateFromParam) {
      startDate = new Date(dateFromParam);
    } else {
      startDate = new Date(year, 0, 1);
    }

    if (dateToParam) {
      endDate = new Date(dateToParam + "T23:59:59.999Z");
    } else {
      endDate = new Date(year + 1, 0, 1);
    }

    const machineryFilter: Record<string, unknown> = {};
    if (machineryId) {
      machineryFilter.id = machineryId;
    }

    const allMachinery = await db.machinery.findMany({
      where: machineryFilter,
      select: {
        id: true,
        machineryName: true,
        machineryType: true,
        plateNumber: true,
        driverName: true,
        hourlyConsumptionRate: true,
        workHoursPerDay: true,
      },
      orderBy: { machineryName: "asc" },
    });

    if (allMachinery.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const machineryIds = allMachinery.map((m) => m.id);

    const dateFilter: Record<string, unknown> = {
      date: { gte: startDate, lt: endDate } as Record<string, unknown>,
      machineryId: { in: machineryIds } as { in: string[] },
    };

    if (fuelTypeParam) {
      dateFilter.fuelType = fuelTypeParam;
    }

    const fuelUsageRecords = await db.fuelUsage.findMany({
      where: dateFilter,
      select: {
        machineryId: true,
        date: true,
        quantity: true,
        totalCost: true,
        fuelType: true,
        unitPrice: true,
      },
    });

    const fuelByMachMonth = new Map<string, { totalLiters: number; totalCost: number; recordCount: number }>();
    for (const r of fuelUsageRecords) {
      if (!r.machineryId) continue;
      const month = r.date.getMonth() + 1;
      const monthKey = `${r.machineryId}_${month}`;
      const existing = fuelByMachMonth.get(monthKey);
      if (existing) {
        existing.totalLiters += r.quantity;
        existing.totalCost += r.totalCost;
        existing.recordCount += 1;
      } else {
        fuelByMachMonth.set(monthKey, { totalLiters: r.quantity, totalCost: r.totalCost, recordCount: 1 });
      }
    }

    const rows: Array<{
      machineryName: string;
      month: string;
      liters: number;
      cost: number;
      records: number;
    }> = [];

    for (const mach of allMachinery) {
      for (let month = 1; month <= 12; month++) {
        const monthKey = `${mach.id}_${month}`;
        const fuel = fuelByMachMonth.get(monthKey);
        if (fuel && fuel.totalLiters > 0) {
          rows.push({
            machineryName: mach.machineryName,
            month: getMonthLabel(month),
            liters: fuel.totalLiters,
            cost: fuel.totalCost,
            records: fuel.recordCount,
          });
        }
      }
    }

    const totalLiters = rows.reduce((s, r) => s + r.liters, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fuel Usage Analysis Report</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #059669; border-bottom: 2px solid #059669; padding-bottom: 8px; }
    h2 { color: #1e293b; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background-color: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    tr:hover { background-color: #f8fafc; }
    .text-right { text-align: right; }
    .summary { display: flex; gap: 24px; margin: 16px 0; }
    .summary-item { background: #f1f5f9; padding: 12px 16px; border-radius: 8px; flex: 1; }
    .summary-item .label { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .summary-item .value { font-size: 20px; font-weight: bold; color: #1e293b; margin-top: 4px; }
    .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  </style>
</head>
<body>
  <h1>Fuel Usage Analysis Report</h1>
  <p style="color: #64748b;">Year: ${year} ${fuelTypeParam ? `| Fuel Type: ${fuelTypeParam}` : ""}</p>

  <div class="summary">
    <div class="summary-item">
      <div class="label">Total Machinery</div>
      <div class="value">${allMachinery.length}</div>
    </div>
    <div class="summary-item">
      <div class="label">Total Fuel Consumed</div>
      <div class="value">${totalLiters.toFixed(1)} L</div>
    </div>
    <div class="summary-item">
      <div class="label">Total Cost</div>
      <div class="value">AFN ${totalCost.toFixed(0)}</div>
    </div>
    <div class="summary-item">
      <div class="label">Total Records</div>
      <div class="value">${rows.length}</div>
    </div>
  </div>

  <h2>Monthly Consumption Details</h2>
  <table>
    <thead>
      <tr>
        <th>Machinery</th>
        <th>Month</th>
        <th class="text-right">Liters</th>
        <th class="text-right">Cost (AFN)</th>
        <th class="text-right">Records</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r) => `
        <tr>
          <td>${r.machineryName}</td>
          <td>${r.month}</td>
          <td class="text-right">${r.liters.toFixed(1)}</td>
          <td class="text-right">${r.cost.toFixed(0)}</td>
          <td class="text-right">${r.records}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="footer">
    Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} |
    YakhshiLedger Fuel Usage Analysis
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="fuel-analysis-${year}.html"`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
