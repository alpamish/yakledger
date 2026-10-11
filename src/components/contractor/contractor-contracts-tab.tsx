"use client";

// Contracts tab (Phase 2): contract list, effective-dated rate tiers,
// and variations with approval. Embedded in the contractor profile.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { contractsApi } from "@/services/contract-api";
import {
  CONTRACT_TYPE_VALUES,
  CONTRACT_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_RATE_TYPES,
  CONTRACT_RATE_TYPE_LABELS,
  type ContractorContract,
  type ContractRate,
  type ContractVariation,
  type ContractType,
  type ContractRateType,
} from "@/types/contract";
import { format } from "date-fns";
import { toast } from "sonner";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

interface Props {
  contractorId: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

const emptyForm = (contractorId: string) => ({
  contractorId,
  title: "",
  projectName: "",
  contractType: "MACHINERY_HIRE" as ContractType,
  value: 0,
  startDate: "",
  endDate: "",
  paymentTerms: "",
  retentionPercent: 0,
  advanceAllowed: true,
  workHoursPerDay: 9,
  contractDaysPerMonth: 28,
  companyProvidesFuel: false,
  contractorProvidesOperator: true,
  companyHandlesMaintenance: false,
  downtimeChargeable: true,
  notes: "",
});

export function ContractorContractsTab({
  contractorId,
  canCreate,
  canEdit,
  canDelete,
  canApprove,
}: Props) {
  const [contracts, setContracts] = useState<ContractorContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContractorContract | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Contract form
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContractorContract | null>(null);
  const [form, setForm] = useState(emptyForm(contractorId));
  const [saving, setSaving] = useState(false);

  // Rate form
  const [rateOpen, setRateOpen] = useState(false);
  const [rateForm, setRateForm] = useState({
    label: "",
    rateType: "HOURLY" as ContractRateType,
    amount: 0,
    effectiveFrom: "",
    isDefault: true,
  });
  const [savingRate, setSavingRate] = useState(false);

  // Variation form
  const [varOpen, setVarOpen] = useState(false);
  const [varForm, setVarForm] = useState({
    description: "",
    valueChange: 0,
    rateLabel: "",
    newAmount: "",
    effectiveFrom: "",
  });
  const [savingVar, setSavingVar] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await contractsApi.list({ contractorId, pageSize: "100" });
      setContracts(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load contracts");
    } finally {
      setLoading(false);
    }
  }, [contractorId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const c = await contractsApi.get(id);
      setDetail(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load contract");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // ---- contract form handlers ----
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(contractorId));
    setFormOpen(true);
  };
  const openEdit = (c: ContractorContract) => {
    setEditing(c);
    setForm({
      contractorId: c.contractorId,
      title: c.title,
      projectName: c.projectName ?? "",
      contractType: c.contractType,
      value: c.value,
      startDate: c.startDate.slice(0, 10),
      endDate: c.endDate ? c.endDate.slice(0, 10) : "",
      paymentTerms: c.paymentTerms ?? "",
      retentionPercent: c.retentionPercent,
      advanceAllowed: c.advanceAllowed,
      workHoursPerDay: c.workHoursPerDay,
      contractDaysPerMonth: c.contractDaysPerMonth,
      companyProvidesFuel: c.companyProvidesFuel,
      contractorProvidesOperator: c.contractorProvidesOperator,
      companyHandlesMaintenance: c.companyHandlesMaintenance,
      downtimeChargeable: c.downtimeChargeable,
      notes: c.notes ?? "",
    });
    setFormOpen(true);
  };

  const saveContract = async () => {
    if (!form.title.trim() || !form.startDate) {
      toast.error("Title and start date are required");
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...form,
        projectName: form.projectName || null,
        paymentTerms: form.paymentTerms || null,
        endDate: form.endDate || null,
        notes: form.notes || null,
      };
      if (editing) {
        await contractsApi.update(editing.id, payload);
        toast.success("Contract updated");
      } else {
        const created = await contractsApi.create(payload);
        toast.success(`Contract ${created.contractNumber} created`);
        setSelectedId(created.id);
      }
      setFormOpen(false);
      load();
      if (selectedId) loadDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save contract");
    } finally {
      setSaving(false);
    }
  };

  const deleteContract = async (c: ContractorContract) => {
    if (!confirm(`Delete contract ${c.contractNumber}? This cannot be undone.`)) return;
    try {
      await contractsApi.remove(c.id);
      toast.success("Contract deleted");
      if (selectedId === c.id) {
        setSelectedId(null);
        setDetail(null);
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete contract");
    }
  };

  // ---- rate handlers ----
  const saveRate = async () => {
    if (!selectedId || !rateForm.label.trim() || !rateForm.effectiveFrom) {
      toast.error("Label and effective date are required");
      return;
    }
    try {
      setSavingRate(true);
      await contractsApi.createRate(selectedId, {
        ...rateForm,
        effectiveTo: null,
      });
      toast.success("Rate added");
      setRateOpen(false);
      loadDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add rate");
    } finally {
      setSavingRate(false);
    }
  };

  const approveRate = async (rate: ContractRate) => {
    if (!selectedId) return;
    try {
      await contractsApi.approveRate(selectedId, rate.id);
      toast.success("Rate approved");
      loadDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve rate");
    }
  };

  const deleteRate = async (rate: ContractRate) => {
    if (!selectedId) return;
    if (!confirm(`Delete rate "${rate.label}"?`)) return;
    try {
      await contractsApi.deleteRate(selectedId, rate.id);
      toast.success("Rate deleted");
      loadDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rate");
    }
  };

  // ---- variation handlers ----
  const saveVariation = async () => {
    if (!selectedId || !varForm.description.trim() || !varForm.effectiveFrom) {
      toast.error("Description and effective date are required");
      return;
    }
    try {
      setSavingVar(true);
      await contractsApi.createVariation(selectedId, {
        description: varForm.description,
        valueChange: varForm.valueChange,
        rateLabel: varForm.rateLabel || null,
        newAmount: varForm.newAmount === "" ? null : Number(varForm.newAmount),
        effectiveFrom: varForm.effectiveFrom,
      });
      toast.success("Variation proposed — awaiting approval");
      setVarOpen(false);
      loadDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to propose variation");
    } finally {
      setSavingVar(false);
    }
  };

  const decideVariation = async (v: ContractVariation, action: "approve" | "reject") => {
    if (!selectedId) return;
    try {
      await contractsApi.decideVariation(selectedId, v.id, action);
      toast.success(`Variation ${action}d`);
      loadDetail(selectedId);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update variation");
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Contracts</h3>
        {canCreate && (
          <Button onClick={openCreate}>New Contract</Button>
        )}
      </div>

      {contracts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No contracts yet.{canCreate ? " Create one to start billing against rates." : ""}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => (
            <Card
              key={c.id}
              className={`cursor-pointer transition-colors ${selectedId === c.id ? "border-primary" : ""}`}
              onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
            >
              <CardContent className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{c.contractNumber}</span>
                    <span className="font-medium">{c.title}</span>
                    <Badge
                      variant="outline"
                      style={{ color: CONTRACT_STATUS_COLORS[c.status], borderColor: CONTRACT_STATUS_COLORS[c.status] }}
                    >
                      {CONTRACT_STATUS_LABELS[c.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{CONTRACT_TYPE_LABELS[c.contractType]}</span>
                    <span>AFN {fmtMoney(c.value)}</span>
                    <span>
                      {format(new Date(c.startDate), "MMM d, yyyy")}
                      {c.endDate ? ` → ${format(new Date(c.endDate), "MMM d, yyyy")}` : " →"}
                    </span>
                    {canEdit && (c.status === "DRAFT" || c.status === "ACTIVE" || c.status === "SUSPENDED") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(c);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    {canDelete && c.status === "DRAFT" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteContract(c);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---- selected contract detail ---- */}
      {selectedId && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {detail ? `${detail.contractNumber} — ${detail.title}` : "Loading…"}
              </CardTitle>
              <div className="flex gap-2">
                {canEdit && detail && !["COMPLETED", "TERMINATED"].includes(detail.status) && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRateForm({
                          label: "",
                          rateType: "HOURLY",
                          amount: 0,
                          effectiveFrom: format(new Date(), "yyyy-MM-dd"),
                          isDefault: true,
                        });
                        setRateOpen(true);
                      }}
                    >
                      Add Rate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setVarForm({
                          description: "",
                          valueChange: 0,
                          rateLabel: "",
                          newAmount: "",
                          effectiveFrom: format(new Date(), "yyyy-MM-dd"),
                        });
                        setVarOpen(true);
                      }}
                    >
                      Propose Variation
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {detailLoading || !detail ? (
              <LoadingSpinner />
            ) : (
              <>
                {/* commercial terms */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
                  <div>
                    <span className="text-muted-foreground">Project: </span>
                    {detail.projectName || "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Value: </span>
                    AFN {fmtMoney(detail.value)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payment terms: </span>
                    {detail.paymentTerms || "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Retention: </span>
                    {detail.retentionPercent}%
                  </div>
                  <div>
                    <span className="text-muted-foreground">Work day: </span>
                    {detail.workHoursPerDay}h × {detail.contractDaysPerMonth}d/month
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fuel: </span>
                    {detail.companyProvidesFuel ? "Company" : "Contractor"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Operator: </span>
                    {detail.contractorProvidesOperator ? "Contractor" : "Company"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Maintenance: </span>
                    {detail.companyHandlesMaintenance ? "Company" : "Contractor"}
                  </div>
                </div>
                {detail.notes && <p className="text-sm text-muted-foreground">{detail.notes}</p>}

                <Separator />

                {/* rate tiers */}
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Rate Tiers</h4>
                  {!detail.rates || detail.rates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No rates configured.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="py-1">Label</th>
                          <th className="py-1">Type</th>
                          <th className="py-1 text-right">Amount</th>
                          <th className="py-1">Effective</th>
                          <th className="py-1">Status</th>
                          <th className="py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.rates.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="py-1.5">
                              {r.label}
                              {r.isDefault && (
                                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                                  default
                                </Badge>
                              )}
                            </td>
                            <td className="py-1.5">{CONTRACT_RATE_TYPE_LABELS[r.rateType]}</td>
                            <td className="py-1.5 text-right">{fmtMoney(r.amount)}</td>
                            <td className="py-1.5">
                              {format(new Date(r.effectiveFrom), "MMM d, yyyy")}
                              {r.effectiveTo
                                ? ` → ${format(new Date(r.effectiveTo), "MMM d, yyyy")}`
                                : " →"}
                            </td>
                            <td className="py-1.5">
                              {r.approvedAt ? (
                                <Badge variant="outline" className="text-[10px] text-emerald-600">
                                  approved
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-amber-600">
                                  pending
                                </Badge>
                              )}
                            </td>
                            <td className="py-1.5 text-right">
                              {!r.approvedAt && canApprove && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => approveRate(r)}
                                >
                                  Approve
                                </Button>
                              )}
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => deleteRate(r)}
                                >
                                  Delete
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <Separator />

                {/* variations */}
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Variations</h4>
                  {!detail.variations || detail.variations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No variations.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.variations.map((v) => (
                        <div
                          key={v.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
                        >
                          <div>
                            <span className="font-mono text-xs">{v.variationNumber}</span>{" "}
                            {v.description}
                            <span className="text-muted-foreground">
                              {" "}
                              — value {v.valueChange >= 0 ? "+" : ""}
                              {fmtMoney(v.valueChange)}
                              {v.rateLabel && v.newAmount != null
                                ? `, rate ${v.rateLabel} → ${fmtMoney(v.newAmount)}`
                                : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                v.status === "APPROVED"
                                  ? "text-emerald-600"
                                  : v.status === "REJECTED"
                                    ? "text-destructive"
                                    : "text-amber-600"
                              }
                            >
                              {v.status}
                            </Badge>
                            {v.status === "PENDING" && canApprove && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => decideVariation(v, "approve")}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => decideVariation(v, "reject")}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- contract dialog ---- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.contractNumber}` : "New Contract"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Dozer hire — Site B"
              />
            </div>
            <div>
              <Label>Project</Label>
              <Input
                value={form.projectName ?? ""}
                onChange={(e) => setForm({ ...form, projectName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select
                  value={form.contractType}
                  onValueChange={(v) => setForm({ ...form, contractType: v as ContractType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPE_VALUES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {CONTRACT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Value (AFN)</Label>
                <Input
                  type="number"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start date *</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>End date</Label>
                <Input
                  type="date"
                  value={form.endDate ?? ""}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Hours/day</Label>
                <Input
                  type="number"
                  value={form.workHoursPerDay}
                  onChange={(e) => setForm({ ...form, workHoursPerDay: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Days/month</Label>
                <Input
                  type="number"
                  value={form.contractDaysPerMonth}
                  onChange={(e) =>
                    setForm({ ...form, contractDaysPerMonth: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Retention %</Label>
                <Input
                  type="number"
                  value={form.retentionPercent}
                  onChange={(e) => setForm({ ...form, retentionPercent: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Payment terms</Label>
              <Input
                value={form.paymentTerms ?? ""}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                placeholder="e.g. Net 30, 40% advance"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveContract} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- rate dialog ---- */}
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Rate Tier</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Label *</Label>
              <Input
                value={rateForm.label}
                onChange={(e) => setRateForm({ ...rateForm, label: e.target.value })}
                placeholder="e.g. EXCAVATOR_HOUR, TRIP_LOAD"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select
                  value={rateForm.rateType}
                  onValueChange={(v) =>
                    setRateForm({ ...rateForm, rateType: v as ContractRateType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_RATE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {CONTRACT_RATE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (AFN) *</Label>
                <Input
                  type="number"
                  value={rateForm.amount}
                  onChange={(e) => setRateForm({ ...rateForm, amount: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Effective from *</Label>
              <Input
                type="date"
                value={rateForm.effectiveFrom}
                onChange={(e) => setRateForm({ ...rateForm, effectiveFrom: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveRate} disabled={savingRate}>
              {savingRate ? "Saving…" : "Add Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- variation dialog ---- */}
      <Dialog open={varOpen} onOpenChange={setVarOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Propose Variation</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Description *</Label>
              <Input
                value={varForm.description}
                onChange={(e) => setVarForm({ ...varForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Value change (AFN)</Label>
                <Input
                  type="number"
                  value={varForm.valueChange}
                  onChange={(e) => setVarForm({ ...varForm, valueChange: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Effective from *</Label>
                <Input
                  type="date"
                  value={varForm.effectiveFrom}
                  onChange={(e) => setVarForm({ ...varForm, effectiveFrom: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rate label (optional)</Label>
                <Input
                  value={varForm.rateLabel}
                  onChange={(e) => setVarForm({ ...varForm, rateLabel: e.target.value })}
                  placeholder="e.g. HOUR"
                />
              </div>
              <div>
                <Label>New amount</Label>
                <Input
                  type="number"
                  value={varForm.newAmount}
                  onChange={(e) => setVarForm({ ...varForm, newAmount: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVarOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveVariation} disabled={savingVar}>
              {savingVar ? "Saving…" : "Propose"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
