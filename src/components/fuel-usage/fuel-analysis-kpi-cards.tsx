'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Droplets,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Gauge,
} from 'lucide-react';

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

interface KpiCardsProps {
  totalLiters: number;
  totalCost: number;
  avgLitersPerHour: number;
  anomalyCount: number;
  criticalCount: number;
  warningCount: number;
  machineryCount: number;
  avgDeviationPercent: number;
}

export function FuelAnalysisKpiCards({
  totalLiters,
  totalCost,
  avgLitersPerHour,
  anomalyCount,
  criticalCount,
  warningCount,
  machineryCount,
  avgDeviationPercent,
}: KpiCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card className="border-emerald-200 dark:border-emerald-900">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium text-muted-foreground">Total Fuel</CardTitle>
          <Droplets className="h-4 w-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {formatNumber(totalLiters)} <span className="text-xs font-normal">L</span>
          </p>
        </CardContent>
      </Card>

      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium text-muted-foreground">Total Cost</CardTitle>
          <BarChart3 className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
            {formatCurrency(totalCost)}
          </p>
        </CardContent>
      </Card>

      <Card className="border-violet-200 dark:border-violet-900">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium text-muted-foreground">Avg L/hr</CardTitle>
          <Gauge className="h-4 w-4 text-violet-600" />
        </CardHeader>
        <CardContent>
          <p className="text-lg font-bold text-violet-700 dark:text-violet-400">
            {formatNumber(avgLitersPerHour)}
          </p>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-900">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium text-muted-foreground">Avg Deviation</CardTitle>
          <TrendingUp className="h-4 w-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <p className={`text-lg font-bold ${Math.abs(avgDeviationPercent) >= 15 ? 'text-red-600 dark:text-red-400' : Math.abs(avgDeviationPercent) >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
            {avgDeviationPercent > 0 ? '+' : ''}{formatNumber(avgDeviationPercent)}%
          </p>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium text-muted-foreground">Anomalies</CardTitle>
          <AlertTriangle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <p className="text-lg font-bold text-red-700 dark:text-red-400">
            {anomalyCount}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {criticalCount} critical · {warningCount} warning
          </p>
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium text-muted-foreground">Machinery</CardTitle>
          <Gauge className="h-4 w-4 text-gray-600" />
        </CardHeader>
        <CardContent>
          <p className="text-lg font-bold text-gray-700 dark:text-gray-400">
            {machineryCount}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
