'use client';

// Contractor Finance Reports tab (Phase 6, Batch A): statement, payable
// aging, retention, advance recovery, deductions, and claims & payments.
// Every figure is fetched from the server-aggregated /api/contractors/reports/*
// routes (reports:view + contractor scope) and rendered as-is — no money math
// happens in this component.
import { useState, useCallback, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { FileText, Clock, Lock, Wallet, Receipt, ClipboardList, Play, Eye, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { contractorsApi } from '@/services/contractor-api';
import { contractorReportsApi } from '@/services/contractor-reports-api';
import type {
  AdvanceRecoveryReport,
  ClaimsPaymentsReport,
  Contractor,
  DeductionsReport,
  PayableAgingReport,
  RetentionReport,
  StatementReport,
} from '@/types/contractor';
import { formatCurrency } from '@/lib/utils';
import { ContractorFinancePdfPreviewModal } from './contractor-finance-reports-preview-modal';

// Screen labels for ledger entry types and deduction types (the PDF documents
// carry their own English/Dari maps).
const STATEMENT_TYPE_LABELS: Record<string, string> = {
  CLAIM_POSTED: 'Claim posted',
  CLAIM_REVERSAL: 'Claim reversed',
  RETENTION_HELD: 'Retention held',
  RETENTION_RELEASED: 'Retention released',
  ADVANCE_DISBURSED: 'Advance disbursed',
  ADVANCE_RECOVERY: 'Advance recovered',
  PAYMENT: 'Payment',
  PAYMENT_REVERSAL: 'Payment reversed',
  WRITE_OFF: 'Write-off',
};

const DEDUCTION_TYPE_LABELS: Record<string, string> = {
  FUEL: 'Fuel',
  PENALTY: 'Penalty',
  MATERIALS: 'Materials',
  ACCOMMODATION: 'Accommodation',
  FOOD: 'Food',
  TRANSPORT: 'Transport',
  TAX: 'Tax',
  OTHER: 'Other',
};
import ContractorStatementPdfDocument from '@/components/pdf/contractor-statement-pdf-document';
import PayableAgingPdfDocument from '@/components/pdf/payable-aging-pdf-document';
import RetentionReportPdfDocument from '@/components/pdf/retention-report-pdf-document';
import AdvanceRecoveryReportPdfDocument from '@/components/pdf/advance-recovery-report-pdf-document';
import DeductionsReportPdfDocument from '@/components/pdf/deductions-report-pdf-document';
import ClaimsPaymentsReportPdfDocument from '@/components/pdf/claims-payments-report-pdf-document';

export function ContractorFinanceReportsTab({
  companyName,
  hasPermission,
}: {
  companyName: string;
  hasPermission: (action: string) => boolean;
}) {
  type ReportKey = 'statement' | 'aging' | 'retention' | 'advances' | 'deductions' | 'claims';

  const [active, setActive] = useState<ReportKey>('statement');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [asOf, setAsOf] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [contractorList, setContractorList] = useState<
    Pick<Contractor, 'id' | 'contractorName' | 'contractorType' | 'status'>[]
  >([]);
  const [loading, setLoading] = useState(false);

  const [statement, setStatement] = useState<StatementReport | null>(null);
  const [aging, setAging] = useState<PayableAgingReport | null>(null);
  const [retention, setRetention] = useState<RetentionReport | null>(null);
  const [advances, setAdvances] = useState<AdvanceRecoveryReport | null>(null);
  const [deductions, setDeductions] = useState<DeductionsReport | null>(null);
  const [claims, setClaims] = useState<ClaimsPaymentsReport | null>(null);

  const [preview, setPreview] = useState<{ el: React.ReactElement; filename: string } | null>(null);

  const ranRef = useRef<Set<ReportKey>>(new Set());

  useEffect(() => {
    contractorsApi
      .getList()
      .then((res) => {
        if (res.data) setContractorList(res.data);
      })
      .catch(() => {});
  }, []);

  const runReport = useCallback(
    async (key: ReportKey) => {
      ranRef.current.add(key);
      setLoading(true);
      try {
        const w = { from: from || undefined, to: to || undefined };
        switch (key) {
          case 'statement':
            if (!contractorId) {
              toast.error('Select a contractor first');
              return;
            }
            setStatement(await contractorReportsApi.getStatement({ contractorId, ...w }));
            break;
          case 'aging':
            setAging(await contractorReportsApi.getPayableAging(asOf || undefined));
            break;
          case 'retention':
            setRetention(await contractorReportsApi.getRetention(w));
            break;
          case 'advances':
            setAdvances(await contractorReportsApi.getAdvanceRecovery(w));
            break;
          case 'deductions':
            setDeductions(await contractorReportsApi.getDeductions(w));
            break;
          case 'claims':
            setClaims(await contractorReportsApi.getClaimsPayments(w));
            break;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    },
    [from, to, asOf, contractorId]
  );

  // Auto-run on first visit of each tab (the statement waits for a contractor).
  useEffect(() => {
    if (ranRef.current.has(active)) return;
    if (active === 'statement' && !contractorId) return;
    runReport(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, contractorId]);

  const stamp = () => format(new Date(), 'yyyy-MM-dd');

  const pdfButton = (label: string, el: React.ReactElement | null, filename: string) =>
    hasPermission('reports:generatePdf') ? (
      <Button
        variant="outline"
        size="sm"
        disabled={!el}
        onClick={() => el && setPreview({ el, filename })}
      >
        <Eye className="h-4 w-4 mr-1.5" />
        {label}
      </Button>
    ) : null;

  const runBtn = (
    <Button
      onClick={() => runReport(active)}
      disabled={loading}
      className="bg-emerald-600 hover:bg-emerald-700 text-white"
    >
      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
      Run report
    </Button>
  );

  const runHint = (text: string) => (
    <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
  );

  const th = 'py-3 font-medium text-muted-foreground';
  const td = 'py-3';

  return (
    <div className="space-y-4">
      <Tabs value={active} onValueChange={(v) => setActive(v as ReportKey)}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="statement" className="gap-1.5">
            <FileText className="h-4 w-4" /> Statement
          </TabsTrigger>
          <TabsTrigger value="aging" className="gap-1.5">
            <Clock className="h-4 w-4" /> Payable Aging
          </TabsTrigger>
          <TabsTrigger value="retention" className="gap-1.5">
            <Lock className="h-4 w-4" /> Retention
          </TabsTrigger>
          <TabsTrigger value="advances" className="gap-1.5">
            <Wallet className="h-4 w-4" /> Advance Recovery
          </TabsTrigger>
          <TabsTrigger value="deductions" className="gap-1.5">
            <Receipt className="h-4 w-4" /> Deductions
          </TabsTrigger>
          <TabsTrigger value="claims" className="gap-1.5">
            <ClipboardList className="h-4 w-4" /> Claims & Payments
          </TabsTrigger>
        </TabsList>

        {/* Shared toolbar: inputs for the active report + Run */}
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
          {active === 'statement' && (
            <div className="space-y-1">
              <span className="block text-xs text-muted-foreground">Contractor</span>
              <Select value={contractorId} onValueChange={setContractorId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select contractor" />
                </SelectTrigger>
                <SelectContent>
                  {contractorList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contractorName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {active === 'aging' ? (
            <div className="space-y-1">
              <span className="block text-xs text-muted-foreground">As of</span>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <span className="block text-xs text-muted-foreground">From</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <span className="block text-xs text-muted-foreground">To</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
            </>
          )}

          {runBtn}
        </div>

        {loading && (
          <div className="py-6">
            <LoadingSpinner size="lg" text="Running report..." />
          </div>
        )}

        {/* ── Statement ─────────────────────────────────────────────── */}
        <TabsContent value="statement" className="space-y-4 mt-4">
          {!statement
            ? runHint('Select a contractor and period, then click “Run report”.')
            : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat label="Opening balance" value={formatCurrency(statement.openingBalance)} />
                  <Stat
                    label="Movement in period"
                    value={formatCurrency(statement.totalInPeriod)}
                    danger={statement.totalInPeriod < 0}
                  />
                  <Stat label="Closing balance" value={formatCurrency(statement.closingBalance)} />
                  <Stat label="Current balance" value={formatCurrency(statement.currentBalance)} />
                </div>
                <Card>
                  <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <p className="text-sm font-medium">
                        {statement.contractorName} — {statement.lines.length} line
                        {statement.lines.length === 1 ? '' : 's'}
                      </p>
                      <div className="flex gap-2">
                        {pdfButton(
                          'Preview (English)',
                          <ContractorStatementPdfDocument
                            report={statement}
                            companyName={companyName}
                            lang="en"
                          />,
                          `contractor-statement-${stamp()}.pdf`
                        )}
                        {pdfButton(
                          'پیش‌نمایش (دری)',
                          <ContractorStatementPdfDocument
                            report={statement}
                            companyName={companyName}
                            lang="fa"
                          />,
                          `contractor-statement-dari-${stamp()}.pdf`
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className={`${th} text-left`}>Date</th>
                            <th className={`${th} text-left`}>Type</th>
                            <th className={`${th} text-left`}>Reference</th>
                            <th className={`${th} text-right`}>Amount</th>
                            <th className={`${th} text-right`}>Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.lines.map((l) => (
                            <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50">
                              <td className={td}>{format(new Date(l.occurredAt), 'dd MMM yyyy')}</td>
                              <td className={td}>{STATEMENT_TYPE_LABELS[l.type] ?? l.type}</td>
                              <td className={td}>{l.reference ?? '—'}</td>
                              <td
                                className={`${td} text-right font-medium ${l.amount < 0 ? 'text-red-600' : ''}`}
                              >
                                {formatCurrency(l.amount)}
                              </td>
                              <td className={`${td} text-right`}>{formatCurrency(l.balanceAfter)}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 font-bold">
                            <td className={td} colSpan={3}>
                              Totals (period)
                            </td>
                            <td className={`${td} text-right`}>{formatCurrency(statement.totalInPeriod)}</td>
                            <td className={`${td} text-right`}>{formatCurrency(statement.closingBalance)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </TabsContent>

        {/* ── Payable aging ─────────────────────────────────────────── */}
        <TabsContent value="aging" className="space-y-4 mt-4">
          {!aging
            ? runHint('Click “Run report” to age all outstanding claims.')
            : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Stat label="Total outstanding" value={formatCurrency(aging.grandTotal)} danger={aging.grandTotal > 0} />
                  <Stat label="Current" value={formatCurrency(aging.totals.current)} />
                  <Stat label="0-30 days" value={formatCurrency(aging.totals['0-30'])} />
                  <Stat label="31-60 days" value={formatCurrency(aging.totals['31-60'])} />
                  <Stat label="61-90 days" value={formatCurrency(aging.totals['61-90'])} />
                  <Stat label="90+ days" value={formatCurrency(aging.totals['90+'])} danger={aging.totals['90+'] > 0} />
                </div>
                <Card>
                  <CardContent>
                    <div className="flex items-center justify-end mb-3">
                      {pdfButton(
                        'Preview PDF',
                        <PayableAgingPdfDocument report={aging} companyName={companyName} />,
                        `payable-aging-${stamp()}.pdf`
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className={`${th} text-left`}>Contractor</th>
                            <th className={`${th} text-right`}>Claims</th>
                            <th className={`${th} text-right`}>Current</th>
                            <th className={`${th} text-right`}>0-30</th>
                            <th className={`${th} text-right`}>31-60</th>
                            <th className={`${th} text-right`}>61-90</th>
                            <th className={`${th} text-right`}>90+</th>
                            <th className={`${th} text-right`}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aging.rows.length === 0 && (
                            <tr>
                              <td className={`${td} text-muted-foreground`} colSpan={8}>
                                No outstanding claims as of {format(new Date(aging.asOf), 'dd MMM yyyy')}.
                              </td>
                            </tr>
                          )}
                          {aging.rows.map((r) => (
                            <tr key={r.contractorId} className="border-b last:border-0 hover:bg-muted/50">
                              <td className={`${td} font-medium`}>{r.contractorName}</td>
                              <td className={`${td} text-right`}>{r.claimCount}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.buckets.current)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.buckets['0-30'])}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.buckets['31-60'])}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.buckets['61-90'])}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.buckets['90+'])}</td>
                              <td className={`${td} text-right font-medium`}>{formatCurrency(r.total)}</td>
                            </tr>
                          ))}
                          {aging.rows.length > 0 && (
                            <tr className="border-t-2 font-bold">
                              <td className={td} colSpan={7}>
                                Portfolio total
                              </td>
                              <td className={`${td} text-right`}>{formatCurrency(aging.grandTotal)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </TabsContent>

        {/* ── Retention ─────────────────────────────────────────────── */}
        <TabsContent value="retention" className="space-y-4 mt-4">
          {!retention
            ? runHint('Click “Run report” to see retention held and released.')
            : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Stat label="Total held" value={formatCurrency(retention.totalHeld)} />
                  <Stat label="Total released" value={formatCurrency(retention.totalReleased)} />
                  <Stat label="Still withheld" value={formatCurrency(retention.totalBalance)} />
                </div>
                <Card>
                  <CardContent>
                    <div className="flex items-center justify-end mb-3">
                      {pdfButton(
                        'Preview PDF',
                        <RetentionReportPdfDocument report={retention} companyName={companyName} />,
                        `retention-${stamp()}.pdf`
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className={`${th} text-left`}>Contractor</th>
                            <th className={`${th} text-right`}>Claims</th>
                            <th className={`${th} text-right`}>Held</th>
                            <th className={`${th} text-right`}>Released</th>
                            <th className={`${th} text-right`}>Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {retention.rows.length === 0 && (
                            <tr>
                              <td className={`${td} text-muted-foreground`} colSpan={5}>
                                No retention activity in this period.
                              </td>
                            </tr>
                          )}
                          {retention.rows.map((r) => (
                            <tr key={r.contractorId} className="border-b last:border-0 hover:bg-muted/50">
                              <td className={`${td} font-medium`}>{r.contractorName}</td>
                              <td className={`${td} text-right`}>{r.claimCount}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.held)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.released)}</td>
                              <td className={`${td} text-right font-medium`}>{formatCurrency(r.balance)}</td>
                            </tr>
                          ))}
                          {retention.rows.length > 0 && (
                            <tr className="border-t-2 font-bold">
                              <td className={td} colSpan={2}>
                                Total
                              </td>
                              <td className={`${td} text-right`}>{formatCurrency(retention.totalHeld)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(retention.totalReleased)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(retention.totalBalance)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </TabsContent>

        {/* ── Advance recovery ──────────────────────────────────────── */}
        <TabsContent value="advances" className="space-y-4 mt-4">
          {!advances
            ? runHint('Click “Run report” to see advances disbursed vs recovered.')
            : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat label="Disbursed" value={formatCurrency(advances.totalDisbursed)} />
                  <Stat label="Recovered" value={formatCurrency(advances.totalRecovered)} />
                  <Stat label="Written off" value={formatCurrency(advances.totalWrittenOff)} danger={advances.totalWrittenOff > 0} />
                  <Stat label="Outstanding" value={formatCurrency(advances.totalOutstanding)} danger={advances.totalOutstanding > 0} />
                </div>
                <Card>
                  <CardContent>
                    <div className="flex items-center justify-end mb-3">
                      {pdfButton(
                        'Preview PDF',
                        <AdvanceRecoveryReportPdfDocument report={advances} companyName={companyName} />,
                        `advance-recovery-${stamp()}.pdf`
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className={`${th} text-left`}>Contractor</th>
                            <th className={`${th} text-right`}>Disbursed</th>
                            <th className={`${th} text-right`}>Recovered</th>
                            <th className={`${th} text-right`}>Written off</th>
                            <th className={`${th} text-right`}>Outstanding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {advances.rows.length === 0 && (
                            <tr>
                              <td className={`${td} text-muted-foreground`} colSpan={5}>
                                No advances in this period.
                              </td>
                            </tr>
                          )}
                          {advances.rows.map((r) => (
                            <tr key={r.contractorId} className="border-b last:border-0 hover:bg-muted/50">
                              <td className={`${td} font-medium`}>{r.contractorName}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.disbursed)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.recovered)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.writtenOff)}</td>
                              <td className={`${td} text-right font-medium`}>{formatCurrency(r.outstanding)}</td>
                            </tr>
                          ))}
                          {advances.rows.length > 0 && (
                            <tr className="border-t-2 font-bold">
                              <td className={td}>Total</td>
                              <td className={`${td} text-right`}>{formatCurrency(advances.totalDisbursed)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(advances.totalRecovered)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(advances.totalWrittenOff)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(advances.totalOutstanding)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </TabsContent>

        {/* ── Deductions ────────────────────────────────────────────── */}
        <TabsContent value="deductions" className="space-y-4 mt-4">
          {!deductions
            ? runHint('Click “Run report” to break down deductions by type.')
            : (
              (() => {
                const types = [...new Set(deductions.rows.flatMap((r) => Object.keys(r.byType)))].sort();
                const top = Object.entries(deductions.totalsByType).sort(
                  (a, b) => (b[1] ?? 0) - (a[1] ?? 0)
                )[0];
                const entries = deductions.rows.reduce((s, r) => s + r.deductionCount, 0);
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <Stat label="Total deductions" value={formatCurrency(deductions.grandTotal)} />
                      <Stat label="Deduction entries" value={String(entries)} />
                      <Stat
                        label="Top type"
                        value={top ? `${DEDUCTION_TYPE_LABELS[top[0]] ?? top[0]} — ${formatCurrency(top[1] ?? 0)}` : '—'}
                      />
                    </div>
                    <Card>
                      <CardContent>
                        <div className="flex items-center justify-end mb-3">
                          {pdfButton(
                            'Preview PDF',
                            <DeductionsReportPdfDocument report={deductions} companyName={companyName} />,
                            `deductions-${stamp()}.pdf`
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className={`${th} text-left`}>Contractor</th>
                                {types.map((t) => (
                                  <th key={t} className={`${th} text-right`}>
                                    {DEDUCTION_TYPE_LABELS[t] ?? t}
                                  </th>
                                ))}
                                <th className={`${th} text-right`}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deductions.rows.length === 0 && (
                                <tr>
                                  <td className={`${td} text-muted-foreground`} colSpan={types.length + 1}>
                                    No deductions in this period.
                                  </td>
                                </tr>
                              )}
                              {deductions.rows.map((r) => (
                                <tr key={r.contractorId} className="border-b last:border-0 hover:bg-muted/50">
                                  <td className={`${td} font-medium`}>{r.contractorName}</td>
                                  {types.map((t) => (
                                    <td key={t} className={`${td} text-right`}>
                                      {formatCurrency(r.byType[t] ?? 0)}
                                    </td>
                                  ))}
                                  <td className={`${td} text-right font-medium`}>{formatCurrency(r.total)}</td>
                                </tr>
                              ))}
                              {deductions.rows.length > 0 && (
                                <tr className="border-t-2 font-bold">
                                  <td className={td}>Total</td>
                                  {types.map((t) => (
                                    <td key={t} className={`${td} text-right`}>
                                      {formatCurrency(deductions.totalsByType[t] ?? 0)}
                                    </td>
                                  ))}
                                  <td className={`${td} text-right`}>{formatCurrency(deductions.grandTotal)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                );
              })())
            }
        </TabsContent>

        {/* ── Claims & payments ─────────────────────────────────────── */}
        <TabsContent value="claims" className="space-y-4 mt-4">
          {!claims
            ? runHint('Click “Run report” to compare claims and payments.')
            : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Stat label="Claims gross" value={formatCurrency(claims.totals.grossAmount)} />
                  <Stat label="Claims net" value={formatCurrency(claims.totals.netAmount)} />
                  <Stat label="Outstanding" value={formatCurrency(claims.totals.outstanding)} danger={claims.totals.outstanding > 0} />
                  <Stat label="Claims paid" value={formatCurrency(claims.totals.paidAmount)} />
                  <Stat label="Payments total" value={formatCurrency(claims.totals.paymentsTotal)} />
                  <Stat label="Reversed" value={formatCurrency(claims.totals.reversedTotal)} danger={claims.totals.reversedTotal > 0} />
                </div>
                <Card>
                  <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <p className="text-sm font-medium">Claims (by period end)</p>
                      {pdfButton(
                        'Preview PDF',
                        <ClaimsPaymentsReportPdfDocument report={claims} companyName={companyName} />,
                        `claims-payments-${stamp()}.pdf`
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className={`${th} text-left`}>Contractor</th>
                            <th className={`${th} text-right`}>#</th>
                            <th className={`${th} text-right`}>Gross</th>
                            <th className={`${th} text-right`}>Retention</th>
                            <th className={`${th} text-right`}>Deductions</th>
                            <th className={`${th} text-right`}>Net</th>
                            <th className={`${th} text-right`}>Paid</th>
                            <th className={`${th} text-right`}>Outstanding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {claims.rows.length === 0 && (
                            <tr>
                              <td className={`${td} text-muted-foreground`} colSpan={8}>
                                No posted claims in this period.
                              </td>
                            </tr>
                          )}
                          {claims.rows.map((r) => (
                            <tr key={r.contractorId} className="border-b last:border-0 hover:bg-muted/50">
                              <td className={`${td} font-medium`}>{r.contractorName}</td>
                              <td className={`${td} text-right`}>{r.claimCount}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.grossAmount)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.retentionAmount)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.deductionsTotal)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.netAmount)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(r.paidAmount)}</td>
                              <td className={`${td} text-right font-medium`}>{formatCurrency(r.outstanding)}</td>
                            </tr>
                          ))}
                          {claims.rows.length > 0 && (
                            <tr className="border-t-2 font-bold">
                              <td className={td} colSpan={2}>
                                Total
                              </td>
                              <td className={`${td} text-right`}>{formatCurrency(claims.totals.grossAmount)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(claims.totals.retentionAmount)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(claims.totals.deductionsTotal)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(claims.totals.netAmount)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(claims.totals.paidAmount)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(claims.totals.outstanding)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <p className="text-sm font-medium mb-3">Payments (by payment date)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className={`${th} text-left`}>Contractor</th>
                            <th className={`${th} text-right`}>#</th>
                            <th className={`${th} text-right`}>Paid</th>
                            <th className={`${th} text-right`}>Reversed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {claims.rows.every((r) => r.paymentCount === 0 && r.reversedTotal === 0) && (
                            <tr>
                              <td className={`${td} text-muted-foreground`} colSpan={4}>
                                No payments in this period.
                              </td>
                            </tr>
                          )}
                          {claims.rows
                            .filter((r) => r.paymentCount > 0 || r.reversedTotal > 0)
                            .map((r) => (
                              <tr key={r.contractorId} className="border-b last:border-0 hover:bg-muted/50">
                                <td className={`${td} font-medium`}>{r.contractorName}</td>
                                <td className={`${td} text-right`}>{r.paymentCount}</td>
                                <td className={`${td} text-right`}>{formatCurrency(r.paymentsTotal)}</td>
                                <td className={`${td} text-right`}>{formatCurrency(r.reversedTotal)}</td>
                              </tr>
                            ))}
                          {claims.totals.paymentCount > 0 && (
                            <tr className="border-t-2 font-bold">
                              <td className={td}>Total</td>
                              <td className={`${td} text-right`}>{claims.totals.paymentCount}</td>
                              <td className={`${td} text-right`}>{formatCurrency(claims.totals.paymentsTotal)}</td>
                              <td className={`${td} text-right`}>{formatCurrency(claims.totals.reversedTotal)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </TabsContent>
      </Tabs>

      <ContractorFinancePdfPreviewModal
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        document={preview?.el ?? null}
        filename={preview?.filename ?? 'report.pdf'}
      />
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-bold tracking-tight ${danger ? 'text-red-600' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
