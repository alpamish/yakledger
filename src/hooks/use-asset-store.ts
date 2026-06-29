import { create } from "zustand";
import type {
  Asset,
  AssetFormData,
  AssetFilters,
  FuelTransaction,
  FuelTransactionFormData,
  FuelStock,
  FuelContainerStock,
  MaintenanceRecord,
  MaintenanceRecordFormData,
  AssetLog,
  AssetLogFormData,
  AssetLogStats,
  AssetDashboardStats,
} from "@/types/asset";
import { assetsApi, fuelApi, maintenanceApi, assetLogApi } from "@/services/asset-api";

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface AssetStore {
  // Asset state
  assets: Asset[];
  assetFilters: AssetFilters;
  assetPagination: PaginationState;
  assetSorting: { sortBy: string; sortOrder: "asc" | "desc" };

  // Fuel state
  fuelTransactions: FuelTransaction[];
  fuelStock: FuelStock[];
  fuelContainerStock: FuelContainerStock[];
  fuelPagination: PaginationState;
  fuelSorting: { sortBy: string; sortOrder: 'asc' | 'desc' };
  fuelFilters: { type?: string; fuelType?: string; assetId?: string; containerId?: string; contractorId?: string; dateFrom?: string; dateTo?: string; search?: string };

  // Maintenance state
  maintenanceRecords: MaintenanceRecord[];
  maintenancePagination: PaginationState;
  maintenanceFilters: { assetId?: string; upcoming?: boolean };

  // Asset logs state
  assetLogs: AssetLog[];
  assetLogPagination: PaginationState;
  assetLogFilters: { assetId?: string; operatorId?: string; status?: string; dateFrom?: string; dateTo?: string };
  logStats: AssetLogStats | null;
  editingLog: AssetLog | null;

  // Dashboard state
  dashboardStats: AssetDashboardStats | null;

  // UI state
  activeView: "list" | "create" | "edit" | "detail";
  editingAsset: Asset | null;
  viewingAssetId: string | null;
  activeTab: "overview" | "maintenance" | "logs" | "fuel";
  isLoading: boolean;
  error: string | null;

  // Asset actions
  fetchAssets: () => Promise<void>;
  createAsset: (data: AssetFormData) => Promise<void>;
  updateAsset: (id: string, data: Partial<AssetFormData>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  getAsset: (id: string) => Promise<Asset | null>;

  // Fuel actions
  fetchFuelTransactions: () => Promise<void>;
  fetchFuelStock: () => Promise<void>;
  createFuelTransaction: (data: FuelTransactionFormData) => Promise<void>;
  deleteFuelTransaction: (id: string) => Promise<void>;

  // Maintenance actions
  fetchMaintenanceRecords: () => Promise<void>;
  createMaintenanceRecord: (data: MaintenanceRecordFormData) => Promise<void>;
  deleteMaintenanceRecord: (id: string) => Promise<void>;

  // Asset log actions
  fetchAssetLogs: () => Promise<void>;
  createAssetLog: (data: AssetLogFormData) => Promise<void>;
  updateAssetLog: (id: string, data: Partial<AssetLogFormData>) => Promise<void>;
  deleteAssetLog: (id: string) => Promise<void>;
  approveAssetLog: (id: string, status: "APPROVED" | "REJECTED") => Promise<void>;
  fetchLogStats: () => Promise<void>;

  // Dashboard
  fetchDashboard: () => Promise<void>;

  // Filter/pagination actions
  setAssetFilters: (filters: Partial<AssetFilters>) => void;
  resetAssetFilters: () => void;
  setAssetPage: (page: number) => void;
  setAssetSorting: (sortBy: string, sortOrder: "asc" | "desc") => void;

  setFuelFilters: (filters: { type?: string; fuelType?: string; assetId?: string; containerId?: string; contractorId?: string; dateFrom?: string; dateTo?: string; search?: string }) => void;
  setFuelSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  setFuelPage: (page: number) => void;
  setFuelPageSize: (pageSize: number) => void;

  setMaintenanceFilters: (filters: { assetId?: string; upcoming?: boolean }) => void;
  setMaintenancePage: (page: number) => void;

  setAssetLogFilters: (filters: { assetId?: string; operatorId?: string; status?: string; dateFrom?: string; dateTo?: string }) => void;
  setAssetLogPage: (page: number) => void;
  setEditingLog: (log: AssetLog | null) => void;

  // Navigation
  setActiveView: (view: "list" | "create" | "edit" | "detail") => void;
  setEditingAsset: (asset: Asset | null) => void;
  setViewingAssetId: (id: string | null) => void;
  setActiveTab: (tab: "overview" | "maintenance" | "logs" | "fuel") => void;

  // Error
  clearError: () => void;
}

const DEFAULT_ASSET_PAGINATION = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
const DEFAULT_ASSET_SORTING = { sortBy: "createdAt", sortOrder: "desc" as const };

export const useAssetStore = create<AssetStore>((set, get) => ({
  // ─── Asset state ─────────────────────────────────────────────
  assets: [],
  assetFilters: {},
  assetPagination: { ...DEFAULT_ASSET_PAGINATION },
  assetSorting: { ...DEFAULT_ASSET_SORTING },

  // ─── Fuel state ──────────────────────────────────────────────
  fuelTransactions: [],
  fuelStock: [],
  fuelContainerStock: [],
  fuelPagination: { ...DEFAULT_ASSET_PAGINATION },
  fuelSorting: { sortBy: 'date', sortOrder: 'desc' },
  fuelFilters: { search: '' },

  // ─── Maintenance state ───────────────────────────────────────
  maintenanceRecords: [],
  maintenancePagination: { ...DEFAULT_ASSET_PAGINATION },
  maintenanceFilters: {},

  // ─── Asset logs state ────────────────────────────────────────
  assetLogs: [],
  assetLogPagination: { ...DEFAULT_ASSET_PAGINATION },
  assetLogFilters: {},
  logStats: null,
  editingLog: null,

  // ─── Dashboard ───────────────────────────────────────────────
  dashboardStats: null,

  // ─── UI state ────────────────────────────────────────────────
  activeView: "list",
  editingAsset: null,
  viewingAssetId: null,
  activeTab: "overview",
  isLoading: false,
  error: null,

  // ─── Asset actions ───────────────────────────────────────────

  fetchAssets: async () => {
    set({ isLoading: true, error: null });
    try {
      const { assetFilters, assetPagination, assetSorting } = get();
      const response = await assetsApi.getAll({
        ...assetFilters,
        page: assetPagination.page,
        pageSize: assetPagination.pageSize,
        sortBy: assetSorting.sortBy,
        sortOrder: assetSorting.sortOrder,
      });
      if (response.data) {
        set({
          assets: response.data.data,
          assetPagination: {
            page: response.data.page,
            pageSize: response.data.pageSize,
            total: response.data.total,
            totalPages: response.data.totalPages,
          },
          isLoading: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch assets";
      set({ isLoading: false, error: message });
    }
  },

  createAsset: async (data: AssetFormData) => {
    set({ isLoading: true, error: null });
    try {
      await assetsApi.create(data);
      set({ isLoading: false, activeView: "list" });
      await get().fetchAssets();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create asset";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  updateAsset: async (id: string, data: Partial<AssetFormData>) => {
    set({ isLoading: true, error: null });
    try {
      await assetsApi.update(id, data);
      set({ isLoading: false, activeView: "list" });
      await get().fetchAssets();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update asset";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  deleteAsset: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await assetsApi.delete(id);
      set({ isLoading: false });
      await get().fetchAssets();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete asset";
      set({ isLoading: false, error: message });
    }
  },

  getAsset: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await assetsApi.getById(id);
      if (response.data) {
        set({ isLoading: false });
        return response.data;
      }
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch asset";
      set({ isLoading: false, error: message });
      return null;
    }
  },

  // ─── Fuel actions ────────────────────────────────────────────

  fetchFuelTransactions: async () => {
    set({ isLoading: true, error: null });
    try {
      const { fuelFilters, fuelPagination, fuelSorting } = get();
      const { search, ...restFilters } = fuelFilters;
      const response = await fuelApi.getAll({
        ...restFilters,
        search: search || undefined,
        page: fuelPagination.page,
        pageSize: fuelPagination.pageSize,
        sortBy: fuelSorting.sortBy,
        sortOrder: fuelSorting.sortOrder,
      });
      if (response.data) {
        set({
          fuelTransactions: response.data.data,
          fuelPagination: {
            page: response.data.page,
            pageSize: response.data.pageSize,
            total: response.data.total,
            totalPages: response.data.totalPages,
          },
          isLoading: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch fuel transactions";
      set({ isLoading: false, error: message });
    }
  },

  fetchFuelStock: async () => {
    try {
      const response = await fuelApi.getStock();
      if (response.data) {
        set({ fuelStock: response.data.stock, fuelContainerStock: response.data.containerStock });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch fuel stock";
      set({ error: message });
    }
  },

  createFuelTransaction: async (data: FuelTransactionFormData) => {
    set({ isLoading: true, error: null });
    try {
      await fuelApi.create(data);
      set({ isLoading: false });
      await Promise.all([get().fetchFuelTransactions(), get().fetchFuelStock()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create fuel transaction";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  deleteFuelTransaction: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await fuelApi.delete(id);
      set({ isLoading: false });
      await Promise.all([get().fetchFuelTransactions(), get().fetchFuelStock()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete fuel transaction";
      set({ isLoading: false, error: message });
    }
  },

  // ─── Maintenance actions ─────────────────────────────────────

  fetchMaintenanceRecords: async () => {
    set({ isLoading: true, error: null });
    try {
      const { maintenanceFilters, maintenancePagination } = get();
      const response = await maintenanceApi.getAll({
        ...maintenanceFilters,
        page: maintenancePagination.page,
        pageSize: maintenancePagination.pageSize,
      });
      if (response.data) {
        set({
          maintenanceRecords: response.data.data,
          maintenancePagination: {
            page: response.data.page,
            pageSize: response.data.pageSize,
            total: response.data.total,
            totalPages: response.data.totalPages,
          },
          isLoading: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch maintenance records";
      set({ isLoading: false, error: message });
    }
  },

  createMaintenanceRecord: async (data: MaintenanceRecordFormData) => {
    set({ isLoading: true, error: null });
    try {
      await maintenanceApi.create(data);
      set({ isLoading: false });
      await get().fetchMaintenanceRecords();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create maintenance record";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  deleteMaintenanceRecord: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await maintenanceApi.delete(id);
      set({ isLoading: false });
      await get().fetchMaintenanceRecords();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete maintenance record";
      set({ isLoading: false, error: message });
    }
  },

  // ─── Asset log actions ───────────────────────────────────────

  fetchAssetLogs: async () => {
    set({ isLoading: true, error: null });
    try {
      const { assetLogFilters, assetLogPagination } = get();
      const response = await assetLogApi.getAll({
        ...assetLogFilters,
        page: assetLogPagination.page,
        pageSize: assetLogPagination.pageSize,
      });
      if (response.data) {
        set({
          assetLogs: response.data.data,
          assetLogPagination: {
            page: response.data.page,
            pageSize: response.data.pageSize,
            total: response.data.total,
            totalPages: response.data.totalPages,
          },
          isLoading: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch asset logs";
      set({ isLoading: false, error: message });
    }
  },

  createAssetLog: async (data: AssetLogFormData) => {
    set({ isLoading: true, error: null });
    try {
      await assetLogApi.create(data);
      set({ isLoading: false });
      await get().fetchAssetLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create asset log";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  updateAssetLog: async (id: string, data: Partial<AssetLogFormData>) => {
    set({ isLoading: true, error: null });
    try {
      await assetLogApi.update(id, data);
      set({ isLoading: false });
      await get().fetchAssetLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update asset log";
      set({ isLoading: false, error: message });
    }
  },

  deleteAssetLog: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await assetLogApi.delete(id);
      set({ isLoading: false });
      await get().fetchAssetLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete asset log";
      set({ isLoading: false, error: message });
    }
  },

  approveAssetLog: async (id: string, status: "APPROVED" | "REJECTED") => {
    set({ isLoading: true, error: null });
    try {
      await assetLogApi.approve(id, status);
      set({ isLoading: false });
      await get().fetchAssetLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update log status";
      set({ isLoading: false, error: message });
    }
  },

  fetchLogStats: async () => {
    try {
      const response = await assetLogApi.getStats();
      if (response.data) {
        set({ logStats: response.data });
      }
    } catch {
      // Stats are non-critical; UI shows "-" when logStats is null
    }
  },

  // ─── Dashboard ───────────────────────────────────────────────

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await assetsApi.getDashboard();
      if (response.data) {
        set({ dashboardStats: response.data, isLoading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch dashboard";
      set({ isLoading: false, error: message });
    }
  },

  // ─── Filter/pagination actions ───────────────────────────────

  setAssetFilters: (filters: Partial<AssetFilters>) => {
    set({ assetFilters: { ...get().assetFilters, ...filters }, assetPagination: { ...get().assetPagination, page: 1 } });
  },

  resetAssetFilters: () => {
    set({ assetFilters: {}, assetPagination: { ...DEFAULT_ASSET_PAGINATION } });
  },

  setAssetPage: (page: number) => {
    set({ assetPagination: { ...get().assetPagination, page } });
  },

  setAssetSorting: (sortBy: string, sortOrder: "asc" | "desc") => {
    set({ assetSorting: { sortBy, sortOrder }, assetPagination: { ...get().assetPagination, page: 1 } });
  },

  setFuelFilters: (filters) => {
    set({ fuelFilters: { ...get().fuelFilters, ...filters }, fuelPagination: { ...get().fuelPagination, page: 1 } });
  },

  setFuelSorting: (sortBy, sortOrder) => {
    set({ fuelSorting: { sortBy, sortOrder }, fuelPagination: { ...get().fuelPagination, page: 1 } });
  },

  setFuelPage: (page: number) => {
    set({ fuelPagination: { ...get().fuelPagination, page } });
  },

  setFuelPageSize: (pageSize: number) => {
    set({ fuelPagination: { ...get().fuelPagination, page: 1, pageSize } });
  },

  setMaintenanceFilters: (filters) => {
    set({ maintenanceFilters: { ...get().maintenanceFilters, ...filters }, maintenancePagination: { ...get().maintenancePagination, page: 1 } });
  },

  setMaintenancePage: (page: number) => {
    set({ maintenancePagination: { ...get().maintenancePagination, page } });
  },

  setAssetLogFilters: (filters) => {
    set({ assetLogFilters: { ...get().assetLogFilters, ...filters }, assetLogPagination: { ...get().assetLogPagination, page: 1 } });
  },

  setAssetLogPage: (page: number) => {
    set({ assetLogPagination: { ...get().assetLogPagination, page } });
  },

  // ─── Navigation ──────────────────────────────────────────────

  setActiveView: (view) => {
    set({ activeView: view, editingAsset: view === "create" ? null : get().editingAsset });
  },

  setEditingAsset: (asset) => {
    set({ editingAsset: asset });
  },

  setViewingAssetId: (id) => {
    set({ viewingAssetId: id });
  },

  setEditingLog: (log) => {
    set({ editingLog: log });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  // ─── Clear error ─────────────────────────────────────────────

  clearError: () => {
    set({ error: null });
  },
}));
