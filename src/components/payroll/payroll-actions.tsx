"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { PAYMENT_METHODS } from "@/types/expense";
import { toast } from "sonner";
import { useEffect } from "react";

export function PayrollActions({
  payrollId,
  employeeId,
  status,
  defaultWalletId,
  onChanged,
}: {
  payrollId: string;
  employeeId: string;
  status: string;
  /** Preferred wallet chosen when the payroll was generated. */
  defaultWalletId?: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [wallets, setWallets] = useState<any[]>([]);
  const [walletId, setWalletId] = useState<string>("");

  useEffect(() => {
    if (approveOpen) {
      setWalletId("");
      walletApi
        .list()
        .then((res) => {
          const ws = res.data ?? [];
          setWallets(ws);
          if (defaultWalletId && ws.some((w: any) => w.id === defaultWalletId)) {
            setWalletId(defaultWalletId);
          }
        })
        .catch(() => setWallets([]));
    }
  }, [approveOpen, defaultWalletId]);

  async function handleRevert() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Revert this approved payroll back to draft?")
    ) {
      return;
    }
    setBusy(true);
    try {
      await payrollApi.revert(employeeId, payrollId, "Manual correction");
      toast.success("Payroll reverted to draft");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Revert failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    setBusy(true);
    try {
      await payrollApi.approve(employeeId, payrollId, paymentMethod, walletId || undefined);
      toast.success("Payroll approved and paid");
      setApproveOpen(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  if (status === "APPROVED") {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={handleRevert}
      >
        {busy ? "Reverting..." : "Revert"}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setApproveOpen(true)}
      >
        Approve
      </Button>
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Payroll</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Approving pays out the net payable amount as a salary payment and
            settles advances and employee-paid expense reimbursements.
          </p>
          <div className="space-y-3">
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Deduct from Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="w-full">
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
            <Button
              variant="outline"
              onClick={() => setApproveOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={busy}>
              {busy ? "Approving..." : "Approve & Pay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
