import { type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { useMobile } from "@/hooks/useMobile";

// Reconstruction of Base44's app shell (topbar + content). On mobile the
// bottom tabs would be hidden by useHideNativeBottomTabs in the native wrapper.
export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const isMobile = useMobile();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">Base<span>888</span></Link>
        <nav className="row" style={{ gap: 14 }}>
          <Link to="/">{t("nav.dashboard")}</Link>
          <Link to="/settings">⚙ Settings</Link>
        </nav>
        <div style={{ marginLeft: "auto" }} className="row">
          {!isMobile && user && <span className="badge">{user.email}</span>}
          {user && (
            <button onClick={async () => { await logout(); navigate("/login"); }}>
              {t("nav.signOut")}
            </button>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
