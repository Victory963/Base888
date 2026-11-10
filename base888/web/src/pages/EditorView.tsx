import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import { apiClient, session } from "@/api/axiosClient";
import { workspaceApi, type AppSummary } from "@/api/workspaceApi";
import { appManageApi, type Checkpoint } from "@/api/appManageApi";
import { useAgentChat, type AgentRender } from "@/hooks/useAgentChat";
import { useToast } from "@/hooks/useToast";
import { AppDashboardPage } from "@/pages/AppDashboardPage";

const base = () => apiClient.defaults.baseURL || "";

// The vibe-coding workspace: AI build-chat on the left, live preview of the
// generated app on the right, toolbar with branches (checkpoints), preview /
// dashboard tabs, edit (Monaco), and publish.
export function EditorView() {
  const { appId = "" } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const { toast, error } = useToast();
  const [app, setApp] = useState<AppSummary | null>(null);
  const [html, setHtml] = useState("");
  const [tab, setTab] = useState<"preview" | "dashboard">("preview");
  const [mode, setMode] = useState<"auto" | "build">("auto");
  const [input, setInput] = useState("");
  const [branches, setBranches] = useState<Checkpoint[]>([]);
  const [branchOpen, setBranchOpen] = useState(false);
  const [pubUrl, setPubUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  const loadPreview = useCallback(async () => {
    try {
      const res = await fetch(`${base()}/apps/${encodeURIComponent(appId)}/export`, { headers: { Authorization: `Bearer ${session.getAccessToken() ?? ""}` } });
      setHtml(await res.text()); setPreviewKey((k) => k + 1);
    } catch { /* ignore */ }
  }, [appId]);

  const { cid, turns, live, busy, awaiting, send } = useAgentChat(appId, () => { void loadPreview(); void workspaceApi.getApp(appId).then(setApp).catch(() => {}); });

  useEffect(() => {
    void workspaceApi.getApp(appId).then(setApp).catch(() => error("アプリを読み込めません"));
    void loadPreview();
    void appManageApi.listCheckpoints(appId).then(setBranches).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  // Auto-send the prompt handed over from the home composer.
  useEffect(() => {
    const p = (loc.state as { prompt?: string } | null)?.prompt;
    if (p && cid && !sentInitial.current) { sentInitial.current = true; void send(p); }
  }, [cid, loc.state, send]);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [turns, live]);

  async function submit() { const v = input.trim(); if (!v) return; setInput(""); await send(v); }
  async function newBranch() {
    try { await appManageApi.snapshot(appId, `ブランチ ${new Date().toLocaleString("ja-JP")}`); setBranches(await appManageApi.listCheckpoints(appId)); toast("新しいブランチ(チェックポイント)を作成しました"); } catch { error("作成に失敗しました"); }
    setBranchOpen(false);
  }
  async function restoreBranch(id: string) {
    try { await appManageApi.restore(appId, id); await loadPreview(); toast("ブランチに切り替えました"); } catch { error("切り替えに失敗しました"); }
    setBranchOpen(false);
  }
  async function publish() {
    try { const r = await appManageApi.publish(appId, "public"); setPubUrl(r.public_url); toast("公開しました", r.public_url || ""); } catch { error("公開に失敗しました"); }
  }

  const suggestions = app?.description
    ? ["ダッシュボードを改善する", "検索機能を追加する", "デザインをダークにする", "多言語対応を追加する"]
    : ["Define the data model", "Create a dashboard page", "Add user roles"];
  const slug = (app?.name || "app").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "app";

  return (
    <div className="editor">
      <div className="topbar">
        <Link to="/" className="logo" style={{ fontSize: 0 }}><span className="logo-mark" /></Link>
        <div style={{ position: "relative" }}>
          <button className="ghost" onClick={() => setBranchOpen((o) => !o)}><b>{app?.name || "…"}</b><span className="badge" style={{ marginLeft: 6 }}>メイン ⌄</span></button>
          {branchOpen && (
            <div className="card" style={{ position: "absolute", top: 40, left: 0, zIndex: 20, width: 260, padding: 8 }}>
              <div className="muted" style={{ padding: "4px 8px", fontSize: 12 }}>ブランチ(チェックポイント)</div>
              <button className="ghost" style={{ width: "100%", justifyContent: "flex-start", background: "#ecebe6" }}>メインチャット</button>
              {branches.map((b) => <button key={b.id} className="ghost" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => void restoreBranch(b.id)}>⎇ {b.label}</button>)}
              <button className="dark" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={() => void newBranch()}>＋ 新しいブランチを作成</button>
            </div>
          )}
        </div>
        <button className="ghost iconbtn" title="履歴" onClick={() => setBranchOpen((o) => !o)}>⟲</button>
        <div className="tabs">
          <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>プレビュー</button>
          <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>ダッシュボード</button>
        </div>
        <button onClick={() => nav(`/apps/${appId}/code`)}>✎ 編集</button>
        <div className="urlbar"><span>⟳</span><span>ホーム</span><span style={{ marginLeft: "auto" }}>▭</span></div>
        <button className="ghost iconbtn" title="コメント">🗨</button>
        <span className="avatar" style={{ width: 26, height: 26, fontSize: 11 }}>WW</span>
        <button className="ghost" style={{ color: "var(--accent)" }}>♕ アップグレード</button>
        <button className="dark" onClick={() => void publish()}>公開</button>
      </div>

      <div className="split">
        <div className="chatpane">
          <div ref={logRef} className="chatlog">
            {turns.length === 0 && !live && <div className="muted" style={{ fontSize: 13 }}>作りたいものを伝えると、エージェントがデータモデルとサンプルデータを設計し、右側にプレビューを表示します。</div>}
            {turns.map((t, i) => t.role === "user"
              ? <div key={i} className="msg user">{t.text}<div className="ts">{new Date(t.ts).toLocaleTimeString("ja-JP")}</div></div>
              : <AgentMsg key={i} r={t.render} ts={t.ts} />)}
            {live && <AgentMsg r={live} live />}
          </div>
          <div className="suggest">
            <div className="muted" style={{ fontSize: 12.5 }}>💡 提案</div>
            <div className="row" style={{ gap: 6 }}>{suggestions.map((s) => <span key={s} className="chip" onClick={() => setInput(s)}>{s}</span>)}</div>
          </div>
          <div style={{ padding: 10 }}>
            <div className="composer small">
              <textarea value={input} rows={1} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} placeholder={awaiting ? "質問に答えてください…" : "何を変更しますか?"} disabled={busy} />
              <div className="bar">
                <button className="ghost iconbtn">＋</button>
                <button className="chip" onClick={() => setMode(mode === "auto" ? "build" : "auto")}>◎ {mode === "auto" ? "自動" : "手動"}</button>
                <button className="ghost">ビルド ⌄</button>
                <div className="right">
                  <button className="ghost iconbtn">⋯</button>
                  <button className="ghost iconbtn">🎙</button>
                  <button className={`iconbtn send ${input.trim() ? "ready" : ""}`} disabled={busy || !input.trim() || !cid} onClick={() => void submit()}>{busy ? "…" : "➤"}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="previewpane">
          {tab === "preview" ? (
            <>
              <div className="domainbar">
                <span>🌐 おすすめのドメイン</span><b>{slug}.base888.app</b>
                <button className="primary" style={{ padding: "3px 10px", fontSize: 12 }}>ドメインを取得</button>
                {pubUrl && <a href={pubUrl} target="_blank" rel="noreferrer" style={{ marginLeft: "auto" }}>公開URLを開く ↗</a>}
              </div>
              <iframe key={previewKey} title="preview" srcDoc={html || "<p style='font-family:sans-serif;color:#888;padding:24px'>プレビューを生成中…</p>"} sandbox="allow-scripts" />
            </>
          ) : (
            <div style={{ overflow: "auto" }}><AppDashboardPage /></div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentMsg({ r, live, ts }: { r: AgentRender; live?: boolean; ts?: number }) {
  return (
    <div className="msg agent stack" style={{ gap: 6 }}>
      {r.status && <div className="step"><span className="spin">◐</span> {r.status}</div>}
      {r.summary && <div>{r.summary}</div>}
      {r.questions.length > 0 && <ol style={{ margin: "2px 0 0 18px" }}>{r.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>}
      {r.plan && <div className="step">▸ <b>{r.plan.app_name}</b> を設計: {(r.plan.entity_names || []).join(", ")}</div>}
      {r.building.map((b, i) => <div key={i} className="step">✓ {b.name} を更新しました <span style={{ opacity: .7 }}>({(b.fields || []).join(", ")})</span></div>)}
      {r.built && <div><b>アプリを更新しました</b> — {r.built.entities?.length} エンティティ、{Object.values(r.built.created || {}).reduce((a, b) => a + b, 0)} 件のサンプルデータを作成。プレビューを更新しました。</div>}
      {r.error && <div style={{ color: "var(--danger)" }}>⚠ {r.error}</div>}
      {live && !r.status && !r.built && !r.error && <div className="step"><span className="spin">◐</span> 考えています…</div>}
      {ts && !live && <div className="ts">{new Date(ts).toLocaleTimeString("ja-JP")}</div>}
    </div>
  );
}
