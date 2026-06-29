'use client';

import * as React from 'react';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
} from '@/types/employee';
import type { Department } from '@/types/employee';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import {
  Users,
  UserCheck,
  UserX,
  UserMinus,
  DollarSign,
  TrendingUp,
  Calendar,
} from 'lucide-react';
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
  Legend,
} from 'recharts';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
}

function StatCard({ title, value, description, icon: Icon, iconColor = 'text-emerald-600 dark:text-emerald-400' }: StatCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function DepartmentChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className="text-emerald-600 dark:text-emerald-400">
        {payload[0].value} employee{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

function PieChartLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string }>;
}) {
  if (!payload?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <div
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

interface EmployeeDashboardProps {
  onViewProfile?: (employee: { id: string }) => void;
}

export function EmployeeDashboard({ onViewProfile }: EmployeeDashboardProps) {
  const { dashboardStats, fetchDashboard, isLoading } = useEmployeeStore();
  const [hasFetched, setHasFetched] = React.useState(false);

  React.useEffect(() => {
    if (!hasFetched) {
      fetchDashboard();
      setHasFetched(true);
    }
  }, [fetchDashboard, hasFetched]);

  if (isLoading && !dashboardStats) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading employee dashboard..." />
      </div>
    );
  }

  if (!dashboardStats) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <EmptyState
          icon={Users}
          title="No employee data"
          description="Start adding employees to see dashboard statistics."
        />
      </div>
    );
  }

  const {
    totalEmployees,
    activeEmployees,
    inactiveEmployees,
    terminatedEmployees,
    employeesByDepartment,
    recentHires,
    totalPayroll,
    averageSalary,
  } = dashboardStats;

  // Prepare bar chart data
  const barData = employeesByDepartment.map((item) => ({
    department: DEPARTMENT_LABELS[item.department as Department] ?? item.department,
    count: item.count,
    departmentKey: item.department,
  }));

  // Prepare pie chart data
  const pieData = employeesByDepartment.map((item) => ({
    name: DEPARTMENT_LABELS[item.department as Department] ?? item.department,
    value: item.count,
    department: item.department,
  }));

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Employees"
          value={totalEmployees.toString()}
          description={`${activeEmployees} active`}
          icon={Users}
        />
        <StatCard
          title="Active"
          value={activeEmployees.toString()}
          description={`${totalEmployees > 0 ? ((activeEmployees / totalEmployees) * 100).toFixed(0) : 0}% of workforce`}
          icon={UserCheck}
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="Inactive"
          value={inactiveEmployees.toString()}
          description={`${terminatedEmployees} terminated`}
          icon={UserX}
          iconColor="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          title="Monthly Payroll"
          value={formatCurrency(totalPayroll)}
          description={`Avg: ${formatCurrency(averageSalary)}/employee`}
          icon={DollarSign}
        />
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Department Bar Chart */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Employees by Department
            </CardTitle>
            <CardDescription>Distribution across departments</CardDescription>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center">
                <p className="text-sm text-muted-foreground">No department data available</p>
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-border/50"
                    />
                    <XAxis
                      dataKey="department"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      angle={-20}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                      allowDecimals={false}
                      className="fill-muted-foreground"
                    />
                    <Tooltip content={<DepartmentChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {barData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={DEPARTMENT_COLORS[entry.departmentKey as Department] ?? '#78716c'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department Distribution Pie Chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Department Distribution
            </CardTitle>
            <CardDescription>Proportional breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center">
                <p className="text-sm text-muted-foreground">No data available</p>
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={1}
                      stroke="hsl(var(--background))"
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={DEPARTMENT_COLORS[entry.department as Department] ?? '#78716c'}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value} employees`, 'Count']}
                    />
                    <Legend
                      content={<PieChartLegend />}
                      layout="horizontal"
                      verticalAlign="bottom"
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Hires */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Recently Hired Employees
          </CardTitle>
          <CardDescription>Latest additions to the team</CardDescription>
        </CardHeader>
        <CardContent>
          {recentHires.length === 0 ? (
            <div className="flex h-24 items-center justify-center">
              <p className="text-sm text-muted-foreground">No recent hires</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {recentHires.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => onViewProfile?.(emp)}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer text-left w-full"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                    {emp.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{emp.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{emp.jobTitle}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="border-0 text-[10px] px-1.5 py-0"
                        style={{
                          backgroundColor: `${DEPARTMENT_COLORS[emp.department as Department] ?? '#78716c'}18`,
                          color: DEPARTMENT_COLORS[emp.department as Department] ?? '#78716c',
                        }}
                      >
                        {DEPARTMENT_LABELS[emp.department as Department] ?? emp.department}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(emp.hireDate)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
