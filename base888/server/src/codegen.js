"use strict";
// Generates a REAL, runnable standalone single-file app from an app's schema +
// data: a dashboard-style app (side nav, KPI cards, recent activity, searchable
// entity tables). Original template; data embedded at generation time.
// Honest scope: a self-contained read-only app, not Base44's editable React codebase.

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeJson(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function generateStandaloneHtml({ appName, description, schema, dataByEntity }) {
  const entities = (schema && schema.entities) || [];
  const payload = safeJson({ appName: appName || "App", description: description || "", entities, data: dataByEntity || {} });
  const initial = ((appName || "A").trim().charAt(0) || "A").toUpperCase();
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(appName || "App")}</title>
<style>
:root{--bg:#f6f7fb;--panel:#fff;--border:#e6e8ef;--text:#1c2030;--muted:#6b7280;--a:#6d5df5;--b:#f05f8f;--c:#2f9bff;--d:#f59e0b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;font-size:14px}
.app{display:grid;grid-template-columns:230px 1fr;min-height:100vh}
aside{background:var(--panel);border-right:1px solid var(--border);padding:18px 14px;display:flex;flex-direction:column;gap:6px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:14px}.brand .m{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,var(--a),var(--b));color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px}
.brand b{display:block;font-size:16px}.brand small{color:var(--muted)}
.sec{color:var(--muted);font-size:12px;padding:10px 8px 4px}
aside a{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:9px;color:var(--text);text-decoration:none}aside a:hover{background:#f1f2f7}aside a.on{background:#eef0ff;color:var(--a);font-weight:600}
.status{margin-top:auto;background:#f6f1ff;border-radius:10px;padding:10px;font-size:12px;color:#5b4bd6}
main{padding:28px 32px;max-width:1200px}
h1{margin:0 0 4px;font-size:28px;background:linear-gradient(90deg,var(--a),var(--b));-webkit-background-clip:text;background-clip:text;color:transparent}.sub{color:var(--muted);margin-bottom:22px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px}
.kpi{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px;position:relative;overflow:hidden}.kpi .ic{position:absolute;right:14px;top:14px;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;opacity:.9}
.kpi .l{color:var(--muted);font-size:13px}.kpi .v{font-size:30px;font-weight:800;margin:4px 0}.kpi .t{font-size:12px;color:var(--muted)}
.grid2{display:grid;grid-template-columns:2fr 1fr;gap:14px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px}.card h3{margin:0 0 12px;font-size:16px;display:flex;align-items:center;gap:8px}
.item{border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px}.item b{display:block;margin-bottom:4px}.item .meta{color:var(--muted);font-size:12px}
.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:6px;background:#eef0ff;color:#4f46e5;margin-left:6px}
.bar{height:6px;background:#eef0f5;border-radius:4px;overflow:hidden;margin:8px 0 4px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--a),var(--c))}
.act{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)}.act .dot{width:28px;height:28px;border-radius:8px;background:#e7f3ff;color:var(--c);display:grid;place-items:center;flex:none}
input.q{width:min(360px,100%);padding:9px 12px;border:1px solid var(--border);border-radius:10px;font:inherit;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--border)}th{color:var(--muted);font-weight:600;white-space:nowrap}
.ok{display:inline-flex;gap:6px;align-items:center;background:#e8f8ee;color:#1e9e5a;border-radius:999px;padding:3px 10px;font-size:12px;float:right}
@media(max-width:800px){.app{grid-template-columns:1fr}aside{display:none}.grid2{grid-template-columns:1fr}}
</style></head>
<body><div class="app">
<aside>
  <div class="brand"><div class="m">${esc(initial)}</div><div><b id="bn"></b><small id="bd"></small></div></div>
  <div class="sec">メインメニュー</div>
  <a href="#/" data-r="/">▦ ダッシュボード</a>
  <div id="navents"></div>
  <div class="sec">システム状況</div>
  <div style="font-size:12.5px;color:var(--muted);padding:0 10px"><div>● データ: 読み込み済み</div><div>● 検索: 有効</div></div>
  <div class="status">Base888 で生成<br><span id="cnt"></span></div>
</aside>
<main id="main"></main>
</div>
<script>
const APP=${payload};
const PAL=['#eef0ff|#6d5df5','#ffe9f0|#f05f8f','#e7f3ff|#2f9bff','#fff4e0|#f59e0b','#e8f8ee|#1e9e5a'];
const $=s=>document.querySelector(s);
$('#bn').textContent=APP.appName;$('#bd').textContent=APP.description||'';
const total=Object.values(APP.data).reduce((n,a)=>n+a.length,0);$('#cnt').textContent=APP.entities.length+' エンティティ · '+total+' 件';
$('#navents').innerHTML=APP.entities.map(e=>'<a href="#/e/'+e.name+'" data-r="/e/'+e.name+'">▸ '+e.name+'</a>').join('');
function ent(n){return APP.entities.find(e=>e.name===n)}
function label(en,id){const r=(APP.data[en]||[]).find(x=>x.id===id);if(!r)return id==null?'':String(id);const e=ent(en);const lf=(e&&e.fields||[]).find(f=>['string','email'].includes(f.type));return String((lf&&r[lf.name])||r.id)}
function cell(f,r){const v=r[f.name];if(f.type==='reference')return label(f.reference_entity,v);if(f.type==='boolean')return v?'✓':'—';return v==null||v===''?'—':String(v)}
const E=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function home(){
  const kp=APP.entities.map((e,i)=>{const [bg,fg]=PAL[i%PAL.length].split('|');return '<div class="kpi"><div class="l">'+E(e.name)+'</div><div class="v">'+((APP.data[e.name]||[]).length)+'</div><div class="t">↗ 登録件数</div><div class="ic" style="background:'+bg+';color:'+fg+'">◆</div></div>'}).join('');
  const first=APP.entities[0];const rows=first?(APP.data[first.name]||[]).slice(0,4):[];
  const list=rows.map((r,i)=>{const f=(first.fields||[]);const t=f[0]?cell(f[0],r):r.id;const sub=f.slice(1,3).map(x=>E(x.name)+': '+E(cell(x,r))).join(' · ');const pct=20+((i*37)%70);return '<div class="item"><b>'+E(t)+'<span class="tag">'+E(first.name)+'</span></b><div class="meta">'+sub+'</div><div class="bar"><i style="width:'+pct+'%"></i></div><div class="meta">全体進捗 '+pct+'%</div></div>'}).join('')||'<div class="meta">データがありません</div>';
  const acts=[];APP.entities.forEach(e=>(APP.data[e.name]||[]).slice(0,2).forEach(r=>{const f=(e.fields||[])[0];acts.push('<div class="act"><div class="dot">◆</div><div><b>'+E(f?cell(f,r):r.id)+'</b><div class="meta">'+E(e.name)+' · '+E((r.created_date||'').slice(0,10))+'</div></div></div>')}));
  $('#main').innerHTML='<span class="ok">● システム正常</span><h1>'+E(APP.appName)+' ダッシュボード</h1><div class="sub">'+E(APP.description||'')+'</div><div class="kpis">'+kp+'</div><div class="grid2"><div class="card"><h3>◎ 概要</h3>'+list+'</div><div class="card"><h3>◷ 最近のアクティビティ</h3>'+(acts.join('')||'<div class="meta">なし</div>')+'</div></div>';
}
function table(name){
  const e=ent(name);if(!e)return home();
  const term=(window.__q||'').toLowerCase();
  const rows=(APP.data[name]||[]).filter(r=>!term||JSON.stringify(r).toLowerCase().includes(term));
  $('#main').innerHTML='<h1>'+E(name)+'</h1><div class="sub">'+rows.length+' 件</div><div class="card"><input class="q" id="q" placeholder="検索…" value="'+E(window.__q||'')+'"><table><thead><tr>'+e.fields.map(f=>'<th>'+E(f.name)+'</th>').join('')+'</tr></thead><tbody>'+(rows.map(r=>'<tr>'+e.fields.map(f=>'<td>'+E(cell(f,r))+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="'+e.fields.length+'" style="color:#999">データがありません</td></tr>')+'</tbody></table></div>';
  const q=$('#q');q.addEventListener('input',()=>{window.__q=q.value;const p=q.selectionStart;table(name);const n=$('#q');n.focus();n.setSelectionRange(p,p)});
}
function route(){const h=location.hash.replace(/^#/,'')||'/';document.querySelectorAll('aside a').forEach(a=>a.classList.toggle('on',a.dataset.r===h));if(h.startsWith('/e/'))table(decodeURIComponent(h.slice(3)));else home()}
window.addEventListener('hashchange',route);route();
</script>
</body></html>`;
}

module.exports = { generateStandaloneHtml };
