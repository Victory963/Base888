import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { agentApi, type AgentEvent } from "@/api/agentApi";
import { useToast } from "@/hooks/useToast";

interface AgentRender {
  status?: string;
  summary?: string;
  questions: string[];
  plan?: { app_name?: string; entity_names?: string[] };
  building: Array<{ name?: string; fields?: string[] }>;
  built?: { app_name?: string; entities?: AgentEvent["entities"]; created?: Record<string, number>; model?: string };
  error?: string;
}
type Turn = { role: "user"; text: string } | { role: "agent"; render: AgentRender };

const emptyRender = (): AgentRender => ({ questions: [], building: [] });

// Base44-style superagent chat: describe an app, answer clarifying questions,
// watch it build a multi-entity app, then open the live preview.
export function AgentBuilderPage() {
  const { appId = "" } = useParams();
  const navigate = useNavigate();
  const { error } = useToast();
  const [cid, setCid] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [live, setLive] = useState<AgentRender | null>(null);
  const [input, setInput] = useState("I want an app to run my small gym.");
  const [busy, setBusy] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { void agentApi.createConversation(appId).then(setCid).catch(() => error("Could not start conversation")); }, [appId]);
  useEffect(() => { scroller.current?.scrollTo(0, scroller.current.scrollHeight); }, [turns, live]);

  async function send() {
    if (!cid || !input.trim() || busy) return;
    const content = input.trim();
    setInput("");
    setTurns((t) => [...t, { role: "user", text: content }]);
    setBusy(true);
    const r = emptyRender();
    setLive({ ...r });
    try {
      for await (const e of agentApi.streamMessage(appId, cid, content)) {
        if (e.type === "status") r.status = e.text;
        else if (e.type === "summary") r.summary = e.text;
        else if (e.type === "question") r.questions = [...r.questions, e.text || ""];
        else if (e.type === "await_answers") setAwaiting(true);
        else if (e.type === "plan") { r.plan = { app_name: e.app_name, entity_names: e.entity_names }; r.status = "Building…"; setAwaiting(false); }
        else if (e.type === "building_entity") r.building = [...r.building, { name: e.name, fields: e.fields }];
        else if (e.type === "built") { r.built = { app_name: e.app_name, entities: e.entities, created: e.created, model: e.model }; r.status = undefined; }
        else if (e.type === "error") r.error = e.message;
        setLive({ ...r });
      }
    } catch (err) {
      r.error = (err as Error).message;
    } finally {
      setTurns((t) => [...t, { role: "agent", render: { ...r } }]);
      setLive(null);
      setBusy(false);
    }
  }

  return (
    <div className="container stack" style={{ maxWidth: 820 }}>
      <div className="row">
        <h2 style={{ margin: 0 }}>✨ Build with the agent</h2>
        <code style={{ marginLeft: "auto" }}>appId: {appId}</code>
      </div>

      <div ref={scroller} className="stack" style={{ maxHeight: "62vh", overflowY: "auto", paddingRight: 4 }}>
        {turns.length === 0 && !live && (
          <div className="muted" style={{ fontSize: 14 }}>Describe the app you want. The agent will ask a couple of questions, then build a data model and sample data you can preview.</div>
        )}
        {turns.map((t, i) => t.role === "user"
          ? <div key={i} className="card" style={{ background: "var(--accent)", color: "#06101f", alignSelf: "flex-end", maxWidth: "80%" }}>{t.text}</div>
          : <AgentCard key={i} r={t.render} appId={appId} navigate={navigate} />)}
        {live && <AgentCard r={live} live appId={appId} navigate={navigate} />}
      </div>

      <div className="row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
          placeholder={awaiting ? "Answer the questions in one line…" : "Describe your app…"}
          disabled={busy}
        />
        <button className="primary" disabled={busy || !cid} onClick={() => void send()}>{busy ? "…" : "Send"}</button>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>Local model on CPU/GPU — a build takes ~30-60s. For instant, higher-quality results set a cloud API key on the backend.</div>
    </div>
  );
}

function AgentCard({ r, live, appId, navigate }: { r: AgentRender; live?: boolean; appId: string; navigate: (p: string) => void }) {
  return (
    <div className="card stack" style={{ maxWidth: "90%" }}>
      {r.status && <div className="row muted"><span className="spin">◐</span> {r.status}</div>}
      {r.summary && <div>{r.summary}</div>}
      {r.questions.length > 0 && (
        <ol style={{ margin: "4px 0 0 18px" }}>{r.questions.map((q, i) => <li key={i} style={{ marginBottom: 4 }}>{q}</li>)}</ol>
      )}
      {r.plan && <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        <strong>{r.plan.app_name}</strong>
        {(r.plan.entity_names || []).map((n) => <span key={n} className="badge">{n}</span>)}
      </div>}
      {r.building.map((b, i) => (
        <div key={i} className="muted" style={{ fontSize: 13 }}>✓ {b.name} <span style={{ opacity: .7 }}>({(b.fields || []).join(", ")})</span></div>
      ))}
      {r.built && (
        <div className="stack">
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            <strong>Built {r.built.entities?.length} entities</strong>
            {Object.entries(r.built.created || {}).map(([k, v]) => <span key={k} className="badge">{k}: {v}</span>)}
            <span className="badge" style={{ marginLeft: "auto" }}>model: {r.built.model}</span>
          </div>
          <div className="row">
            <button className="primary" onClick={() => navigate(`/apps/${appId}/preview`)}>▶ Open live preview</button>
            <button onClick={() => navigate(`/apps/${appId}/editor`)}>Open data editor</button>
            <Link to="/" style={{ marginLeft: "auto" }}><button>Dashboard</button></Link>
          </div>
        </div>
      )}
      {r.error && <div style={{ color: "var(--danger)" }}>⚠ {r.error}</div>}
      {live && !r.built && !r.error && !r.status && <div className="muted"><span className="spin">◐</span> working…</div>}
    </div>
  );
}
