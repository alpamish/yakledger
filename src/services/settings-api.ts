import type { ApiResponse } from "@/types/expense";

export interface AppSettings {
  id: string;
  companyName: string;
  companyLogo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  taxId?: string | null;
}

const BASE = "/api/settings";

export const settingsApi = {
  get: async (): Promise<ApiResponse<AppSettings | null>> => {
    const token = localStorage.getItem("auth_token");
    const res = await fetch(BASE, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.json();
  },
};
