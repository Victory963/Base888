import { apiClient } from "./axiosClient";

// Reconstruction of Base44's WorkspaceAPI + apps/editor surface.

export interface Workspace {
  id: string;
  name: string;
  unlocked: boolean;
  role: "owner" | "member";
}

export interface AppSummary {
  id: string;
  name: string;
  description: string;
  updated_date: string;
  flavor: string;
}

export const workspaceApi = {
  async list(): Promise<Workspace[]> {
    const res = await apiClient.get("/workspaces");
    return res.data.items as Workspace[];
  },

  async unlockState(workspaceId: string): Promise<{ unlocked: boolean }> {
    const res = await apiClient.get(`/workspaces/${encodeURIComponent(workspaceId)}/unlock-state`);
    return res.data;
  },

  async listApps(): Promise<AppSummary[]> {
    const res = await apiClient.get("/apps/");
    return res.data.items as AppSummary[];
  },

  async getApp(appId: string): Promise<AppSummary> {
    const res = await apiClient.get(`/apps/${encodeURIComponent(appId)}`);
    return res.data as AppSummary;
  },

  async createApp(name: string, description = ""): Promise<AppSummary> {
    const res = await apiClient.post("/apps/", { name, description });
    return res.data as AppSummary;
  }
};
