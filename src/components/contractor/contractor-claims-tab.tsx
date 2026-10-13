"use client";

// Claims tab (Phase 4): build claims from approved timesheets, manage
// deductions, and drive the submit → verify → finance → approve workflow.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
import { contractorFinancialsApi } from "@/services/contractor-financials-api";
import { contractsApi } from "@/services/contract-api";
import { timesheetsApi } from "@/services/contractor-api";
import {
  CLAIM_STATUS_LABELS,
  CLAIM_STATUS_COLORS,
  CLAIM_DEDUCTION_TYPES,
  CLAIM_DEDUCTION_TYPE_LABELS,
  type ClaimDeductionType,
  type ClaimStatus,
  type ContractorClaim,
} from "@/types/contractor-financials";
import type { Timesheet as ClaimTimesheet } from "@/types/contractor";
import type { ContractorContract } from "@/types/contract";
import { format } from "date-fns";
import { toast } from "sonner";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Props {
  contractorId: string;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const color = CLAIM_STATUS_COLORS[status as ClaimStatus] ?? "#94a3b8";
  const label = CLAIM_STATUS_LABELS[status as ClaimStatus] ?? status;
  return (
    <Badge variant="outline" style={{ color, borderColor: color }}>
      {label}
    </Badge>
  );
}

export function ContractorClaimsTab({ contractorId, canCreate, canEdit, canApprove }: Props) {
  const [claims, setClaims] = useState<ContractorClaim[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [contracts, setContracts] = useState<ContractorContract[]>([]);
  const [buildContractId, setBuildContractId] = useState<string>("");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [buildTimesheets, setBuildTimesheets] = useState<ClaimTimesheet[]>([]);
  const [selectedTs, setSelectedTs] = useState<Set<string>>(new Set());
  const [buildLoading, setBuildLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Detail state
  const [detail, setDetail] = useState<ContractorClaim | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Deduction form
  const [dedType, setDedType] = useState<ClaimDeductionType>("FUEL");
  const [dedDescription, setDedDescription] = useState("");
  const [dedAmount, setDedAmount] = useState<string>("");

  // Action dialog (reject/reverse/release-retention carry a note/reason/amount)
  const [actionClaim, setActionClaim] = useState<ContractorClaim | null>(null);
  const [action, setAction] = useState<string>("");
  const [actionNote, setActionNote] = useState("");
  const [actionAmount, setActionAmount] = useState<string>("");
  const [actionBusy, setActionBusy] = useState(false);

  const loadClaims = useCallback(async () => {
    try {
      setLoading(true);
      const res = await contractorFinancialsApi.listClaims({ contractorId, pageSize: "100" });
      setClaims(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }, [contractorId]);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const openDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const claim = await contractorFinancialsApi.getClaim(id);
      setDetail(claim);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load claim");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(
    async (id: string) => {
      try {
        const claim = await contractorFinancialsApi.getClaim(id);
        setDetail(claim);
      } catch {
        /* keep stale detail on refresh failure */
      }
      loadClaims();
    },
    [loadClaims]
  );

  // ── Claim builder ─────────────────────────────────────────────────────────

  const openBuilder = useCallback(async () => {
    setBuilderOpen(true);
    setSelectedTs(new Set());
    setBuildTimesheets([]);
    try {
      const res = await contractsApi.list({ contractorId });
      const active = (res.data ?? []).filter(
        (c: ContractorContract) => c.status === "ACTIVE"
      );
      setContracts(active);
      if (active.length > 0) setBuildContractId((prev) => prev || active[0].id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load contracts");
    }
  }, [contractorId]);

  // Load approved timesheets for the chosen contract + period.
  useEffect(() => {
    if (!builderOpen || !buildContractId || !periodStart || !periodEnd) return;
    let cancelled = false;
    (async () => {
      try {
        setBuildLoading(true);
        const res = await timesheetsApi.getAll({
          contractorId,
          dateFrom: periodStart,
          dateTo: periodEnd,
          approvalStatus: "APPROVED",
          pageSize: 200,
        });
        const all = res.data?.data ?? [];
        if (!cancelled) {
          // Only timesheets on this contract; the server also guards against
          // already-claimed timesheets, so stale rows fail loudly on create.
          setBuildTimesheets(all.filter((t) => t.contractId === buildContractId));
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load timesheets");
      } finally {
        if (!cancelled) setBuildLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [builderOpen, buildContractId, periodStart, periodEnd, contractorId]);

  const toggleTs = (id: string) => {
    setSelectedTs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const preview = useMemo(() => {
    const gross = round2(
      buildTimesheets
        .filter((t) => selectedTs.has(t.id))
        .reduce((s, t) => s + t.totalHours * (t.rateAmount ?? 0), 0)
    );
    const contract = contracts.find((c) => c.id === buildContractId);
    const retentionPercent = contract?.retentionPercent ?? 0;
    const retention = round2((gross * retentionPercent) / 100);
    return { gross, retentionPercent, retention, net: round2(gross - retention) };
  }, [buildTimesheets, selectedTs, contracts, buildContractId]);

  const createClaim = async () => {
    if (!buildContractId || selectedTs.size === 0) {
      toast.error("Select a contract and at least one timesheet");
      return;
    }
    try {
      setCreating(true);
      const claim = await contractorFinancialsApi.createClaim({
        contractId: buildContractId,
        timesheetIds: Array.from(selectedTs),
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
      });
      toast.success(`Claim ${claim.claimNumber} created`);
      setBuilderOpen(false);
      loadClaims();
      openDetail(claim.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create claim");
    } finally {
      setCreating(false);
    }
  };

  // ── Deductions ────────────────────────────────────────────────────────────

  const addDeduction = async () => {
    if (!detail) return;
    const amount = parseFloat(dedAmount);
    if (!dedDescription.trim() || isNaN(amount) || amount <= 0) {
      toast.error("Enter a description and a positive amount");
      return;
    }
    try {
      await contractorFinancialsApi.addDeduction(detail.id, {
        type: dedType,
        description: dedDescription.trim(),
        amount,
      });
      setDedDescription("");
      setDedAmount("");
      toast.success("Deduction added");
      refreshDetail(detail.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add deduction");
    }
  };

  const deleteDeduction = async (deductionId: string) => {
    if (!detail) return;
    try {
      await contractorFinancialsApi.removeDeduction(detail.id, deductionId);
      toast.success("Deduction removed");
      refreshDetail(detail.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove deduction");
    }
  };

  // ── Workflow actions ──────────────────────────────────────────────────────

  const runAction = async () => {
    if (!actionClaim) return;
    try {
      setActionBusy(true);
      const needsReason = action === "reject" || action === "reverse";
      if (needsReason && !actionNote.trim()) {
        toast.error("A reason is required");
        return;
      }
      await contractorFinancialsApi.claimAction(actionClaim.id, {
        action,
        note: actionNote.trim() || undefined,
        reason: actionNote.trim() || undefined,
        amount: action === "releaseRetention" ? parseFloat(actionAmount) || 0 : undefined,
      });
      toast.success(
        action === "approve"
          ? "Claim approved and posted"
          : action === "submit"
            ? "Claim submitted"
            : `Claim ${action}d`
      );
      setActionClaim(null);
      setActionNote("");
      setActionAmount("");
      refreshDetail(actionClaim.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionBusy(false);
    }
  };

  const askAction = (claim: ContractorClaim, act: string) => {
    setActionClaim(claim);
    setAction(act);
    setActionNote("");
    const remainingRetention = round2(
      (claim.retentionAmount ?? 0) -
        (claim.retentionReleases ?? []).reduce((s, r) => s + r.amount, 0)
    );
    setActionAmount(act === "releaseRetention" ? String(remainingRetention > 0 ? remainingRetention : 0) : "");
  };

  const quickAction = async (claim: ContractorClaim, act: string) => {
    try {
      setActionBusy(true);
      await contractorFinancialsApi.claimAction(claim.id, { action: act });
      toast.success(act === "approve" ? "Claim approved and posted" : `Claim ${act}d`);
      refreshDetail(claim.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Contractor Claims</CardTitle>
          {canCreate && (
            <Button size="sm" onClick={openBuilder}>
              New Claim
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No claims yet. Build one from approved timesheets.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Claim #</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Period</th>
                    <th className="py-2 pr-3 text-right">Gross</th>
                    <th className="py-2 pr-3 text-right">Retention</th>
                    <th className="py-2 pr-3 text-right">Net</th>
                    <th className="py-2 pr-3 text-right">Paid</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => (
                    <tr
                      key={claim.id}
                      className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                      onClick={() => openDetail(claim.id)}
                    >
                      <td className="py-2 pr-3 font-medium">{claim.claimNumber}</td>
                      <td className="py-2 pr-3">{claim.title}</td>
                      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                        {format(new Date(claim.periodStart), "yyyy-MM-dd")} →{" "}
                        {format(new Date(claim.periodEnd), "yyyy-MM-dd")}
                      </td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(claim.grossAmount)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(claim.retentionAmount)}</td>
                      <td className="py-2 pr-3 text-right font-medium">{fmtMoney(claim.netAmount)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(claim.paidAmount)}</td>
                      <td className="py-2">
                        <StatusBadge status={claim.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Claim builder dialog ─────────────────────────────────────────── */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Claim from Timesheets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Contract</Label>
                <Select value={buildContractId} onValueChange={setBuildContractId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contract" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.contractNumber} — {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Period start</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div>
                <Label>Period end</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>

            {buildLoading ? (
              <LoadingSpinner />
            ) : buildContractId && periodStart && periodEnd ? (
              buildTimesheets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No approved timesheets on this contract for the selected period.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                  {buildTimesheets.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTs.has(t.id)}
                        onChange={() => toggleTs(t.id)}
                      />
                      <span className="w-24">{format(new Date(t.date), "yyyy-MM-dd")}</span>
                      <span className="flex-1 text-muted-foreground">
                        {t.machinery?.machineryName ?? "—"}
                      </span>
                      <span>{t.totalHours}h</span>
                      <span className="w-20 text-right">@ {fmtMoney(t.rateAmount ?? 0)}</span>
                    </label>
                  ))}
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Pick a contract and period to list claimable timesheets.
              </p>
            )}

            {selectedTs.size > 0 && (
              <>
                <Separator />
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Selected</span>
                    <p className="font-medium">{selectedTs.size} timesheet(s)</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gross</span>
                    <p className="font-medium">{fmtMoney(preview.gross)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Retention ({preview.retentionPercent}%)
                    </span>
                    <p className="font-medium">−{fmtMoney(preview.retention)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Net (preview)</span>
                    <p className="font-medium text-emerald-600">{fmtMoney(preview.net)}</p>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createClaim} disabled={creating || selectedTs.size === 0}>
              {creating ? "Creating…" : "Create Draft Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Claim detail dialog ──────────────────────────────────────────── */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {detailLoading && !detail ? (
            <LoadingSpinner />
          ) : detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.claimNumber} — {detail.title}
                  <StatusBadge status={detail.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Gross</span>
                  <p className="font-medium">{fmtMoney(detail.grossAmount)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Retention ({detail.retentionPercent}%)
                  </span>
                  <p className="font-medium">−{fmtMoney(detail.retentionAmount)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Deductions</span>
                  <p className="font-medium">−{fmtMoney(detail.deductionsTotal)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Net</span>
                  <p className="font-medium text-emerald-600">{fmtMoney(detail.netAmount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Advance recovery</span>
                  <p className="font-medium">−{fmtMoney(detail.advanceRecoveryTotal)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Paid</span>
                  <p className="font-medium">{fmtMoney(detail.paidAmount)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Outstanding</span>
                  <p className="font-medium">
                    {fmtMoney(
                      round2(detail.netAmount - detail.advanceRecoveryTotal - detail.paidAmount)
                    )}
                  </p>
                </div>
              </div>

              {/* Lines */}
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Claim Lines</h4>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1 pr-2">Date / Source</th>
                        <th className="py-1 pr-2">Description</th>
                        <th className="py-1 pr-2 text-right">Qty</th>
                        <th className="py-1 pr-2 text-right">Rate</th>
                        <th className="py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.lines ?? []).map((line) => (
                        <tr key={line.id} className="border-b last:border-0">
                          <td className="py-1 pr-2 text-muted-foreground">
                            {line.sourceType === "TIMESHEET" ? "Timesheet" : line.sourceType}
                          </td>
                          <td className="py-1 pr-2">{line.description}</td>
                          <td className="py-1 pr-2 text-right">{line.quantity}</td>
                          <td className="py-1 pr-2 text-right">{fmtMoney(line.rateAmount)}</td>
                          <td className="py-1 text-right">{fmtMoney(line.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Deductions */}
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Deductions</h4>
                {(detail.deductions ?? []).length > 0 && (
                  <div className="mb-2 space-y-1">
                    {detail.deductions!.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">
                          {CLAIM_DEDUCTION_TYPE_LABELS[d.type as ClaimDeductionType] ?? d.type}
                        </Badge>
                        <span className="flex-1">{d.description}</span>
                        <span className="font-medium">−{fmtMoney(d.amount)}</span>
                        {detail.status === "DRAFT" && canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-red-500"
                            onClick={() => deleteDeduction(d.id)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {detail.status === "DRAFT" && canEdit && (
                  <div className="flex items-end gap-2">
                    <div className="w-36">
                      <Label className="text-xs">Type</Label>
                      <Select value={dedType} onValueChange={(v) => setDedType(v as ClaimDeductionType)}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLAIM_DEDUCTION_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {CLAIM_DEDUCTION_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        className="h-8"
                        value={dedDescription}
                        onChange={(e) => setDedDescription(e.target.value)}
                        placeholder="e.g. Fuel recovered"
                      />
                    </div>
                    <div className="w-28">
                      <Label className="text-xs">Amount</Label>
                      <Input
                        className="h-8"
                        type="number"
                        min="0"
                        step="0.01"
                        value={dedAmount}
                        onChange={(e) => setDedAmount(e.target.value)}
                      />
                    </div>
                    <Button size="sm" className="h-8" onClick={addDeduction}>
                      Add
                    </Button>
                  </div>
                )}
              </div>

              {/* Workflow actions */}
              <Separator />
              <div className="flex flex-wrap gap-2">
                {detail.status === "DRAFT" && canEdit && (
                  <>
                    <Button size="sm" disabled={actionBusy} onClick={() => quickAction(detail, "submit")}>
                      Submit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionBusy}
                      onClick={() => contractorFinancialsApi.voidClaim(detail.id).then(() => {
                        toast.success("Claim voided");
                        setDetail(null);
                        loadClaims();
                      }).catch((err) => toast.error(err.message))}
                    >
                      Void
                    </Button>
                  </>
                )}
                {["SUBMITTED", "VERIFIED", "FINANCE_REVIEW"].includes(detail.status) && canApprove && (
                  <>
                    {detail.status === "SUBMITTED" && (
                      <Button size="sm" disabled={actionBusy} onClick={() => quickAction(detail, "verify")}>
                        Mark Verified
                      </Button>
                    )}
                    {detail.status === "VERIFIED" && (
                      <Button size="sm" disabled={actionBusy} onClick={() => quickAction(detail, "financeReview")}>
                        Send to Finance
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={actionBusy}
                      onClick={() => quickAction(detail, "approve")}
                    >
                      Approve &amp; Post
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionBusy}
                      onClick={() => askAction(detail, "reject")}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {["POSTED", "PARTIALLY_PAID"].includes(detail.status) && canApprove && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionBusy}
                      onClick={() => askAction(detail, "releaseRetention")}
                    >
                      Release Retention
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionBusy}
                      onClick={() => askAction(detail, "reverse")}
                    >
                      Reverse Claim
                    </Button>
                  </>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Action dialog (reject / reverse / release retention) ─────────── */}
      <Dialog open={!!actionClaim} onOpenChange={(open) => !open && setActionClaim(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === "reject"
                ? `Reject ${actionClaim?.claimNumber}`
                : action === "reverse"
                  ? `Reverse ${actionClaim?.claimNumber}`
                  : `Release Retention — ${actionClaim?.claimNumber}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {action === "releaseRetention" ? (
              <>
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={actionAmount}
                    onChange={(e) => setActionAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Reason</Label>
                  <Textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} />
                </div>
              </>
            ) : (
              <div>
                <Label>Reason {action === "reject" || action === "reverse" ? "(required)" : ""}</Label>
                <Textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionClaim(null)}>
              Cancel
            </Button>
            <Button
              variant={action === "releaseRetention" ? "default" : "destructive"}
              disabled={actionBusy}
              onClick={runAction}
            >
              {actionBusy ? "Working…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
