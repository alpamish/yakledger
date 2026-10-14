"use client";

// Payments tab (Phase 4): record payments (Expense + wallet + ledger), then
// allocate them across posted claims. Reversals unwind allocations + wallet.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { contractorComplianceApi } from "@/services/contractor-compliance-api";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type ContractorPayment,
  type OutstandingClaim,
  type PaymentMethod,
  type PaymentStatus,
} from "@/types/contractor-financials";
import type {
  ContractorComplianceStatus,
  PaymentAuthorization,
} from "@/types/contractor";
import { format } from "date-fns";
import { toast } from "sonner";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Props {
  contractorId: string;
  canCreate: boolean;
  canReverse: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const color = PAYMENT_STATUS_COLORS[status as PaymentStatus] ?? "#94a3b8";
  const label = PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? status;
  return (
    <Badge variant="outline" style={{ color, borderColor: color }}>
      {label}
    </Badge>
  );
}

export function ContractorPaymentsTab({ contractorId, canCreate, canReverse }: Props) {
  const [payments, setPayments] = useState<ContractorPayment[]>([]);
  const [outstandingClaims, setOutstandingClaims] = useState<OutstandingClaim[]>([]);
  const [loading, setLoading] = useState(true);

  // Record dialog
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Allocate dialog
  const [allocTarget, setAllocTarget] = useState<ContractorPayment | null>(null);
  const [allocClaimId, setAllocClaimId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [allocBusy, setAllocBusy] = useState(false);

  // Reverse dialog
  const [reverseTarget, setReverseTarget] = useState<ContractorPayment | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseBusy, setReverseBusy] = useState(false);

  // Compliance (Phase 5): receiver + live authorizations + blocked verdict,
  // loaded when the record dialog opens so the gate is mirrored client-side.
  const [receiver, setReceiver] = useState("");
  const [liveAuths, setLiveAuths] = useState<PaymentAuthorization[]>([]);
  const [compliance, setCompliance] = useState<ContractorComplianceStatus | null>(null);

  useEffect(() => {
    if (!formOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const [comp, auths] = await Promise.all([
          contractorComplianceApi.getCompliance(contractorId),
          contractorComplianceApi.listAuthorizations({
            contractorId,
            active: "true",
            pageSize: "100",
          }),
        ]);
        if (cancelled) return;
        setCompliance(comp);
        setLiveAuths(auths.data);
      } catch {
        // Non-fatal: the server gate still enforces on submit.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formOpen, contractorId]);

  // Client-side mirror of the authorization gate: pick the authorization
  // covering the entered receiver (normalized) — used for the limit hint.
  const matchedAuth = useMemo(() => {
    const wanted = receiver.trim().toLowerCase();
    if (!wanted) return null;
    return (
      liveAuths.find((a) => a.receiverName.trim().toLowerCase() === wanted) ?? null
    );
  }, [liveAuths, receiver]);

  const overLimit =
    matchedAuth?.maxAmount != null &&
    !isNaN(parseFloat(amount)) &&
    parseFloat(amount) > matchedAuth.maxAmount;

  const blocked = compliance?.paymentsBlocked ?? false;
  const needsAuthButNoMatch =
    liveAuths.length > 0 && receiver.trim() !== "" && matchedAuth === null;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [pay, out] = await Promise.all([
        contractorFinancialsApi.listPayments({ contractorId, pageSize: "100" }),
        contractorFinancialsApi.getOutstanding(contractorId).catch(() => null),
      ]);
      setPayments(pay);
      setOutstandingClaims(out?.claims.filter((c) => c.outstanding > 0) ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [contractorId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!paymentDate) {
      toast.error("Payment date is required");
      return;
    }
    try {
      setSaving(true);
      // Idempotency key protects against double-click/network retries.
      const idemKey = `pay-${contractorId}-${paymentDate}-${value}-${Date.now()}`;
      const payment = await contractorFinancialsApi.createPayment(
        {
          contractorId,
          amount: value,
          paymentDate,
          method,
          authorizedById: receiver.trim() || null,
          notes: notes.trim() || null,
        },
        idemKey
      );
      toast.success(`Payment ${payment.paymentNumber} recorded`);
      setFormOpen(false);
      setAmount("");
      setNotes("");
      setReceiver("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const allocatable = useMemo(() => {
    if (!allocTarget) return 0;
    const allocated = (allocTarget.allocations ?? []).reduce((s, a) => s + a.amount, 0);
    return round2(allocTarget.amount - allocated);
  }, [allocTarget]);

  const allocate = async () => {
    if (!allocTarget || !allocClaimId) return;
    const value = parseFloat(allocAmount);
    if (isNaN(value) || value <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (value > allocatable) {
      toast.error(`At most ${fmtMoney(allocatable)} remains unallocated on this payment`);
      return;
    }
    try {
      setAllocBusy(true);
      await contractorFinancialsApi.allocatePayment(allocTarget.id, [
        { claimId: allocClaimId, amount: value },
      ]);
      toast.success("Payment allocated");
      setAllocTarget(null);
      setAllocClaimId("");
      setAllocAmount("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Allocation failed");
    } finally {
      setAllocBusy(false);
    }
  };

  const reverse = async () => {
    if (!reverseTarget) return;
    if (!reverseReason.trim()) {
      toast.error("A reason is required");
      return;
    }
    try {
      setReverseBusy(true);
      await contractorFinancialsApi.reversePayment(reverseTarget.id, reverseReason.trim());
      toast.success(`Payment ${reverseTarget.paymentNumber} reversed`);
      setReverseTarget(null);
      setReverseReason("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reversal failed");
    } finally {
      setReverseBusy(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Contractor Payments</CardTitle>
          {canCreate && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              Record Payment
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No payments recorded. Payments create an expense row and reduce the company wallet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Payment #</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 pr-3">Method</th>
                    <th className="py-2 pr-3 text-right">Allocated</th>
                    <th className="py-2">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const allocated = (p.allocations ?? []).reduce((s, a) => s + a.amount, 0);
                    const unallocated = round2(p.amount - allocated);
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 pr-3 font-medium">{p.paymentNumber}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {format(new Date(p.paymentDate), "yyyy-MM-dd")}
                        </td>
                        <td className="py-2 pr-3 text-right">{fmtMoney(p.amount)}</td>
                        <td className="py-2 pr-3">
                          {PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {fmtMoney(allocated)}
                          {unallocated > 0 && p.status === "COMPLETED" && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({fmtMoney(unallocated)} free)
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {canCreate && p.status === "COMPLETED" && unallocated > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setAllocTarget(p);
                                setAllocClaimId("");
                                setAllocAmount(String(unallocated));
                              }}
                            >
                              Allocate
                            </Button>
                          )}
                          {canReverse && p.status === "COMPLETED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-500"
                              onClick={() => {
                                setReverseTarget(p);
                                setReverseReason("");
                              }}
                            >
                              Reverse
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Record dialog ────────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {compliance?.paymentsBlocked && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                <strong>Payments blocked:</strong> {compliance.blockedReason}
              </div>
            )}
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Payment date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            {liveAuths.length > 0 && (
              <div>
                <Label>Authorized receiver</Label>
                <Select
                  value={receiver}
                  onValueChange={(v) => setReceiver(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select the authorized receiver" />
                  </SelectTrigger>
                  <SelectContent>
                    {liveAuths.map((a) => (
                      <SelectItem key={a.id} value={a.receiverName}>
                        {a.receiverName}
                        {a.maxAmount != null ? ` — up to ${fmtMoney(a.maxAmount)} AFN` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Active authorizations cover these receivers; a payment must match one of
                  them.
                </p>
              </div>
            )}
            {liveAuths.length === 0 && (
              <div>
                <Label>Receiver (optional)</Label>
                <Input
                  value={receiver}
                  onChange={(e) => setReceiver(e.target.value)}
                  placeholder="Person receiving the payment"
                />
              </div>
            )}
            {needsAuthButNoMatch && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                No authorization covers this receiver — the payment will be rejected.
              </div>
            )}
            {matchedAuth?.maxAmount != null && overLimit && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Amount exceeds the authorized limit of {fmtMoney(matchedAuth.maxAmount)} AFN.
              </div>
            )}
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              A matching expense row is created and, for cash payments, the company wallet is
              debited in the same transaction.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              disabled={
                saving ||
                blocked ||
                overLimit ||
                needsAuthButNoMatch ||
                (liveAuths.length > 0 && receiver.trim() === "")
              }
            >
              {saving ? "Recording…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Allocate dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!allocTarget} onOpenChange={(open) => !open && setAllocTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Allocate {allocTarget?.paymentNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Unallocated remainder: <span className="font-medium">{fmtMoney(allocatable)}</span>
            </p>
            <div>
              <Label>Claim</Label>
              <Select value={allocClaimId} onValueChange={setAllocClaimId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select claim" />
                </SelectTrigger>
                <SelectContent>
                  {outstandingClaims.map((c) => (
                    <SelectItem key={c.claimId} value={c.claimId}>
                      {c.claimNumber} — outstanding {fmtMoney(c.outstanding)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={allocAmount}
                onChange={(e) => setAllocAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocTarget(null)}>
              Cancel
            </Button>
            <Button onClick={allocate} disabled={allocBusy || !allocClaimId}>
              {allocBusy ? "Allocating…" : "Allocate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reverse dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!reverseTarget} onOpenChange={(open) => !open && setReverseTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse {reverseTarget?.paymentNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Allocations are unwound, the wallet is credited back, and a compensating ledger
              entry is written.
            </p>
            <div>
              <Label>Reason (required)</Label>
              <Textarea
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="e.g. Bounced cheque"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={reverseBusy} onClick={reverse}>
              {reverseBusy ? "Working…" : "Reverse Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
