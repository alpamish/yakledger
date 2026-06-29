import type { ApiResponse, PaginatedResponse } from "@/types/expense";
import type {
  Asset,
  AssetFormData,
  AssetFilters,
  AssetLog,
  AssetLogFormData,
  AssetLogStats,
  AssetDashboardStats,
  FuelTransaction,
  FuelTransactionFormData,
  FuelStock,
  FuelContainerStock,
  FuelFinancialSummary,
  MaintenanceRecord,
  MaintenanceRecordFormData,
} from "@/types/asset";
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

  if (response.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/";
    throw new ApiError("Unauthorized", 401);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body.error || body.message) message = body.error || body.message;
    } catch {}
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export const assetsApi = {
  getAll: async (
    params?: AssetFilters
  ): Promise<ApiResponse<PaginatedResponse<Asset>>> => {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.search) searchParams.set("search", params.search);
      if (params.categories?.length) searchParams.set("categories", params.categories.join(","));
      if (params.statuses?.length) searchParams.set("statuses", params.statuses.join(","));
      if (params.assignedToId) searchParams.set("assignedToId", params.assignedToId);
      if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
      if (params.dateTo) searchParams.set("dateTo", params.dateTo);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }
    const qs = searchParams.toString();
    return request<ApiResponse<PaginatedResponse<Asset>>>(`/assets${qs ? `?${qs}` : ""}`);
  },

  getById: async (id: string): Promise<ApiResponse<Asset>> => {
    return request<ApiResponse<Asset>>(`/assets/${id}`);
  },

  create: async (data: AssetFormData): Promise<ApiResponse<Asset>> => {
    return request<ApiResponse<Asset>>("/assets", { method: "POST", body: JSON.stringify(data) });
  },

  update: async (id: string, data: Partial<AssetFormData>): Promise<ApiResponse<Asset>> => {
    return request<ApiResponse<Asset>>(`/assets/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return request<ApiResponse<void>>(`/assets/${id}`, { method: "DELETE" });
  },

  getDashboard: async (): Promise<ApiResponse<AssetDashboardStats>> => {
    return request<ApiResponse<AssetDashboardStats>>("/assets/dashboard");
  },
};

export const fuelApi = {
  getAll: async (params?: {
    type?: string;
    fuelType?: string;
    assetId?: string;
    containerId?: string;
    contractorId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<ApiResponse<PaginatedResponse<FuelTransaction>>> => {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.type) searchParams.set("type", params.type);
      if (params.fuelType) searchParams.set("fuelType", params.fuelType);
      if (params.assetId) searchParams.set("assetId", params.assetId);
      if (params.containerId) searchParams.set("containerId", params.containerId);
      if (params.contractorId) searchParams.set("contractorId", params.contractorId);
      if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
      if (params.dateTo) searchParams.set("dateTo", params.dateTo);
      if (params.search) searchParams.set("search", params.search);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }
    const qs = searchParams.toString();
    return request<ApiResponse<PaginatedResponse<FuelTransaction>>>(`/fuel-transactions${qs ? `?${qs}` : ""}`);
  },

  getStock: async (containerId?: string): Promise<ApiResponse<{ stock: FuelStock[]; containerStock: FuelContainerStock[] }>> => {
    const qs = containerId ? `?containerId=${containerId}` : "";
    return request<ApiResponse<{ stock: FuelStock[]; containerStock: FuelContainerStock[] }>>(`/fuel-transactions/stock${qs}`);
  },

  getContainers: async (includeInactive?: boolean): Promise<ApiResponse<FuelContainerStock[]>> => {
    const qs = includeInactive ? "?includeInactive=true" : "";
    return request<ApiResponse<FuelContainerStock[]>>(`/fuel-containers${qs}`);
  },

  create: async (data: FuelTransactionFormData): Promise<ApiResponse<FuelTransaction>> => {
    return request<ApiResponse<FuelTransaction>>("/fuel-transactions", { method: "POST", body: JSON.stringify(data) });
  },

  update: async (id: string, data: Partial<FuelTransactionFormData>): Promise<ApiResponse<FuelTransaction>> => {
    return request<ApiResponse<FuelTransaction>>(`/fuel-transactions/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return request<ApiResponse<void>>(`/fuel-transactions/${id}`, { method: "DELETE" });
  },

  getFinancialSummary: async (params?: { dateFrom?: string; dateTo?: string }): Promise<ApiResponse<FuelFinancialSummary>> => {
    let url = "/fuel-transactions/financial-summary";
    if (params?.dateFrom || params?.dateTo) {
      const qp = new URLSearchParams();
      if (params.dateFrom) qp.set("dateFrom", params.dateFrom);
      if (params.dateTo) qp.set("dateTo", params.dateTo);
      url += "?" + qp.toString();
    }
    return request<ApiResponse<FuelFinancialSummary>>(url);
  },

  getAvgUnitPrice: async (fuelType: string): Promise<ApiResponse<{ fuelType: string; avgUnitPrice: number }>> => {
    return request<ApiResponse<{ fuelType: string; avgUnitPrice: number }>>(`/fuel-transactions/avg-unit-price?fuelType=${encodeURIComponent(fuelType)}`);
  },
};

export const maintenanceApi = {
  getAll: async (params?: {
    assetId?: string;
    serviceType?: string;
    upcoming?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<ApiResponse<PaginatedResponse<MaintenanceRecord>>> => {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.assetId) searchParams.set("assetId", params.assetId);
      if (params.serviceType) searchParams.set("serviceType", params.serviceType);
      if (params.upcoming) searchParams.set("upcoming", "true");
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }
    const qs = searchParams.toString();
    return request<ApiResponse<PaginatedResponse<MaintenanceRecord>>>(`/maintenance${qs ? `?${qs}` : ""}`);
  },

  create: async (data: MaintenanceRecordFormData): Promise<ApiResponse<MaintenanceRecord>> => {
    return request<ApiResponse<MaintenanceRecord>>("/maintenance", { method: "POST", body: JSON.stringify(data) });
  },

  update: async (id: string, data: Partial<MaintenanceRecordFormData>): Promise<ApiResponse<MaintenanceRecord>> => {
    return request<ApiResponse<MaintenanceRecord>>(`/maintenance/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return request<ApiResponse<void>>(`/maintenance/${id}`, { method: "DELETE" });
  },
};

export const assetLogApi = {
  getAll: async (params?: {
    assetId?: string;
    operatorId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<ApiResponse<PaginatedResponse<AssetLog>>> => {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.assetId) searchParams.set("assetId", params.assetId);
      if (params.operatorId) searchParams.set("operatorId", params.operatorId);
      if (params.status) searchParams.set("status", params.status);
      if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
      if (params.dateTo) searchParams.set("dateTo", params.dateTo);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }
    const qs = searchParams.toString();
    return request<ApiResponse<PaginatedResponse<AssetLog>>>(`/asset-logs${qs ? `?${qs}` : ""}`);
  },

  create: async (data: AssetLogFormData): Promise<ApiResponse<AssetLog>> => {
    return request<ApiResponse<AssetLog>>("/asset-logs", { method: "POST", body: JSON.stringify(data) });
  },

  update: async (id: string, data: Partial<AssetLogFormData>): Promise<ApiResponse<AssetLog>> => {
    return request<ApiResponse<AssetLog>>(`/asset-logs/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },

  approve: async (id: string, status: "APPROVED" | "REJECTED"): Promise<ApiResponse<AssetLog>> => {
    return request<ApiResponse<AssetLog>>(`/asset-logs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  },

  getStats: async (): Promise<ApiResponse<AssetLogStats>> => {
    return request<ApiResponse<AssetLogStats>>("/asset-logs/stats");
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return request<ApiResponse<void>>(`/asset-logs/${id}`, { method: "DELETE" });
  },
};
