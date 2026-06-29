import type {
  ApiResponse,
  PaginatedResponse,
} from "@/types/expense";
import type {
  Employee,
  EmployeeFormData,
  EmployeeFilters,
  EmployeeDashboardStats,
  EmployeeFinancialSummaryResponse,
} from "@/types/employee";
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

// ─── Employees API ────────────────────────────────────────────────────────

export const employeesApi = {
  getAll: async (
    params?: EmployeeFilters & {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: string;
    }
  ): Promise<ApiResponse<PaginatedResponse<Employee>>> => {
    const searchParams = new URLSearchParams();

    if (params) {
      if (params.search) searchParams.set("search", params.search);
      if (params.searchField) searchParams.set("searchField", params.searchField);
      if (params.departments?.length) {
        searchParams.set("departments", params.departments.join(","));
      }
      if (params.statuses?.length) {
        searchParams.set("statuses", params.statuses.join(","));
      }
      if (params.employmentTypes?.length) {
        searchParams.set("employmentTypes", params.employmentTypes.join(","));
      }
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }

    const qs = searchParams.toString();
    const endpoint = `/employees${qs ? `?${qs}` : ""}`;

    return request<ApiResponse<PaginatedResponse<Employee>>>(endpoint);
  },

  getById: async (id: string): Promise<ApiResponse<Employee>> => {
    return request<ApiResponse<Employee>>(`/employees/${id}`);
  },

  create: async (data: EmployeeFormData): Promise<ApiResponse<Employee>> => {
    return request<ApiResponse<Employee>>("/employees", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: Partial<EmployeeFormData>
  ): Promise<ApiResponse<Employee>> => {
    return request<ApiResponse<Employee>>(`/employees/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return request<ApiResponse<void>>(`/employees/${id}`, {
      method: "DELETE",
    });
  },

  bulkAction: async (
    ids: string[],
    action: "delete" | "activate" | "deactivate"
  ): Promise<ApiResponse<{ affected: number }>> => {
    return request<ApiResponse<{ affected: number }>>("/employees/bulk-action", {
      method: "POST",
      body: JSON.stringify({ ids, action }),
    });
  },

  getDashboard: async (): Promise<ApiResponse<EmployeeDashboardStats>> => {
    return request<ApiResponse<EmployeeDashboardStats>>("/employees/dashboard");
  },

  getList: async (
    status?: string
  ): Promise<ApiResponse<Pick<Employee, "id" | "fullName" | "jobTitle" | "department" | "salary" | "status" | "hireDate">[]>> => {
    const qs = status ? `?status=${status}` : "";
    return request<ApiResponse<Pick<Employee, "id" | "fullName" | "jobTitle" | "department" | "salary" | "status" | "hireDate">[]>>(
      `/employees/list${qs}`
    );
  },

  financialSummary: async (
    ids: string[]
  ): Promise<ApiResponse<EmployeeFinancialSummaryResponse>> => {
    return request<ApiResponse<EmployeeFinancialSummaryResponse>>(
      "/employees/financial-summary",
      {
        method: "POST",
        body: JSON.stringify({ ids }),
      }
    );
  },
};
