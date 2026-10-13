"use client";

// Advances tab (Phase 4): disburse cash advances against future claims,
// track FIFO recovery, and write off remainders.
import { useCallback, useEffect, useState } from "react";
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
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { contractorFinancialsApi } from "@/services/contractor-financials-api";
import {
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
  type AdvanceStatus,
  type ContractorAdvance,
} from "@/types/contractor-financials";
import { format } from "date-fns";
import { toast } from "sonner";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Props {
  contractorId: string;
  canCreate: boolean;
  canWriteOff: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const color = ADVANCE_STATUS_COLORS[status as AdvanceStatus] ?? "#94a3b8";
  const label = ADVANCE_STATUS_LABELS[status as AdvanceStatus] ?? status;
  return (
    <Badge variant="outline" style={{ color, borderColor: color }}>
      {label}
    </Badge>
  );
}

export function ContractorAdvancesTab({ contractorId, canCreate, canWriteOff }: Props) {
  const [advances, setAdvances] = useState<ContractorAdvance[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [recoveryPercent, setRecoveryPercent] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Write-off dialog
  const [writeOffTarget, setWriteOffTarget] = useState<ContractorAdvance | null>(null);
  const [writeOffReason, setWriteOffReason] = useState("");
  const [writeOffBusy, setWriteOffBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await contractorFinancialsApi.listAdvances({ contractorId, pageSize: "100" });
      setAdvances(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load advances");
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
    if (!date) {
      toast.error("Date is required");
      return;
    }
    try {
      setSaving(true);
      const advance = await contractorFinancialsApi.createAdvance({
        contractorId,
        amount: value,
        date,
        recoveryPercent: recoveryPercent.trim() ? parseFloat(recoveryPercent) : null,
        notes: notes.trim() || null,
      });
      toast.success(`Advance ${advance.advanceNumber} disbursed`);
      setFormOpen(false);
      setAmount("");
      setRecoveryPercent("");
      setNotes("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disburse advance");
    } finally {
      setSaving(false);
    }
  };

  const writeOff = async () => {
    if (!writeOffTarget) return;
    if (!writeOffReason.trim()) {
      toast.error("A reason is required");
      return;
    }
    try {
      setWriteOffBusy(true);
      await contractorFinancialsApi.writeOffAdvance(writeOffTarget.id, writeOffReason.trim());
      toast.success(`Advance ${writeOffTarget.advanceNumber} written off`);
      setWriteOffTarget(null);
      setWriteOffReason("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Write-off failed");
    } finally {
      setWriteOffBusy(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Contractor Advances</CardTitle>
          {canCreate && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              Disburse Advance
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {advances.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No advances recorded. Cash advances are recovered FIFO from approved claims.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Advance #</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 pr-3 text-right">Recovered</th>
                    <th className="py-2 pr-3 text-right">Outstanding</th>
                    <th className="py-2 pr-3 text-right">Recovery %</th>
                    <th className="py-2">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map((a) => {
                    const outstanding = round2(a.amount - a.recoveredAmount);
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 pr-3 font-medium">{a.advanceNumber}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {format(new Date(a.date), "yyyy-MM-dd")}
                        </td>
                        <td className="py-2 pr-3 text-right">{fmtMoney(a.amount)}</td>
                        <td className="py-2 pr-3 text-right text-emerald-600">
                          {fmtMoney(a.recoveredAmount)}
                        </td>
                        <td className="py-2 pr-3 text-right font-medium">
                          {a.status === "WRITTEN_OFF" ? "—" : fmtMoney(outstanding)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {a.recoveryPercent != null ? `${a.recoveryPercent}%` : "—"}
                        </td>
                        <td className="py-2">
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="py-2 text-right">
                          {canWriteOff &&
                            ["OUTSTANDING", "PARTIALLY_RECOVERED"].includes(a.status) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-500"
                                onClick={() => {
                                  setWriteOffTarget(a);
                                  setWriteOffReason("");
                                }}
                              >
                                Write Off
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

      {/* ── Create dialog ────────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disburse Advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Recovery % of each future claim&apos;s net (optional)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={recoveryPercent}
                onChange={(e) => setRecoveryPercent(e.target.value)}
                placeholder="e.g. 25"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving ? "Disbursing…" : "Disburse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Write-off dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!writeOffTarget} onOpenChange={(open) => !open && setWriteOffTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Write Off {writeOffTarget?.advanceNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Outstanding {fmtMoney(writeOffTarget ? round2(writeOffTarget.amount - writeOffTarget.recoveredAmount) : 0)}{" "}
              will be forgiven and posted to the ledger as a write-off.
            </p>
            <div>
              <Label>Reason (required)</Label>
              <Textarea
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
                placeholder="e.g. Commercial settlement"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWriteOffTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={writeOffBusy} onClick={writeOff}>
              {writeOffBusy ? "Working…" : "Write Off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
