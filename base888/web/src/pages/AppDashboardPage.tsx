import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { appManageApi, type DashboardData } from "@/api/appManageApi";
import { workspaceApi, type AppSummary } from "@/api/workspaceApi";
import { useToast } from "@/hooks/useToast";

const PALETTE = ["#5b8cff", "#7affc6", "#ffce6b", "#ff6b9d", "#9d7aff", "#6bd3ff"];

// Per-app dashboard: KPI cards + enum breakdown bars, computed from live data.
export function AppDashboardPage() {
  const { appId = "" } = useParams();
  const { error } = useToast();
  const [app, setApp] = useState<AppSummary | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [a, d] = await Promise.all([workspaceApi.getApp(appId), appManageApi.dashboard(appId)]);
        setApp(a); setData(d);
      } catch { error("Could not load dashboard"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  return (
    <div className="container stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>📊 {app?.name || "App"} <span className="muted" style={{ fontSize: 14 }}>dashboard</span></h2>
        <Link to={`/apps/${appId}/preview`} style={{ marginLeft: "auto" }}><button>Preview</button></Link>
        <Link to={`/apps/${appId}/agent`}><button>✨ Agent</button></Link>
      </div>

      {!data ? <div className="muted">Loading…</div> : (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
            {data.cards.map((c) => (
              <div key={c.label} className="card">
                <div className="muted" style={{ fontSize: 13 }}>{c.label}</div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{c.value}</div>
                <div className="muted" style={{ fontSize: 12 }}>records</div>
              </div>
            ))}
            {data.cards.length === 0 && <div className="muted">No entities yet — build the app with the agent.</div>}
          </div>

          {data.charts.map((ch) => {
            const entries = Object.entries(ch.counts);
            const max = Math.max(1, ...entries.map(([, v]) => v));
            return (
              <div key={ch.entity + ch.field} className="card stack">
                <strong>{ch.entity} · {ch.field}</strong>
                <div className="stack" style={{ gap: 8 }}>
                  {entries.map(([k, v], i) => (
                    <div key={k} className="row" style={{ gap: 10 }}>
                      <span style={{ width: 120, color: "var(--muted)", fontSize: 13 }}>{k}</span>
                      <div style={{ flex: 1, background: "var(--panel-2)", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ width: `${(v / max) * 100}%`, minWidth: 2, height: 22, background: PALETTE[i % PALETTE.length] }} />
                      </div>
                      <span style={{ width: 28, textAlign: "right" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
