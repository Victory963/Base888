import { createStore } from "./createStore";
import { session } from "@/api/axiosClient";
import type { Workspace } from "@/api/workspaceApi";

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  setWorkspaces: (w: Workspace[]) => void;
  setActive: (id: string | null) => void;
}

export const useWorkspaceStore = createStore<WorkspaceState>(
  (set) => ({
    workspaces: [],
    activeWorkspaceId: null,
    setWorkspaces: (workspaces) => set({ workspaces }),
    setActive: (activeWorkspaceId) => {
      session.setActiveWorkspace(activeWorkspaceId);
      set({ activeWorkspaceId });
    }
  }),
  { name: "workspace", persistKeys: ["activeWorkspaceId"] }
);
