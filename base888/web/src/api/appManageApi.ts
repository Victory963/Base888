import { apiClient, session } from "./axiosClient";

export interface DashboardData {
  cards: Array<{ label: string; value: number }>;
  charts: Array<{ entity: string; field: string; counts: Record<string, number> }>;
}
export interface Checkpoint { id: string; label: string; created_date: string }

const base = () => apiClient.defaults.baseURL || "";

export const appManageApi = {
  dashboard: (appId: string) => apiClient.get<DashboardData>(`/apps/${encodeURIComponent(appId)}/dashboard`).then((r) => r.data),
  publish: (appId: string, visibility: "public" | "private") =>
    apiClient.put<{ visibility: string; public_url: string | null }>(`/apps/${encodeURIComponent(appId)}/publish`, { visibility }).then((r) => r.data),
  async download(appId: string, filename: string) {
    const res = await fetch(`${base()}/apps/${encodeURIComponent(appId)}/export`, { headers: { Authorization: `Bearer ${session.getAccessToken() ?? ""}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
  listCheckpoints: (appId: string) => apiClient.get<{ items: Checkpoint[] }>(`/apps/${encodeURIComponent(appId)}/checkpoints`).then((r) => r.data.items),
  snapshot: (appId: string, label: string) => apiClient.post(`/apps/${encodeURIComponent(appId)}/checkpoints`, { label }).then((r) => r.data),
  restore: (appId: string, id: string) => apiClient.post(`/apps/${encodeURIComponent(appId)}/checkpoints/${encodeURIComponent(id)}/restore`, {}).then((r) => r.data),
  putSchema: (appId: string, body: unknown) => apiClient.put(`/apps/${encodeURIComponent(appId)}/schema`, body).then((r) => r.data),
  getCode: (appId: string) => apiClient.get<{ code: string; generated: boolean }>(`/apps/${encodeURIComponent(appId)}/code`).then((r) => r.data),
  putCode: (appId: string, code: string) => apiClient.put(`/apps/${encodeURIComponent(appId)}/code`, { code }).then((r) => r.data),
  generateCode: (appId: string) => apiClient.post<{ code: string }>(`/apps/${encodeURIComponent(appId)}/code/generate`, {}).then((r) => r.data)
};
