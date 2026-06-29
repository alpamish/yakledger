import { create } from "zustand";
import type {
  Employee,
  EmployeeFormData,
  EmployeeFilters,
  EmployeeDashboardStats,
} from "@/types/employee";
import { employeesApi } from "@/services/employee-api";

interface EmployeeStore {
  // Employee state
  employees: Employee[];
  selectedEmployeeIds: Set<string>;
  filters: EmployeeFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  sorting: { sortBy: string; sortOrder: "asc" | "desc" };

  // UI state
  isFormOpen: boolean;
  editingEmployee: Employee | null;
  isLoading: boolean;

  // Dashboard
  dashboardStats: EmployeeDashboardStats | null;

  // Profile
  selectedEmployee: Employee | null;

  // Employee list for dropdowns
  employeeList: Pick<Employee, "id" | "fullName" | "jobTitle" | "department">[];

  // Error state
  error: string | null;

  // Employee actions
  fetchEmployees: () => Promise<void>;
  createEmployee: (data: EmployeeFormData) => Promise<void>;
  updateEmployee: (id: string, data: Partial<EmployeeFormData>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  bulkAction: (action: "delete" | "activate" | "deactivate") => Promise<void>;

  // Selection actions
  toggleSelectEmployee: (id: string) => void;
  selectAllEmployees: () => void;
  clearSelection: () => void;

  // Filter actions
  setFilters: (filters: Partial<EmployeeFilters>) => void;
  resetFilters: () => void;

  // Pagination actions
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;

  // Sort actions
  setSorting: (sortBy: string, sortOrder: "asc" | "desc") => void;

  // UI actions
  openForm: (employee?: Employee) => void;
  closeForm: () => void;

  // Dashboard
  fetchDashboard: () => Promise<void>;

  // Profile
  fetchEmployeeProfile: (id: string) => Promise<void>;
  clearSelectedEmployee: () => void;

  // Employee list for dropdowns
  fetchEmployeeList: () => Promise<void>;

  // Clear error
  clearError: () => void;
}

const DEFAULT_FILTERS: EmployeeFilters = {};
const DEFAULT_PAGINATION = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
const DEFAULT_SORTING = { sortBy: "createdAt", sortOrder: "desc" as const };

export const useEmployeeStore = create<EmployeeStore>((set, get) => ({
  // ─── Employee state ────────────────────────────────────────────
  employees: [],
  selectedEmployeeIds: new Set<string>(),
  filters: { ...DEFAULT_FILTERS },
  pagination: { ...DEFAULT_PAGINATION },
  sorting: { ...DEFAULT_SORTING },

  // ─── UI state ──────────────────────────────────────────────────
  isFormOpen: false,
  editingEmployee: null,
  isLoading: false,

  // ─── Dashboard ─────────────────────────────────────────────────
  dashboardStats: null,

  // ─── Profile ───────────────────────────────────────────────────
  selectedEmployee: null,

  // ─── Employee list for dropdowns ────────────────────────────────
  employeeList: [],

  // ─── Error state ───────────────────────────────────────────────
  error: null,

  // ─── Employee actions ──────────────────────────────────────────

  fetchEmployees: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters, pagination, sorting } = get();
      const response = await employeesApi.getAll({
        ...filters,
        page: pagination.page,
        pageSize: pagination.pageSize,
        sortBy: sorting.sortBy,
        sortOrder: sorting.sortOrder,
      });
      if (response.data) {
        set({
          employees: response.data.data,
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
      const message = err instanceof Error ? err.message : "Failed to fetch employees";
      set({ isLoading: false, error: message });
    }
  },

  createEmployee: async (data: EmployeeFormData) => {
    set({ isLoading: true, error: null });
    try {
      await employeesApi.create(data);
      set({ isLoading: false, isFormOpen: false, editingEmployee: null });
      await get().fetchEmployees();
      await get().fetchEmployeeList(); // Refresh dropdown list
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create employee";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  updateEmployee: async (id: string, data: Partial<EmployeeFormData>) => {
    set({ isLoading: true, error: null });
    try {
      await employeesApi.update(id, data);
      set({ isLoading: false, isFormOpen: false, editingEmployee: null });
      await get().fetchEmployees();
      await get().fetchEmployeeList();
      // Refresh selected employee profile if it matches the updated employee
      const selected = get().selectedEmployee;
      if (selected?.id === id) {
        await get().fetchEmployeeProfile(id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update employee";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  deleteEmployee: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await employeesApi.delete(id);
      const newSelected = new Set(get().selectedEmployeeIds);
      newSelected.delete(id);
      set({ isLoading: false, selectedEmployeeIds: newSelected });
      await get().fetchEmployees();
      await get().fetchEmployeeList();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete employee";
      set({ isLoading: false, error: message });
    }
  },

  bulkAction: async (action: "delete" | "activate" | "deactivate") => {
    const { selectedEmployeeIds } = get();
    if (selectedEmployeeIds.size === 0) return;

    set({ isLoading: true, error: null });
    try {
      await employeesApi.bulkAction(Array.from(selectedEmployeeIds), action);
      set({ isLoading: false, selectedEmployeeIds: new Set<string>() });
      await get().fetchEmployees();
      await get().fetchEmployeeList();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to perform bulk action";
      set({ isLoading: false, error: message });
    }
  },

  // ─── Selection actions ─────────────────────────────────────────

  toggleSelectEmployee: (id: string) => {
    const newSelected = new Set(get().selectedEmployeeIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    set({ selectedEmployeeIds: newSelected });
  },

  selectAllEmployees: () => {
    const allIds = get().employees.map((e) => e.id);
    set({ selectedEmployeeIds: new Set(allIds) });
  },

  clearSelection: () => {
    set({ selectedEmployeeIds: new Set<string>() });
  },

  // ─── Filter actions ────────────────────────────────────────────

  setFilters: (filters: Partial<EmployeeFilters>) => {
    set({
      filters: { ...get().filters, ...filters },
      pagination: { ...get().pagination, page: 1 },
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
      pagination: { ...get().pagination, page: 1 },
    });
  },

  // ─── UI actions ────────────────────────────────────────────────

  openForm: (employee?: Employee) => {
    set({ isFormOpen: true, editingEmployee: employee ?? null });
  },

  closeForm: () => {
    set({ isFormOpen: false, editingEmployee: null });
  },

  // ─── Dashboard ─────────────────────────────────────────────────

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await employeesApi.getDashboard();
      if (response.data) {
        set({ dashboardStats: response.data, isLoading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch employee dashboard";
      set({ isLoading: false, error: message });
    }
  },

  // ─── Profile ───────────────────────────────────────────────────

  fetchEmployeeProfile: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await employeesApi.getById(id);
      if (response.data) {
        set({ selectedEmployee: response.data, isLoading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch employee profile";
      set({ isLoading: false, error: message });
    }
  },

  clearSelectedEmployee: () => {
    set({ selectedEmployee: null });
  },

  // ─── Employee list for dropdowns ────────────────────────────────

  fetchEmployeeList: async () => {
    try {
      const response = await employeesApi.getList("ACTIVE");
      if (response.data) {
        set({ employeeList: response.data });
      }
    } catch {
      // Silently fail for dropdown list
    }
  },

  // ─── Clear error ───────────────────────────────────────────────

  clearError: () => {
    set({ error: null });
  },
}));
