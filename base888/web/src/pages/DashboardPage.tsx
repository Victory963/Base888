import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspaceApi, type AppSummary } from "@/api/workspaceApi";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useToast } from "@/hooks/useToast";

// Reconstruction of Base44's post-login dashboard: the app list for the active
// workspace, plus a "new app" action.
export function DashboardPage() {
  const { t } = useTranslation();
  const { activeWorkspaceId } = useWorkspace();
  const { workspaces } = useWorkspaceStore();
  const { isEnabled } = useFeatureFlags();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try { setApps(await workspaceApi.listApps()); } finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [activeWorkspaceId]);

  async function createApp() {
    const name = `Untitled app ${apps.length + 1}`;
    const created = await workspaceApi.createApp(name);
    toast("App created", created.name);
    void reload();
  }

  async function createAndBuild() {
    const created = await workspaceApi.createApp(`AI app ${apps.length + 1}`);
    navigate(`/apps/${created.id}/agent`);
  }

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <div className="container stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>{t("dash.yourApps")}</h2>
        {active && <span className="badge">{active.name}</span>}
        {isEnabled("launchpad-multi-contests") && <span className="badge">launchpad</span>}
        <button className="primary" style={{ marginLeft: "auto" }} onClick={createAndBuild}>✨ Build with AI</button>
        <button onClick={createApp}>{t("dash.newApp")}</button>
      </div>
      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <div className="grid">
          {apps.map((a) => (
            <Link key={a.id} to={`/apps/${a.id}/editor`}>
              <div className="card stack">
                <div style={{ fontWeight: 600 }}>{a.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>{a.description || "No description"}</div>
                <div className="badge">{a.flavor}</div>
              </div>
            </Link>
          ))}
          {apps.length === 0 && <div className="muted">No apps yet. Create your first one.</div>}
        </div>
      )}
    </div>
  );
}
