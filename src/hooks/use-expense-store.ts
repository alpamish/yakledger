import { create } from "zustand";
import type {
  DashboardStats,
  Expense,
  ExpenseFilters,
  ExpenseFormData,
  User,
  PermissionsMap,
} from "@/types/expense";
import { authApi, expensesApi, getToken, setToken, clearToken } from "@/services/api";

interface ExpenseStore {
  // Auth state
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  userPermissions: PermissionsMap;

  // Expense state
  expenses: Expense[];
  selectedExpenseIds: Set<string>;
  filters: ExpenseFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  sorting: { sortBy: string; sortOrder: "asc" | "desc" };

  // UI state
  isFormOpen: boolean;
  editingExpense: Expense | null;
  isLoading: boolean;

  // Dashboard
  dashboardStats: DashboardStats | null;

  // Error state
  error: string | null;

  // Auth actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  fetchPermissions: () => Promise<void>;

  // Expense actions
  fetchExpenses: () => Promise<void>;
  createExpense: (data: ExpenseFormData) => Promise<void>;
  updateExpense: (id: string, data: Partial<ExpenseFormData>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  bulkDeleteExpenses: () => Promise<void>;

  // Selection actions
  toggleSelectExpense: (id: string) => void;
  selectAllExpenses: (ids?: string[]) => void;
  clearSelection: () => void;
  clearStaleSelections: (validIds: Set<string>) => void;

  // Filter actions
  setFilters: (filters: Partial<ExpenseFilters>) => void;
  resetFilters: () => void;

  // Pagination actions
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;

  // Sort actions
  setSorting: (sortBy: string, sortOrder: "asc" | "desc") => void;

  // UI actions
  openForm: (expense?: Expense) => void;
  closeForm: () => void;

  // Dashboard
  fetchDashboard: () => Promise<void>;

  // Clear error
  clearError: () => void;
}

const DEFAULT_FILTERS: ExpenseFilters = {};
const DEFAULT_PAGINATION = { page: 1, pageSize: 50, total: 0, totalPages: 0 };
const DEFAULT_SORTING = { sortBy: "createdAt", sortOrder: "desc" as const };

export const useExpenseStore = create<ExpenseStore>((set, get) => ({
  // ─── Auth state ────────────────────────────────────────────────
  user: null,
  token: typeof window !== "undefined" ? getToken() : null,
  isAuthenticated: false,
  isLoadingAuth: true,
  userPermissions: {},

  // ─── Expense state ─────────────────────────────────────────────
  expenses: [],
  selectedExpenseIds: new Set<string>(),
  filters: { ...DEFAULT_FILTERS },
  pagination: { ...DEFAULT_PAGINATION },
  sorting: { ...DEFAULT_SORTING },

  // ─── UI state ──────────────────────────────────────────────────
  isFormOpen: false,
  editingExpense: null,
  isLoading: false,

  // ─── Dashboard ─────────────────────────────────────────────────
  dashboardStats: null,

  // ─── Error state ───────────────────────────────────────────────
  error: null,

  // ─── Auth actions ──────────────────────────────────────────────

  login: async (email: string, password: string) => {
    set({ isLoadingAuth: true, error: null });
    try {
      const response = await authApi.login({ email, password });
      if (response.data) {
        setToken(response.data.token);
        set({
          user: response.data.user,
          token: response.data.token,
          isAuthenticated: true,
          isLoadingAuth: false,
        });
        get().fetchPermissions();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      set({ isLoadingAuth: false, error: message });
      throw err;
    }
  },

  register: async (email: string, name: string, password: string) => {
    set({ isLoadingAuth: true, error: null });
    try {
      const response = await authApi.register({ email, name, password });
      if (response.data) {
        setToken(response.data.token);
        set({
          user: response.data.user,
          token: response.data.token,
          isAuthenticated: true,
          isLoadingAuth: false,
        });
        get().fetchPermissions();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      set({ isLoadingAuth: false, error: message });
      throw err;
    }
  },

  logout: () => {
    clearToken();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoadingAuth: false,
      userPermissions: {},
      expenses: [],
      selectedExpenseIds: new Set<string>(),
      filters: { ...DEFAULT_FILTERS },
      pagination: { ...DEFAULT_PAGINATION },
      sorting: { ...DEFAULT_SORTING },
      isFormOpen: false,
      editingExpense: null,
      isLoading: false,
      dashboardStats: null,
      error: null,
    });
    // Fire-and-forget API logout
    authApi.logout().catch(() => {});
  },

  checkAuth: async () => {
    const currentToken = getToken();
    if (!currentToken) {
      set({ isAuthenticated: false, isLoadingAuth: false, user: null, token: null });
      return;
    }
    set({ isLoadingAuth: true });
    try {
      const response = await authApi.me();
      if (response.data) {
        set({
          user: response.data,
          token: currentToken,
          isAuthenticated: true,
          isLoadingAuth: false,
        });
        get().fetchPermissions();
      } else {
        clearToken();
        set({ isAuthenticated: false, isLoadingAuth: false, user: null, token: null });
      }
    } catch {
      clearToken();
      set({ isAuthenticated: false, isLoadingAuth: false, user: null, token: null });
    }
  },

  fetchPermissions: async () => {
    try {
      const response = await fetch("/api/auth/permissions", {
        headers: { Authorization: `Bearer ${get().token}` },
      });
      if (response.ok) {
        const body = await response.json();
        if (body.data) {
          set({ userPermissions: body.data });
        }
      }
    } catch {
      // silently fail
    }
  },

  // ─── Expense actions ───────────────────────────────────────────

  fetchExpenses: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters, pagination, sorting } = get();
      const response = await expensesApi.getAll({
        ...filters,
        page: pagination.page,
        pageSize: pagination.pageSize,
        sortBy: sorting.sortBy,
        sortOrder: sorting.sortOrder,
      });
      if (response.data) {
        set({
          expenses: response.data.data,
          pagination: {
            page: response.data.page,
            pageSize: response.data.pageSize,
            total: response.data.total,
            totalPages: response.data.totalPages,
          },
          isLoading: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch expenses";
      set({ isLoading: false, error: message });
    }
  },

  createExpense: async (data: ExpenseFormData) => {
    set({ isLoading: true, error: null });
    try {
      await expensesApi.create(data);
      set({ isLoading: false, isFormOpen: false, editingExpense: null });
      await get().fetchExpenses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create expense";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  updateExpense: async (id: string, data: Partial<ExpenseFormData>) => {
    set({ isLoading: true, error: null });
    try {
      await expensesApi.update(id, data);
      set({ isLoading: false, isFormOpen: false, editingExpense: null });
      await get().fetchExpenses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update expense";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  deleteExpense: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await expensesApi.delete(id);
      // Remove from selection if selected
      const newSelected = new Set(get().selectedExpenseIds);
      newSelected.delete(id);
      set({ isLoading: false, selectedExpenseIds: newSelected });
      await get().fetchExpenses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete expense";
      set({ isLoading: false, error: message });
    }
  },

  bulkDeleteExpenses: async () => {
    const { selectedExpenseIds } = get();
    if (selectedExpenseIds.size === 0) return;

    set({ isLoading: true, error: null });
    try {
      await expensesApi.bulkDelete(Array.from(selectedExpenseIds));
      set({ isLoading: false, selectedExpenseIds: new Set<string>() });
      await get().fetchExpenses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete expenses";
      set({ isLoading: false, error: message });
    }
  },

  // ─── Selection actions ─────────────────────────────────────────

  toggleSelectExpense: (id: string) => {
    const newSelected = new Set(get().selectedExpenseIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    set({ selectedExpenseIds: newSelected });
  },

  selectAllExpenses: (ids?: string[]) => {
    const allIds = ids ?? get().expenses.map((e) => e.id);
    set({ selectedExpenseIds: new Set(allIds) });
  },

  clearSelection: () => {
    set({ selectedExpenseIds: new Set<string>() });
  },

  clearStaleSelections: (validIds: Set<string>) => {
    const current = get().selectedExpenseIds;
    const pruned = new Set([...current].filter((id) => validIds.has(id)));
    if (pruned.size !== current.size) {
      set({ selectedExpenseIds: pruned });
    }
  },

  // ─── Filter actions ────────────────────────────────────────────

  setFilters: (filters: Partial<ExpenseFilters>) => {
    set({
      filters: { ...get().filters, ...filters },
      pagination: { ...get().pagination, page: 1 }, // Reset to page 1 on filter change
    });
  },

  resetFilters: () => {
    set({
      filters: { ...DEFAULT_FILTERS },
      pagination: { ...DEFAULT_PAGINATION },
    });
  },

  // ─── Pagination actions ────────────────────────────────────────

  setPage: (page: number) => {
    set({ pagination: { ...get().pagination, page } });
  },

  setPageSize: (pageSize: number) => {
    set({ pagination: { ...get().pagination, pageSize, page: 1 } });
  },

  // ─── Sort actions ──────────────────────────────────────────────

  setSorting: (sortBy: string, sortOrder: "asc" | "desc") => {
    set({
      sorting: { sortBy, sortOrder },
      pagination: { ...get().pagination, page: 1 }, // Reset to page 1 on sort change
    });
  },

  // ─── UI actions ────────────────────────────────────────────────

  openForm: (expense?: Expense) => {
    set({ isFormOpen: true, editingExpense: expense ?? null });
  },

  closeForm: () => {
    set({ isFormOpen: false, editingExpense: null });
  },

  // ─── Dashboard ─────────────────────────────────────────────────

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await expensesApi.getDashboard();
      if (response.data) {
        set({ dashboardStats: response.data, isLoading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch dashboard";
      set({ isLoading: false, error: message });
    }
  },

  // ─── Clear error ───────────────────────────────────────────────

  clearError: () => {
    set({ error: null });
  },
}));
