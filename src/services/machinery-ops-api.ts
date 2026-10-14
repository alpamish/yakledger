// API client for the machinery site-operations subsystem (Phase 3):
// assignment history, daily operating logs, downtime, and fuel variance.
import type {
  DowntimeRecord,
  FuelVarianceRow,
  FuelVarianceSummary,
  MachineryAssignment,
  MachineryDailyLog,
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

export interface ListResponse<T> {
  total: number;
  page: number;
  pageSize: number;
  data: T[];
}

export interface FuelVarianceResponse {
  rows: FuelVarianceRow[];
  summary: FuelVarianceSummary[];
}

export interface TransferFormData {
  contractorId: string;
  startDate: string;
  contractId?: string | null;
  projectName?: string | null;
  transferredBy?: string | null;
  notes?: string | null;
}

export interface DailyLogFormData {
  date: string;
  contractId?: string | null;
  openingMeter: number;
  closingMeter: number;
  normalHours?: number;
  overtimeHours?: number;
  idleHours?: number;
  breakdownHours?: number;
  weather?: string | null;
  delayReason?: string | null;
  operator?: string | null;
  loggedBy?: string | null;
}

export interface DowntimeFormData {
  start: string;
  end?: string | null;
  reason: string;
  chargeable?: boolean | null;
  notes?: string | null;
  loggedBy?: string | null;
}

export const machineryOpsApi = {
  // ── Assignments (transfer history) ──────────────────────────────────────
  listAssignments: (machineryId: string): Promise<MachineryAssignment[]> =>
    request<MachineryAssignment[]>(`/machinery/${machineryId}/assignments`),

  transfer: (
    machineryId: string,
    body: TransferFormData
  ): Promise<{ assignment: MachineryAssignment; assignments: MachineryAssignment[] }> =>
    request(`/machinery/${machineryId}/assignments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateAssignment: (
    machineryId: string,
    assignmentId: string,
    body: {
      startDate?: string;
      endDate?: string | null;
      contractId?: string | null;
      projectName?: string | null;
      transferredBy?: string;
      notes?: string | null;
    }
  ): Promise<MachineryAssignment> =>
    request(`/machinery/${machineryId}/assignments/${assignmentId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // ── Daily operating logs ────────────────────────────────────────────────
  listDailyLogs: (
    machineryId: string,
    params: Record<string, string> = {}
  ): Promise<ListResponse<MachineryDailyLog>> => {
    const qs = new URLSearchParams(params).toString();
    return request(`/machinery/${machineryId}/daily-logs${qs ? `?${qs}` : ""}`);
  },

  createDailyLog: (machineryId: string, body: DailyLogFormData): Promise<MachineryDailyLog> =>
    request(`/machinery/${machineryId}/daily-logs`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateDailyLog: (
    machineryId: string,
    logId: string,
    body: Partial<DailyLogFormData>
  ): Promise<MachineryDailyLog> =>
    request(`/machinery/${machineryId}/daily-logs/${logId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteDailyLog: (machineryId: string, logId: string): Promise<{ id: string }> =>
    request(`/machinery/${machineryId}/daily-logs/${logId}`, { method: "DELETE" }),

  // ── Downtime ────────────────────────────────────────────────────────────
  listDowntime: (
    machineryId: string,
    params: Record<string, string> = {}
  ): Promise<ListResponse<DowntimeRecord>> => {
    const qs = new URLSearchParams(params).toString();
    return request(`/machinery/${machineryId}/downtime${qs ? `?${qs}` : ""}`);
  },

  createDowntime: (machineryId: string, body: DowntimeFormData): Promise<DowntimeRecord> =>
    request(`/machinery/${machineryId}/downtime`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateDowntime: (
    machineryId: string,
    recordId: string,
    body: Partial<DowntimeFormData>
  ): Promise<DowntimeRecord> =>
    request(`/machinery/${machineryId}/downtime/${recordId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteDowntime: (machineryId: string, recordId: string): Promise<{ id: string }> =>
    request(`/machinery/${machineryId}/downtime/${recordId}`, { method: "DELETE" }),

  // ── Fuel variance ───────────────────────────────────────────────────────
  fuelVariance: (
    params: Record<string, string> = {}
  ): Promise<FuelVarianceResponse> => {
    const qs = new URLSearchParams(params).toString();
    return request(`/machinery/fuel-variance${qs ? `?${qs}` : ""}`);
  },
};
