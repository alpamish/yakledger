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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { payrollApi } from "@/services/payroll-api";
import { walletApi } from "@/services/wallet-api";
import { formatMinor } from "@/lib/money";
import { PAYMENT_METHODS } from "@/types/expense";
import { toast } from "sonner";
import { useEffect } from "react";
import { MoreHorizontal, Check, RotateCcw, Trash2 } from "lucide-react";

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
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState<string>("");

  useEffect(() => {
    if (approveOpen) {
      setWalletId("");
      walletApi
        .list()
        .then((res) => {
          const ws: Wallet[] = res.data ?? [];
          setWallets(ws);
          if (defaultWalletId && ws.some((w) => w.id === defaultWalletId)) {
            setWalletId(defaultWalletId);
          }
        })
        .catch(() => setWallets([]));
    }
  }, [approveOpen, defaultWalletId]);

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

  if (status === "APPROVED") {
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
              onClick={() => setRevertConfirmOpen(true)}
              disabled={busy}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Revert to Draft
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmDialog
          open={revertConfirmOpen}
          onOpenChange={setRevertConfirmOpen}
          title="Revert Payroll"
          description="This will revert the approved payroll back to draft status. The salary payment and advance allocations will be removed. Are you sure?"
          confirmText="Revert"
          variant="destructive"
          onConfirm={handleRevert}
        />
      </>
    );
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
            Approve & Pay
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
