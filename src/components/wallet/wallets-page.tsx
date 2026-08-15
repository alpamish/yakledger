"use client";

import { useCallback, useEffect, useState } from "react";
import { walletApi } from "@/services/wallet-api";
import { formatMinor } from "@/lib/money";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { usePermissions } from "@/hooks/use-permissions";
import { Plus, Wallet, ArrowLeftRight, Pencil, Power, PiggyBank } from "lucide-react";

function fmt(amount: number, currency = "AFN") {
  return formatMinor(Math.round(amount * 100), currency);
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

type DialogState = "create" | "edit" | "fund" | "adjust" | "transfer" | null;

export function WalletsPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("wallets:manage");

  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await walletApi.list();
      setWallets(res.data ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalBalance = wallets
    .filter((w) => w.isActive)
    .reduce((sum, w) => sum + (w.balance ?? 0), 0);

  const openDialog = (state: DialogState, wallet?: any) => {
    setSelected(wallet ?? null);
    setDialog(state);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Balance</div>
            <div className="text-2xl font-semibold font-mono">{fmt(totalBalance)}</div>
            <div className="text-xs text-muted-foreground">Active wallets</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Wallets</div>
            <div className="text-2xl font-semibold">{wallets.length}</div>
            <div className="text-xs text-muted-foreground">
              {wallets.filter((w) => w.isActive).length} active
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Company Wallets</div>
              <div className="text-sm mt-1">
                Deduct payroll and other payments from a company wallet.
              </div>
            </div>
            {canManage && (
              <Button size="sm" onClick={() => openDialog("create")}>
                <Plus className="h-4 w-4 mr-1" /> New Wallet
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wallets</CardTitle>
          <CardDescription>Cash and bank accounts the company draws from.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10">
              <LoadingSpinner text="Loading wallets..." />
            </div>
          ) : wallets.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No wallets"
              description="Create a company wallet to pay salaries and track balances."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  {canManage && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell>{w.type || "CASH"}</TableCell>
                    <TableCell>{w.currency}</TableCell>
                    <TableCell className="font-mono font-semibold">
                      {fmt(w.balance, w.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.isActive ? "default" : "secondary"}>
                        {w.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmtDate(w.createdAt)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Edit"
                            onClick={() => openDialog("edit", w)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Fund"
                            onClick={() => openDialog("fund", w)}
                          >
                            <PiggyBank className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Adjust"
                            onClick={() => openDialog("adjust", w)}
                          >
                            <Wallet className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Transfer"
                            onClick={() => openDialog("transfer", w)}
                          >
                            <ArrowLeftRight className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500"
                            title={w.isActive ? "Deactivate" : "Activate"}
                            onClick={async () => {
                              try {
                                if (w.isActive) {
                                  await walletApi.deactivate(w.id);
                                  toast.success("Wallet deactivated");
                                } else {
                                  await walletApi.update(w.id, { isActive: true });
                                  toast.success("Wallet activated");
                                }
                                load();
                              } catch (e: any) {
                                toast.error(e?.message || "Failed");
                              }
                            }}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateWalletDialog
        open={dialog === "create"}
        onOpenChange={(o) => setDialog(o ? "create" : null)}
        onDone={() => {
          setDialog(null);
          load();
        }}
      />
      <EditWalletDialog
        open={dialog === "edit"}
        onOpenChange={(o) => setDialog(o ? "edit" : null)}
        wallet={selected}
        onDone={() => {
          setDialog(null);
          load();
        }}
      />
      <FundWalletDialog
        open={dialog === "fund"}
        onOpenChange={(o) => setDialog(o ? "fund" : null)}
        wallet={selected}
        onDone={() => {
          setDialog(null);
          load();
        }}
      />
      <AdjustWalletDialog
        open={dialog === "adjust"}
        onOpenChange={(o) => setDialog(o ? "adjust" : null)}
        wallet={selected}
        onDone={() => {
          setDialog(null);
          load();
        }}
      />
      <TransferDialog
        open={dialog === "transfer"}
        onOpenChange={(o) => setDialog(o ? "transfer" : null)}
        fromWallet={selected}
        wallets={wallets}
        onDone={() => {
          setDialog(null);
          load();
        }}
      />
    </div>
  );
}

function CreateWalletDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("CASH");
  const [currency, setCurrency] = useState("AFN");
  const [initialBalance, setInitialBalance] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Wallet name is required");
      return;
    }
    setSaving(true);
    try {
      await walletApi.create({
        name: name.trim(),
        type,
        currency,
        initialBalance: initialBalance ? Number(initialBalance) : 0,
      });
      toast.success("Wallet created");
      setName("");
      setInitialBalance("");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create wallet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Wallet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Bank Account" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK">Bank</SelectItem>
                  <SelectItem value="MOBILE">Mobile</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Initial Balance</Label>
            <Input
              type="number"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditWalletDialog({
  open,
  onOpenChange,
  wallet,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  wallet: any;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("CASH");
  const [currency, setCurrency] = useState("AFN");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wallet) {
      setName(wallet.name);
      setType(wallet.type || "CASH");
      setCurrency(wallet.currency || "AFN");
    }
  }, [wallet]);

  async function save() {
    if (!name.trim()) {
      toast.error("Wallet name is required");
      return;
    }
    setSaving(true);
    try {
      await walletApi.update(wallet.id, { name: name.trim(), type, currency });
      toast.success("Wallet updated");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update wallet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Wallet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK">Bank</SelectItem>
                  <SelectItem value="MOBILE">Mobile</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FundWalletDialog({
  open,
  onOpenChange,
  wallet,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  wallet: any;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setNote("");
    }
  }, [open]);

  async function save() {
    const a = Number(amount);
    if (!a || a <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    setSaving(true);
    try {
      await walletApi.fund(wallet.id, a, note || undefined);
      toast.success("Wallet funded");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Fund failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fund Wallet</DialogTitle>
        </DialogHeader>
        {wallet && (
          <p className="text-sm text-muted-foreground">
            Add money to <span className="font-medium">{wallet.name}</span>. Current balance:{" "}
            <span className="font-mono">{fmt(wallet.balance, wallet.currency)}</span>.
          </p>
        )}
        <div className="space-y-3">
          <div>
            <Label>Amount</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Funding..." : "Fund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustWalletDialog({
  open,
  onOpenChange,
  wallet,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  wallet: any;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setNote("");
    }
  }, [open]);

  async function save() {
    const a = Number(amount);
    if (!a || a === 0) {
      toast.error("Enter a non-zero amount");
      return;
    }
    setSaving(true);
    try {
      await walletApi.adjust(wallet.id, a, note || undefined);
      toast.success("Balance adjusted");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Adjust failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Balance</DialogTitle>
        </DialogHeader>
        {wallet && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{wallet.name}</span> current balance:{" "}
            <span className="font-mono">{fmt(wallet.balance, wallet.currency)}</span>. Use a
            positive amount to add, negative to deduct.
          </p>
        )}
        <div className="space-y-3">
          <div>
            <Label>Amount</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Adjusting..." : "Adjust"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  open,
  onOpenChange,
  fromWallet,
  wallets,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fromWallet: any;
  wallets: any[];
  onDone: () => void;
}) {
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setToId("");
      setAmount("");
      setNote("");
    }
  }, [open]);

  async function save() {
    const a = Number(amount);
    if (!a || a <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!toId) {
      toast.error("Select a target wallet");
      return;
    }
    setSaving(true);
    try {
      await walletApi.transfer(fromWallet.id, toId, a, note || undefined);
      toast.success("Transfer completed");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer Between Wallets</DialogTitle>
        </DialogHeader>
        {fromWallet && (
          <p className="text-sm text-muted-foreground">
            From <span className="font-medium">{fromWallet.name}</span> (balance{" "}
            <span className="font-mono">{fmt(fromWallet.balance, fromWallet.currency)}</span>).
          </p>
        )}
        <div className="space-y-3">
          <div>
            <Label>To Wallet</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select target wallet" />
              </SelectTrigger>
              <SelectContent>
                {wallets
                  .filter((w) => w.id !== fromWallet?.id)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} — {fmt(w.balance, w.currency)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Transferring..." : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}