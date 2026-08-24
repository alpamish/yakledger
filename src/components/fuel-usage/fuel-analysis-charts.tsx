'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
  Legend,
  ComposedChart,
} from 'recharts';
import { BarChart3, TrendingUp, PieChart, Layers, Gauge } from 'lucide-react';
import type { MonthlyAnalysisResponse, MonthlyFuelData } from '@/types/contractor';
import { FUEL_TYPE_COLORS, FUEL_TYPE_LABELS } from '@/types/contractor';
import { getShamsiMonthName } from '@/lib/shamsi';

function formatNumber(n: number, decimals = 1): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function monthDisplayLabel(monthLabel: string, month: string, dateMode: 'miladi' | 'shamsi'): string {
  if (dateMode === 'shamsi') {
    const parts = month.split('-');
    if (parts.length === 2) {
      const m = parseInt(parts[1], 10);
      if (!isNaN(m) && m >= 1 && m <= 12) return getShamsiMonthName(m - 1);
    }
  }
  return monthLabel;
}

interface ChartDataPoint {
  month: string;
  monthLabel: string;
  displayLabel: string;
  totalLiters: number;
  totalCost: number;
  litersPerHour: number;
  expectedRate: number;
  deviationPercent: number;
  machineryName: string;
}

function ConsumptionBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartDataPoint; dataKey?: string }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const devColor =
    Math.abs(d.deviationPercent) >= 15
      ? 'text-red-600'
      : Math.abs(d.deviationPercent) >= 5
        ? 'text-amber-600'
        : 'text-green-600';
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{d.displayLabel}{d.machineryName ? ` — ${d.machineryName}` : ''}</p>
      <p className="text-emerald-600">Liters: {formatNumber(d.totalLiters)}</p>
      <p className="text-blue-600">Cost: {formatCurrency(d.totalCost)}</p>
      <p className="text-violet-600">L/hr: {formatNumber(d.litersPerHour)}</p>
      <p className={devColor}>Deviation: {d.deviationPercent > 0 ? '+' : ''}{formatNumber(d.deviationPercent)}%</p>
    </div>
  );
}

function RateLineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {formatNumber(p.value)} L/hr
        </p>
      ))}
    </div>
  );
}

interface FuelAnalysisChartsProps {
  analysisData: MonthlyAnalysisResponse[];
  selectedMachineryName: string;
  dateMode?: 'miladi' | 'shamsi';
}

export function FuelAnalysisCharts({
  analysisData,
  selectedMachineryName,
  dateMode = 'miladi',
}: FuelAnalysisChartsProps) {
  const chartData = useMemo(() => {
    const points: ChartDataPoint[] = [];
    for (const d of analysisData) {
      const mName = (d.machinery as { machineryName?: string })?.machineryName ?? '';
      for (const m of d.monthlyData) {
        if (m.totalLiters > 0 || m.totalHours > 0) {
          points.push({
            month: m.month,
            monthLabel: m.monthLabel,
            displayLabel: monthDisplayLabel(m.monthLabel, m.month, dateMode),
            totalLiters: m.totalLiters,
            totalCost: m.totalCost,
            litersPerHour: m.litersPerHour,
            expectedRate: m.expectedRate,
            deviationPercent: m.deviationPercent,
            machineryName: mName,
          });
        }
      }
    }
    return points.sort((a, b) => a.month.localeCompare(b.month));
  }, [analysisData, dateMode]);

  const hasExpectedRate = chartData.some((d) => d.expectedRate > 0);

  const machineryNames = useMemo(() => {
    const names = new Set(chartData.map((d) => d.machineryName).filter(Boolean));
    return Array.from(names);
  }, [chartData]);

  const isMultiMachine = machineryNames.length > 1;

  const deviationColors = useMemo(() => {
    return chartData.map((d) => {
      if (Math.abs(d.deviationPercent) >= 15) return '#ef4444';
      if (Math.abs(d.deviationPercent) >= 5) return '#f59e0b';
      return '#10b981';
    });
  }, [chartData]);

  // Machinery comparison (aggregate per machinery by total liters)
  const machineryComparison = useMemo(() => {
    const map = new Map<string, { name: string; totalLiters: number; totalCost: number; count: number }>();
    for (const d of analysisData) {
      const name = (d.machinery as { machineryName?: string })?.machineryName ?? 'Unknown';
      let totalLiters = 0;
      let totalCost = 0;
      let count = 0;
      for (const m of d.monthlyData) {
        totalLiters += m.totalLiters;
        totalCost += m.totalCost;
        if (m.totalLiters > 0) count++;
      }
      if (totalLiters > 0) map.set(name, { name, totalLiters, totalCost, count });
    }
    return Array.from(map.values())
      .sort((a, b) => b.totalLiters - a.totalLiters)
      .slice(0, 10);
  }, [analysisData]);

  // Fuel type over time (stacked) across the whole selection
  const fuelTypeTrend = useMemo(() => {
    const byMonth = new Map<string, { month: string; monthLabel: string; displayLabel: string; [k: string]: number | string }>();
    for (const d of analysisData) {
      const fbtm = d.fuelTypeByMonth;
      if (!fbtm) continue;
      for (const m of fbtm) {
        let entry = byMonth.get(m.month);
        if (!entry) {
          entry = {
            month: m.month,
            monthLabel: m.monthLabel,
            displayLabel: monthDisplayLabel(m.monthLabel, m.month, dateMode),
          };
          byMonth.set(m.month, entry);
        }
        for (const ft of m.fuelTypes) {
          entry[ft.fuelType] = (typeof entry[ft.fuelType] === 'number' ? entry[ft.fuelType] as number : 0) + ft.totalLiters;
        }
      }
    }
    return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [analysisData, dateMode]);

  const trendFuelTypes = useMemo(() => {
    const set = new Set<string>();
    for (const entry of fuelTypeTrend) {
      for (const [k] of Object.entries(entry)) {
        if (['month', 'monthLabel', 'displayLabel'].includes(k)) continue;
        set.add(k);
      }
    }
    return Array.from(set);
  }, [fuelTypeTrend]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Monthly Consumption Bar Chart (liters + cost) */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            Monthly Fuel Consumption
            {selectedMachineryName && (
              <span className="text-muted-foreground font-normal text-xs">
                — {selectedMachineryName}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="displayLabel"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  yAxisId="liters"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v.toFixed(0)}`}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip content={<ConsumptionBarTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="liters" dataKey="totalLiters" name="Liters" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, idx) => {
                    const color = deviationColors[idx] ?? '#10b981';
                    return <Cell key={`cell-${idx}`} fill={color} fillOpacity={0.8} />;
                  })}
                </Bar>
                <Bar yAxisId="cost" dataKey="totalCost" name="Cost" fill="#3b82f6" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Consumption Rate Line Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-violet-600" />
            Consumption Rate Trend (L/hr)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="displayLabel"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={40}
                />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<RateLineTooltip />} />
                <Line
                  type="monotone"
                  dataKey="litersPerHour"
                  name="Actual L/hr"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#8b5cf6' }}
                  activeDot={{ r: 5 }}
                />
                {hasExpectedRate && (
                  <ReferenceLine
                    y={chartData[0]?.expectedRate ?? 0}
                    stroke="#f59e0b"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    label={{
                      value: 'Expected',
                      position: 'right',
                      fontSize: 10,
                      fill: '#f59e0b',
                    }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Fuel Type Distribution Pie Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PieChart className="h-4 w-4 text-blue-600" />
            Fuel Type Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={(() => {
                    const fuelMap = new Map<string, number>();
                    for (const d of analysisData) {
                      const dist = d.fuelTypeDistribution;
                      if (dist && dist.length > 0) {
                        for (const entry of dist) {
                          fuelMap.set(entry.fuelType, (fuelMap.get(entry.fuelType) ?? 0) + entry.totalLiters);
                        }
                      } else {
                        for (const m of d.monthlyData) {
                          if (m.totalLiters > 0) {
                            fuelMap.set('Other', (fuelMap.get('Other') ?? 0) + m.totalLiters);
                          }
                        }
                      }
                    }
                    return Array.from(fuelMap.entries()).map(([name, value]) => ({ name, value }));
                  })()}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {(() => {
                    const names = Array.from(
                      new Set(
                        analysisData.flatMap((d) =>
                          (d.fuelTypeDistribution ?? []).map((e) => e.fuelType)
                        )
                      )
                    );
                    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
                    return names.length > 0
                      ? names.map((name, i) => (
                          <Cell key={name} fill={colors[i % colors.length]} />
                        ))
                      : [<Cell key="other" fill={colors[0]} />];
                  })()}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0];
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                        <p className="font-medium">{d.name}</p>
                        <p className="text-emerald-600">{formatNumber(d.value as number)} L</p>
                      </div>
                    );
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-muted-foreground">{value}</span>
                  )}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1">
            Total fuel consumed across all months
          </p>
        </CardContent>
      </Card>

      {/* Machinery Comparison (horizontal bar) */}
      {isMultiMachine && machineryComparison.length > 1 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-600" />
              Machinery Comparison
              <span className="text-muted-foreground font-normal text-xs">
                Top {machineryComparison.length} by total liters
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={machineryComparison}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof machineryComparison)[0];
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                          <p className="mb-1 font-medium">{d.name}</p>
                          <p className="text-emerald-600">Liters: {formatNumber(d.totalLiters)}</p>
                          <p className="text-blue-600">Cost: {formatCurrency(d.totalCost)}</p>
                          <p className="text-muted-foreground">Months with usage: {d.count}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="totalLiters" name="Liters" fill="#10b981" fillOpacity={0.85} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fuel Type Trend (stacked bar) */}
      {fuelTypeTrend.length > 0 && trendFuelTypes.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Gauge className="h-4 w-4 text-violet-600" />
              Fuel Type Trend Over Time
              <span className="text-muted-foreground font-normal text-xs">
                Liters by fuel type per month
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fuelTypeTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="displayLabel"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(0)}`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                          <p className="mb-1 font-medium">{label}</p>
                          {payload.map((p, i) => (
                            <p key={i} style={{ color: p.color }}>
                              {FUEL_TYPE_LABELS[p.name as keyof typeof FUEL_TYPE_LABELS] ?? p.name}: {formatNumber(p.value as number)} L
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {trendFuelTypes.map((ft) => (
                    <Bar
                      key={ft}
                      dataKey={ft}
                      stackId="fuel"
                      fill={FUEL_TYPE_COLORS[ft as keyof typeof FUEL_TYPE_COLORS] ?? '#78716c'}
                      radius={[0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
