'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { fuelUsageApi } from '@/services/contractor-api';
import {
  Loader2,
  ArrowLeft,
  BarChart3,
  AlertTriangle,
  AlertOctagon,
  Fuel,
} from 'lucide-react';
import type { DailyDetailResponse, DailyFuelData, FuelAnomaly } from '@/types/contractor';

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

function getDeviationBadge(deviation: number) {
  const abs = Math.abs(deviation);
  if (abs >= 15) return { label: 'Critical', className: 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400' };
  if (abs >= 5) return { label: 'Warning', className: 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400' };
  return { label: 'Normal', className: 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400' };
}

interface FuelDailyBreakdownProps {
  machineryId: string;
  machineryName: string;
  month: string;
  monthLabel: string;
  onBack: () => void;
}

export function FuelDailyBreakdown({
  machineryId,
  machineryName,
  month,
  monthLabel,
  onBack,
}: FuelDailyBreakdownProps) {
  const [data, setData] = useState<DailyDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fuelUsageApi.getDailyDetail({ machineryId, month });
      setData(res.data ?? null);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [machineryId, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const criticalCount = data?.anomalies.filter((a) => a.severity === 'critical').length ?? 0;
  const warningCount = data?.anomalies.filter((a) => a.severity === 'warning').length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Fuel className="h-5 w-5 text-emerald-600" />
            Daily Breakdown — {monthLabel}
          </h2>
          <p className="text-sm text-muted-foreground">
            {machineryName} — {month}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading daily data...</p>
          </div>
        </div>
      ) : !data ? (
        <div className="py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Failed to load daily breakdown data.</p>
        </div>
      ) : data.dailyData.length === 0 ? (
        <div className="py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No daily fuel records found for this month.</p>
        </div>
      ) : (
        <>
          {/* Anomaly Alert Summary */}
          {(criticalCount > 0 || warningCount > 0) && (
            <Alert variant="default" className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-300">
                {criticalCount + warningCount} Abnormal Day{criticalCount + warningCount > 1 ? 's' : ''} Detected
              </AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                {criticalCount > 0 && `${criticalCount} critical`}
                {criticalCount > 0 && warningCount > 0 && ' and '}
                {warningCount > 0 && `${warningCount} warning`}
                {criticalCount + warningCount > 1 ? ' days' : ' day'} with unusual consumption.
              </AlertDescription>
            </Alert>
          )}

          {/* Daily Breakdown Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                Daily Fuel Records — {monthLabel}
                <span className="text-muted-foreground font-normal text-xs">
                  ({machineryName})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Liters</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">L/hr</TableHead>
                      <TableHead className="text-right">Vs Monthly Avg</TableHead>
                      <TableHead className="text-right">Hours Source</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.dailyData.map((d: DailyFuelData) => {
                      const status = getDeviationBadge(d.deviationPercent);
                      const devColor = d.isAbnormal
                        ? Math.abs(d.deviationPercent) >= 15
                          ? 'text-red-600 dark:text-red-400 font-bold'
                          : 'text-amber-600 dark:text-amber-400 font-bold'
                        : 'text-green-600 dark:text-green-400';
                      return (
                        <TableRow
                          key={d.date}
                          className={d.isAbnormal ? 'bg-red-50/50 dark:bg-red-950/10' : ''}
                        >
                          <TableCell className="font-mono text-xs">{d.date}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatNumber(d.totalLiters)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatCurrency(d.totalCost)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatNumber(d.totalHours)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums font-medium">
                            {d.totalHours > 0 ? formatNumber(d.litersPerHour) : '—'}
                          </TableCell>
                          <TableCell className={`text-right font-mono tabular-nums ${devColor}`}>
                            {d.deviationPercent > 0 ? '+' : ''}{formatNumber(d.deviationPercent)}%
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                d.hasTimesheetData
                                  ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
                                  : 'border-muted-foreground/30 text-muted-foreground'
                              }`}
                            >
                              {d.hasTimesheetData ? 'Timesheet' : 'No Data'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${status.className}`}
                            >
                              {status.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground px-4 py-2 border-t">
                Monthly avg: {formatNumber(data.monthlyAvgLitersPerHour)} L/hr &mdash; Hours from daily timesheet records only.
              </p>
            </CardContent>
          </Card>

          {/* Day Deviation Anomalies */}
          {data.anomalies.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Day Deviation Alerts
                  <Badge variant="destructive" className="ml-2 text-[10px] px-1.5">
                    {criticalCount} Critical
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 border-amber-300 text-amber-700">
                    {warningCount} Warning
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.anomalies.map((anomaly: FuelAnomaly, idx: number) => {
                  const SeverityIcon = anomaly.severity === 'critical' ? AlertOctagon : AlertTriangle;
                  return (
                    <div
                      key={`daily_anomaly_${idx}`}
                      className={`rounded-lg border p-4 ${
                        anomaly.severity === 'critical'
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                          : 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <SeverityIcon
                          className={`h-5 w-5 mt-0.5 ${
                            anomaly.severity === 'critical'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase ${
                                anomaly.severity === 'critical'
                                  ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400'
                                  : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {anomaly.severity}
                            </Badge>
                          </div>
                          <p className="text-sm mt-1">{anomaly.message}</p>
                          <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
                            <span>
                              Actual: <strong>{formatNumber(anomaly.actualValue)} L/hr</strong>
                            </span>
                            <span>
                              Expected: <strong>{formatNumber(anomaly.expectedValue)} L/hr</strong>
                            </span>
                            <span>
                              Deviation: <strong>{formatNumber(Math.abs(anomaly.deviationPercent))}%</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
