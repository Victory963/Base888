import { createContext, useContext, useEffect, type ReactNode } from "react";
import { workspaceApi } from "@/api/workspaceApi";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useAuth } from "./AuthContext";

interface WorkspaceContextValue {
  activeWorkspaceId: string | null;
  setActive: (id: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// Reconstruction of Base44's WorkspaceContext: loads workspaces once the user
// is authenticated and tracks the active workspace (propagated to the axios
// X-Active-Workspace-Id header via the store).
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { workspaces, activeWorkspaceId, setWorkspaces, setActive } = useWorkspaceStore();

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const ws = await workspaceApi.list();
        setWorkspaces(ws);
        if (!activeWorkspaceId && ws[0]) setActive(ws[0].id);
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <WorkspaceContext.Provider value={{ activeWorkspaceId, setActive }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
