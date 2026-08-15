"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { payrollApi } from "@/services/payroll-api";
import { walletApi } from "@/services/wallet-api";
import { formatMinor } from "@/lib/money";
import { toast } from "sonner";

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: iso(start), periodEnd: iso(end) };
}

export function PayrollGenerateDialog({
  open,
  onOpenChange,
  employeeIds,
  scopeLabel,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to generate for all active employees. */
  employeeIds?: string[];
  scopeLabel?: string;
  onGenerated: () => void;
}) {
  const defaults = currentMonthRange();
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);
  const [allowances, setAllowances] = useState("");
  const [bonuses, setBonuses] = useState("");
  const [deductions, setDeductions] = useState("");
  const [wallets, setWallets] = useState<any[]>([]);
  const [walletId, setWalletId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const d = currentMonthRange();
      setPeriodStart(d.periodStart);
      setPeriodEnd(d.periodEnd);
      setAllowances("");
      setBonuses("");
      setDeductions("");
      setWalletId("");
      walletApi
        .list()
        .then((res) => setWallets(res.data ?? []))
        .catch(() => setWallets([]));
    }
  }, [open]);

  async function submit() {
    if (!periodStart || !periodEnd) {
      toast.error("Period start and end are required");
      return;
    }
    setSaving(true);
    try {
      const res = await payrollApi.generate({
        periodStart,
        periodEnd,
        ...(employeeIds ? { employeeIds } : {}),
        ...(allowances ? { allowancesMinor: Number(allowances) } : {}),
        ...(bonuses ? { bonusesMinor: Number(bonuses) } : {}),
        ...(deductions ? { deductionsMinor: Number(deductions) } : {}),
        ...(walletId ? { walletId } : {}),
      });
      const errors: string[] = res.data?.errors ?? [];
      if (errors.length > 0) {
        toast.warning(
          `Generated ${res.data?.generated ?? 0} record(s). Errors: ${errors.join("; ")}`
        );
      } else {
        toast.success(
          res.message || `Generated ${res.data?.generated ?? 0} payroll record(s)`
        );
      }
      onOpenChange(false);
      onGenerated();
    } catch (e: any) {
      toast.error(e?.message || "Generate failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Payroll</DialogTitle>
          <DialogDescription>
            {scopeLabel
              ? `Generate a draft payroll for ${scopeLabel}.`
              : "Generate a draft payroll for all active employees."}{" "}
            Drafts are only paid out once approved.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Period Start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label>Period End</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Allowances (AFN)</Label>
              <Input
                type="number"
                min={0}
                value={allowances}
                onChange={(e) => setAllowances(e.target.value)}
              />
            </div>
            <div>
              <Label>Bonuses (AFN)</Label>
              <Input
                type="number"
                min={0}
                value={bonuses}
                onChange={(e) => setBonuses(e.target.value)}
              />
            </div>
            <div>
              <Label>Deductions (AFN)</Label>
              <Input
                type="number"
                min={0}
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Pay from Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger>
                <SelectValue placeholder="Cash / no wallet" />
              </SelectTrigger>
              <SelectContent>
                {wallets.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No wallets configured
                  </SelectItem>
                ) : (
                  wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} — {formatMinor(w.balance, w.currency)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Generating..." : "Generate Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}