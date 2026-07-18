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
} from 'recharts';
import { BarChart3, TrendingUp, PieChart } from 'lucide-react';
import type { MonthlyAnalysisResponse, MonthlyFuelData } from '@/types/contractor';
import { FUEL_TYPE_COLORS, FUEL_TYPE_LABELS } from '@/types/contractor';

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

interface ChartDataPoint {
  month: string;
  monthLabel: string;
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
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartDataPoint }>;
  label?: string;
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
      <p className="mb-1 font-medium">{d.monthLabel}{d.machineryName ? ` — ${d.machineryName}` : ''}</p>
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
}

export function FuelAnalysisCharts({ analysisData, selectedMachineryName }: FuelAnalysisChartsProps) {
  const chartData = useMemo(() => {
    const points: ChartDataPoint[] = [];
    for (const d of analysisData) {
      const mName = (d.machinery as { machineryName?: string })?.machineryName ?? '';
      for (const m of d.monthlyData) {
        if (m.totalLiters > 0 || m.totalHours > 0) {
          points.push({
            month: m.month,
            monthLabel: m.monthLabel,
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
  }, [analysisData]);

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Monthly Consumption Bar Chart */}
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
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v.toFixed(0)}`}
                />
                <Tooltip content={<ConsumptionBarTooltip />} />
                <Bar dataKey="totalLiters" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, idx) => {
                    const color = deviationColors[idx] ?? '#10b981';
                    return <Cell key={`cell-${idx}`} fill={color} fillOpacity={0.8} />;
                  })}
                </Bar>
              </BarChart>
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
                  dataKey="monthLabel"
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
                      for (const m of d.monthlyData) {
                        if (m.totalLiters > 0) {
                          const existing = fuelMap.get('Total') ?? 0;
                          fuelMap.set('Total', existing + m.totalLiters);
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
                    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
                    return (
                      // Single segment, multi-segment if we had per-fuel-type data
                      <Cell key="total" fill={colors[0]} />
                    );
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
    </div>
  );
}
