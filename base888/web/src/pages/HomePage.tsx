import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { workspaceApi, type AppSummary } from "@/api/workspaceApi";
import { apiClient } from "@/api/axiosClient";
import { useToast } from "@/hooks/useToast";

const TEMPLATES = [
  { t: "CRM", d: "顧客・会社・商談を管理", p: "A CRM to track clients, their companies, and deals in progress with stages and amounts." },
  { t: "タスク管理", d: "プロジェクトとタスク", p: "A task tracker with projects and tasks that have status, priority and due dates." },
  { t: "在庫管理", d: "商品・仕入先・入出庫", p: "An inventory app with products, suppliers and stock movements." },
  { t: "予約システム", d: "リソースと予約", p: "A booking system with resources, customers and reservations with time slots." },
  { t: "社内ヘルプデスク", d: "チケットと担当者", p: "An internal helpdesk with tickets, agents, categories and priorities." },
  { t: "イベント管理", d: "イベントと参加者", p: "An event manager with events, attendees, ticket types and check-ins." }
];

// Builder home: personalized greeting + prompt composer + recent / templates.
export function HomePage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { error } = useToast();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"recent" | "community" | "templates">("recent");
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [community, setCommunity] = useState<AppSummary[]>([]);

  useEffect(() => {
    void workspaceApi.listApps().then(setApps).catch(() => {});
    void apiClient.get<{ items: AppSummary[] }>("/api/community/apps").then((r) => setCommunity(r.data.items)).catch(() => {});
  }, []);

  const name = ((user?.full_name || user?.email || "").split("@")[0].split(" ")[0] || "").slice(0, 12);

  async function create() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const app = await workspaceApi.createApp(prompt.trim().slice(0, 48));
      nav(`/apps/${app.id}/editor/preview`, { state: { prompt: prompt.trim() } });
    } catch { error("作成に失敗しました"); } finally { setBusy(false); }
  }

  return (
    <div className="home">
      <div className="greet">こんにちは、{name}さん<span className="dot">。</span><br />次は何を作りますか?</div>

      <div className="composer">
        <textarea
          value={prompt} rows={2}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void create(); }}
          placeholder="作りたいアプリを説明してください..."
        />
        <div className="bar">
          <button className="ghost iconbtn" title="添付">＋</button>
          <span style={{ width: 1, height: 20, background: "var(--border)" }} />
          <button className="chip">◎ 自動</button>
          <div className="right">
            <button className="ghost">作成 ⌄</button>
            <button className="ghost iconbtn" title="音声入力">🎙</button>
            <button className={`iconbtn send ${prompt.trim() ? "ready" : ""}`} disabled={busy || !prompt.trim()} onClick={() => void create()} title="作成">{busy ? "…" : "↑"}</button>
          </div>
        </div>
      </div>

      <div className="stack" style={{ width: "min(900px,100%)", gap: 14 }}>
        <div className="home-tabs">
          <span className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")}>最近のアプリ</span>
          <span className={tab === "community" ? "active" : ""} onClick={() => setTab("community")}>コミュニティ テンプレート</span>
          <span className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>Base888 テンプレート</span>
        </div>
        <div className="app-tiles">
          {tab === "recent" && apps.slice(0, 8).map((a) => (
            <div key={a.id} className="tile" onClick={() => nav(`/apps/${a.id}/editor/preview`)}><b>{a.name}</b><span className="muted" style={{ fontSize: 12.5 }}>{a.description || "—"}</span></div>
          ))}
          {tab === "recent" && apps.length === 0 && <div className="muted">まだアプリがありません。上の入力欄から作成しましょう。</div>}
          {tab === "community" && community.map((a) => (
            <div key={a.id} className="tile" onClick={() => window.open(`${apiClient.defaults.baseURL || ""}/p/${a.id}`, "_blank")}><b>{a.name}</b><span className="muted" style={{ fontSize: 12.5 }}>{a.description || "公開アプリ"}</span></div>
          ))}
          {tab === "community" && community.length === 0 && <div className="muted">公開されたアプリはまだありません。</div>}
          {tab === "templates" && TEMPLATES.map((t) => (
            <div key={t.t} className="tile" onClick={() => setPrompt(t.p)}><b>{t.t}</b><span className="muted" style={{ fontSize: 12.5 }}>{t.d}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
