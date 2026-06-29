import { create } from "zustand";
import type { AttendanceRecord, AttendanceStatus } from "@/types/employee";
import { attendanceApi } from "@/services/api";

interface AttendanceStore {
  records: AttendanceRecord[];
  total: number;
  isLoading: boolean;
  error: string | null;

  // Current filters
  employeeId: string | null;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;

  // Summary
  summary: {
    presentDays: number;
    halfDays: number;
    absentDays: number;
    leaveDays: number;
    holidayDays: number;
    totalDays: number;
    effectiveDays: number;
  } | null;
  summaryLoading: boolean;

  // Actions
  fetchRecords: (params?: {
    employeeId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<void>;
  setFilters: (filters: {
    employeeId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => void;
  setPage: (page: number) => void;
  createRecord: (data: {
    employeeId: string;
    date: string;
    status: AttendanceStatus;
    notes?: string;
  }) => Promise<boolean>;
  deleteRecord: (id: string) => Promise<boolean>;
  fetchSummary: (params: {
    employeeId: string;
    dateFrom?: string;
    dateTo?: string;
  }) => Promise<void>;
}

export const useAttendanceStore = create<AttendanceStore>((set, get) => ({
  records: [],
  total: 0,
  isLoading: false,
  error: null,
  employeeId: null,
  dateFrom: "",
  dateTo: "",
  page: 1,
  pageSize: 31,
  summary: null,
  summaryLoading: false,

  fetchRecords: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const filters = params ?? {};
      const res = await attendanceApi.getAll({
        employeeId: filters.employeeId ?? get().employeeId ?? undefined,
        dateFrom: filters.dateFrom ?? (get().dateFrom || undefined),
        dateTo: filters.dateTo ?? (get().dateTo || undefined),
        page: filters.page ?? get().page,
        pageSize: filters.pageSize ?? get().pageSize,
      });
      if (res.success && res.data) {
        set({ records: res.data.data, total: res.data.total });
      }
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  setFilters: (filters) => {
    set({
      employeeId: filters.employeeId ?? get().employeeId,
      dateFrom: filters.dateFrom ?? "",
      dateTo: filters.dateTo ?? "",
      page: 1,
    });
  },

  setPage: (page) => {
    set({ page });
  },

  createRecord: async (data) => {
    try {
      const res = await attendanceApi.create(data);
      if (res.success) {
        await get().fetchRecords();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  deleteRecord: async (id) => {
    try {
      const res = await attendanceApi.delete(id);
      if (res.success) {
        await get().fetchRecords();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  fetchSummary: async (params) => {
    set({ summaryLoading: true });
    try {
      const res = await attendanceApi.getSummary(params);
      if (res.success && res.data) {
        set({ summary: res.data });
      }
    } catch {
      // ignore
    } finally {
      set({ summaryLoading: false });
    }
  },
}));
