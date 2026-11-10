import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { workspaceApi, type AppSummary } from "@/api/workspaceApi";
import { appManageApi } from "@/api/appManageApi";
import { useAgentChat, type AgentRender } from "@/hooks/useAgentChat";
import { useToast } from "@/hooks/useToast";

const CHANNELS = ["WhatsApp", "Telegram", "LINE", "iMessage", "Slack"];

// Superagent conversation view: a wide chat with the agent, channel bar, and
// action chips. Channels are shown but honestly marked as not connected.
export function SuperagentView() {
  const { appId: routeAppId } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const [appId, setAppId] = useState(routeAppId || "");
  const [app, setApp] = useState<AppSummary | null>(null);
  const [input, setInput] = useState("");
  const [pubUrl, setPubUrl] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const { cid, turns, live, busy, awaiting, send } = useAgentChat(appId, () => { void workspaceApi.getApp(appId).then(setApp).catch(() => {}); });

  useEffect(() => {
    if (routeAppId) { setAppId(routeAppId); void workspaceApi.getApp(routeAppId).then(setApp).catch(() => {}); return; }
    // "new conversation": create a fresh app to build in
    void workspaceApi.createApp("無題のエージェント").then((a) => { setAppId(a.id); setApp(a); nav(`/superagent/app/${a.id}`, { replace: true }); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeAppId]);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [turns, live]);

  async function submit() { const v = input.trim(); if (!v) return; setInput(""); await send(v); }
  async function checkDeployed() {
    try { const r = await appManageApi.publish(appId, "public"); setPubUrl(r.public_url); if (r.public_url) window.open(r.public_url, "_blank"); } catch { toast("公開に失敗しました"); }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
        <span style={{ color: "var(--accent-2)", fontSize: 18 }}>✺</span>
        <b>{app?.name || "無題のエージェント"}</b>
        {pubUrl && <a href={pubUrl} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 13 }}>{pubUrl} ↗</a>}
      </div>

      <div ref={logRef} className="agentlog">
        {turns.length === 0 && !live && <div className="muted">作りたいアプリや、やりたいことを伝えてください。エージェントが質問し、設計し、構築します。</div>}
        {turns.map((t, i) => t.role === "user"
          ? <div key={i} className="msg user" style={{ justifySelf: "end" }}>{t.text}</div>
          : <AgentBubble key={i} r={t.render} ts={t.ts} />)}
        {live && <AgentBubble r={live} live />}
      </div>

      <div style={{ maxWidth: 860, width: "100%", margin: "0 auto", padding: "0 24px 18px", display: "grid", gap: 10 }}>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <div className="channels">
            <span className="muted">お使いのアプリからチャットできます</span>
            {CHANNELS.map((c) => <span key={c} className="ch" style={{ color: "var(--accent-2)", cursor: "pointer" }} onClick={() => toast(`${c} は未接続です`, "チャネル設定で接続してください(このビルドでは未設定)")}>● {c}</span>)}
            <span className="muted">✕</span>
          </div>
        </div>
        <div className="actionchips">
          <span className="chip" onClick={() => void checkDeployed()}>デプロイしたサイトを確認する</span>
          <span className="chip" onClick={() => toast("Slack は未接続です", "連携を設定すると共有リンクを送れます")}>✦ Slackに共有リンクを送る</span>
          <span className="chip" onClick={() => setInput("ダッシュボードを改善する")}>ダッシュボードを改善する</span>
          <span className="chip" style={{ marginLeft: "auto" }} onClick={() => nav("/superagent/new")}>⟳</span>
        </div>
        <div className="composer">
          <textarea value={input} rows={1} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} placeholder={awaiting ? "質問に答えてください…" : "メッセージを入力..."} disabled={busy} />
          <div className="bar">
            <button className="ghost iconbtn">＋</button>
            <div className="right">
              <button className="chip">◎ 自動</button>
              <button className="ghost iconbtn">🎙</button>
              <button className={`iconbtn send ${input.trim() ? "ready" : ""}`} style={!input.trim() ? { background: "#1b1b1f", color: "#fff" } : undefined} disabled={busy || !cid} onClick={() => void submit()}>{busy ? "…" : "⫶"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentBubble({ r, live, ts }: { r: AgentRender; live?: boolean; ts?: number }) {
  return (
    <div className="msg agent stack" style={{ gap: 8, maxWidth: "100%" }}>
      <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--accent-2)" }}>✺</span>{r.status && <span className="step"><span className="spin">◐</span> {r.status}</span>}</div>
      {r.summary && <div>{r.summary}</div>}
      {r.questions.length > 0 && <ol style={{ margin: "0 0 0 18px" }}>{r.questions.map((q, i) => <li key={i} style={{ marginBottom: 4 }}>{q}</li>)}</ol>}
      {r.plan && <div><b>{r.plan.app_name}</b> を設計しました: {(r.plan.entity_names || []).join(", ")}</div>}
      {r.building.length > 0 && <div><b>実装したエンティティ一覧:</b><ul style={{ margin: "4px 0 0 18px" }}>{r.building.map((b, i) => <li key={i}><b>{b.name}</b> — {(b.fields || []).join(", ")}</li>)}</ul></div>}
      {r.built && <div>全エンティティを実装しました! プレビューはエディタで確認できます。何かご要望はありますか?</div>}
      {r.error && <div style={{ color: "var(--danger)" }}>⚠ {r.error}</div>}
      {live && !r.status && !r.built && !r.error && <div className="step"><span className="spin">◐</span> 考えています…</div>}
      {ts && !live && <div className="ts">{new Date(ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} ⧉ 🔊</div>}
    </div>
  );
}
