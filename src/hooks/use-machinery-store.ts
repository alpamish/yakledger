'use client';

import { create } from 'zustand';
import type {
  Machinery,
  MachineryFormData,
  MachineryFilters,
  MachineryStatus,
} from '@/types/contractor';
import { machineryApi } from '@/services/contractor-api';

interface MachineryStore {
  machinery: Machinery[];
  selectedIds: Set<string>;
  filters: MachineryFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  sorting: { sortBy: string; sortOrder: 'asc' | 'desc' };

  isFormOpen: boolean;
  editingMachinery: Machinery | null;
  isLoading: boolean;
  error: string | null;

  fetchMachinery: () => Promise<void>;
  createMachinery: (data: MachineryFormData) => Promise<void>;
  updateMachinery: (id: string, data: Partial<MachineryFormData>) => Promise<void>;
  deleteMachinery: (id: string) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkUpdateStatus: (ids: string[], status: MachineryStatus) => Promise<void>;

  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  setFilters: (filters: Partial<MachineryFilters>) => void;
  resetFilters: () => void;

  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => void;

  openForm: (machinery?: Machinery) => void;
  closeForm: () => void;
  clearError: () => void;
}

const DEFAULT_FILTERS: MachineryFilters = {};
const DEFAULT_PAGINATION = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
const DEFAULT_SORTING = { sortBy: 'createdAt', sortOrder: 'desc' as const };

export const useMachineryStore = create<MachineryStore>((set, get) => ({
  machinery: [],
  selectedIds: new Set<string>(),
  filters: { ...DEFAULT_FILTERS },
  pagination: { ...DEFAULT_PAGINATION },
  sorting: { ...DEFAULT_SORTING },

  isFormOpen: false,
  editingMachinery: null,
  isLoading: false,
  error: null,

  fetchMachinery: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters, pagination, sorting } = get();
      const res = await machineryApi.getAll({
        ...filters,
        page: pagination.page,
        pageSize: pagination.pageSize,
        sortBy: sorting.sortBy,
        sortOrder: sorting.sortOrder,
      });
      if (res.data) {
        set({
          machinery: res.data.data,
          pagination: {
            page: res.data.page,
            pageSize: res.data.pageSize,
            total: res.data.total,
            totalPages: res.data.totalPages,
          },
          isLoading: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch machinery';
      set({ isLoading: false, error: message });
    }
  },

  createMachinery: async (data: MachineryFormData) => {
    set({ isLoading: true, error: null });
    try {
      await machineryApi.create(data);
      set({ isLoading: false, isFormOpen: false, editingMachinery: null });
      await get().fetchMachinery();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create machinery';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  updateMachinery: async (id: string, data: Partial<MachineryFormData>) => {
    set({ isLoading: true, error: null });
    try {
      await machineryApi.update(id, data);
      set({ isLoading: false, isFormOpen: false, editingMachinery: null });
      await get().fetchMachinery();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update machinery';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  deleteMachinery: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await machineryApi.delete(id);
      const newSelected = new Set(get().selectedIds);
      newSelected.delete(id);
      set({ isLoading: false, selectedIds: newSelected });
      await get().fetchMachinery();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete machinery';
      set({ isLoading: false, error: message });
    }
  },

  bulkDelete: async (ids: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await Promise.all(ids.map((id) => machineryApi.delete(id)));
      set({ isLoading: false, selectedIds: new Set<string>() });
      await get().fetchMachinery();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete machinery';
      set({ isLoading: false, error: message });
    }
  },

  bulkUpdateStatus: async (ids: string[], status: MachineryStatus) => {
    set({ isLoading: true, error: null });
    try {
      await machineryApi.bulkAction(ids, 'updateStatus', status);
      set({ isLoading: false, selectedIds: new Set<string>() });
      await get().fetchMachinery();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update machinery status';
      set({ isLoading: false, error: message });
    }
  },

  toggleSelect: (id: string) => {
    const newSelected = new Set(get().selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    set({ selectedIds: newSelected });
  },

  selectAll: () => {
    const allIds = get().machinery.map((m) => m.id);
    set({ selectedIds: new Set(allIds) });
  },

  clearSelection: () => {
    set({ selectedIds: new Set<string>() });
  },

  setFilters: (filters: Partial<MachineryFilters>) => {
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

  setPage: (page: number) => {
    set({ pagination: { ...get().pagination, page } });
  },

  setPageSize: (pageSize: number) => {
    set({ pagination: { ...get().pagination, pageSize, page: 1 } });
  },

  setSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => {
    set({
      sorting: { sortBy, sortOrder },
      pagination: { ...get().pagination, page: 1 },
    });
  },

  openForm: (machinery?: Machinery) => {
    set({ isFormOpen: true, editingMachinery: machinery ?? null });
  },

  closeForm: () => {
    set({ isFormOpen: false, editingMachinery: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));
