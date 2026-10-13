"use client";

// Ledger tab (Phase 4): the contractor's money ledger with running balance,
// plus outstanding claims and aging buckets.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { contractorFinancialsApi } from "@/services/contractor-financials-api";
import {
  LEDGER_ENTRY_TYPE_LABELS,
  POSITIVE_LEDGER_TYPES,
  type AgingBucket,
  type ContractorLedgerEntry,
  type LedgerEntryType,
} from "@/types/contractor-financials";
import { format } from "date-fns";
import { toast } from "sonner";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

interface Props {
  contractorId: string;
}

export function ContractorLedgerTab({ contractorId }: Props) {
  const [entries, setEntries] = useState<ContractorLedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [totalRetention, setTotalRetention] = useState(0);
  const [buckets, setBuckets] = useState<AgingBucket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p: number) => {
      try {
        setLoading(true);
        const [stmt, out] = await Promise.all([
          contractorFinancialsApi.getLedger(contractorId, {
            page: String(p),
            pageSize: "50",
          }),
          contractorFinancialsApi.getOutstanding(contractorId).catch(() => null),
        ]);
        setEntries(stmt.data);
        setBalance(stmt.balance);
        setTotal(stmt.total);
        setPage(stmt.page);
        setTotalPages(stmt.totalPages);
        if (out) {
          setTotalOutstanding(out.totalOutstanding);
          setTotalRetention(out.totalRetention);
          setBuckets(out.aging.buckets);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load ledger");
      } finally {
        setLoading(false);
      }
    },
    [contractorId]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const bucketLabel = (b: AgingBucket["bucket"]) =>
    b === "current" ? "Current" : b === "90+" ? "90+ days" : `${b} days`;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Ledger Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {fmtMoney(balance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {balance > 0 ? "Owed to contractor" : balance < 0 ? "Contractor owes company" : "Settled"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Claim Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{fmtMoney(totalOutstanding)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Retention still held: {fmtMoney(totalRetention)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {buckets
                .filter((b) => b.amount > 0)
                .map((b) => (
                  <Badge
                    key={b.bucket}
                    variant="outline"
                    style={{
                      color: b.bucket === "current" ? "#10b981" : b.bucket === "90+" ? "#ef4444" : "#f59e0b",
                      borderColor: "currentColor",
                    }}
                  >
                    {bucketLabel(b.bucket)}: {fmtMoney(b.amount)}
                  </Badge>
                ))}
              {buckets.every((b) => b.amount <= 0) && (
                <span className="text-sm text-muted-foreground">Nothing outstanding</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statement */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Ledger Statement</CardTitle>
          <span className="text-sm text-muted-foreground">{total} entries</span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSpinner />
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No ledger activity yet. Posting a claim starts the ledger.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Reference</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const positive = POSITIVE_LEDGER_TYPES.includes(e.type) || e.amount > 0;
                      return (
                        <tr key={e.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {format(new Date(e.occurredAt), "yyyy-MM-dd")}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" style={{ color: positive ? "#10b981" : "#ef4444", borderColor: "currentColor" }}>
                              {LEDGER_ENTRY_TYPE_LABELS[e.type as LedgerEntryType] ?? e.type}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground max-w-[28rem] truncate">
                            {e.reference ?? "—"}
                          </td>
                          <td
                            className="py-2 pr-3 text-right font-medium"
                            style={{ color: positive ? "#10b981" : "#ef4444" }}
                          >
                            {e.amount > 0 ? "+" : ""}
                            {fmtMoney(e.amount)}
                          </td>
                          <td className="py-2 text-right">{fmtMoney(e.balanceAfter)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => load(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => load(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
