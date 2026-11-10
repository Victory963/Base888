import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { builderApi, type GenerateResult } from "@/api/builderApi";
import { useToast } from "@/hooks/useToast";

// One-shot data-model generator: the LLM designs a JSON schema + sample data
// data model, and the backend materializes the entities + sample records.
export function BuilderPage() {
  const { appId = "" } = useParams();
  const navigate = useNavigate();
  const { error, toast } = useToast();
  const [prompt, setPrompt] = useState("A simple CRM to track clients, their companies, and deals in progress.");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  async function generate() {
    setBusy(true);
    setResult(null);
    setElapsed(0);
    const t0 = Date.now();
    timer.current = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const r = await builderApi.generate(appId, prompt);
      setResult(r);
      toast("App generated", `${r.entities?.length ?? 0} entities created`);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
      error("Generation failed", err.response?.data?.message || err.response?.data?.error || err.message || "see server logs");
    } finally {
      if (timer.current) window.clearInterval(timer.current);
      setBusy(false);
    }
  }

  return (
    <div className="container stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>✨ Build with AI</h2>
        <code style={{ marginLeft: "auto" }}>appId: {appId}</code>
      </div>

      <div className="card stack">
        <span className="muted">Describe the app you want. The AI will design its data model and create sample data.</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          style={{ font: "inherit", background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 12, resize: "vertical" }}
        />
        <div className="row">
          <button className="primary" disabled={busy || !prompt.trim()} onClick={generate}>
            {busy ? `Generating… ${elapsed}s` : "Generate app"}
          </button>
          {busy && <span className="muted">Local model on CPU — this can take a few minutes.</span>}
        </div>
      </div>

      {result && (
        <div className="card stack">
          <div className="row">
            <strong>{result.app_name || "Generated app"}</strong>
            <span className="badge" style={{ marginLeft: "auto" }}>model: {result.raw_model || "local"}</span>
          </div>
          {result.description && <span className="muted">{result.description}</span>}
          {result.entities?.map((ent) => (
            <div key={ent.name} className="card" style={{ background: "var(--panel-2)" }}>
              <div className="row">
                <strong>{ent.name}</strong>
                <span className="badge" style={{ marginLeft: "auto" }}>{result.created?.[ent.name] ?? 0} records</span>
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {ent.fields?.map((f) => <span key={f.name} className="badge">{f.name}: {f.type}</span>)}
              </div>
            </div>
          ))}
          <div className="row">
            <button className="primary" onClick={() => navigate(`/apps/${appId}/editor`)}>Open the app →</button>
            <Link to="/" style={{ marginLeft: "auto" }}><button>Back to dashboard</button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
