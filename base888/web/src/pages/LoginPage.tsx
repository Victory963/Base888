import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { authApi, type OAuthProvider } from "@/api/authApi";
import { appConfig, isTurnstileEnabled } from "@/config/appConfig";
import { useToast } from "@/hooks/useToast";

const PROVIDERS: OAuthProvider[] = ["google", "github", "apple", "oidc"];

// Reconstruction of Base44's login surface: password + OAuth/SSO providers,
// optional Cloudflare Turnstile gate.
export function LoginPage() {
  const { login, register } = useAuth();
  const { t } = useTranslation();
  const { error } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@base888.local");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const turnstile = isTurnstileEnabled ? "dev-turnstile-token" : undefined;
    try {
      if (mode === "register") await register(email, fullName || email.split("@")[0], password, turnstile);
      else await login(email, password, turnstile);
      navigate("/");
    } catch {
      error(mode === "register" ? "Sign-up failed" : "Sign-in failed", "Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="card login-card stack">
        <div className="brand" style={{ fontSize: 22 }}>Base<span>888</span></div>
        <div className="muted">{t("app.tagline")}</div>
        <form className="stack" onSubmit={onSubmit}>
          <label className="stack">
            <span className="muted">{t("auth.email")}</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" />
          </label>
          {mode === "register" && (
            <label className="stack">
              <span className="muted">Name</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} type="text" autoComplete="name" />
            </label>
          )}
          <label className="stack">
            <span className="muted">{t("auth.password")}</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} />
          </label>
          <button className="primary" disabled={busy} type="submit">
            {mode === "register" ? "Create account" : t("auth.signIn")}
          </button>
        </form>
        <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} style={{ background: "transparent", border: "none", color: "var(--accent)" }}>
          {mode === "login" ? "Need an account? Create one" : "Have an account? Sign in"}
        </button>
        <div className="muted" style={{ textAlign: "center", fontSize: 13 }}>— or —</div>
        <div className="stack">
          {PROVIDERS.map((p) => (
            <a key={p} href={authApi.oauthStartUrl(p)}>
              <button style={{ width: "100%" }} type="button">
                {t("auth.continueWith", { provider: p.toUpperCase() })}
              </button>
            </a>
          ))}
        </div>
        {isTurnstileEnabled && (
          <div className="badge" style={{ alignSelf: "center" }}>
            Turnstile: {appConfig.TURNSTILE_SITE_KEY}
          </div>
        )}
      </div>
    </div>
  );
}
