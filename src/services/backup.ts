import type { ApiResponse } from "./settings";
import type { BackupManifest, BackupResult, RestoreResult } from "@/lib/backup";

const API_BASE = "/api/backup";

async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const json = await response.json();
  if (!response.ok) {
    return { success: false, error: json.error ?? "Request failed" };
  }
  return json;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const backupApi = {
  list: async (): Promise<ApiResponse<BackupManifest[]>> => {
    const res = await fetch(API_BASE, { headers: authHeaders() });
    return handleResponse<BackupManifest[]>(res);
  },

  create: async (reason?: string): Promise<ApiResponse<BackupResult>> => {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "create", reason }),
    });
    return handleResponse<BackupResult>(res);
  },

  restore: async (file: string, password: string): Promise<ApiResponse<RestoreResult>> => {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "restore", file, password }),
    });
    return handleResponse<RestoreResult>(res);
  },
};
