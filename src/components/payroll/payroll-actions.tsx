"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PayrollAllocationDialog } from "@/components/payroll/payroll-allocation-dialog";
import { payrollApi } from "@/services/payroll-api";
import { walletApi } from "@/services/wallet-api";
import { formatMinor, formatMajor, toMinor } from "@/lib/money";
import {
  PAYROLL_PAYMENT_METHODS,
  PAYROLL_PAYMENT_METHOD_LABELS,
} from "@/lib/payroll-status";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Check,
  RotateCcw,
  Trash2,
  Banknote,
  PieChart,
} from "lucide-react";

interface Wallet {
  id: string;
  name: string;
  balance: number;
  currency?: string;
}

export function PayrollActions({
  payrollId,
  employeeId,
  status,
  defaultWalletId,
  netPayMinor = 0,
  totalPaidMinor = 0,
  onChanged,
}: {
  payrollId: string;
  employeeId: string;
  status: string;
  /** Preferred wallet chosen when the payroll was generated. */
  defaultWalletId?: string;
  /** Net payable of the approved payroll (minor units). */
  netPayMinor?: number;
  /** Already settled amount of this payroll (minor units). */
  totalPaidMinor?: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState<string>("");

  const remainingMinor = Math.max(netPayMinor - totalPaidMinor, 0);
  const remaining = remainingMinor / 100;
  const canPay =
    (status === "APPROVED" || status === "PARTIALLY_PAID") && remainingMinor > 0;
  const canRevert = status === "APPROVED" || status === "PARTIALLY_PAID";

  // Balance is a major-unit Float; compare it in major units so the warning
  // matches what the server actually deducts.
  const selectedWallet = wallets.find((w) => w.id === walletId);
  const requestedMajor = amount.trim() === "" ? remaining : parseFloat(amount);
  const insufficientFunds =
    paymentMethod === "COMPANY_WALLET" &&
    !!selectedWallet &&
    Number.isFinite(requestedMajor) &&
    requestedMajor > selectedWallet.balance;

  useEffect(() => {
    if (payOpen) {
      setWalletId("");
      setAmount("");
      setNote("");
      setPaymentMethod("CASH");
      walletApi
        .list()
        .then((res) => {
          const ws: Wallet[] = res.data ?? [];
          setWallets(ws);
          if (defaultWalletId && ws.some((w) => w.id === defaultWalletId)) {
            // The payroll was generated with an assigned wallet: default the
            // payment to a company-wallet payment so the wallet is actually
            // deducted (a CASH payment never touches any wallet).
            setWalletId(defaultWalletId);
            setPaymentMethod("COMPANY_WALLET");
          }
        })
        .catch(() => setWallets([]));
    }
  }, [payOpen, defaultWalletId]);

  async function handleRevert() {
    setRevertConfirmOpen(false);
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
      await payrollApi.approve(employeeId, payrollId);
      toast.success("Payroll approved");
      setApproveOpen(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePay() {
    const parsed = amount.trim() === "" ? undefined : Math.round(toMinor(parseFloat(amount)));
    if (amount.trim() !== "" && (!Number.isFinite(parsed!) || parsed! <= 0)) {
      toast.error("Amount must be positive");
      return;
    }
    if (paymentMethod === "COMPANY_WALLET" && !walletId) {
      toast.error("Select the company wallet to pay from");
      return;
    }
    if (insufficientFunds && selectedWallet) {
      toast.error(
        `Insufficient funds in "${selectedWallet.name}": needs ${formatMajor(requestedMajor, selectedWallet.currency)} but only ${formatMajor(selectedWallet.balance, selectedWallet.currency)} is available.`
      );
      return;
    }
    setBusy(true);
    try {
      const res = await payrollApi.pay(payrollId, {
        amountMinor: parsed,
        paymentMethod,
        walletId: walletId || undefined,
        note: note || undefined,
      });
      // The server settles open payrolls oldest period first; list every
      // period the money touched so the cascade is visible to the user.
      const settled: Array<{
        periodStart: string;
        periodEnd: string;
        amountMinor: number;
      }> = res.data?.settledPeriods ?? [];
      const settledNote =
        settled.length > 1
          ? ` — settled ${settled
              .map(
                (s) =>
                  `${new Date(s.periodStart).toLocaleDateString()}–${new Date(
                    s.periodEnd
                  ).toLocaleDateString()} (${formatMinor(s.amountMinor)})`
              )
              .join(", ")}`
          : "";
      toast.success(
        (parsed === undefined
          ? "Salary payment recorded"
          : `Partial salary payment of ${formatMinor(parsed)} recorded`) + settledNote
      );
      setPayOpen(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setDeleteConfirmOpen(false);
    setBusy(true);
    try {
      await payrollApi.delete(payrollId);
      toast.success("Payroll record deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (status === "APPROVED" || status === "PARTIALLY_PAID") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canPay && (
              <DropdownMenuItem onClick={() => setPayOpen(true)} disabled={busy}>
                <Banknote className="mr-2 h-4 w-4" />
                Record Payment
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => setAllocOpen(true)}
              disabled={busy || totalPaidMinor > 0}
            >
              <PieChart className="mr-2 h-4 w-4" />
              Project Allocation
            </DropdownMenuItem>
            {canRevert && (
              <DropdownMenuItem
                onClick={() => setRevertConfirmOpen(true)}
                disabled={busy}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Revert to Draft
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmDialog
          open={revertConfirmOpen}
          onOpenChange={setRevertConfirmOpen}
          title="Revert Payroll"
          description="This will return the payroll to draft so the figures can be corrected. Salary payments that have already been recorded are preserved and stay visible. Are you sure?"
          confirmText="Revert"
          variant="destructive"
          onConfirm={handleRevert}
        />
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Salary Payment</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Remaining payable:{" "}
              <span className="font-medium text-foreground">
                {formatMinor(remainingMinor)}
              </span>
              {totalPaidMinor > 0 && (
                <> · already paid {formatMinor(totalPaidMinor)}</>
              )}
            </p>
            <div className="space-y-3">
              <div>
                <Label>Amount (AFN)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={`Full remaining (${remaining})`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave empty to settle the full remaining amount.
                </p>
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYROLL_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYROLL_PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {paymentMethod === "COMPANY_WALLET" && (
                <div>
                  <Label>Deduct from Wallet</Label>
                  <Select value={walletId} onValueChange={setWalletId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select wallet..." />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          No wallets configured
                        </SelectItem>
                      ) : (
                        wallets.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} — {formatMajor(w.balance, w.currency)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {insufficientFunds && selectedWallet && (
                    <p className="mt-1 text-xs text-destructive">
                      Insufficient funds: this payment needs{" "}
                      {formatMajor(requestedMajor, selectedWallet.currency)} but the
                      wallet only has{" "}
                      {formatMajor(selectedWallet.balance, selectedWallet.currency)}.
                    </p>
                  )}
                </div>
              )}
              <div>
                <Label>Note (optional)</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reference or comment"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePay} disabled={busy || insufficientFunds}>
                {busy ? "Saving..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <PayrollAllocationDialog
          open={allocOpen}
          onOpenChange={setAllocOpen}
          payrollId={payrollId}
          onSaved={onChanged}
        />
      </>
    );
  }

  if (status === "PAID") {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => setApproveOpen(true)}
            disabled={busy}
          >
            <Check className="mr-2 h-4 w-4" />
            Approve
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setAllocOpen(true)}
            disabled={busy}
          >
            <PieChart className="mr-2 h-4 w-4" />
            Project Allocation
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={busy}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Payroll"
        description="This will permanently delete this draft payroll record. This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve Payroll"
        description="Approval freezes the payroll figures, applies the advance deductions and posts the salary accounting entry. No money moves until a payment is recorded. Are you sure?"
        confirmText="Approve"
        onConfirm={handleApprove}
      />
      <PayrollAllocationDialog
        open={allocOpen}
        onOpenChange={setAllocOpen}
        payrollId={payrollId}
        onSaved={onChanged}
      />
    </>
  );
}
