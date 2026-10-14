"use client";

// Fuel variance tab (Phase 3): expected fuel (consumption rate × worked
// hours from daily logs) vs actual FuelUsage per day. Days without a daily
// log or a consumption rate show null expectation (coverage gaps).
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { machineryOpsApi } from "@/services/machinery-ops-api";
import type { FuelVarianceRow, Machinery } from "@/types/contractor";
import { Fuel, TrendingDown, TrendingUp } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

interface Props {
  machinery: Machinery;
}

export function FuelVarianceTab({ machinery }: Props) {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);

  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [rows, setRows] = useState<FuelVarianceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await machineryOpsApi.fuelVariance({
        machineryId: machinery.id,
        from,
        to,
      });
      setRows(res.rows);
    } catch {
      // parent toast handles auth/errors; keep the tab usable
    } finally {
      setLoading(false);
    }
  }, [machinery.id, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const totalActual = rows.reduce((s, r) => s + r.actualLiters, 0);
  const expectedRows = rows.filter((r) => r.expectedLiters != null);
  const totalExpected = expectedRows.reduce((s, r) => s + (r.expectedLiters ?? 0), 0);
  const totalVariance = totalActual - totalExpected;
  const coverage = rows.length > 0 ? Math.round((expectedRows.length / rows.length) * 100) : 0;
  const overBudget = totalVariance > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Fuel className="size-4" />
          Fuel Variance
        </CardTitle>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              className="h-8 w-36"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              className="h-8 w-36"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={load}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No fuel usage in this range (or none visible to you).
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Actual</p>
                <p className="text-lg font-semibold tabular-nums">{fmt(totalActual)} L</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Expected</p>
                <p className="text-lg font-semibold tabular-nums">{fmt(totalExpected)} L</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Variance</p>
                <p
                  className={`text-lg font-semibold tabular-nums flex items-center gap-1 ${
                    overBudget ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {overBudget ? (
                    <TrendingUp className="size-4" />
                  ) : (
                    <TrendingDown className="size-4" />
                  )}
                  {overBudget ? "+" : ""}
                  {fmt(totalVariance)} L
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Coverage</p>
                <p className="text-lg font-semibold tabular-nums">{coverage}%</p>
                <p className="text-[10px] text-muted-foreground">days with log + rate</p>
              </div>
            </div>

            <div className="rounded-md border divide-y">
              <div className="grid grid-cols-6 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
                <span>Date</span>
                <span className="text-right">Worked</span>
                <span className="text-right">Expected</span>
                <span className="text-right">Actual</span>
                <span className="text-right">Variance</span>
                <span>Status</span>
              </div>
              {rows.map((r) => (
                <div
                  key={`${r.machineryId}-${r.date}`}
                  className="grid grid-cols-6 gap-2 px-3 py-2 text-sm items-center"
                >
                  <span className="text-xs">{r.date}</span>
                  <span className="text-right tabular-nums text-xs">
                    {r.workedHours != null ? `${fmt(r.workedHours)}h` : "—"}
                  </span>
                  <span className="text-right tabular-nums text-xs">
                    {r.expectedLiters != null ? `${fmt(r.expectedLiters)} L` : "—"}
                  </span>
                  <span className="text-right tabular-nums text-xs">
                    {fmt(r.actualLiters)} L
                  </span>
                  <span
                    className={`text-right tabular-nums text-xs font-medium ${
                      r.variance == null
                        ? "text-muted-foreground"
                        : r.variance > 0
                          ? "text-rose-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {r.variance == null
                      ? "—"
                      : `${r.variance > 0 ? "+" : ""}${fmt(r.variance)} L`}
                  </span>
                  <span>
                    {r.expectedLiters == null ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {r.workedHours == null ? "No daily log" : "No rate"}
                      </Badge>
                    ) : r.variance != null && r.variance > 0 ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Over
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        OK
                      </Badge>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
