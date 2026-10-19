"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { walletApi } from "@/services/wallet-api";
import { employeesApi } from "@/services/api";
import { getToken } from "@/services/api";
import { formatMinor, formatMajor } from "@/lib/money";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { EmptyState } from "@/components/common/empty-state";
import { usePermissions } from "@/hooks/use-permissions";
import { TransferToWalletDialog } from "@/components/cash-advance/transfer-to-wallet-dialog";
import { Plus, Wallet, ArrowLeftRight, ArrowDownToLine, Pencil, Power, PiggyBank, Eye, ChevronLeft, ChevronRight, ChevronDown, Check, Loader2, X } from "lucide-react";

function fmt(amount: number, currency = "AFN") {
  return formatMajor(amount, currency);
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

type DialogState = "create" | "edit" | "fund" | "adjust" | "transfer" | "ledger" | "receive" | null;

export function WalletsPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("wallets:manage");

  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState("wallets");

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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

      <TabsContent value="wallets" className="mt-4">
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
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Assigned Users</TableHead>
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
                    <TableCell>
                      {w.employees && w.employees.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {w.employees.slice(0, 3).map((we: any) => (
                            <Badge key={we.id} variant="outline" className="text-xs">
                              {we.employee?.fullName ?? 'Unknown'}
                            </Badge>
                          ))}
                          {w.employees.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{w.employees.length - 3}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">All</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {w.users && w.users.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {w.users.slice(0, 3).map((wu: any) => (
                            <Badge key={wu.id} variant="outline" className="text-xs">
                              {wu.user?.name ?? 'Unknown'}
                            </Badge>
                          ))}
                          {w.users.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{w.users.length - 3}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">All</span>
                      )}
                    </TableCell>
                    <TableCell>{fmtDate(w.createdAt)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Transactions"
                            onClick={() => openDialog("ledger", w)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
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
                            title="Receive from employee"
                            onClick={() => openDialog("receive", w)}
                          >
                            <ArrowDownToLine className="h-4 w-4" />
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
      </TabsContent>

      <TabsContent value="transactions" className="mt-4">
        <WalletTransactionsTab />
      </TabsContent>
      </Tabs>

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
      <WalletTransactionsDialog
        open={dialog === "ledger"}
        onOpenChange={(o) => setDialog(o ? "ledger" : null)}
        wallet={selected}
      />
      <TransferToWalletDialog
        open={dialog === "receive"}
        onOpenChange={(o) => setDialog(o ? "receive" : null)}
        walletId={selected?.id}
        walletName={selected?.name}
        onSuccess={() => {
          setDialog(null);
          load();
        }}
      />
    </div>
  );
}

const TX_TYPE_LABELS: Record<string, string> = {
  FUNDING: "Funding",
  ADJUSTMENT: "Adjustment",
  PAYROLL: "Payroll payment",
  EXPENSE: "Expense payment",
  ADVANCE: "Cash advance",
  REVERSAL: "Reversal",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
};

const PAGE_SIZES = [10, 25, 50, 100];

function WalletTransactionsTab() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [walletId, setWalletId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    walletApi
      .list()
      .then((res) => setWallets(res.data ?? []))
      .catch(() => setWallets([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await walletApi.transactions({
        walletId: walletId || undefined,
        type: type || undefined,
        from: from || undefined,
        to: to || undefined,
        search: search.trim() || undefined,
        page,
        pageSize,
      });
      if (res.success) setData(res.data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [walletId, type, from, to, search, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const rows: any[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const current = page;
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push(-1);
      for (let i = Math.max(2, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) {
        pages.push(i);
      }
      if (current < totalPages - 2) pages.push(-1);
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, page]);

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>Ledger entries across all company wallets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Wallet</Label>
            <Select
              value={walletId || undefined}
              onValueChange={(v) => {
                setWalletId(v === "__all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All wallets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All wallets</SelectItem>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={type || undefined}
              onValueChange={(v) => {
                setType(v === "__all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All types</SelectItem>
                {Object.entries(TX_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="date"
              className="w-[160px]"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="date"
              className="w-[160px]"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label>Search note</Label>
            <Input
              placeholder="Search note..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setWalletId("");
              setType("");
              setFrom("");
              setTo("");
              setSearch("");
              setPage(1);
            }}
          >
            Reset
          </Button>
        </div>

        {loading ? (
          <div className="py-10">
            <LoadingSpinner text="Loading transactions..." />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No transactions"
            description="No ledger entries match the current filters."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDate(t.createdAt)}</TableCell>
                  <TableCell className="font-medium">{t.wallet?.name ?? "—"}</TableCell>
                  <TableCell>{TX_TYPE_LABELS[t.type] ?? t.type}</TableCell>
                  <TableCell
                    className={`font-mono font-semibold ${
                      t.amount < 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {t.amount < 0 ? "−" : "+"}
                    {formatMinor(Math.round(Math.abs(t.amount) * 100), t.wallet?.currency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.note || (t.payrollId ? "Linked to payroll" : "—")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{startIndex}</span> to{" "}
              <span className="font-medium text-foreground">{endIndex}</span> of{" "}
              <span className="font-medium text-foreground">{total}</span> results
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-8 rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Previous page</span>
                </Button>
                {pageNumbers.map((pg, idx) =>
                  pg === -1 ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={pg}
                      variant={pg === page ? "default" : "outline"}
                      size="icon"
                      className={`h-8 w-8 ${
                        pg === page ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                      }`}
                      onClick={() => setPage(pg)}
                    >
                      {pg}
                    </Button>
                  )
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Next page</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WalletTransactionsDialog({
  open,
  onOpenChange,
  wallet,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  wallet: any;
}) {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && wallet) {
      setLoading(true);
      walletApi
        .get(wallet.id)
        .then((res) => setTxs(res.data?.transactions ?? []))
        .catch(() => setTxs([]))
        .finally(() => setLoading(false));
    }
  }, [open, wallet]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transactions</DialogTitle>
        </DialogHeader>
        {wallet && (
          <p className="text-sm text-muted-foreground">
            {wallet.name} · balance{" "}
            <span className="font-mono">{fmt(wallet.balance, wallet.currency)}</span>
          </p>
        )}
        <div className="max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="py-8">
              <LoadingSpinner text="Loading transactions..." />
            </div>
          ) : txs.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No transactions"
              description="No ledger entries for this wallet yet."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txs.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmtDate(t.createdAt)}
                    </TableCell>
                    <TableCell>{TX_TYPE_LABELS[t.type] ?? t.type}</TableCell>
                    <TableCell
                      className={`font-mono font-semibold ${
                        t.amount < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {t.amount < 0 ? "−" : "+"}
                      {formatMinor(Math.round(Math.abs(t.amount) * 100), wallet?.currency)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.note || (t.payrollId ? "Linked to payroll" : "—")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [employees, setEmployees] = useState<{ id: string; fullName: string; jobTitle: string }[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [empPopoverOpen, setEmpPopoverOpen] = useState(false);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);

  useEffect(() => {
    if (open) {
      employeesApi.list().then((res) => {
        if (res.data) setEmployees(res.data);
      }).catch(() => {}).finally(() => setLoadingEmployees(false));
      const token = getToken();
      fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((body) => setUsers(body.data ?? []))
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }, [open]);

  const toggleEmployee = (id: string) => {
    setEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const toggleUser = (id: string) => {
    setUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  };

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
        employeeIds: employeeIds.length > 0 ? employeeIds : undefined,
        userIds: userIds.length > 0 ? userIds : undefined,
      });
      toast.success("Wallet created");
      setName("");
      setInitialBalance("");
      setEmployeeIds([]);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create wallet");
    } finally {
      setSaving(false);
    }
  }

  const selectedEmployees = employees.filter((e) => employeeIds.includes(e.id));

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
          <div className="space-y-1.5">
            <Label>Assign to Employees (optional)</Label>
            <Popover open={empPopoverOpen} onOpenChange={setEmpPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {selectedEmployees.length > 0
                    ? `${selectedEmployees.length} employee${selectedEmployees.length > 1 ? 's' : ''} selected`
                    : 'All employees (no restriction)'}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command>
                  <CommandInput placeholder="Search employees..." />
                  <CommandList>
                    <CommandEmpty>No employees found.</CommandEmpty>
                    {loadingEmployees ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : (
                      employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={emp.id}
                          keywords={[emp.fullName, emp.jobTitle]}
                          onSelect={() => toggleEmployee(emp.id)}
                        >
                          <Check
                            className="mr-2 h-4 w-4"
                            style={{ opacity: employeeIds.includes(emp.id) ? 1 : 0 }}
                          />
                          {emp.fullName} — {emp.jobTitle}
                        </CommandItem>
                      ))
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedEmployees.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedEmployees.map((emp) => (
                  <Badge key={emp.id} variant="secondary" className="text-xs gap-1">
                    {emp.fullName}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => toggleEmployee(emp.id)} />
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave empty to allow all employees to use this wallet.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Restrict to Users (optional)</Label>
            <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {userIds.length > 0
                    ? `${userIds.length} user${userIds.length > 1 ? 's' : ''} selected`
                    : 'Admins & Managers only (no restriction)'}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command>
                  <CommandInput placeholder="Search users..." />
                  <CommandList>
                    <CommandEmpty>No users found.</CommandEmpty>
                    {loadingUsers ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : (
                      users.map((u) => (
                        <CommandItem
                          key={u.id}
                          value={u.id}
                          keywords={[u.name, u.email]}
                          onSelect={() => toggleUser(u.id)}
                        >
                          <Check
                            className="mr-2 h-4 w-4"
                            style={{ opacity: userIds.includes(u.id) ? 1 : 0 }}
                          />
                          {u.name} — {u.email}
                        </CommandItem>
                      ))
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {userIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {users.filter((u) => userIds.includes(u.id)).map((u) => (
                  <Badge key={u.id} variant="secondary" className="text-xs gap-1">
                    {u.name}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => toggleUser(u.id)} />
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave empty to allow all users with access to see this wallet.
            </p>
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
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [employees, setEmployees] = useState<{ id: string; fullName: string; jobTitle: string }[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [empPopoverOpen, setEmpPopoverOpen] = useState(false);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);

  useEffect(() => {
    if (wallet) {
      setName(wallet.name);
      setType(wallet.type || "CASH");
      setCurrency(wallet.currency || "AFN");
      setEmployeeIds(wallet.employees?.map((e: any) => e.employeeId) ?? []);
      setUserIds(wallet.users?.map((wu: any) => wu.userId) ?? []);
    }
  }, [wallet]);

  useEffect(() => {
    if (open) {
      employeesApi.list().then((res) => {
        if (res.data) setEmployees(res.data);
      }).catch(() => {}).finally(() => setLoadingEmployees(false));
      const token = getToken();
      fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((body) => setUsers(body.data ?? []))
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }, [open]);

  const toggleEmployee = (id: string) => {
    setEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const toggleUser = (id: string) => {
    setUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  };

  async function save() {
    if (!name.trim()) {
      toast.error("Wallet name is required");
      return;
    }
    setSaving(true);
    try {
      await walletApi.update(wallet.id, { name: name.trim(), type, currency, employeeIds, userIds });
      toast.success("Wallet updated");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update wallet");
    } finally {
      setSaving(false);
    }
  }

  const selectedEmployees = employees.filter((e) => employeeIds.includes(e.id));

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
          <div className="space-y-1.5">
            <Label>Assign to Employees (optional)</Label>
            <Popover open={empPopoverOpen} onOpenChange={setEmpPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {selectedEmployees.length > 0
                    ? `${selectedEmployees.length} employee${selectedEmployees.length > 1 ? 's' : ''} selected`
                    : 'All employees (no restriction)'}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command>
                  <CommandInput placeholder="Search employees..." />
                  <CommandList>
                    <CommandEmpty>No employees found.</CommandEmpty>
                    {loadingEmployees ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : (
                      employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={emp.id}
                          keywords={[emp.fullName, emp.jobTitle]}
                          onSelect={() => toggleEmployee(emp.id)}
                        >
                          <Check
                            className="mr-2 h-4 w-4"
                            style={{ opacity: employeeIds.includes(emp.id) ? 1 : 0 }}
                          />
                          {emp.fullName} — {emp.jobTitle}
                        </CommandItem>
                      ))
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedEmployees.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedEmployees.map((emp) => (
                  <Badge key={emp.id} variant="secondary" className="text-xs gap-1">
                    {emp.fullName}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => toggleEmployee(emp.id)} />
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave empty to allow all employees to use this wallet.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Restrict to Users (optional)</Label>
            <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {userIds.length > 0
                    ? `${userIds.length} user${userIds.length > 1 ? 's' : ''} selected`
                    : 'Admins & Managers only (no restriction)'}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command>
                  <CommandInput placeholder="Search users..." />
                  <CommandList>
                    <CommandEmpty>No users found.</CommandEmpty>
                    {loadingUsers ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : (
                      users.map((u) => (
                        <CommandItem
                          key={u.id}
                          value={u.id}
                          keywords={[u.name, u.email]}
                          onSelect={() => toggleUser(u.id)}
                        >
                          <Check
                            className="mr-2 h-4 w-4"
                            style={{ opacity: userIds.includes(u.id) ? 1 : 0 }}
                          />
                          {u.name} — {u.email}
                        </CommandItem>
                      ))
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {userIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {users.filter((u) => userIds.includes(u.id)).map((u) => (
                  <Badge key={u.id} variant="secondary" className="text-xs gap-1">
                    {u.name}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => toggleUser(u.id)} />
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave empty to allow all users with access to see this wallet.
            </p>
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