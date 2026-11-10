import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { workspaceApi, type AppSummary } from "@/api/workspaceApi";

// Builder app shell: left sidebar with App / Agent modes, nav, recent items,
// upgrade card and workspace footer. Original Base888 branding.
export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const loc = useLocation();
  const nav = useNavigate();
  const [mode, setMode] = useState<"app" | "agent">(loc.pathname.startsWith("/superagent") ? "agent" : "app");
  const [recent, setRecent] = useState<AppSummary[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { void workspaceApi.listApps().then((a) => setRecent(a.slice(0, 6))).catch(() => {}); }, [loc.pathname]);
  useEffect(() => { setMode(loc.pathname.startsWith("/superagent") ? "agent" : "app"); }, [loc.pathname]);

  const ws = workspaces.find((w) => w.id === activeWorkspaceId);
  const initials = (user?.full_name || user?.email || "U").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "U";

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sb-head">
          <Link to="/" className="logo"><span className="logo-mark" />Base888</Link>
          <button className="ghost iconbtn" onClick={() => setCollapsed(true)} title="サイドバーを閉じる">▣</button>
        </div>
        <div className="mode-tabs">
          <button className={mode === "app" ? "active" : ""} onClick={() => { setMode("app"); nav("/"); }}>⊞ アプリ</button>
          <button className={mode === "agent" ? "active" : ""} onClick={() => { setMode("agent"); nav("/superagent/new"); }}>◎ エージェント</button>
        </div>

        {mode === "app" ? (
          <>
            <nav className="nav">
              <NavLink to="/" end><span className="ico">⌂</span>ホーム</NavLink>
              <NavLink to="/search"><span className="ico">⌕</span>検索</NavLink>
              <NavLink to="/apps"><span className="ico">⊞</span>すべてのアプリ</NavLink>
              <NavLink to="/code"><span className="ico">⌨</span>ベースコード</NavLink>
              <NavLink to="/templates"><span className="ico">▦</span>アプリテンプレート</NavLink>
              <NavLink to="/community"><span className="ico">✦</span>コミュニティ<span className="chev">›</span></NavLink>
              <NavLink to="/connectors"><span className="ico">⚲</span>コネクター</NavLink>
              <NavLink to="/partners"><span className="ico">◈</span>パートナー<span className="chev">›</span></NavLink>
            </nav>
            <div className="sb-section"><span>お気に入り</span><span>›</span></div>
            <div className="sb-section"><span>最近の項目</span><span>⌄</span></div>
            <div className="recent">
              {recent.map((a) => <Link key={a.id} to={`/apps/${a.id}/editor/preview`}>{a.name}</Link>)}
              <Link to="/apps" style={{ color: "var(--muted)", textDecoration: "underline" }}>すべて表示</Link>
            </div>
          </>
        ) : (
          <>
            <nav className="nav">
              <NavLink to="/superagent/new"><span className="ico">＋</span>新しい会話</NavLink>
              <NavLink to="/workflows"><span className="ico">⚡</span>ワークフロー</NavLink>
              <NavLink to="/connectors"><span className="ico">⚲</span>プラグイン</NavLink>
              <NavLink to="/channels"><span className="ico">◌</span>チャネル</NavLink>
              <NavLink to="/artifacts"><span className="ico">▭</span>アーティファクト</NavLink>
              <NavLink to="/settings"><span className="ico">⚙</span>エージェント設定</NavLink>
            </nav>
            <div className="sb-section"><span>会話 ⌄</span><span>＋</span></div>
            <div className="recent">
              {recent.map((a) => <Link key={a.id} to={`/superagent/app/${a.id}`}>◎ {a.name}</Link>)}
            </div>
          </>
        )}

        <div className="sb-foot">
          <div className="upgrade">
            <div><b>プランをアップグレード</b><span className="muted">アプリをもっと活用しましょう</span></div>
            <span style={{ color: "var(--accent)" }}>♕</span>
          </div>
          <div className="ws">
            <span className="avatar">{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws?.name || "My Workspace"}</div>
              <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.full_name || user?.email}</div>
            </div>
            <button className="ghost iconbtn" style={{ marginLeft: "auto" }} onClick={() => void logout().then(() => nav("/login"))} title="サインアウト">⏻</button>
          </div>
        </div>
      </aside>

      <div className="main">
        {collapsed && <button className="ghost iconbtn" style={{ position: "fixed", left: 8, top: 8, zIndex: 5 }} onClick={() => setCollapsed(false)} title="サイドバーを開く">▣</button>}
        {children}
      </div>
    </div>
  );
}
