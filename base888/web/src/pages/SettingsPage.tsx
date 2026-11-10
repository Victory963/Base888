import { useEffect, useState } from "react";
import { accountApi } from "@/api/accountApi";
import { useToast } from "@/hooks/useToast";

// Account settings: credits, available models, and real TOTP 2FA.
export function SettingsPage() {
  const { error, toast } = useToast();
  const [credits, setCredits] = useState<number | null>(null);
  const [models, setModels] = useState<{ models: string[]; current: string; provider: string } | null>(null);
  const [mfaOn, setMfaOn] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [code, setCode] = useState("");

  async function refresh() {
    try {
      setCredits(await accountApi.credits());
      setModels(await accountApi.models());
      setMfaOn(await accountApi.mfaStatus());
    } catch { error("Could not load settings"); }
  }
  useEffect(() => { void refresh(); }, []);

  async function beginSetup() { try { setSetup(await accountApi.mfaSetup()); } catch { error("MFA setup failed"); } }
  async function enable() { try { await accountApi.mfaEnable(code); setSetup(null); setCode(""); toast("2FA enabled"); void refresh(); } catch { error("Invalid code"); } }
  async function disable() { try { await accountApi.mfaDisable(code); setCode(""); toast("2FA disabled"); void refresh(); } catch { error("Invalid code"); } }

  return (
    <div className="container stack" style={{ maxWidth: 760 }}>
      <h2 style={{ margin: 0 }}>⚙ Settings</h2>

      <div className="card stack">
        <strong>Credits</strong>
        <div style={{ fontSize: 30, fontWeight: 700 }}>{credits ?? "…"}</div>
        <div className="muted" style={{ fontSize: 13 }}>Simulated balance — each AI generation costs 1 credit. No real payment is processed.</div>
      </div>

      <div className="card stack">
        <strong>Models</strong>
        <div className="muted" style={{ fontSize: 13 }}>Provider: {models?.provider || "…"} · current: <code>{models?.current}</code></div>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {(models?.models || []).map((m) => <span key={m} className="badge" style={m === models?.current ? { color: "var(--accent-2)", borderColor: "var(--accent-2)" } : undefined}>{m}</span>)}
          {models && models.models.length === 0 && <span className="muted">No model list from provider.</span>}
        </div>
      </div>

      <div className="card stack">
        <strong>Two-factor authentication (TOTP)</strong>
        <div className="row"><span className="badge">{mfaOn == null ? "…" : mfaOn ? "enabled" : "disabled"}</span></div>
        {!mfaOn && !setup && <div><button className="primary" onClick={() => void beginSetup()}>Set up 2FA</button></div>}
        {setup && (
          <div className="stack">
            <div className="muted" style={{ fontSize: 13 }}>Add this secret to an authenticator app (TOTP), then enter the 6-digit code:</div>
            <code style={{ wordBreak: "break-all" }}>{setup.secret}</code>
            <code style={{ wordBreak: "break-all", fontSize: 12 }}>{setup.otpauth_url}</code>
            <div className="row"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" style={{ maxWidth: 160 }} /><button className="primary" onClick={() => void enable()}>Enable</button></div>
          </div>
        )}
        {mfaOn && (
          <div className="row"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" style={{ maxWidth: 160 }} /><button onClick={() => void disable()}>Disable 2FA</button></div>
        )}
      </div>
    </div>
  );
}
