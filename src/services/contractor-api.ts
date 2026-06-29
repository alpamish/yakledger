import type { ApiResponse, PaginatedResponse } from "@/types/expense";
import type {
  Contractor,
  ContractorFormData,
  ContractorFilters,
  ContractorDashboardStats,
  Timesheet,
  TimesheetFormData,
  TimesheetFilters,
  FuelUsage,
  FuelUsageFormData,
  FuelUsageFilters,
  FuelUsageSummary,
  Machinery,
  MachineryFormData,
  MachineryFilters,
  MachinerySummaryStats,
  MachineryByContractor,
  MachineryFuelPerMachinery,
  BulkFuelUsageRecord,
  BulkFuelUsageRequest,
  BulkFuelUsageResponse,
  BulkTimesheetRequest,
  BulkTimesheetResponse,
} from "@/types/contractor";
import { getToken, ApiError } from "./api";

const API_BASE = "/api";

// Base request helper (reuse pattern from main api.ts)
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    throw new ApiError("Unauthorized", 401);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body.error || body.message) {
        message = body.error || body.message;
      }
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();
  return data as T;
}

// ─── Contractors API ────────────────────────────────────────────────────────

export const contractorsApi = {
  getAll: async (
    params?: ContractorFilters & {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: string;
    }
  ): Promise<ApiResponse<PaginatedResponse<Contractor>>> => {
    const searchParams = new URLSearchParams();

    if (params) {
      if (params.search) searchParams.set("search", params.search);
      if (params.contractorTypes?.length) {
        searchParams.set("contractorTypes", params.contractorTypes.join(","));
      }
      if (params.statuses?.length) {
        searchParams.set("statuses", params.statuses.join(","));
      }
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }

    const qs = searchParams.toString();
    const endpoint = `/contractors${qs ? `?${qs}` : ""}`;

    return request<ApiResponse<PaginatedResponse<Contractor>>>(endpoint);
  },

  getById: async (id: string): Promise<ApiResponse<Contractor>> => {
    return request<ApiResponse<Contractor>>(`/contractors/${id}`);
  },

  create: async (data: ContractorFormData): Promise<ApiResponse<Contractor>> => {
    return request<ApiResponse<Contractor>>("/contractors", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: Partial<ContractorFormData>
  ): Promise<ApiResponse<Contractor>> => {
    return request<ApiResponse<Contractor>>(`/contractors/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return request<ApiResponse<void>>(`/contractors/${id}`, {
      method: "DELETE",
    });
  },

  bulkAction: async (
    ids: string[],
    action: "delete" | "activate" | "suspend"
  ): Promise<ApiResponse<{ affected: number }>> => {
    return request<ApiResponse<{ affected: number }>>("/contractors/bulk-action", {
      method: "POST",
      body: JSON.stringify({ ids, action }),
    });
  },

  getDashboard: async (): Promise<ApiResponse<ContractorDashboardStats>> => {
    return request<ApiResponse<ContractorDashboardStats>>("/contractors/dashboard");
  },

  getList: async (
    status?: string
  ): Promise<ApiResponse<Pick<Contractor, "id" | "contractorName" | "fatherName" | "contractorType" | "status">[]>> => {
    const qs = status ? `?status=${status}` : "";
    return request<ApiResponse<Pick<Contractor, "id" | "contractorName" | "fatherName" | "contractorType" | "status">[]>>(
      `/contractors/list${qs}`
    );
  },
};

// ─── Timesheets API ─────────────────────────────────────────────────────────

export const timesheetsApi = {
  getAll: async (
    params?: TimesheetFilters & {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: string;
    }
  ): Promise<ApiResponse<PaginatedResponse<Timesheet>>> => {
    const searchParams = new URLSearchParams();

    if (params) {
      if (params.search) searchParams.set("search", params.search);
      if (params.contractorId) searchParams.set("contractorId", params.contractorId);
      if (params.machineryId) searchParams.set("machineryId", params.machineryId);
      if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
      if (params.dateTo) searchParams.set("dateTo", params.dateTo);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }

    const qs = searchParams.toString();
    const endpoint = `/timesheets${qs ? `?${qs}` : ""}`;

    return request<ApiResponse<PaginatedResponse<Timesheet>>>(endpoint);
  },

  getById: async (id: string): Promise<ApiResponse<Timesheet>> => {
    return request<ApiResponse<Timesheet>>(`/timesheets/${id}`);
  },

  create: async (data: TimesheetFormData): Promise<ApiResponse<Timesheet>> => {
    return request<ApiResponse<Timesheet>>("/timesheets", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: Partial<TimesheetFormData>
  ): Promise<ApiResponse<Timesheet>> => {
    return request<ApiResponse<Timesheet>>(`/timesheets/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return request<ApiResponse<void>>(`/timesheets/${id}`, {
      method: "DELETE",
    });
  },

  approve: async (id: string): Promise<ApiResponse<Timesheet>> => {
    return request<ApiResponse<Timesheet>>(`/timesheets/${id}/approve`, {
      method: "POST",
    });
  },

  bulkCreate: async (data: BulkTimesheetRequest): Promise<ApiResponse<BulkTimesheetResponse>> => {
    return request<ApiResponse<BulkTimesheetResponse>>("/timesheets/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// ─── Fuel Usage API ─────────────────────────────────────────────────────────

export const fuelUsageApi = {
  getSummary: async (params?: { dateFrom?: string; dateTo?: string }): Promise<ApiResponse<FuelUsageSummary>> => {
    const searchParams = new URLSearchParams();
    if (params?.dateFrom) searchParams.set("dateFrom", params.dateFrom);
    if (params?.dateTo) searchParams.set("dateTo", params.dateTo);
    const qs = searchParams.toString();
    return request<ApiResponse<FuelUsageSummary>>(`/fuel-usage/summary${qs ? `?${qs}` : ""}`);
  },

  getAll: async (
    params?: FuelUsageFilters & {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: string;
    }
  ): Promise<ApiResponse<PaginatedResponse<FuelUsage>>> => {
    const searchParams = new URLSearchParams();

    if (params) {
      if (params.search) searchParams.set("search", params.search);
      if (params.contractorId) searchParams.set("contractorId", params.contractorId);
      if (params.machineryId) searchParams.set("machineryId", params.machineryId);
      if (params.machineryType) searchParams.set("machineryType", params.machineryType);
      if (params.fuelTypes?.length) {
        searchParams.set("fuelTypes", params.fuelTypes.join(","));
      }
      if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
      if (params.dateTo) searchParams.set("dateTo", params.dateTo);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }

    const qs = searchParams.toString();
    const endpoint = `/fuel-usage${qs ? `?${qs}` : ""}`;

    return request<ApiResponse<PaginatedResponse<FuelUsage>>>(endpoint);
  },

  getById: async (id: string): Promise<ApiResponse<FuelUsage>> => {
    return request<ApiResponse<FuelUsage>>(`/fuel-usage/${id}`);
  },

  create: async (data: FuelUsageFormData): Promise<ApiResponse<FuelUsage>> => {
    return request<ApiResponse<FuelUsage>>("/fuel-usage", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: Partial<FuelUsageFormData>
  ): Promise<ApiResponse<FuelUsage>> => {
    return request<ApiResponse<FuelUsage>>(`/fuel-usage/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return request<ApiResponse<void>>(`/fuel-usage/${id}`, {
      method: "DELETE",
    });
  },

  bulkCreate: async (data: BulkFuelUsageRequest): Promise<ApiResponse<BulkFuelUsageResponse>> => {
    return request<ApiResponse<BulkFuelUsageResponse>>("/fuel-usage/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// ─── Machinery API ──────────────────────────────────────────────────────────

export const machineryApi = {
  getAll: async (
    params?: MachineryFilters & {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: string;
    }
  ): Promise<ApiResponse<PaginatedResponse<Machinery>>> => {
    const searchParams = new URLSearchParams();

    if (params) {
      if (params.search) searchParams.set("search", params.search);
      if (params.statuses?.length) {
        searchParams.set("statuses", params.statuses.join(","));
      }
      if (params.assignedContractorId) {
        searchParams.set("assignedContractorId", params.assignedContractorId);
      }
      if (params.machineryTypes?.length) {
        searchParams.set("machineryType", params.machineryTypes[0]);
      }
      if (params.fuelTypes?.length) {
        searchParams.set("fuelTypes", params.fuelTypes.join(","));
      }
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }

    const qs = searchParams.toString();
    const endpoint = `/machinery${qs ? `?${qs}` : ""}`;

    return request<ApiResponse<PaginatedResponse<Machinery>>>(endpoint);
  },

  getById: async (id: string): Promise<ApiResponse<Machinery>> => {
    return request<ApiResponse<Machinery>>(`/machinery/${id}`);
  },

  create: async (data: MachineryFormData): Promise<ApiResponse<Machinery>> => {
    return request<ApiResponse<Machinery>>("/machinery", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: Partial<MachineryFormData>
  ): Promise<ApiResponse<Machinery>> => {
    return request<ApiResponse<Machinery>>(`/machinery/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return request<ApiResponse<void>>(`/machinery/${id}`, {
      method: "DELETE",
    });
  },

  bulkAction: async (
    ids: string[],
    action: "updateStatus",
    value?: string
  ): Promise<ApiResponse<{ affected: number }>> => {
    return request<ApiResponse<{ affected: number }>>("/machinery/bulk-action", {
      method: "POST",
      body: JSON.stringify({ ids, action, value }),
    });
  },

  getTypes: async (): Promise<ApiResponse<string[]>> => {
    return request<ApiResponse<string[]>>("/machinery/types");
  },

  getSummary: async (): Promise<ApiResponse<MachinerySummaryStats>> => {
    return request<ApiResponse<MachinerySummaryStats>>("/machinery/summary");
  },

  getContractorSummary: async (
    params?: { search?: string; page?: number; pageSize?: number }
  ): Promise<ApiResponse<PaginatedResponse<MachineryByContractor>>> => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
    const qs = searchParams.toString();
    return request<ApiResponse<PaginatedResponse<MachineryByContractor>>>(`/machinery/contractor-summary${qs ? `?${qs}` : ""}`);
  },

  getFuelSummary: async (
    params?: { search?: string; page?: number; pageSize?: number }
  ): Promise<ApiResponse<PaginatedResponse<MachineryFuelPerMachinery>>> => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
    const qs = searchParams.toString();
    return request<ApiResponse<PaginatedResponse<MachineryFuelPerMachinery>>>(`/machinery/fuel-summary${qs ? `?${qs}` : ""}`);
  },

  getList: async (
    status?: string
  ): Promise<ApiResponse<Pick<Machinery, "id" | "machineryName" | "machineryType" | "plateNumber" | "driverName" | "status">[]>> => {
    const qs = status ? `?status=${status}` : "";
    return request<ApiResponse<Pick<Machinery, "id" | "machineryName" | "machineryType" | "plateNumber" | "driverName" | "status">[]>>(
      `/machinery/list${qs}`
    );
  },
};
