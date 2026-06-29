export interface SyncStatus {
  isLocalDb: boolean;
  syncInProgress: boolean;
  lastSync: {
    success: boolean;
    startedAt: string;
    finishedAt: string;
    totalSynced: number;
    totalSkipped: number;
    totalErrors: number;
    tables: {
      table: string;
      status: string;
      total: number;
      synced: number;
      skipped: number;
      errors: { rowId: string; message: string }[];
    }[];
    error?: string;
  } | null;
}

export interface SyncResultData {
  success: boolean;
  startedAt: string;
  finishedAt: string;
  totalSynced: number;
  totalSkipped: number;
  totalErrors: number;
  tables: {
    table: string;
    status: string;
    total: number;
    synced: number;
    skipped: number;
    errors: { rowId: string; message: string }[];
  }[];
  error?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    return { success: false, error: json.error ?? `HTTP ${response.status}` };
  }
  return response.json();
}

export const syncApi = {
  getStatus: async (): Promise<ApiResponse<SyncStatus>> => {
    const token = localStorage.getItem("auth_token");
    const res = await fetch("/api/sync", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return handleResponse<SyncStatus>(res);
  },

  triggerSync: async (
    force = false
  ): Promise<ApiResponse<SyncResultData>> => {
    const token = localStorage.getItem("auth_token");
    const params = force ? "?force=true" : "";
    const res = await fetch(`/api/sync${params}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return handleResponse<SyncResultData>(res);
  },
};
