export interface AppSettings {
  id: string;
  companyName: string;
  companyLogo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const API_BASE = "/api/settings";

async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const json = await response.json();
  if (!response.ok) {
    return { success: false, error: json.error ?? "Request failed" };
  }
  return json;
}

export const settingsApi = {
  get: async (): Promise<ApiResponse<AppSettings>> => {
    const token = localStorage.getItem("auth_token");
    const res = await fetch(API_BASE, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return handleResponse<AppSettings>(res);
  },

  update: async (data: Partial<AppSettings>): Promise<ApiResponse<AppSettings>> => {
    const token = localStorage.getItem("auth_token");
    const res = await fetch(API_BASE, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<AppSettings>(res);
  },

  uploadLogo: async (file: File): Promise<ApiResponse<{ path: string }>> => {
    const token = localStorage.getItem("auth_token");
    const formData = new FormData();
    formData.append("logo", file);

    const res = await fetch(`${API_BASE}/upload-logo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    return handleResponse<{ path: string }>(res);
  },
};
