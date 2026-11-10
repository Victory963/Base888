import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { appManageApi } from "@/api/appManageApi";
import { useToast } from "@/hooks/useToast";

// Monaco code editor for the generated app. The AI generates a self-contained
// single-file app; you edit its real source here and preview/publish/export it.
// Honest scope: a single-file HTML/JS app, not Base44's multi-file React project.
export function CodeEditorPage() {
  const { appId = "" } = useParams();
  const { toast, error } = useToast();
  const [code, setCode] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        let { code: c, generated } = await appManageApi.getCode(appId);
        if (!c || generated) c = (await appManageApi.generateCode(appId)).code;
        setCode(c); setPreview(c); loaded.current = true;
      } catch { error("Could not load code"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function save() { setBusy(true); try { await appManageApi.putCode(appId, code); setDirty(false); setPreview(code); toast("Saved"); } catch { error("Save failed"); } finally { setBusy(false); } }
  async function regenerate() { setBusy(true); try { const r = await appManageApi.generateCode(appId); setCode(r.code); setPreview(r.code); setDirty(false); toast("Regenerated from schema"); } catch { error("Regenerate failed"); } finally { setBusy(false); } }

  return (
    <div className="stack" style={{ padding: 16, height: "calc(100vh - 54px)", gap: 10 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{"</>"} Code editor <code>{appId}</code></h2>
        <div className="row" style={{ marginLeft: "auto", flexWrap: "wrap" }}>
          <button onClick={() => setPreview(code)}>▶ Run</button>
          <button onClick={() => void regenerate()} disabled={busy}>↻ Regenerate</button>
          <button className="primary" onClick={() => void save()} disabled={busy || !dirty}>{dirty ? "Save*" : "Saved"}</button>
          <Link to={`/apps/${appId}/preview`}><button>Preview</button></Link>
          <Link to={`/apps/${appId}/agent`}><button>✨ Agent</button></Link>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1, minHeight: 0 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <Editor
            height="100%" defaultLanguage="html" value={code} theme="vs-dark"
            onChange={(v) => { setCode(v ?? ""); setDirty(true); }}
            options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", scrollBeyondLastLine: false }}
          />
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
          <iframe title="preview" srcDoc={preview} sandbox="allow-scripts" style={{ width: "100%", height: "100%", border: 0, background: "#fff" }} />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>Left: the generated app's real source (editable Monaco). Right: live preview of what you Run/Save. Save feeds Publish & Export too.</div>
    </div>
  );
}
