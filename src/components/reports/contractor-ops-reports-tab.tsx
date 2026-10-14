'use client';

// Contractor Ops Reports tab (Phase 6, Batch B): machinery utilization,
// downtime, fuel variance, and per-project contractor cost. Utilization,
// downtime, and project cost are server-aggregated under
// /api/contractor-ops-reports/*; fuel variance reuses the Phase 3 engine via
// /api/machinery/fuel-variance. Machinery-reports-tab.tsx is intentionally
// untouched — this tab is additive.
import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Gauge,
  Wrench,
  Fuel,
  FolderKanban,
  Play,
  Eye,
  Loader2,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { contractorReportsApi } from '@/services/contractor-reports-api';
import { machineryOpsApi } from '@/services/machinery-ops-api';
import type {
  DowntimeReport,
  FuelVarianceSummary,
  ProjectCostReport,
  UtilizationReport,
} from '@/types/contractor';
import { ContractorFinancePdfPreviewModal } from './contractor-finance-reports-preview-modal';
import MachineryUtilizationPdfDocument from '@/components/pdf/machinery-utilization-pdf-document';
import MachineryDowntimePdfDocument from '@/components/pdf/machinery-downtime-pdf-document';
import FuelVariancePdfDocument from '@/components/pdf/fuel-variance-pdf-document';
import ContractorProjectCostPdfDocument from '@/components/pdf/contractor-project-cost-pdf-document';

export function ContractorOpsReportsTab({
  companyName,
  hasPermission,
}: {
  companyName: string;
  hasPermission: (action: string) => boolean;
}) {
  type OpsReportKey = 'utilization' | 'downtime' | 'fuelVariance' | 'projectCost';

  const [active, setActive] = useState<OpsReportKey>('utilization');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);

  const [utilization, setUtilization] = useState<UtilizationReport | null>(null);
  const [downtime, setDowntime] = useState<DowntimeReport | null>(null);
  const [fuel, setFuel] = useState<FuelVarianceSummary[] | null>(null);
  const [projectCost, setProjectCost] = useState<ProjectCostReport | null>(null);

  const [preview, setPreview] = useState<{ el: React.ReactElement; filename: string } | null>(null);

  const runReport = useCallback(
    async (key: OpsReportKey) => {
      setLoading(true);
      try {
        const w = { from: from || undefined, to: to || undefined };
        switch (key) {
          case 'utilization':
            setUtilization(await contractorReportsApi.getUtilization(w));
            break;
          case 'downtime':
            setDowntime(await contractorReportsApi.getDowntime(w));
            break;
          case 'fuelVariance': {
            const params: Record<string, string> = {};
            if (from) params.from = from;
            if (to) params.to = to;
            const res = await machineryOpsApi.fuelVariance(params);
            setFuel(res.summary);
            break;
          }
          case 'projectCost':
            setProjectCost(await contractorReportsApi.getProjectCost(w));
            break;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    },
    [from, to]
  );

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

  const fmtH = (n: number) => `${n.toFixed(1)} h`;
  const fmtL = (n: number) => `${n.toFixed(1)} L`;

  const th = 'py-3 font-medium text-muted-foreground';
  const td = 'py-3';

  const runHint = (text: string) => (
    <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
  );

  return (
    <div className="space-y-4">
      <Tabs value={active} onValueChange={(v) => setActive(v as OpsReportKey)}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="utilization" className="gap-1.5">
            <Gauge className="h-4 w-4" /> Utilization
          </TabsTrigger>
          <TabsTrigger value="downtime" className="gap-1.5">
            <Wrench className="h-4 w-4" /> Downtime
          </TabsTrigger>
          <TabsTrigger value="fuelVariance" className="gap-1.5">
            <Fuel className="h-4 w-4" /> Fuel Variance
          </TabsTrigger>
          <TabsTrigger value="projectCost" className="gap-1.5">
            <FolderKanban className="h-4 w-4" /> Project Cost
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="space-y-1">
            <span className="block text-xs text-muted-foreground">From</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <span className="block text-xs text-muted-foreground">To</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button
            onClick={() => runReport(active)}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Run report
          </Button>
        </div>

        {loading && (
          <div className="py-6">
            <LoadingSpinner size="lg" text="Running report..." />
          </div>
        )}

        {/* ── Utilization ───────────────────────────────────────────── */}
        <TabsContent value="utilization" className="space-y-4 mt-4">
          {!utilization
            ? runHint('Click “Run report” to compute machinery utilization.')
            : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat label="Fleet utilization" value={utilization.totals.utilizationPercent === null ? '—' : `${utilization.totals.utilizationPercent}%`} />
                  <Stat label="Worked hours" value={fmtH(utilization.totals.workedHours)} />
                  <Stat label="Idle hours" value={fmtH(utilization.totals.idleHours)} />
                  <Stat label="Downtime hours" value={fmtH(utilization.totals.downtimeHours)} danger={utilization.totals.downtimeHours > 0} />
                </div>
                <Card>
                  <CardContent>
                    <div className="flex items-center justify-end mb-3">
                      {pdfButton(
                        'Preview PDF',
                        <MachineryUtilizationPdfDocument report={utilization} companyName={companyName} />,
                        `machinery-utilization-${stamp()}.pdf`
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className={`${th} text-left`}>Machine</th>
                            <th className={`${th} text-left`}>Contractor</th>
                            <th className={`${th} text-right`}>Days</th>
                            <th className={`${th} text-right`}>Worked</th>
                            <th className={`${th} text-right`}>Idle</th>
                            <th className={`${th} text-right`}>Breakdown</th>
                            <th className={`${th} text-right`}>Downtime</th>
                            <th className={`${th} text-right`}>Chg. down</th>
                            <th className={`${th} text-right`}>Util %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {utilization.rows.length === 0 && (
                            <tr>
                              <td className={`${td} text-muted-foreground`} colSpan={9}>
                                No machinery in scope.
                              </td>
                            </tr>
                          )}
                          {utilization.rows.map((r) => (
                            <tr key={r.machineryId} className="border-b last:border-0 hover:bg-muted/50">
                              <td className={`${td} font-medium`}>
                                {r.machineryName}
                                {r.plateNumber ? ` (${r.plateNumber})` : ''}
                              </td>
                              <td className={td}>{r.assignedContractorName ?? '—'}</td>
                              <td className={`${td} text-right`}>{r.loggedDays}</td>
                              <td className={`${td} text-right`}>{fmtH(r.workedHours)}</td>
                              <td className={`${td} text-right`}>{fmtH(r.idleHours)}</td>
                              <td className={`${td} text-right`}>{fmtH(r.breakdownHours)}</td>
                              <td className={`${td} text-right`}>{fmtH(r.downtimeHours)}</td>
                              <td className={`${td} text-right`}>{fmtH(r.chargeableDowntimeHours)}</td>
                              <td className={`${td} text-right font-medium`}>
                                {r.utilizationPercent === null ? '—' : `${r.utilizationPercent}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </TabsContent>

        {/* ── Downtime ──────────────────────────────────────────────── */}
        <TabsContent value="downtime" className="space-y-4 mt-4">
          {!downtime
            ? runHint('Click “Run report” to break down machinery downtime.')
            : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Stat label="Total downtime" value={fmtH(downtime.totalHours)} danger={downtime.totalHours > 0} />
                  <Stat label="Chargeable" value={fmtH(downtime.chargeableHours)} />
                  <Stat label="Top reason" value={downtime.byReason[0]?.reason ?? '—'} />
                </div>
                <Card>
                  <CardContent>
                    <div className="flex items-center justify-end mb-3">
                      {pdfButton(
                        'Preview PDF',
                        <MachineryDowntimePdfDocument report={downtime} companyName={companyName} />,
                        `machinery-downtime-${stamp()}.pdf`
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className={`${th} text-left`}>Machine</th>
                            <th className={`${th} text-left`}>Contractor</th>
                            <th className={`${th} text-right`}>Records</th>
                            <th className={`${th} text-right`}>Total hours</th>
                            <th className={`${th} text-right`}>Chargeable</th>
                            <th className={`${th} text-left`}>Reasons</th>
                          </tr>
                        </thead>
                        <tbody>
                          {downtime.rows.length === 0 && (
                            <tr>
                              <td className={`${td} text-muted-foreground`} colSpan={6}>
                                No downtime records in this period.
                              </td>
                            </tr>
                          )}
                          {downtime.rows.map((r) => (
                            <tr key={r.machineryId} className="border-b last:border-0 hover:bg-muted/50">
                              <td className={`${td} font-medium`}>{r.machineryName}</td>
                              <td className={td}>{r.assignedContractorName ?? '—'}</td>
                              <td className={`${td} text-right`}>{r.recordCount}</td>
                              <td className={`${td} text-right`}>{fmtH(r.totalHours)}</td>
                              <td className={`${td} text-right`}>{fmtH(r.chargeableHours)}</td>
                              <td className={`${td} text-xs text-muted-foreground`}>
                                {r.byReason.map((x) => `${x.reason} (${x.hours.toFixed(1)}h)`).join(', ')}
                              </td>
                            </tr>
                          ))}
                          {downtime.rows.length > 0 && (
                            <tr className="border-t-2 font-bold">
                              <td className={td} colSpan={2}>
                                Total
                              </td>
                              <td className={`${td} text-right`}>
                                {downtime.rows.reduce((s, r) => s + r.recordCount, 0)}
                              </td>
                              <td className={`${td} text-right`}>{fmtH(downtime.totalHours)}</td>
                              <td className={`${td} text-right`}>{fmtH(downtime.chargeableHours)}</td>
                              <td />
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

        {/* ── Fuel variance ─────────────────────────────────────────── */}
        <TabsContent value="fuelVariance" className="space-y-4 mt-4">
          {!fuel
            ? runHint('Click “Run report” to compare expected vs actual fuel.')
            : (
              (() => {
                const totalExpected = fuel.reduce((s, r) => s + r.expectedLiters, 0);
                const totalActual = fuel.reduce((s, r) => s + r.actualLiters, 0);
                const totalVariance = fuel.reduce((s, r) => s + r.variance, 0);
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Stat label="Expected" value={fmtL(totalExpected)} />
                      <Stat label="Actual" value={fmtL(totalActual)} />
                      <Stat label="Variance" value={fmtL(totalVariance)} danger={totalVariance > 0} />
                      <Stat label="Machines" value={String(fuel.length)} />
                    </div>
                    <Card>
                      <CardContent>
                        <div className="flex items-center justify-end mb-3">
                          {pdfButton(
                            'Preview PDF',
                            <FuelVariancePdfDocument
                              summary={fuel}
                              companyName={companyName}
                              from={from || undefined}
                              to={to || undefined}
                            />,
                            `fuel-variance-${stamp()}.pdf`
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className={`${th} text-left`}>Machine</th>
                                <th className={`${th} text-right`}>Rate</th>
                                <th className={`${th} text-right`}>Expected</th>
                                <th className={`${th} text-right`}>Actual</th>
                                <th className={`${th} text-right`}>Variance</th>
                                <th className={`${th} text-right`}>Coverage</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fuel.length === 0 && (
                                <tr>
                                  <td className={`${td} text-muted-foreground`} colSpan={6}>
                                    No fuel usage with a machinery reference in this period.
                                  </td>
                                </tr>
                              )}
                              {fuel.map((r) => (
                                <tr key={r.machineryId} className="border-b last:border-0 hover:bg-muted/50">
                                  <td className={`${td} font-medium`}>{r.machineryName}</td>
                                  <td className={`${td} text-right`}>{r.consumptionRate.toFixed(1)} L/h</td>
                                  <td className={`${td} text-right`}>{fmtL(r.expectedLiters)}</td>
                                  <td className={`${td} text-right`}>{fmtL(r.actualLiters)}</td>
                                  <td className={`${td} text-right font-medium ${r.variance > 0 ? 'text-red-600' : ''}`}>
                                    {fmtL(r.variance)}
                                  </td>
                                  <td className={`${td} text-right`}>
                                    {r.expectedDays}/{r.totalDays} ({r.coveragePercent}%)
                                  </td>
                                </tr>
                              ))}
                              {fuel.length > 0 && (
                                <tr className="border-t-2 font-bold">
                                  <td className={td}>Total</td>
                                  <td />
                                  <td className={`${td} text-right`}>{fmtL(totalExpected)}</td>
                                  <td className={`${td} text-right`}>{fmtL(totalActual)}</td>
                                  <td className={`${td} text-right`}>{fmtL(totalVariance)}</td>
                                  <td />
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

        {/* ── Project cost ──────────────────────────────────────────── */}
        <TabsContent value="projectCost" className="space-y-4 mt-4">
          {!projectCost
            ? runHint('Click “Run report” to compare contract value vs approved vs paid.')
            : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat label="Contract value" value={`AFN ${projectCost.totals.contractValue.toLocaleString('en-US')}`} />
                  <Stat label="Approved (net)" value={`AFN ${projectCost.totals.approvedNet.toLocaleString('en-US')}`} />
                  <Stat label="Paid" value={`AFN ${projectCost.totals.paidAmount.toLocaleString('en-US')}`} />
                  <Stat label="Outstanding" value={`AFN ${projectCost.totals.outstanding.toLocaleString('en-US')}`} danger={projectCost.totals.outstanding > 0} />
                </div>
                <Card>
                  <CardContent>
                    <div className="flex items-center justify-end mb-3">
                      {pdfButton(
                        'Preview PDF',
                        <ContractorProjectCostPdfDocument report={projectCost} companyName={companyName} />,
                        `project-cost-${stamp()}.pdf`
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className={`${th} text-left`}>Project</th>
                            <th className={`${th} text-left`}>Contract</th>
                            <th className={`${th} text-left`}>Contractor</th>
                            <th className={`${th} text-right`}>Value</th>
                            <th className={`${th} text-right`}>Approved</th>
                            <th className={`${th} text-right`}>Retention</th>
                            <th className={`${th} text-right`}>Paid</th>
                            <th className={`${th} text-right`}>Outstanding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectCost.rows.length === 0 && (
                            <tr>
                              <td className={`${td} text-muted-foreground`} colSpan={8}>
                                No contracts in scope.
                              </td>
                            </tr>
                          )}
                          {projectCost.rows.map((r) => (
                            <tr key={r.contractId} className="border-b last:border-0 hover:bg-muted/50">
                              <td className={td}>{r.projectName ?? '—'}</td>
                              <td className={`${td} font-medium`}>{r.contractTitle}</td>
                              <td className={td}>{r.contractorName}</td>
                              <td className={`${td} text-right`}>{formatMoney(r.contractValue)}</td>
                              <td className={`${td} text-right`}>{formatMoney(r.approvedNet)}</td>
                              <td className={`${td} text-right`}>{formatMoney(r.retentionHeld)}</td>
                              <td className={`${td} text-right`}>{formatMoney(r.paidAmount)}</td>
                              <td className={`${td} text-right font-medium`}>{formatMoney(r.outstanding)}</td>
                            </tr>
                          ))}
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

function formatMoney(n: number): string {
  return `AFN ${Math.round(n).toLocaleString('en-US')}`;
}
