import { create } from "zustand";
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
  Machinery,
  InlineMachineryEntry,
} from "@/types/contractor";
import { contractorsApi, timesheetsApi, fuelUsageApi, machineryApi } from "@/services/contractor-api";

interface ContractorStore {
  // Contractor state
  contractors: Contractor[];
  selectedContractorIds: Set<string>;
  filters: ContractorFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  sorting: { sortBy: string; sortOrder: "asc" | "desc" };

  // UI state
  isFormOpen: boolean;
  editingContractor: Contractor | null;
  isLoading: boolean;

  // Dashboard
  dashboardStats: ContractorDashboardStats | null;

  // Profile
  selectedContractor: Contractor | null;

  // Contractor list for dropdowns
  contractorList: Pick<Contractor, "id" | "contractorName" | "fatherName" | "contractorType" | "status">[];

  // Machinery list for dropdowns
  machineryList: Pick<Machinery, "id" | "machineryName" | "machineryType" | "plateNumber" | "status">[];

  // Error state
  error: string | null;

  // Sub-store states for profile tabs
  timesheets: Timesheet[];
  timesheetPagination: { page: number; pageSize: number; total: number; totalPages: number };
  fuelUsages: FuelUsage[];
  fuelUsagePagination: { page: number; pageSize: number; total: number; totalPages: number };

  // Contractor actions
  fetchContractors: () => Promise<void>;
  createContractor: (data: ContractorFormData) => Promise<void>;
  updateContractor: (id: string, data: Partial<ContractorFormData>) => Promise<void>;
  deleteContractor: (id: string) => Promise<void>;
  bulkAction: (action: "delete" | "activate" | "suspend") => Promise<void>;

  // Selection actions
  toggleSelectContractor: (id: string) => void;
  selectAllContractors: () => void;
  clearSelection: () => void;

  // Filter actions
  setFilters: (filters: Partial<ContractorFilters>) => void;
  resetFilters: () => void;

  // Pagination actions
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;

  // Sort actions
  setSorting: (sortBy: string, sortOrder: "asc" | "desc") => void;

  // UI actions
  openForm: (contractor?: Contractor) => void;
  closeForm: () => void;

  // Dashboard
  fetchDashboard: () => Promise<void>;

  // Profile
  fetchContractorProfile: (id: string) => Promise<void>;
  clearSelectedContractor: () => void;

  // Contractor list for dropdowns
  fetchContractorList: () => Promise<void>;

  // Machinery list for dropdowns
  fetchMachineryList: () => Promise<void>;

  // Clear error
  clearError: () => void;

  // Sub-store actions for profile tabs
  fetchTimesheets: (contractorId: string, params?: TimesheetFilters & { page?: number; pageSize?: number }) => Promise<void>;
  fetchFuelUsages: (contractorId: string, params?: FuelUsageFilters & { page?: number; pageSize?: number }) => Promise<void>;
}

const DEFAULT_FILTERS: ContractorFilters = {};
const DEFAULT_PAGINATION = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
const DEFAULT_SORTING = { sortBy: "createdAt", sortOrder: "desc" as const };

export const useContractorStore = create<ContractorStore>((set, get) => ({
  // ─── Contractor state ───────────────────────────────────────────
  contractors: [],
  selectedContractorIds: new Set<string>(),
  filters: { ...DEFAULT_FILTERS },
  pagination: { ...DEFAULT_PAGINATION },
  sorting: { ...DEFAULT_SORTING },

  // ─── UI state ──────────────────────────────────────────────────
  isFormOpen: false,
  editingContractor: null,
  isLoading: false,

  // ─── Dashboard ─────────────────────────────────────────────────
  dashboardStats: null,

  // ─── Profile ───────────────────────────────────────────────────
  selectedContractor: null,

  // ─── Contractor list for dropdowns ──────────────────────────────
  contractorList: [],

  // ─── Machinery list for dropdowns ───────────────────────────────
  machineryList: [],

  // ─── Error state ───────────────────────────────────────────────
  error: null,

  // ─── Sub-store states for profile tabs ─────────────────────────
  timesheets: [],
  timesheetPagination: { ...DEFAULT_PAGINATION },
  fuelUsages: [],
  fuelUsagePagination: { ...DEFAULT_PAGINATION },

  // ─── Contractor actions ────────────────────────────────────────

  fetchContractors: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters, pagination, sorting } = get();
      const response = await contractorsApi.getAll({
        ...filters,
        page: pagination.page,
        pageSize: pagination.pageSize,
        sortBy: sorting.sortBy,
        sortOrder: sorting.sortOrder,
      });
      if (response.data) {
        set({
          contractors: response.data.data,
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
      const message = err instanceof Error ? err.message : "Failed to fetch contractors";
      set({ isLoading: false, error: message });
    }
  },

  createContractor: async (data: ContractorFormData) => {
    set({ isLoading: true, error: null });
    try {
      await contractorsApi.create(data);
      set({ isLoading: false, isFormOpen: false, editingContractor: null });
      await get().fetchContractors();
      await get().fetchContractorList(); // Refresh dropdown list
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create contractor";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  updateContractor: async (id: string, data: Partial<ContractorFormData>) => {
    set({ isLoading: true, error: null });
    try {
      await contractorsApi.update(id, data);
      set({ isLoading: false, isFormOpen: false, editingContractor: null });
      await get().fetchContractors();
      await get().fetchContractorList(); // Refresh dropdown list
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update contractor";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  deleteContractor: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await contractorsApi.delete(id);
      const newSelected = new Set(get().selectedContractorIds);
      newSelected.delete(id);
      set({ isLoading: false, selectedContractorIds: newSelected });
      await get().fetchContractors();
      await get().fetchContractorList();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete contractor";
      set({ isLoading: false, error: message });
    }
  },

  bulkAction: async (action: "delete" | "activate" | "suspend") => {
    const { selectedContractorIds } = get();
    if (selectedContractorIds.size === 0) return;

    set({ isLoading: true, error: null });
    try {
      await contractorsApi.bulkAction(Array.from(selectedContractorIds), action);
      set({ isLoading: false, selectedContractorIds: new Set<string>() });
      await get().fetchContractors();
      await get().fetchContractorList();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to perform bulk action";
      set({ isLoading: false, error: message });
    }
  },

  // ─── Selection actions ─────────────────────────────────────────

  toggleSelectContractor: (id: string) => {
    const newSelected = new Set(get().selectedContractorIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    set({ selectedContractorIds: newSelected });
  },

  selectAllContractors: () => {
    const allIds = get().contractors.map((c) => c.id);
    set({ selectedContractorIds: new Set(allIds) });
  },

  clearSelection: () => {
    set({ selectedContractorIds: new Set<string>() });
  },

  // ─── Filter actions ────────────────────────────────────────────

  setFilters: (filters: Partial<ContractorFilters>) => {
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

  openForm: (contractor?: Contractor) => {
    set({ isFormOpen: true, editingContractor: contractor ?? null });
  },

  closeForm: () => {
    set({ isFormOpen: false, editingContractor: null });
  },

  // ─── Dashboard ─────────────────────────────────────────────────

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await contractorsApi.getDashboard();
      if (response.data) {
        set({ dashboardStats: response.data, isLoading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch contractor dashboard";
      set({ isLoading: false, error: message });
    }
  },

  // ─── Profile ───────────────────────────────────────────────────

  fetchContractorProfile: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await contractorsApi.getById(id);
      if (response.data) {
        set({ selectedContractor: response.data, isLoading: false });
      }
      // Also fetch timesheets and fuel usages for this contractor
      await get().fetchTimesheets(id);
      await get().fetchFuelUsages(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch contractor profile";
      set({ isLoading: false, error: message });
    }
  },

  clearSelectedContractor: () => {
    set({
      selectedContractor: null,
      timesheets: [],
      timesheetPagination: { ...DEFAULT_PAGINATION },
      fuelUsages: [],
      fuelUsagePagination: { ...DEFAULT_PAGINATION },
    });
  },

  // ─── Contractor list for dropdowns ─────────────────────────────

  fetchContractorList: async () => {
    try {
      const response = await contractorsApi.getList("ACTIVE");
      if (response.data) {
        set({ contractorList: response.data });
      }
    } catch {
      // Silently fail for dropdown list
    }
  },

  // ─── Machinery list for dropdowns ──────────────────────────────

  fetchMachineryList: async () => {
    try {
      const response = await machineryApi.getList("OPERATIONAL");
      if (response.data) {
        set({ machineryList: response.data });
      }
    } catch {
      // Silently fail for dropdown list
    }
  },

  // ─── Clear error ───────────────────────────────────────────────

  clearError: () => {
    set({ error: null });
  },

  // ─── Sub-store actions for profile tabs ────────────────────────

  fetchTimesheets: async (contractorId: string, params?: TimesheetFilters & { page?: number; pageSize?: number }) => {
    try {
      const response = await timesheetsApi.getAll({
        contractorId,
        ...params,
      });
      if (response.data) {
        set({
          timesheets: response.data.data,
          timesheetPagination: {
            page: response.data.page,
            pageSize: response.data.pageSize,
            total: response.data.total,
            totalPages: response.data.totalPages,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch timesheets";
      set({ error: message });
    }
  },

  fetchFuelUsages: async (contractorId: string, params?: FuelUsageFilters & { page?: number; pageSize?: number }) => {
    try {
      const response = await fuelUsageApi.getAll({
        contractorId,
        ...params,
      });
      if (response.data) {
        set({
          fuelUsages: response.data.data,
          fuelUsagePagination: {
            page: response.data.page,
            pageSize: response.data.pageSize,
            total: response.data.total,
            totalPages: response.data.totalPages,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch fuel usages";
      set({ error: message });
    }
  },
}));
