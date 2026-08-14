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
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { EmptyState } from "@/components/common/empty-state";
import { FileText } from "lucide-react";

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

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Employment Overview</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <InfoItem label="Father Name" value={employee.fatherName} />
        <InfoItem label="Grandfather" value={employee.grandfatherName} />
        <InfoItem label="Phone" value={employee.phoneNumber} />
        <InfoItem label="Email" value={employee.email} />
        <InfoItem label="National ID" value={employee.nationalId} />
        <InfoItem label="Department" value={employee.department} />
        <InfoItem label="Employment Type" value={employee.employmentType} />
        <InfoItem label="Hire Date" value={fmtDate(employee.hireDate)} />
        <InfoItem label="Work Location" value={employee.workLocation} />
        {canViewSalary && (
          <InfoItem
            label="Current Salary"
            value={salary ? formatMinor(salary.amountMinor, salary.currency) : "—"}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SalaryTab({
  history,
  current,
  canManage,
  onChanged,
}: {
  history: any[];
  current: any;
  canManage: boolean;
  onChanged: () => void;
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
      await employeesApi.createSalaryChange(history[0]?.employeeId ?? "", {
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
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.contractNumber || !form.startDate) {
      toast.error("Contract number and start date are required");
      return;
    }
    setSaving(true);
    try {
      await employeesApi.createContract(employeeId, {
        contractNumber: form.contractNumber,
        startDate: form.startDate,
        endDate: form.endDate || null,
        position: form.position,
        department: form.department,
        salaryMinor: form.salaryMinor ? parseFloat(form.salaryMinor) : 0,
        notes: form.notes,
      });
      toast.success("Contract created");
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
        <CardTitle>Contracts</CardTitle>
        {canManage && <Button onClick={() => setOpen(true)}>Add Contract</Button>}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contract</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contract Number</Label>
              <Input value={form.contractNumber || ""} onChange={(e) => set("contractNumber", e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Input value={form.contractType || "FIXED_TERM"} onChange={(e) => set("contractType", e.target.value)} />
            </div>
            <div>
              <Label>Start Date</Label>
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
              <Label>Salary</Label>
              <Input type="number" value={form.salaryMinor || ""} onChange={(e) => set("salaryMinor", e.target.value)} />
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
  const [saving, setSaving] = useState(false);
  function set(k: string, v: string) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.documentType) {
      toast.error("Document type is required");
      return;
    }
    setSaving(true);
    try {
      await employeesApi.createDocument(employeeId, {
        documentType: form.documentType,
        documentNumber: form.documentNumber,
        issueDate: form.issueDate || null,
        expiryDate: form.expiryDate || null,
        notes: form.notes,
      });
      toast.success("Document added");
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
        <CardTitle>Documents</CardTitle>
        {canManage && <Button onClick={() => setOpen(true)}>Add Document</Button>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="No documents" description="No documents uploaded." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
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
                      <span className={new Date(d.expiryDate) < new Date() ? "text-red-500 font-medium" : ""}>
                        {fmtDate(d.expiryDate)}
                      </span>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Document Type</Label>
              <Input value={form.documentType || ""} onChange={(e) => set("documentType", e.target.value)} placeholder="Tazkira, Passport, Contract..." />
            </div>
            <div>
              <Label>Document Number</Label>
              <Input value={form.documentNumber || ""} onChange={(e) => set("documentNumber", e.target.value)} />
            </div>
            <div>
              <Label>Issue Date</Label>
              <Input type="date" value={form.issueDate || ""} onChange={(e) => set("issueDate", e.target.value)} />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiryDate || ""} onChange={(e) => set("expiryDate", e.target.value)} />
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
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function handleRevert(p: any) {
    if (typeof window !== "undefined" && !window.confirm("Revert this approved payroll back to draft?")) {
      return;
    }
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/employees/${employeeId}/payroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          action: "revert",
          payrollId: p.id,
          reason: "Manual correction",
        }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error || "Revert failed");
      toast.success("Payroll reverted to draft");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Revert failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Payroll History</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          Export CSV
        </Button>
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
                {canManage && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const line = p.lines?.[0];
                const prevDebt = line?.previousDebtMinor ?? 0;
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
                      <Badge variant={p.status === "APPROVED" ? "default" : "secondary"}>
                        {line?.paymentStatus === "PAID"
                          ? `Paid${line.paymentMethod ? ` (${line.paymentMethod})` : ""}`
                          : p.status}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {p.status === "APPROVED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === p.id}
                            onClick={() => handleRevert(p)}
                          >
                            {busyId === p.id ? "Reverting..." : "Revert"}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
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
