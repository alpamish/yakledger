"use client";

import { useEffect, useState } from "react";
import { employeesApi } from "@/services/employee-api";
import { formatMinor } from "@/lib/money";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { CalendarDays, HandCoins } from "lucide-react";

function fmt(amount: number) {
  return formatMinor(Math.round(amount * 100));
}

function StatCard({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: "default" | "green" | "red" | "secondary";
}) {
  const tone =
    accent === "green"
      ? "text-green-600"
      : accent === "red"
      ? "text-red-600"
      : accent === "secondary"
      ? "text-muted-foreground"
      : "";
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={`text-lg font-semibold font-mono ${tone}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function EmployeeFinancialSummaryTab({
  employeeId,
}: {
  employeeId: string;
}) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await employeesApi.getFinancialSummary(employeeId);
        if (!cancelled) setSummary(res.data);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load financial summary");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (loading) {
    return (
      <div className="py-10">
        <LoadingSpinner text="Loading financial summary..." />
      </div>
    );
  }
  if (!summary) return null;

  const outstandingTone =
    summary.outstanding > 0
      ? "green"
      : summary.outstanding < 0
      ? "red"
      : "secondary";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Paid (incl. expenses)"
          value={fmt(summary.totalPaid)}
          sub="Salary + expenses paid + reimbursed"
          accent="green"
        />
        <StatCard
          title="Total Received"
          value={fmt(summary.totalReceived)}
          sub="Salary + expenses paid + advances"
        />
        <StatCard
          title="Total Demand"
          value={fmt(summary.outstanding)}
          sub={
            summary.outstanding > 0
              ? "Company owes employee"
              : summary.outstanding < 0
              ? "Employee owes company"
              : "Settled"
          }
          accent={outstandingTone}
        />
        <StatCard
          title="Employee Wallet"
          value={fmt(summary.walletBalance)}
          sub="Current account balance"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Financial Summary</CardTitle>
          <CardDescription>
            Earning and payment activity since hire date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4 text-primary" />
                Work
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Days worked</span>
                <span className="font-medium">
                  {summary.daysWorked} <span className="text-muted-foreground">days</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overtime hours</span>
                <span className="font-medium">
                  {Number(summary.totalOvertimeHours ?? 0).toFixed(1)}h
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overtime pay</span>
                <span className="font-medium font-mono">{fmt(summary.overtimePay ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Earned salary</span>
                <span className="font-medium font-mono">{fmt(summary.earnedSalary ?? 0)}</span>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <HandCoins className="h-4 w-4 text-primary" />
                Payments &amp; Expenses
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Salary paid (payroll)</span>
                <span className="font-medium font-mono">{fmt(summary.salaryPaid ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expenses paid to employee</span>
                <span className="font-medium font-mono">{fmt(summary.expensesPaidTo ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Reimbursed (employee-paid)</span>
                <span className="font-medium font-mono">{fmt(summary.reimbursements ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Advances received</span>
                <span className="font-medium font-mono">{fmt(summary.advancesReceived ?? 0)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}