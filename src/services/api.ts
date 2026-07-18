import type {
  AuthResponse,
  ApiResponse,
  DashboardStats,
  Expense,
  ExpenseFilters,
  ExpenseFormData,
  PaginatedResponse,
  User,
  CashTransaction,
  CashTransactionFormData,
  EmployeeCashAccount,
  EmployeeListItem,
  LedgerEntry,
  Transfer,
  TransferFormData,
} from "@/types/expense";
import type {
  AttendanceRecord,
  AttendanceSummary,
  AttendanceFilters,
} from "@/types/employee";

const API_BASE = "/api";

// ─── In-Memory Cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(endpoint: string, method: string): string {
  return `${method}:${endpoint}`;
}

function getCached<T>(endpoint: string, method: string): T | null {
  if (method !== "GET") return null;
  const key = getCacheKey(endpoint, method);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(endpoint: string, method: string, data: unknown, ttlMs: number): void {
  if (method !== "GET") return;
  const key = getCacheKey(endpoint, method);
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  if (cache.size > 500) {
    const oldest = cache.entries().next().value;
    if (oldest) cache.delete(oldest[0]);
  }
}

function invalidateCache(modulePrefix: string): void {
  for (const key of cache.keys()) {
    if (key.includes(modulePrefix)) {
      cache.delete(key);
    }
  }
}

function computeTTL(endpoint: string): number {
  if (endpoint.includes("/dashboard") || endpoint.includes("/summary") || endpoint.includes("/stats")) {
    return 15_000;
  }
  if (endpoint.includes("/list") || endpoint.includes("/types") || endpoint.includes("/stock")) {
    return 30_000;
  }
  return 10_000;
}

// ─── Token management ────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("auth_token", token);
}

function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("auth_token");
}

// API error class
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Base request helper
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const method = options.method || "GET";

  const cached = getCached<T>(endpoint, method);
  if (cached !== null) return cached;

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
    clearToken();
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
      // response body is not JSON, use default message
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json() as T;

  if (method === "GET") {
    const ttl = computeTTL(endpoint);
    setCache(endpoint, method, data, ttl);
  }

  return data;
}

async function mutate<T>(
  endpoint: string,
  options: RequestInit,
  modulePrefix: string
): Promise<T> {
  const result = await request<T>(endpoint, { ...options });
  invalidateCache(modulePrefix);
  return result;
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export const authApi = {
  register: async (data: { email: string; name: string; password: string }): Promise<ApiResponse<AuthResponse>> => {
    const result = await request<ApiResponse<AuthResponse>>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (result.data?.token) {
      setToken(result.data.token);
    }
    return result;
  },

  login: async (data: { email: string; password: string }): Promise<ApiResponse<AuthResponse>> => {
    const result = await request<ApiResponse<AuthResponse>>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (result.data?.token) {
      setToken(result.data.token);
    }
    return result;
  },

  me: async (): Promise<ApiResponse<User>> => {
    return request<ApiResponse<User>>("/auth/me");
  },

  logout: async (): Promise<void> => {
    try {
      await request<void>("/auth/logout", { method: "POST" });
    } finally {
      clearToken();
    }
  },
};

// ─── Expenses API ────────────────────────────────────────────────────────────

export const expensesApi = {
  getAll: async (
    params?: ExpenseFilters & {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: string;
    }
  ): Promise<ApiResponse<PaginatedResponse<Expense>>> => {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.search) searchParams.set("search", params.search);
      if (params.searchField) searchParams.set("searchField", params.searchField);
      if (params.categories?.length) {
        params.categories.forEach((c) => searchParams.append("category", c));
      }
      if (params.paymentMethods?.length) {
        params.paymentMethods.forEach((pm) => searchParams.append("paymentMethod", pm));
      }
      if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
      if (params.dateTo) searchParams.set("dateTo", params.dateTo);
      if (params.amountMin !== undefined) searchParams.set("amountMin", String(params.amountMin));
      if (params.amountMax !== undefined) searchParams.set("amountMax", String(params.amountMax));
      if (params.paidBy) searchParams.set("paidBy", params.paidBy);
      if (params.paidTo) searchParams.set("paidTo", params.paidTo);
      if (params.paidById) searchParams.set("paidById", params.paidById);
      if (params.paidToId) searchParams.set("paidToId", params.paidToId);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    }
    const qs = searchParams.toString();
    return request<ApiResponse<PaginatedResponse<Expense>>>(`/expenses${qs ? `?${qs}` : ""}`);
  },

  getById: async (id: string): Promise<ApiResponse<Expense>> => {
    return request<ApiResponse<Expense>>(`/expenses/${id}`);
  },

  create: async (data: ExpenseFormData): Promise<ApiResponse<Expense>> => {
    return mutate<ApiResponse<Expense>>("/expenses", {
      method: "POST",
      body: JSON.stringify(data),
    }, "/expenses");
  },

  update: async (id: string, data: Partial<ExpenseFormData>): Promise<ApiResponse<Expense>> => {
    return mutate<ApiResponse<Expense>>(`/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }, "/expenses");
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return mutate<ApiResponse<void>>(`/expenses/${id}`, {
      method: "DELETE",
    }, "/expenses");
  },

  bulkDelete: async (ids: string[]): Promise<ApiResponse<void>> => {
    return mutate<ApiResponse<void>>("/expenses/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }, "/expenses");
  },

  getDashboard: async (): Promise<ApiResponse<DashboardStats>> => {
    return request<ApiResponse<DashboardStats>>("/expenses/dashboard");
  },

  uploadAttachment: async (file: File): Promise<ApiResponse<{ url: string }>> => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/expenses/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (response.status === 401) {
      clearToken();
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
      throw new ApiError("Unauthorized", 401);
    }

    if (!response.ok) {
      let message = `Upload failed with status ${response.status}`;
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

    invalidateCache("/expenses");
    return response.json();
  },
};

// ─── Employees API ────────────────────────────────────────────────────────────

export const employeesApi = {
  list: async (): Promise<ApiResponse<EmployeeListItem[]>> => {
    return request<ApiResponse<EmployeeListItem[]>>("/employees/list");
  },
};

// ─── Cash Advance / Wallet API ───────────────────────────────────────────────

export const cashAdvanceApi = {
  createTransaction: async (data: CashTransactionFormData): Promise<ApiResponse<CashTransaction>> => {
    return mutate<ApiResponse<CashTransaction>>("/cash-transactions", {
      method: "POST",
      body: JSON.stringify(data),
    }, "/cash-transactions");
  },

  getTransactions: async (params?: { employeeId?: string; type?: string }): Promise<ApiResponse<CashTransaction[]>> => {
    const searchParams = new URLSearchParams();
    if (params?.employeeId) searchParams.set("employeeId", params.employeeId);
    if (params?.type) searchParams.set("type", params.type);
    const qs = searchParams.toString();
    return request<ApiResponse<CashTransaction[]>>(`/cash-transactions${qs ? `?${qs}` : ""}`);
  },

  deleteTransaction: async (id: string): Promise<ApiResponse<void>> => {
    return mutate<ApiResponse<void>>(`/cash-transactions/${id}`, { method: "DELETE" }, "/cash-transactions");
  },

  createTransfer: async (data: TransferFormData): Promise<ApiResponse<Transfer>> => {
    return mutate<ApiResponse<Transfer>>("/employee-wallet/transfer", {
      method: "POST",
      body: JSON.stringify(data),
    }, "/employee-wallet");
  },

  getEmployeeWallets: async (): Promise<ApiResponse<EmployeeCashAccount[]>> => {
    return request<ApiResponse<EmployeeCashAccount[]>>("/employee-wallet");
  },

  getEmployeeWallet: async (
    employeeId: string,
    params?: { dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }
  ): Promise<ApiResponse<{ account: EmployeeCashAccount | null; ledger: LedgerEntry[]; total?: number; page?: number; pageSize?: number }>> => {
    const searchParams = new URLSearchParams({ employeeId });
    if (params?.dateFrom) searchParams.set("dateFrom", params.dateFrom);
    if (params?.dateTo) searchParams.set("dateTo", params.dateTo);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
    return request<ApiResponse<{ account: EmployeeCashAccount | null; ledger: LedgerEntry[]; total?: number; page?: number; pageSize?: number }>>(`/employee-wallet?${searchParams.toString()}`);
  },

  getEmployeeLedger: async (employeeId: string): Promise<ApiResponse<LedgerEntry[]>> => {
    return request<ApiResponse<LedgerEntry[]>>(`/employee-wallet/ledger/${employeeId}`);
  },

  getTransfers: async (): Promise<ApiResponse<Transfer[]>> => {
    return request<ApiResponse<Transfer[]>>("/employee-wallet/transfer");
  },
};

// ─── Attendance API ─────────────────────────────────────────────────────────

export const attendanceApi = {
  getAll: async (params?: AttendanceFilters): Promise<ApiResponse<{ data: AttendanceRecord[]; total: number }>> => {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.employeeId) searchParams.set("employeeId", params.employeeId);
      if (params.search) searchParams.set("search", params.search);
      if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
      if (params.dateTo) searchParams.set("dateTo", params.dateTo);
      if (params.status) searchParams.set("status", params.status);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
    }
    const qs = searchParams.toString();
    return request<ApiResponse<{ data: AttendanceRecord[]; total: number }>>(`/attendance${qs ? `?${qs}` : ""}`);
  },

  create: async (data: { employeeId: string; date: string; status: string; notes?: string }): Promise<ApiResponse<AttendanceRecord>> => {
    return mutate<ApiResponse<AttendanceRecord>>("/attendance", {
      method: "POST",
      body: JSON.stringify(data),
    }, "/attendance");
  },

  update: async (id: string, data: { status?: string; notes?: string }): Promise<ApiResponse<AttendanceRecord>> => {
    return mutate<ApiResponse<AttendanceRecord>>(`/attendance/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }, "/attendance");
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    return mutate<ApiResponse<void>>(`/attendance/${id}`, {
      method: "DELETE",
    }, "/attendance");
  },

  getSummary: async (params: { employeeId: string; dateFrom?: string; dateTo?: string }): Promise<ApiResponse<AttendanceSummary>> => {
    const searchParams = new URLSearchParams({ employeeId: params.employeeId });
    if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
    if (params.dateTo) searchParams.set("dateTo", params.dateTo);
    return request<ApiResponse<AttendanceSummary>>(`/attendance/summary?${searchParams.toString()}`);
  },

  bulkCreate: async (data: { employeeId: string; date: string; status: string; notes?: string }[]): Promise<ApiResponse<{ count: number }>> => {
    return mutate<ApiResponse<{ count: number }>>("/attendance/bulk", {
      method: "POST",
      body: JSON.stringify({ records: data }),
    }, "/attendance");
  },
};

export { getToken, setToken, clearToken };
