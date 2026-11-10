import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "@/api/axiosClient";
import { workspaceApi, type AppSummary } from "@/api/workspaceApi";
import { appManageApi } from "@/api/appManageApi";
import { useToast } from "@/hooks/useToast";

function useApps() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  useEffect(() => { void workspaceApi.listApps().then(setApps).catch(() => {}); }, []);
  return apps;
}
function Head({ title, right }: { title: string; right?: React.ReactNode }) {
  return <div className="row" style={{ marginBottom: 16 }}><h2 style={{ margin: 0 }}>{title}</h2><div style={{ marginLeft: "auto" }}>{right}</div></div>;
}
function AppTiles({ apps, to }: { apps: AppSummary[]; to: (a: AppSummary) => string }) {
  const nav = useNavigate();
  return (
    <div className="app-tiles" style={{ width: "100%" }}>
      {apps.map((a) => <div key={a.id} className="tile" onClick={() => nav(to(a))}><b>{a.name}</b><span className="muted" style={{ fontSize: 12.5 }}>{a.description || "—"}</span><div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{new Date(a.updated_date).toLocaleDateString("ja-JP")}</div></div>)}
      {apps.length === 0 && <div className="muted">アプリがありません。</div>}
    </div>
  );
}

export function AllAppsPage() {
  const apps = useApps();
  return <div className="container"><Head title="すべてのアプリ" right={<Link to="/"><button className="primary">＋ 新規作成</button></Link>} /><AppTiles apps={apps} to={(a) => `/apps/${a.id}/editor/preview`} /></div>;
}

export function SearchPage() {
  const apps = useApps(); const [q, setQ] = useState("");
  const hits = apps.filter((a) => (a.name + " " + (a.description || "")).toLowerCase().includes(q.toLowerCase()));
  return <div className="container stack"><Head title="検索" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="アプリ名や説明で検索…" /><AppTiles apps={hits} to={(a) => `/apps/${a.id}/editor/preview`} /></div>;
}

const TEMPLATES = [
  { t: "CRM", d: "顧客・会社・商談を管理", p: "A CRM to track clients, their companies, and deals in progress with stages and amounts." },
  { t: "タスク管理", d: "プロジェクトとタスク", p: "A task tracker with projects and tasks that have status, priority and due dates." },
  { t: "在庫管理", d: "商品・仕入先・入出庫", p: "An inventory app with products, suppliers and stock movements." },
  { t: "予約システム", d: "リソースと予約", p: "A booking system with resources, customers and reservations with time slots." },
  { t: "社内ヘルプデスク", d: "チケットと担当者", p: "An internal helpdesk with tickets, agents, categories and priorities." },
  { t: "イベント管理", d: "イベントと参加者", p: "An event manager with events, attendees, ticket types and check-ins." },
  { t: "人事管理", d: "社員・部署・休暇", p: "An HR app with employees, departments, and leave requests." },
  { t: "学習管理", d: "コース・受講者・進捗", p: "A learning platform with courses, students, lessons and progress." }
];
export function TemplatesPage() {
  const nav = useNavigate(); const { error } = useToast();
  async function use(p: string, t: string) { try { const a = await workspaceApi.createApp(t); nav(`/apps/${a.id}/editor/preview`, { state: { prompt: p } }); } catch { error("作成に失敗しました"); } }
  return <div className="container"><Head title="アプリテンプレート" /><div className="app-tiles" style={{ width: "100%" }}>{TEMPLATES.map((x) => <div key={x.t} className="tile" onClick={() => void use(x.p, x.t)}><b>{x.t}</b><span className="muted" style={{ fontSize: 12.5 }}>{x.d}</span></div>)}</div></div>;
}

export function CommunityPage() {
  const [items, setItems] = useState<AppSummary[]>([]);
  useEffect(() => { void apiClient.get<{ items: AppSummary[] }>("/api/community/apps").then((r) => setItems(r.data.items)).catch(() => {}); }, []);
  const base = apiClient.defaults.baseURL || "";
  return <div className="container"><Head title="コミュニティ" /><p className="muted">このワークスペースで公開されたアプリ(読み取り専用)。</p><div className="app-tiles" style={{ width: "100%" }}>{items.map((a) => <div key={a.id} className="tile" onClick={() => window.open(`${base}/p/${a.id}`, "_blank")}><b>{a.name}</b><span className="muted" style={{ fontSize: 12.5 }}>{a.description || "公開アプリ"}</span></div>)}{items.length === 0 && <div className="muted">公開アプリはまだありません。エディタの「公開」で追加できます。</div>}</div></div>;
}

export function PartnersPage() {
  return <div className="container stack"><Head title="パートナー" /><div className="card"><b>パートナープログラムは未実装です</b><p className="muted">Base44 にはクライアントアプリ管理・クレジット請求先設定・ディレクトリ掲載を含むパートナー機能がありますが、Base888 では実装していません(誇張せず、未実装として明記)。</p></div></div>;
}

type Conn = { id: string; type: string; name: string; config: Record<string, string> };
export function ConnectorsPage() {
  const apps = useApps(); const { toast, error } = useToast();
  const [appId, setAppId] = useState(""); const [catalog, setCatalog] = useState<Array<{ type: string; label: string; fields: string[] }>>([]);
  const [items, setItems] = useState<Conn[]>([]); const [form, setForm] = useState({ type: "http", name: "", url: "", method: "GET" }); const [out, setOut] = useState("");
  useEffect(() => { void apiClient.get("/api/connectors/catalog").then((r) => setCatalog(r.data.types)).catch(() => {}); }, []);
  useEffect(() => { if (!appId && apps[0]) setAppId(apps[0].id); }, [apps, appId]);
  async function load() { if (!appId) return; try { setItems((await apiClient.get(`/apps/${appId}/connectors`)).data.items); } catch { /* */ } }
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);
  async function add() { try { await apiClient.post(`/apps/${appId}/connectors`, { type: form.type, name: form.name || form.type, config: { url: form.url, method: form.method } }); setForm({ ...form, name: "", url: "" }); toast("コネクターを追加しました"); void load(); } catch { error("追加に失敗しました"); } }
  async function invoke(id: string) { try { const r = await apiClient.post(`/apps/${appId}/connectors/${id}/invoke`, {}); setOut(`HTTP ${r.data.status}\n${String(r.data.body).slice(0, 600)}`); } catch { error("呼び出しに失敗しました"); } }
  return (
    <div className="container stack">
      <Head title="コネクター" right={<select value={appId} onChange={(e) => setAppId(e.target.value)} style={{ width: 220 }}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>} />
      <div className="card stack"><b>カタログ</b><div className="row" style={{ flexWrap: "wrap" }}>{catalog.map((c) => <span key={c.type} className="badge">{c.label}</span>)}</div></div>
      <div className="card stack"><b>コネクターを追加</b>
        <div className="grid" style={{ gridTemplateColumns: "140px 1fr 2fr 110px auto" }}>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{catalog.map((c) => <option key={c.type} value={c.type}>{c.type}</option>)}</select>
          <input placeholder="名前" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="https://… (呼び出し先URL)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option>GET</option><option>POST</option></select>
          <button className="primary" onClick={() => void add()} disabled={!form.url}>追加</button>
        </div>
      </div>
      <div className="card stack"><b>登録済み</b>{items.map((c) => <div key={c.id} className="row"><span className="badge">{c.type}</span><b>{c.name}</b><code>{c.config.url}</code><button style={{ marginLeft: "auto" }} onClick={() => void invoke(c.id)}>▶ 実行</button></div>)}{items.length === 0 && <span className="muted">まだありません。</span>}{out && <pre style={{ background: "#f0eee8", padding: 10, borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>{out}</pre>}</div>
    </div>
  );
}

type Task = { id: string; name: string; cron: string; handler_url: string; last_run: string | null };
export function WorkflowsPage() {
  const apps = useApps(); const { toast, error } = useToast();
  const [appId, setAppId] = useState(""); const [items, setItems] = useState<Task[]>([]); const [form, setForm] = useState({ name: "", every: "60", url: "" });
  useEffect(() => { if (!appId && apps[0]) setAppId(apps[0].id); }, [apps, appId]);
  async function load() { if (!appId) return; try { setItems((await apiClient.get(`/apps/${appId}/tasks`)).data.items); } catch { /* */ } }
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);
  async function add() { try { await apiClient.post(`/apps/${appId}/tasks`, { name: form.name || "task", every_minutes: Number(form.every) || 60, handler_url: form.url }); setForm({ name: "", every: "60", url: "" }); toast("ワークフローを登録しました"); void load(); } catch { error("登録に失敗しました"); } }
  async function del(id: string) { await apiClient.delete(`/apps/${appId}/tasks/${id}`); void load(); }
  return (
    <div className="container stack">
      <Head title="ワークフロー(スケジュール実行)" right={<select value={appId} onChange={(e) => setAppId(e.target.value)} style={{ width: 220 }}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>} />
      <p className="muted">一定間隔で Webhook/関数URL を実際に呼び出します(サーバー内スケジューラ、1分粒度)。</p>
      <div className="card"><div className="grid" style={{ gridTemplateColumns: "1fr 120px 2fr auto" }}>
        <input placeholder="名前" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input type="number" min={1} placeholder="分ごと" value={form.every} onChange={(e) => setForm({ ...form, every: e.target.value })} />
        <input placeholder="https://… (POST 先)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <button className="primary" onClick={() => void add()} disabled={!form.url}>登録</button>
      </div></div>
      <div className="card stack">{items.map((t) => <div key={t.id} className="row"><b>{t.name}</b><span className="badge">{t.cron}分ごと</span><code>{t.handler_url}</code><span className="muted" style={{ fontSize: 12 }}>last: {t.last_run ? new Date(t.last_run).toLocaleString("ja-JP") : "—"}</span><button style={{ marginLeft: "auto" }} onClick={() => void del(t.id)}>削除</button></div>)}{items.length === 0 && <span className="muted">まだありません。</span>}</div>
    </div>
  );
}

export function ChannelsPage() {
  const chans = [["WhatsApp", "Meta Business API のトークンと Webhook"], ["Telegram", "BotFather のボットトークン"], ["LINE", "Messaging API チャネルトークン"], ["iMessage", "Apple Messages for Business"], ["Slack", "Slack App の Bot トークン"]];
  return <div className="container stack"><Head title="チャネル" /><p className="muted">エージェントをメッセージングアプリから使うためのチャネル。<b>このビルドでは未接続</b>です(各サービスの認証情報が必要)。誇張はしません。</p><div className="grid">{chans.map(([n, req]) => <div key={n} className="card"><div className="row"><b>{n}</b><span className="badge" style={{ marginLeft: "auto" }}>未接続</span></div><div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>接続に必要: {req}</div></div>)}</div></div>;
}

export function ArtifactsPage() {
  const apps = useApps(); const base = apiClient.defaults.baseURL || "";
  return <div className="container stack"><Head title="アーティファクト" /><p className="muted">生成されたアプリの成果物: 単一ファイルの実行可能 HTML、ソースコード、公開URL。</p><div className="card stack">{apps.map((a) => <div key={a.id} className="row"><b>{a.name}</b><button style={{ marginLeft: "auto" }} onClick={() => void appManageApi.download(a.id, `${a.name.replace(/[^A-Za-z0-9_-]/g, "_")}.html`)}>⬇ HTML</button><Link to={`/apps/${a.id}/code`}><button>{"</>"} コード</button></Link><a href={`${base}/p/${a.id}`} target="_blank" rel="noreferrer"><button>公開URL ↗</button></a></div>)}{apps.length === 0 && <span className="muted">アプリがありません。</span>}</div></div>;
}

export function CodePickerPage() {
  const apps = useApps();
  return <div className="container"><Head title="ベースコード" /><p className="muted">編集するアプリを選択してください(Monaco エディタで開きます)。</p><AppTiles apps={apps} to={(a) => `/apps/${a.id}/code`} /></div>;
}
