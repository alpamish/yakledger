// API client for contractor reporting (Phase 6, Batch A): statement, payable
// aging, retention, advance recovery, deductions, claims & payments. All
// endpoints are server-aggregated under /api/contractors/reports/* and gated
// by `reports:view` + the caller's contractor access scope.
import type {
  AdvanceRecoveryReport,
  ClaimsPaymentsReport,
  DeductionsReport,
  DowntimeReport,
  PayableAgingReport,
  ProjectCostReport,
  RetentionReport,
  StatementReport,
  UtilizationReport,
} from "@/types/contractor";
import { getToken, ApiError } from "./api";

const API_BASE = "/api";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data.error || `Request failed with status ${response.status}`,
      response.status
    );
  }
  return data.data as T;
}

export interface ReportWindow {
  from?: string;
  to?: string;
}

function windowQuery(w: ReportWindow): string {
  const qs = new URLSearchParams();
  if (w.from) qs.set("from", w.from);
  if (w.to) qs.set("to", w.to);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const contractorReportsApi = {
  getStatement: (params: { contractorId: string } & ReportWindow): Promise<StatementReport> => {
    const qs = new URLSearchParams({ contractorId: params.contractorId });
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    return request<StatementReport>(`/contractors/reports/statement?${qs.toString()}`);
  },

  getPayableAging: (asOf?: string): Promise<PayableAgingReport> =>
    request<PayableAgingReport>(
      `/contractors/reports/payable-aging${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ""}`
    ),

  getRetention: (w: ReportWindow = {}): Promise<RetentionReport> =>
    request<RetentionReport>(`/contractors/reports/retention${windowQuery(w)}`),

  getAdvanceRecovery: (w: ReportWindow = {}): Promise<AdvanceRecoveryReport> =>
    request<AdvanceRecoveryReport>(`/contractors/reports/advance-recovery${windowQuery(w)}`),

  getDeductions: (w: ReportWindow = {}): Promise<DeductionsReport> =>
    request<DeductionsReport>(`/contractors/reports/deductions${windowQuery(w)}`),

  getClaimsPayments: (w: ReportWindow = {}): Promise<ClaimsPaymentsReport> =>
    request<ClaimsPaymentsReport>(`/contractors/reports/claims-payments${windowQuery(w)}`),

  // ── Machinery & project ops (Batch B) ────────────────────────────────────
  getUtilization: (w: ReportWindow = {}): Promise<UtilizationReport> =>
    request<UtilizationReport>(`/contractor-ops-reports/utilization${windowQuery(w)}`),

  getDowntime: (w: ReportWindow = {}): Promise<DowntimeReport> =>
    request<DowntimeReport>(`/contractor-ops-reports/downtime${windowQuery(w)}`),

  getProjectCost: (w: ReportWindow = {}): Promise<ProjectCostReport> =>
    request<ProjectCostReport>(`/contractor-ops-reports/project-cost${windowQuery(w)}`),
};
