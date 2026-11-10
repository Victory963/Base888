import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { builderApi, type AppSchema, type EntityField } from "@/api/builderApi";
import { workspaceApi, type AppSummary } from "@/api/workspaceApi";
import { createClient } from "@/sdk/base888Sdk";
import { appManageApi } from "@/api/appManageApi";
import { useToast } from "@/hooks/useToast";

type Rec = { id: string; [k: string]: unknown };
type Entity = { name: string; icon?: string; fields: EntityField[] };

// Live preview — a working app auto-generated from the schema (Base44 "preview").
// Tables + typed create forms per entity, with enum selects and reference pickers.
export function PreviewPage() {
  const { appId = "" } = useParams();
  const { error, toast } = useToast();
  const [app, setApp] = useState<AppSummary | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [active, setActive] = useState("");
  const [recs, setRecs] = useState<Record<string, Rec[]>>({});
  const [form, setForm] = useState<Record<string, unknown>>({});
  const client = useMemo(() => createClient({ appId }), [appId]);
  const [pubUrl, setPubUrl] = useState<string | null>(null);
  async function doPublish() { try { const r = await appManageApi.publish(appId, "public"); setPubUrl(r.public_url); toast("Published", r.public_url || ""); } catch { error("Publish failed"); } }
  async function doExport() { try { await appManageApi.download(appId, `${(app?.name || "app").replace(/[^A-Za-z0-9_-]/g, "_")}.html`); } catch { error("Export failed"); } }
  async function doSnapshot() { try { await appManageApi.snapshot(appId, "manual " + new Date().toLocaleTimeString()); toast("Checkpoint saved"); } catch { error("Snapshot failed"); } }

  async function loadAll(ents: Entity[]) {
    const out: Record<string, Rec[]> = {};
    for (const e of ents) { try { out[e.name] = (await client.entities[e.name].list("-created_date", 100)) as Rec[]; } catch { out[e.name] = []; } }
    setRecs(out);
  }
  useEffect(() => {
    void (async () => {
      try {
        const [a, s] = await Promise.all([workspaceApi.getApp(appId), builderApi.getSchema(appId) as Promise<AppSchema>]);
        setApp(a);
        const ents = (s.entities || []) as Entity[];
        setEntities(ents); setActive(ents[0]?.name || "");
        await loadAll(ents);
      } catch { error("Could not load app"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  const entity = entities.find((e) => e.name === active);

  function labelFor(entName: string, id: unknown): string {
    const r = (recs[entName] || []).find((x) => x.id === id);
    if (!r) return String(id ?? "");
    const ent = entities.find((e) => e.name === entName);
    const labelField = ent?.fields.find((f) => ["string", "email"].includes(f.type));
    return String((labelField && r[labelField.name]) ?? r.id);
  }

  async function addRecord() {
    if (!entity) return;
    try {
      const created = (await client.entities[entity.name].create(form)) as Rec;
      setRecs((r) => ({ ...r, [entity.name]: [created, ...(r[entity.name] || [])] }));
      setForm({});
      toast("Record created", entity.name);
    } catch { error("Create failed"); }
  }
  async function del(id: string) {
    if (!entity) return;
    await client.entities[entity.name].delete(id);
    setRecs((r) => ({ ...r, [entity.name]: (r[entity.name] || []).filter((x) => x.id !== id) }));
  }

  function fieldInput(f: EntityField) {
    const v = form[f.name];
    const set = (val: unknown) => setForm((s) => ({ ...s, [f.name]: val }));
    if (f.type === "enum") return <select value={String(v ?? "")} onChange={(e) => set(e.target.value)}><option value="">—</option>{(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    if (f.type === "reference") { const target = f.reference_entity || ""; return <select value={String(v ?? "")} onChange={(e) => set(e.target.value)}><option value="">—</option>{(recs[target] || []).map((r) => <option key={r.id} value={r.id}>{labelFor(target, r.id)}</option>)}</select>; }
    if (f.type === "boolean") return <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} style={{ width: "auto" }} />;
    if (f.type === "number") return <input type="number" value={String(v ?? "")} onChange={(e) => set(Number(e.target.value))} />;
    if (f.type === "text") return <textarea value={String(v ?? "")} onChange={(e) => set(e.target.value)} rows={2} style={{ width: "100%", background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }} />;
    const t = f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text";
    return <input type={t} value={String(v ?? "")} onChange={(e) => set(e.target.value)} />;
  }

  function cell(f: EntityField, r: Rec) {
    const v = r[f.name];
    if (f.type === "reference") return labelFor(f.reference_entity || "", v);
    if (f.type === "boolean") return v ? "✓" : "—";
    return v === undefined || v === null || v === "" ? "—" : String(v);
  }

  return (
    <div className="container stack">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>▶ {app?.name || "App"} <span className="muted" style={{ fontSize: 14 }}>live preview</span></h2>
        <div className="row" style={{ marginLeft: "auto", flexWrap: "wrap" }}>
          <Link to={`/apps/${appId}/dashboard`}><button>📊 Dashboard</button></Link>
          <Link to={`/apps/${appId}/code`}><button>{"</>"} Code</button></Link>
          <button onClick={() => void doExport()}>⬇ Export</button>
          <button onClick={() => void doSnapshot()}>⎙ Snapshot</button>
          <button className="primary" onClick={() => void doPublish()}>🌐 Publish</button>
          <Link to={`/apps/${appId}/agent`}><button>✨ Agent</button></Link>
          <Link to={`/apps/${appId}/editor`}><button>Data</button></Link>
        </div>
      </div>
      {pubUrl && <div className="card" style={{ background: "var(--panel-2)" }}>Published (read-only, no login): <a href={pubUrl} target="_blank" rel="noreferrer">{pubUrl}</a></div>}
      {app?.description && <div className="muted">{app.description}</div>}

      {entities.length === 0 ? (
        <div className="card">No data model yet. <Link to={`/apps/${appId}/agent`}>Build one with the agent →</Link></div>
      ) : (
        <>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {entities.map((e) => (
              <button key={e.name} className={e.name === active ? "primary" : ""} onClick={() => setActive(e.name)}>
                {e.name} <span className="badge" style={{ marginLeft: 6 }}>{(recs[e.name] || []).length}</span>
              </button>
            ))}
          </div>

          {entity && (
            <div className="card stack">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead><tr>{entity.fields.map((f) => <th key={f.name} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{f.name}</th>)}<th></th></tr></thead>
                  <tbody>
                    {(recs[entity.name] || []).map((r) => (
                      <tr key={r.id}>
                        {entity.fields.map((f) => <td key={f.name} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)" }}>{cell(f, r)}</td>)}
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)" }}><button onClick={() => void del(r.id)} style={{ padding: "2px 8px" }}>✕</button></td>
                      </tr>
                    ))}
                    {(recs[entity.name] || []).length === 0 && <tr><td colSpan={entity.fields.length + 1} className="muted" style={{ padding: 10 }}>No records yet.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="card" style={{ background: "var(--panel-2)" }}>
                <div className="row" style={{ marginBottom: 8 }}><strong>New {entity.name}</strong></div>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
                  {entity.fields.map((f) => (
                    <label key={f.name} className="stack" style={{ gap: 4 }}>
                      <span className="muted" style={{ fontSize: 12 }}>{f.name} <span style={{ opacity: .6 }}>{f.type}{f.options ? `(${f.options.join("/")})` : ""}{f.reference_entity ? `→${f.reference_entity}` : ""}</span></span>
                      {fieldInput(f)}
                    </label>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 10 }}><button className="primary" onClick={() => void addRecord()}>+ Create</button></div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
