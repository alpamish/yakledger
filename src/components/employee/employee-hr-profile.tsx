"use client";

import { useEffect, useState, useCallback } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { employeesApi } from "@/services/employee-api";
import { getToken } from "@/services/api";
import { formatMinor } from "@/lib/money";
import type { Employee } from "@/types/employee";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { EmptyState } from "@/components/common/empty-state";
import { PayrollActions } from "@/components/payroll/payroll-actions";
import { PayrollGenerateDialog } from "@/components/payroll/payroll-generate-dialog";
import { EmployeeFinancialSummaryTab } from "@/components/employee/employee-financial-summary-tab";
import { EmployeeExpensesTab } from "@/components/employee/employee-expenses-tab";
import {
  FileText,
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Briefcase,
  Calendar,
  Clock,
  Wallet,
  Users,
  IdCard,
  Hash,
  Upload,
  Download,
} from "lucide-react";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}
function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

export function EmployeeHrProfile({ employee }: { employee: Employee }) {
  const { hasPermission } = usePermissions();
  const canViewSalary = hasPermission("employees:salary:view");
  const canManageSalary = hasPermission("employees:salary:manage");
  const canManageContract = hasPermission("employees:contract:manage");
  const canManageDocuments = hasPermission("employees:documents:manage");
  const canManageLeave = hasPermission("employees:leave:manage");
  const canViewPayroll = hasPermission("employees:payroll:view");
  const canManagePayroll = hasPermission("employees:payroll:manage");
  const canViewExpenses = hasPermission("expenses:view");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [salary, contracts, documents, leaves, assignments, payroll, audit, leaveTypes] =
        await Promise.all([
          canViewSalary ? employeesApi.getSalaryHistory(employee.id) : Promise.resolve(null),
          employeesApi.getContracts(employee.id),
          employeesApi.getDocuments(employee.id),
          employeesApi.getLeaves(employee.id),
          employeesApi.getAssignments(employee.id),
          canViewPayroll ? employeesApi.getPayroll(employee.id) : Promise.resolve(null),
          employeesApi.getAuditEvents(employee.id),
          employeesApi.getLeaveTypes(),
        ]);
      setData({
        salary: salary?.data,
        contracts: contracts.data,
        documents: documents.data,
        leaves: leaves.data,
        assignments: assignments.data,
        payroll: payroll?.data,
        audit: audit.data,
        leaveTypes: leaveTypes.data,
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to load HR data");
    } finally {
      setLoading(false);
    }
  }, [employee.id, canViewSalary, canViewPayroll]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">
                {employee.fullName}
                {employee.employeeNumber && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {employee.employeeNumber}
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                {employee.jobTitle} · {employee.department}
              </CardDescription>
            </div>
            <Badge>{employee.status}</Badge>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canViewSalary && <TabsTrigger value="salary">Salary History</TabsTrigger>}
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          {canViewPayroll && <TabsTrigger value="payroll">Payroll</TabsTrigger>}
          {canViewPayroll && <TabsTrigger value="summary">Financial Summary</TabsTrigger>}
          {canViewExpenses && <TabsTrigger value="expenses">Expenses</TabsTrigger>}
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="py-10">
            <LoadingSpinner text="Loading HR records..." />
          </div>
        ) : (
          <>
            <TabsContent value="overview">
              <OverviewTab employee={employee} salary={data.salary?.current} canViewSalary={canViewSalary} />
            </TabsContent>

            {canViewSalary && (
              <TabsContent value="salary">
                <SalaryTab
                  history={data.salary?.history ?? []}
                  current={data.salary?.current}
                  canManage={canManageSalary}
                  onChanged={load}
                  employeeId={employee.id}
                />
              </TabsContent>
            )}

            <TabsContent value="contracts">
              <ContractsTab
                rows={data.contracts ?? []}
                canManage={canManageContract}
                onChanged={load}
                employeeId={employee.id}
              />
            </TabsContent>

            <TabsContent value="documents">
              <DocumentsTab
                rows={data.documents ?? []}
                canManage={canManageDocuments}
                onChanged={load}
                employeeId={employee.id}
              />
            </TabsContent>

            <TabsContent value="leave">
              <LeaveTab
                rows={data.leaves ?? []}
                leaveTypes={data.leaveTypes ?? []}
                canManage={canManageLeave}
                onChanged={load}
                employeeId={employee.id}
              />
            </TabsContent>

            {canViewPayroll && (
              <TabsContent value="payroll">
                <PayrollTab
                  rows={data.payroll ?? []}
                  employeeId={employee.id}
                  canManage={canManagePayroll}
                  onChanged={load}
                />
              </TabsContent>
            )}

            {canViewPayroll && (
              <TabsContent value="summary">
                <EmployeeFinancialSummaryTab employeeId={employee.id} />
              </TabsContent>
            )}

            {canViewExpenses && (
              <TabsContent value="expenses">
                <EmployeeExpensesTab employeeId={employee.id} />
              </TabsContent>
            )}

            <TabsContent value="assignments">
              <AssignmentsTab
                rows={data.assignments ?? []}
                onChanged={load}
                employeeId={employee.id}
              />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityTab rows={data.audit ?? []} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function tenure(hireDate?: string | Date | null) {
  if (!hireDate) return null;
  const start = new Date(hireDate);
  const now = new Date();
  const months =
    now.getMonth() -
    start.getMonth() +
    (now.getFullYear() - start.getFullYear()) * 12;
  if (months < 0) return null;
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m > 0 ? `${y} yr ${m} mo` : `${y} yr`;
}

function paidHours(start?: string | null, end?: string | null, breakMins?: number | null) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const totalMinutes = eh * 60 + em - (sh * 60 + sm) - (breakMins ?? 0);
  if (totalMinutes <= 0) return null;
  return `${(totalMinutes / 60).toFixed(1)}h`;
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate">{value || "—"}</div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function OverviewTab({
  employee,
  salary,
  canViewSalary,
}: {
  employee: Employee;
  salary?: any;
  canViewSalary: boolean;
}) {
  const schedule = `${employee.workStartTime ?? "07:00"} – ${employee.workEndTime ?? "18:00"} (${employee.breakMinutes ?? 0}m break)`;
  const dailyPaid = paidHours(
    employee.workStartTime,
    employee.workEndTime,
    employee.breakMinutes
  );
  const empTenure = tenure(employee.hireDate);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
            {initials(employee.fullName)}
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-2xl">{employee.fullName}</CardTitle>
              <Badge
                variant={employee.status === "ACTIVE" ? "default" : "secondary"}
              >
                {employee.status}
              </Badge>
            </div>
            <CardDescription className="text-base">
              {employee.jobTitle || "—"} · {employee.department || "—"}
            </CardDescription>
            <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground pt-1">
              {employee.employeeNumber && (
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" /> {employee.employeeNumber}
                </span>
              )}
              {empTenure && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {empTenure}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard title="Personal" icon={User}>
            <DetailItem icon={User} label="Father Name" value={employee.fatherName} />
            <DetailItem icon={Users} label="Grandfather" value={employee.grandfatherName} />
            <DetailItem icon={Phone} label="Phone" value={employee.phoneNumber} />
            <DetailItem icon={Mail} label="Email" value={employee.email} />
            <DetailItem icon={IdCard} label="National ID" value={employee.nationalId} />
          </SectionCard>

          <SectionCard title="Employment" icon={Briefcase}>
            <DetailItem icon={Building2} label="Department" value={employee.department} />
            <DetailItem icon={Briefcase} label="Employment Type" value={employee.employmentType} />
            <DetailItem icon={Calendar} label="Hire Date" value={fmtDate(employee.hireDate)} />
            <DetailItem icon={MapPin} label="Work Location" value={employee.workLocation} />
          </SectionCard>

          <SectionCard title="Schedule" icon={Clock}>
            <DetailItem icon={Clock} label="Daily Hours" value={schedule} />
            <DetailItem icon={Clock} label="Paid Hours / Day" value={dailyPaid} />
          </SectionCard>

          {canViewSalary && (
            <SectionCard title="Compensation" icon={Wallet}>
              <DetailItem
                icon={Wallet}
                label="Current Salary"
                value={
                  salary ? formatMinor(salary.amountMinor, salary.currency) : "—"
                }
              />
              <DetailItem
                icon={Calendar}
                label="Effective Since"
                value={fmtDate(salary?.effectiveFrom)}
              />
            </SectionCard>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SalaryTab({
  history,
  current,
  canManage,
  onChanged,
  employeeId,
}: {
  history: any[];
  current: any;
  canManage: boolean;
  onChanged: () => void;
  employeeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!amount || !effectiveFrom) {
      toast.error("Amount and effective date are required");
      return;
    }
    setSaving(true);
    try {
      await employeesApi.createSalaryChange(employeeId, {
        amount: parseFloat(amount),
        effectiveFrom,
        reason,
      });
      toast.success("Salary change recorded");
      setOpen(false);
      setAmount("");
      setEffectiveFrom("");
      setReason("");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Salary History</CardTitle>
          {current && (
            <CardDescription>
              Current: {formatMinor(current.amountMinor, current.currency)} (since{" "}
              {fmtDate(current.effectiveFrom)})
            </CardDescription>
          )}
        </div>
        {canManage && (
          <Button onClick={() => setOpen(true)}>Add Salary Change</Button>
        )}
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <EmptyState icon={FileText} title="No salary records" description="Salary history is empty." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Effective From</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{fmtDate(h.effectiveFrom)}</TableCell>
                  <TableCell className="font-mono">{formatMinor(h.amountMinor, h.currency)}</TableCell>
                  <TableCell>{h.currency}</TableCell>
                  <TableCell>{h.reason || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Salary Change</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Effective From</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const CONTRACT_TYPES = [
  { value: "FIXED_TERM", label: "Fixed Term" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "PART_TIME", label: "Part Time" },
  { value: "INTERN", label: "Intern" },
  { value: "OTHER", label: "Other" },
];

function ContractsTab({
  rows,
  canManage,
  onChanged,
  employeeId,
}: {
  rows: any[];
  canManage: boolean;
  onChanged: () => void;
  employeeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ contractType: "FIXED_TERM", status: "ACTIVE" });
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  function reset() {
    setForm({ contractType: "FIXED_TERM", status: "ACTIVE" });
    setFile(null);
    setFileKey((k) => k + 1);
  }

  async function save() {
    if (!form.contractNumber || !form.startDate) {
      toast.error("Contract number and start date are required");
      return;
    }
    setSaving(true);
    try {
      let fileUrl: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch(`/api/employees/${employeeId}/contracts/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        });
        const upBody = await up.json();
        if (!upBody.success) throw new Error(upBody.error || "Upload failed");
        fileUrl = upBody.data.fileUrl;
      }

      await employeesApi.createContract(employeeId, {
        contractNumber: form.contractNumber,
        contractType: form.contractType || "FIXED_TERM",
        startDate: form.startDate,
        endDate: form.endDate || null,
        position: form.position,
        department: form.department,
        salaryMinor: form.salaryMinor ? parseFloat(form.salaryMinor) : 0,
        status: form.status || "ACTIVE",
        fileUrl,
        notes: form.notes,
      });
      toast.success("Contract created");
      setOpen(false);
      reset();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Contracts</CardTitle>
        {canManage && (
          <Button onClick={() => setOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Add Contract
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="No contracts" description="No contract records yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>File</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.contractNumber}</TableCell>
                  <TableCell>{c.contractType}</TableCell>
                  <TableCell>{fmtDate(c.startDate)}</TableCell>
                  <TableCell>{fmtDate(c.endDate)}</TableCell>
                  <TableCell className="font-mono">{formatMinor(c.salaryMinor, c.currency)}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {c.fileUrl ? (
                      <a
                        href={c.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-xs text-primary hover:underline"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contract</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contract Number *</Label>
              <Input
                value={form.contractNumber || ""}
                onChange={(e) => set("contractNumber", e.target.value)}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={form.contractType || "FIXED_TERM"}
                onValueChange={(v) => set("contractType", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date *</Label>
              <Input type="date" value={form.startDate || ""} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.endDate || ""} onChange={(e) => set("endDate", e.target.value)} />
            </div>
            <div>
              <Label>Position</Label>
              <Input value={form.position || ""} onChange={(e) => set("position", e.target.value)} />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={form.department || ""} onChange={(e) => set("department", e.target.value)} />
            </div>
            <div>
              <Label>Salary</Label>
              <Input type="number" value={form.salaryMinor || ""} onChange={(e) => set("salaryMinor", e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status || "ACTIVE"}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="TERMINATED">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Contract File</Label>
              <Input
                key={fileKey}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <div className="text-xs text-muted-foreground mt-1">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Uploading..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const DOCUMENT_TYPES = [
  { value: "ID_CARD", label: "ID Card / Tazkira" },
  { value: "PASSPORT", label: "Passport" },
  { value: "DRIVERS_LICENSE", label: "Driver's License" },
  { value: "WORK_PERMIT", label: "Work Permit" },
  { value: "EDUCATION_CERTIFICATE", label: "Education Certificate" },
  { value: "OTHER", label: "Other" },
];

function DocumentsTab({
  rows,
  canManage,
  onChanged,
  employeeId,
}: {
  rows: any[];
  canManage: boolean;
  onChanged: () => void;
  employeeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  function reset() {
    setForm({});
    setFile(null);
    setFileKey((k) => k + 1);
  }

  async function save() {
    if (!form.documentType) {
      toast.error("Document type is required");
      return;
    }
    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch(`/api/employees/${employeeId}/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const upBody = await up.json();
      if (!upBody.success) throw new Error(upBody.error || "Upload failed");

      await employeesApi.createDocument(employeeId, {
        documentType: form.documentType,
        documentNumber: form.documentNumber,
        issueDate: form.issueDate || null,
        expiryDate: form.expiryDate || null,
        fileUrl: upBody.data.fileUrl,
        notes: form.notes,
      });
      toast.success("Document added");
      setOpen(false);
      reset();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Documents</CardTitle>
        {canManage && (
          <Button onClick={() => setOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Upload Document
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents"
            description="No documents uploaded."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.documentType}</TableCell>
                  <TableCell>{d.documentNumber || "—"}</TableCell>
                  <TableCell>{fmtDate(d.issueDate)}</TableCell>
                  <TableCell>
                    {d.expiryDate ? (
                      <span
                        className={
                          new Date(d.expiryDate) < new Date()
                            ? "text-red-500 font-medium"
                            : ""
                        }
                      >
                        {fmtDate(d.expiryDate)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {d.fileUrl ? (
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-xs text-primary hover:underline"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{d.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Document Type *</Label>
              <Select
                value={form.documentType || ""}
                onValueChange={(v) => set("documentType", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Document Number</Label>
              <Input
                value={form.documentNumber || ""}
                onChange={(e) => set("documentNumber", e.target.value)}
              />
            </div>
            <div>
              <Label>Issue Date</Label>
              <Input
                type="date"
                value={form.issueDate || ""}
                onChange={(e) => set("issueDate", e.target.value)}
              />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={form.expiryDate || ""}
                onChange={(e) => set("expiryDate", e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label>File *</Label>
              <Input
                key={fileKey}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <div className="text-xs text-muted-foreground mt-1">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function LeaveTab({
  rows,
  leaveTypes,
  canManage,
  onChanged,
  employeeId,
}: {
  rows: any[];
  leaveTypes: any[];
  canManage: boolean;
  onChanged: () => void;
  employeeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  function set(k: string, v: string) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.startDate || !form.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    setSaving(true);
    try {
      await employeesApi.createLeave(employeeId, {
        leaveTypeId: form.leaveTypeId || null,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
      });
      toast.success("Leave request created");
      setOpen(false);
      setForm({});
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    try {
      await employeesApi.approveLeave(employeeId, id, status);
      toast.success(`Leave ${status.toLowerCase()}`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Leave</CardTitle>
        {canManage && <Button onClick={() => setOpen(true)}>Request Leave</Button>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="No leave records" description="No leave requests." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.leaveType?.name || "—"}</TableCell>
                  <TableCell>{fmtDate(l.startDate)}</TableCell>
                  <TableCell>{fmtDate(l.endDate)}</TableCell>
                  <TableCell>{l.days}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        l.status === "APPROVED"
                          ? "default"
                          : l.status === "REJECTED"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {l.status}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      {l.status === "PENDING" && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => decide(l.id, "APPROVED")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => decide(l.id, "REJECTED")}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Leave Type</Label>
              <select
                className="w-full rounded border px-2 py-2 text-sm"
                value={form.leaveTypeId || ""}
                onChange={(e) => set("leaveTypeId", e.target.value)}
              >
                <option value="">— Select —</option>
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate || ""} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.endDate || ""} onChange={(e) => set("endDate", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea value={form.reason || ""} onChange={(e) => set("reason", e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PayrollTab({
  rows,
  employeeId,
  canManage,
  onChanged,
}: {
  rows: any[];
  employeeId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [generateOpen, setGenerateOpen] = useState(false);

  async function handleExport() {
    try {
      const res = await fetch("/api/payroll/export", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payroll-export.csv";
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Payroll CSV downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Payroll History</CardTitle>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGenerateOpen(true)}
            >
              Generate Payroll
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="No payroll" description="No payroll records generated." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Already Received</TableHead>
                <TableHead>Prev Debt</TableHead>
                <TableHead>Net Payable</TableHead>
                <TableHead>Remaining Debt</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Wallet</TableHead>
                {canManage && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const line = p.lines?.[0];
                const prevDebt = line?.previousDebtMinor ?? 0;
                // Payment state comes from the authoritative payroll figures,
                // not the line-level marker, which can go stale.
                const netPayMinor = Math.max(line?.netPayMinor ?? 0, 0);
                const paidMinor = p.totalPaidMinor ?? 0;
                const fullyPaid =
                  p.status === "PAID" ||
                  (netPayMinor > 0 && paidMinor >= netPayMinor);
                const partiallyPaid = paidMinor > 0 && !fullyPaid;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {fmtDate(p.periodStart)} → {fmtDate(p.periodEnd)}
                    </TableCell>
                    <TableCell className="font-mono">
                      {line ? formatMinor(line.grossPayMinor ?? line.netPayMinor, line.currency) : "—"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {line ? formatMinor(line.amountAlreadyReceivedMinor ?? 0) : "—"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {prevDebt === 0 ? "—" : formatMinor(prevDebt)}
                    </TableCell>
                    <TableCell className="font-mono font-semibold">
                      {line ? formatMinor(line.netPayableMinor ?? line.netPayMinor) : "—"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {(line?.remainingEmployeeDebtMinor ?? 0) === 0
                        ? "—"
                        : formatMinor(line.remainingEmployeeDebtMinor)}
                    </TableCell>
                    <TableCell>
                      {fullyPaid ? (
                        <Badge variant="default">
                          Paid
                          {line?.paymentMethod ? ` (${line.paymentMethod})` : ""}
                        </Badge>
                      ) : partiallyPaid ? (
                        <Badge variant="default">
                          Partially paid — {formatMinor(paidMinor)} of{" "}
                          {formatMinor(netPayMinor)}
                        </Badge>
                      ) : p.status === "APPROVED" ||
                        p.status === "PARTIALLY_PAID" ? (
                        <Badge variant="outline">Approved — unpaid</Badge>
                      ) : (
                        <Badge variant="secondary">{p.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {p.wallet?.name ?? "—"}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <PayrollActions
                          payrollId={p.id}
                          employeeId={employeeId}
                          status={p.status}
                          defaultWalletId={p.walletId}
                          netPayMinor={line?.netPayMinor ?? 0}
                          totalPaidMinor={p.totalPaidMinor ?? 0}
                          onChanged={onChanged}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <PayrollGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        employeeIds={[employeeId]}
        scopeLabel="this employee"
        onGenerated={onChanged}
      />
    </Card>
  );
}

function AssignmentsTab({
  rows,
  onChanged,
  employeeId,
}: {
  rows: any[];
  onChanged: () => void;
  employeeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  function set(k: string, v: string) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.project || !form.startDate) {
      toast.error("Project and start date are required");
      return;
    }
    setSaving(true);
    try {
      await employeesApi.createAssignment(employeeId, {
        project: form.project,
        position: form.position,
        startDate: form.startDate,
        endDate: form.endDate || null,
        notes: form.notes,
      });
      toast.success("Assignment created");
      setOpen(false);
      setForm({});
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Project Assignments</CardTitle>
        <Button onClick={() => setOpen(true)}>Add Assignment</Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="No assignments" description="No project assignments recorded." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.project}</TableCell>
                  <TableCell>{a.position || "—"}</TableCell>
                  <TableCell>{fmtDate(a.startDate)}</TableCell>
                  <TableCell>{fmtDate(a.endDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Project Assignment</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Project</Label>
              <Input value={form.project || ""} onChange={(e) => set("project", e.target.value)} />
            </div>
            <div>
              <Label>Position</Label>
              <Input value={form.position || ""} onChange={(e) => set("position", e.target.value)} />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate || ""} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.endDate || ""} onChange={(e) => set("endDate", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ActivityTab({ rows }: { rows: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity History</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="No activity" description="No audit events recorded." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{fmtDateTime(a.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{a.action}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.previousValue && a.newValue
                      ? `${a.previousValue} → ${a.newValue}`
                      : a.reason || a.newValue || ""}
                  </TableCell>
                  <TableCell>{a.performedBy?.name || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
