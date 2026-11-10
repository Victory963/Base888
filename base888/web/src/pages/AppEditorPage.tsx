import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspaceApi, type AppSummary } from "@/api/workspaceApi";
import { builderApi, type AppSchema, type EntityField } from "@/api/builderApi";
import { createClient } from "@/sdk/base888Sdk";
import { useToast } from "@/hooks/useToast";

type Rec = { id: string; [k: string]: unknown };

// Schema-driven app editor: renders the AI-generated entities and their records,
// and exposes the live InvokeLLM integration.
export function AppEditorPage() {
  const { appId = "" } = useParams();
  const { t } = useTranslation();
  const { error } = useToast();
  const [app, setApp] = useState<AppSummary | null>(null);
  const [schema, setSchema] = useState<AppSchema | null>(null);
  const [records, setRecords] = useState<Record<string, Rec[]>>({});
  const [llmOut, setLlmOut] = useState("");
  const [busyLLM, setBusyLLM] = useState(false);

  const client = useMemo(() => createClient({ appId }), [appId]);

  async function loadRecordsFor(names: string[]) {
    const out: Record<string, Rec[]> = {};
    for (const name of names) {
      try { out[name] = (await client.entities[name].list("-created_date", 20)) as Rec[]; } catch { out[name] = []; }
    }
    setRecords(out);
  }

  useEffect(() => {
    void (async () => {
      try {
        const [a, s] = await Promise.all([workspaceApi.getApp(appId), builderApi.getSchema(appId)]);
        setApp(a); setSchema(s);
        await loadRecordsFor((s.entities || []).map((e) => e.name));
      } catch { error("Could not load app"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function addSample(entityName: string, fields: EntityField[]) {
    const rec: Record<string, unknown> = {};
    for (const f of fields) rec[f.name] = f.type === "number" ? 0 : f.type === "boolean" ? false : `${f.name} value`;
    const created = (await client.entities[entityName].create(rec)) as Rec;
    setRecords((r) => ({ ...r, [entityName]: [created, ...(r[entityName] || [])] }));
  }

  async function invokeLLM() {
    setBusyLLM(true);
    try {
      const res = await client.integrations.core.InvokeLLM({ prompt: `In one short sentence, suggest a useful feature for an app called "${app?.name || "this app"}".` });
      setLlmOut(typeof res.output === "string" ? res.output : JSON.stringify(res.output));
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      error("LLM failed", err.response?.data?.message || err.message);
    } finally {
      setBusyLLM(false);
    }
  }

  const entities = schema?.entities || [];

  return (
    <div className="container stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>{t("editor.title")}</h2>
        {app && <span className="badge">{app.name}</span>}
        <Link to={`/apps/${appId}/agent`} style={{ marginLeft: "auto" }}><button className="primary">✨ Build with AI</button></Link>
      </div>
      {app?.description && <span className="muted">{app.description}</span>}

      {entities.length === 0 ? (
        <div className="card stack">
          <strong>No data model yet</strong>
          <span className="muted">Use “Build with AI” to generate this app’s entities from a prompt.</span>
        </div>
      ) : entities.map((ent) => (
        <div key={ent.name} className="card stack">
          <div className="row">
            <strong>{ent.name}</strong>
            <span className="muted" style={{ fontSize: 13 }}>{(ent.fields || []).map((f) => f.name).join(", ")}</span>
            <button style={{ marginLeft: "auto" }} onClick={() => addSample(ent.name, ent.fields || [])}>+ add</button>
          </div>
          <div className="stack">
            {(records[ent.name] || []).map((r) => (
              <div key={r.id} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 6 }}>
                <span style={{ fontSize: 14 }}>{summarize(r, ent.fields)}</span>
                <span className="badge">{r.id.slice(0, 8)}</span>
              </div>
            ))}
            {(records[ent.name] || []).length === 0 && <span className="muted">No records.</span>}
          </div>
        </div>
      ))}

      <div className="card stack">
        <div className="row">
          <strong>integrations.core.InvokeLLM (live)</strong>
          <button style={{ marginLeft: "auto" }} disabled={busyLLM} onClick={invokeLLM}>{busyLLM ? "Running…" : "Run"}</button>
        </div>
        {llmOut && <span className="muted">{llmOut}</span>}
      </div>
    </div>
  );
}

function summarize(r: Rec, fields?: EntityField[]): string {
  const keys = (fields?.map((f) => f.name) || Object.keys(r))
    .filter((k) => !["id", "created_date", "updated_date", "created_by"].includes(k))
    .slice(0, 3);
  return keys.map((k) => `${k}: ${String(r[k])}`).join("  ·  ") || r.id;
}
