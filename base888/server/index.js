"use strict";
/*
 * Base888 real backend.
 *
 * SQLite persistence, scrypt+JWT auth with rotating refresh tokens, real
 * per-workspace authorization, multipart file storage, and real LLM/email
 * integrations (configured via environment). Reconstructs the Base44-style API
 * surface documented in ../../analysis/REVERSE-ENGINEERING-REPORT.md.
 */
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Busboy = require("busboy");

const cfg = require("./src/config");
const { q, uid, now, seed } = require("./src/db");
const A = require("./src/auth");
const { invokeLLM, generateImage, IntegrationError } = require("./src/llm");
const { sendEmail } = require("./src/mailer");
const { startWs } = require("./src/ws");
const builder = require("./src/builder");
const agent = require("./src/agent");
const schema = require("./src/schema");
const codegen = require("./src/codegen");
const totp = require("./src/totp");
const github = require("./src/github");

seed();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
// Baseline security headers (manual; no extra dependency).
app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "no-referrer");
  res.set("Cross-Origin-Resource-Policy", "same-site");
  if (process.env.ENABLE_HSTS === "true") res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(cors({
  origin: [cfg.WEB_ORIGIN, "http://localhost:5888", "http://127.0.0.1:5888"],
  credentials: true,
  exposedHeaders: ["X-Request-ID", "X-Error-Code"]
}));
app.use(cookieParser());
app.use((req, res, next) => { res.set("X-Request-ID", req.get("X-Request-ID") || uid("rid")); next(); });

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function setCookies(res, refresh) {
  res.cookie("b888_rt", refresh, { httpOnly: true, sameSite: "lax", path: "/", maxAge: cfg.REFRESH_TTL * 1000 });
}
// Honest simulated credits (no real payment): decrement on generation actions.
function charge(userId, n = 1) {
  return q.run("UPDATE users SET credits = credits - ? WHERE id=? AND credits >= ?", n, userId, n).changes > 0;
}
async function verifyTurnstile(token, ip) {
  if (!cfg.TURNSTILE_SECRET) return true;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: cfg.TURNSTILE_SECRET, response: token || "", remoteip: ip || "" })
  });
  const data = await res.json().catch(() => ({ success: false }));
  return !!data.success;
}

// Lightweight in-memory rate limiter for auth endpoints (per IP + email).
const rlBuckets = new Map();
function authLimiter(req, res, next) {
  const key = `${req.ip}|${(req.body && req.body.email) || ""}`;
  const nowMs = Date.now();
  const windowMs = 15 * 60 * 1000;
  const b = rlBuckets.get(key);
  if (!b || nowMs > b.resetAt) { rlBuckets.set(key, { count: 1, resetAt: nowMs + windowMs }); return next(); }
  b.count += 1;
  if (b.count > 10) {
    res.set("Retry-After", String(Math.ceil((b.resetAt - nowMs) / 1000)));
    res.set("X-Error-Code", "rate_limited");
    return res.status(429).json({ error: "rate_limited" });
  }
  next();
}

// ---- runtime config (served to index.html, like Base44) --------------------
app.get("/api/frontend-config.js", (_req, res) => {
  const flags = Object.fromEntries(q.all("SELECT key,enabled FROM feature_flags").map((f) => [f.key, !!f.enabled]));
  const cfgObj = {
    BACKEND_URL: "", SDK_BACKEND_URL: "", WS_BACKEND_URL: `ws://localhost:${cfg.WS_PORT}`,
    PLATFORM_URL: cfg.WEB_ORIGIN, APPS_BASE_DOMAIN: "base888.local",
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY || "", TURNSTILE_ENABLED: cfg.TURNSTILE_SECRET ? "true" : "false",
    GOOGLE_CLIENT_ID: cfg.GOOGLE_CLIENT_ID, APP_FLAVOR: "platform", GIT_SHA: process.env.GIT_SHA || "dev",
    PRE_AUTH_FLAGS: flags, PRE_AUTH_EXPERIMENTS: { visitor_id: "server", assignments: {}, overrides: {} }
  };
  res.type("application/javascript").send(`window.__APP_CONFIG__ = ${JSON.stringify(cfgObj)};`);
});

// JSON body parser for the rest (multipart routes read the stream directly).
app.use(express.json({ limit: "4mb" }));

// ---- auth ------------------------------------------------------------------
function createUserWithWorkspace(email, fullName, password) {
  const { hash, salt } = A.hashPassword(password);
  const userId = uid("usr");
  q.run("INSERT INTO users (id,email,full_name,role,pw_hash,pw_salt,created_date) VALUES (?,?,?,?,?,?,?)",
    userId, email, fullName || email.split("@")[0], "user", hash, salt, now());
  const wsId = uid("ws");
  q.run("INSERT INTO workspaces (id,name,owner_id,created_date) VALUES (?,?,?,?)", wsId, "My Workspace", userId, now());
  q.run("INSERT INTO workspace_members (workspace_id,user_id,role) VALUES (?,?,?)", wsId, userId, "owner");
  return q.get("SELECT id,email,full_name,role,created_date FROM users WHERE id=?", userId);
}

app.post("/auth/register", authLimiter, asyncH(async (req, res) => {
  const { email, full_name, password, turnstile_token } = req.body || {};
  if (!email || !password) { res.set("X-Error-Code", "bad_request"); return res.status(400).json({ error: "email and password required" }); }
  if (!(await verifyTurnstile(turnstile_token, req.ip))) { res.set("X-Error-Code", "turnstile_failed"); return res.status(403).json({ error: "turnstile_failed" }); }
  if (q.get("SELECT 1 AS x FROM users WHERE email=?", email)) { res.set("X-Error-Code", "email_taken"); return res.status(409).json({ error: "email_taken" }); }
  const user = createUserWithWorkspace(email, full_name, password);
  const access = A.signAccess(user.id); setCookies(res, A.issueRefresh(user.id));
  res.status(201).json({ access_token: access, user });
}));

app.post("/auth/login", authLimiter, asyncH(async (req, res) => {
  const { email, password, turnstile_token } = req.body || {};
  if (!(await verifyTurnstile(turnstile_token, req.ip))) { res.set("X-Error-Code", "turnstile_failed"); return res.status(403).json({ error: "turnstile_failed" }); }
  const row = q.get("SELECT * FROM users WHERE email = ?", email);
  if (!row || !A.verifyPassword(password || "", row.pw_hash, row.pw_salt)) {
    res.set("X-Error-Code", "invalid_credentials"); return res.status(401).json({ error: "invalid_credentials" });
  }
  if (row.mfa_enabled) {
    const code = req.body && req.body.mfa_code;
    if (!code) { res.set("X-Error-Code", "mfa_required"); return res.status(401).json({ error: "mfa_required" }); }
    if (!totp.verify(row.mfa_secret, code)) { res.set("X-Error-Code", "mfa_invalid"); return res.status(401).json({ error: "mfa_invalid" }); }
  }
  const access = A.signAccess(row.id); setCookies(res, A.issueRefresh(row.id));
  res.json({ access_token: access, user: { id: row.id, email: row.email, full_name: row.full_name, role: row.role, created_date: row.created_date } });
}));

app.post("/auth/refresh", (req, res) => {
  const userId = A.consumeRefresh(req.cookies?.b888_rt);
  if (!userId) { res.set("X-Error-Code", "refresh_invalid"); return res.status(401).json({ error: "refresh_invalid" }); }
  setCookies(res, A.issueRefresh(userId)); // rotate
  res.json({ access_token: A.signAccess(userId) });
});

app.get("/api/me", A.requireAuth, (req, res) => res.json(req.user));
app.get("/auth/sso/my-tokens", A.requireAuth, (req, res) => {
  const tokens = q.all("SELECT id, created_date, expires_at, revoked FROM refresh_tokens WHERE user_id = ? ORDER BY created_date DESC", req.user.id);
  res.json({ tokens });
});
app.post("/api/auth/oidc/logout", A.requireAuth, (req, res) => { A.revokeAllRefresh(req.user.id); res.clearCookie("b888_rt", { path: "/" }); res.json({ ok: true }); });

// Real TOTP 2FA
app.get("/auth/mfa/status", A.requireAuth, (req, res) => {
  const u = q.get("SELECT mfa_enabled FROM users WHERE id=?", req.user.id);
  res.json({ enabled: !!(u && u.mfa_enabled) });
});
app.post("/auth/mfa/setup", A.requireAuth, (req, res) => {
  const secret = totp.generateSecret();
  q.run("UPDATE users SET mfa_secret=?, mfa_enabled=0 WHERE id=?", secret, req.user.id);
  res.json({ secret, otpauth_url: totp.otpauthUrl(secret, req.user.email) });
});
app.post("/auth/mfa/enable", A.requireAuth, (req, res) => {
  const u = q.get("SELECT mfa_secret FROM users WHERE id=?", req.user.id);
  if (!u || !u.mfa_secret || !totp.verify(u.mfa_secret, req.body && req.body.code)) { res.set("X-Error-Code", "mfa_invalid"); return res.status(400).json({ error: "mfa_invalid" }); }
  q.run("UPDATE users SET mfa_enabled=1 WHERE id=?", req.user.id);
  res.json({ enabled: true });
});
app.post("/auth/mfa/disable", A.requireAuth, (req, res) => {
  const u = q.get("SELECT mfa_secret FROM users WHERE id=?", req.user.id);
  if (!u || !totp.verify(u.mfa_secret, req.body && req.body.code)) { res.set("X-Error-Code", "mfa_invalid"); return res.status(400).json({ error: "mfa_invalid" }); }
  q.run("UPDATE users SET mfa_secret=NULL, mfa_enabled=0 WHERE id=?", req.user.id);
  res.json({ enabled: false });
});
app.get("/auth/:provider/login", (req, res) => {
  res.set("X-Error-Code", "oauth_not_configured");
  res.status(501).json({ error: "oauth_not_configured", provider: req.params.provider, hint: "Set provider client id/secret to enable real OAuth." });
});

// ---- system ----------------------------------------------------------------
app.get("/api/feature-flags", (_req, res) => {
  const flags = Object.fromEntries(q.all("SELECT key,enabled FROM feature_flags").map((f) => [f.key, !!f.enabled]));
  res.json({ flags });
});
app.get("/api/consent/config", (_req, res) => res.json({ required: !!cfg.TURNSTILE_SECRET, version: 1 }));
app.post("/api/consent/receipts", (req, res) => {
  const user = A.currentUser(req);
  q.run("INSERT INTO consent_receipts (id,user_id,data,created_date) VALUES (?,?,?,?)", uid("cr"), user ? user.id : null, JSON.stringify(req.body || {}), now());
  res.status(201).json({ ok: true });
});
app.post("/api/v2/rum", (_req, res) => res.status(204).end());
app.get("/api/credits", A.requireAuth, (req, res) => {
  const u = q.get("SELECT credits FROM users WHERE id=?", req.user.id);
  res.json({ credits: u ? u.credits : 0 });
});
app.get("/api/models", A.requireAuth, asyncH(async (req, res) => {
  let models = [];
  try {
    const tagsUrl = (cfg.LLM.baseUrl || "http://localhost:11434/v1").replace(/\/v1\/?$/, "") + "/api/tags";
    const r = await fetch(tagsUrl);
    if (r.ok) { const d = await r.json(); models = (d.models || []).map((m) => m.name); }
  } catch { /* provider may not expose a tag list */ }
  res.json({ models, current: cfg.LLM.model, provider: cfg.LLM.provider });
}));
// Community: publicly published apps (read-only gallery)
app.get("/api/community/apps", (_req, res) => {
  res.json({ items: q.all("SELECT id,name,description,updated_date,flavor FROM apps WHERE visibility='public' ORDER BY updated_date DESC LIMIT 60") });
});
app.get("/api/connectors/catalog", A.requireAuth, (_req, res) => res.json({ types: [
  { type: "http", label: "HTTP request", fields: ["url", "method", "headers"] },
  { type: "webhook", label: "Outgoing webhook (POST)", fields: ["url"] },
  { type: "rest_api", label: "REST API (GET + key header)", fields: ["base_url", "api_key_header", "api_key"] }
] }));
// Real Stripe Checkout for credit top-ups — gated on STRIPE_SECRET_KEY (no fake charges)
app.post("/api/billing/checkout", A.requireAuth, asyncH(async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) { res.set("X-Error-Code", "billing_not_configured"); return res.status(503).json({ error: "billing_not_configured", hint: "Set STRIPE_SECRET_KEY (test mode) to enable real checkout." }); }
  const amount = Math.min(Math.max(Number(req.body && req.body.credits) || 100, 1), 10000);
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("success_url", `${cfg.WEB_ORIGIN}/settings?paid=1`);
  p.set("cancel_url", `${cfg.WEB_ORIGIN}/settings`);
  p.set("line_items[0][price_data][currency]", "usd");
  p.set("line_items[0][price_data][product_data][name]", `${amount} Base888 credits`);
  p.set("line_items[0][price_data][unit_amount]", String(amount));
  p.set("line_items[0][quantity]", "1");
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" }, body: p });
  const data = await r.json();
  if (!r.ok) { res.set("X-Error-Code", "stripe_error"); return res.status(502).json({ error: "stripe_error", detail: data.error }); }
  res.json({ checkout_url: data.url, id: data.id });
}));

// ---- workspaces ------------------------------------------------------------
app.get("/workspaces", A.requireAuth, (req, res) => {
  const items = q.all(
    `SELECT w.id, w.name, m.role, w.owner_id FROM workspaces w
     JOIN workspace_members m ON m.workspace_id = w.id WHERE m.user_id = ? ORDER BY w.created_date`,
    req.user.id
  ).map((w) => ({ id: w.id, name: w.name, role: w.role, unlocked: true }));
  res.json({ items });
});
app.post("/workspaces", A.requireAuth, (req, res) => {
  const name = (req.body && req.body.name) || "New Workspace";
  const wsId = uid("ws");
  q.run("INSERT INTO workspaces (id,name,owner_id,created_date) VALUES (?,?,?,?)", wsId, name, req.user.id, now());
  q.run("INSERT INTO workspace_members (workspace_id,user_id,role) VALUES (?,?,?)", wsId, req.user.id, "owner");
  res.status(201).json({ id: wsId, name, role: "owner", unlocked: true });
});
app.get("/workspaces/:id/unlock-state", A.requireAuth, (req, res) => {
  const member = q.get("SELECT 1 AS ok FROM workspace_members WHERE workspace_id=? AND user_id=?", req.params.id, req.user.id);
  if (!member) { res.set("X-Error-Code", "forbidden"); return res.status(403).json({ error: "forbidden" }); }
  res.json({ unlocked: true });
});

// ---- apps ------------------------------------------------------------------
app.get("/apps/", A.requireAuth, (req, res) => {
  const items = q.all(
    `SELECT a.* FROM apps a JOIN workspace_members m ON m.workspace_id = a.workspace_id
     WHERE m.user_id = ? ORDER BY a.updated_date DESC`,
    req.user.id
  ).map((a) => ({ id: a.id, name: a.name, description: a.description, flavor: a.flavor, updated_date: a.updated_date, workspace_id: a.workspace_id }));
  res.json({ items });
});
app.post("/apps/", A.requireAuth, (req, res) => {
  let wsId = req.body && req.body.workspace_id;
  if (wsId) {
    if (!q.get("SELECT 1 AS ok FROM workspace_members WHERE workspace_id=? AND user_id=?", wsId, req.user.id)) {
      res.set("X-Error-Code", "forbidden"); return res.status(403).json({ error: "forbidden" });
    }
  } else {
    const first = q.get("SELECT workspace_id FROM workspace_members WHERE user_id=? ORDER BY rowid LIMIT 1", req.user.id);
    wsId = first && first.workspace_id;
  }
  if (!wsId) { res.set("X-Error-Code", "no_workspace"); return res.status(400).json({ error: "no_workspace" }); }
  const a = { id: uid("app"), workspace_id: wsId, name: (req.body && req.body.name) || "Untitled app", description: (req.body && req.body.description) || "", flavor: "platform", updated_date: now() };
  q.run("INSERT INTO apps (id,workspace_id,name,description,flavor,created_by,created_date,updated_date) VALUES (?,?,?,?,?,?,?,?)",
    a.id, a.workspace_id, a.name, a.description, a.flavor, req.user.id, now(), a.updated_date);
  res.status(201).json(a);
});

// App-scoped router (auth + real authorization on every route)
const appRouter = express.Router({ mergeParams: true });
appRouter.use(A.requireAuth, A.requireAppAccess);
appRouter.get("/", (req, res) => {
  const a = req.app888;
  res.json({ id: a.id, name: a.name, description: a.description, flavor: a.flavor, updated_date: a.updated_date, workspace_id: a.workspace_id });
});

// entities CRUD
appRouter.get("/entities/:name", (req, res) => {
  const rows = q.all("SELECT * FROM entities WHERE app_id=? AND entity_name=?", req.params.appId, req.params.name).map(rowToRecord);
  const r = schema.runQuery(rows, { sort: req.query.sort ? String(req.query.sort) : "-created_date", limit: Math.min(Number(req.query.limit || 100), 1000), offset: Number(req.query.offset || 0) });
  res.json({ items: r.items, total: r.total });
});
appRouter.post("/entities/:name/filter", (req, res) => {
  const body = req.body || {};
  const rows = q.all("SELECT * FROM entities WHERE app_id=? AND entity_name=?", req.params.appId, req.params.name).map(rowToRecord);
  res.json(schema.runQuery(rows, { query: body.query || {}, sort: body.sort, limit: body.limit, offset: body.offset }));
});
appRouter.post("/entities/:name", (req, res) => {
  const sch = schema.loadSchema(req.params.appId);
  const { data, errors } = schema.validateRecord(req.params.appId, sch, req.params.name, { ...(req.body || {}) });
  if (errors.length) { res.set("X-Error-Code", "validation_error"); return res.status(400).json({ error: "validation_error", details: errors }); }
  const id = uid("rec"), ts = now();
  delete data.id;
  q.run("INSERT INTO entities (id,app_id,entity_name,data,created_by,created_date,updated_date) VALUES (?,?,?,?,?,?,?)",
    id, req.params.appId, req.params.name, JSON.stringify(data), req.user.id, ts, ts);
  res.status(201).json({ id, created_date: ts, updated_date: ts, created_by: req.user.id, ...data });
});
appRouter.get("/entities/:name/:id", (req, res) => {
  const row = q.get("SELECT * FROM entities WHERE id=? AND app_id=? AND entity_name=?", req.params.id, req.params.appId, req.params.name);
  if (!row) { res.set("X-Error-Code", "not_found"); return res.status(404).json({ error: "not_found" }); }
  res.json(rowToRecord(row));
});
appRouter.put("/entities/:name/:id", (req, res) => {
  const row = q.get("SELECT * FROM entities WHERE id=? AND app_id=? AND entity_name=?", req.params.id, req.params.appId, req.params.name);
  if (!row) { res.set("X-Error-Code", "not_found"); return res.status(404).json({ error: "not_found" }); }
  const sch = schema.loadSchema(req.params.appId);
  const { data: patch, errors } = schema.validateRecord(req.params.appId, sch, req.params.name, { ...(req.body || {}) }, { partial: true });
  if (errors.length) { res.set("X-Error-Code", "validation_error"); return res.status(400).json({ error: "validation_error", details: errors }); }
  const merged = { ...JSON.parse(row.data), ...patch }; delete merged.id;
  const ts = now();
  q.run("UPDATE entities SET data=?, updated_date=? WHERE id=?", JSON.stringify(merged), ts, row.id);
  res.json({ id: row.id, created_date: row.created_date, updated_date: ts, created_by: row.created_by, ...merged });
});
appRouter.delete("/entities/:name/:id", (req, res) => {
  q.run("DELETE FROM entities WHERE id=? AND app_id=? AND entity_name=?", req.params.id, req.params.appId, req.params.name);
  res.json({ ok: true });
});

// integrations
appRouter.post("/integrations/core/InvokeLLM", asyncH(async (req, res) => {
  if (!charge(req.user.id, 1)) { res.set("X-Error-Code", "insufficient_credits"); return res.status(402).json({ error: "insufficient_credits" }); }
  const out = await invokeLLM(req.body || {});
  res.json(out);
}));
appRouter.post("/integrations/core/CompareModels", asyncH(async (req, res) => {
  const models = Array.isArray(req.body && req.body.models) ? req.body.models.slice(0, 3) : [];
  if (!charge(req.user.id, models.length || 1)) { res.set("X-Error-Code", "insufficient_credits"); return res.status(402).json({ error: "insufficient_credits" }); }
  const prompt = (req.body && req.body.prompt) || "";
  const results = {};
  for (const m of models) { try { results[m] = (await invokeLLM({ prompt, model: m, max_tokens: 300 })).output; } catch (e) { results[m] = `error: ${e.message}`; } }
  res.json({ results });
}));
appRouter.post("/integrations/core/SendEmail", asyncH(async (req, res) => {
  const out = await sendEmail(req.body || {});
  res.json(out);
}));
appRouter.post("/integrations/core/GenerateImage", asyncH(async (req, res) => {
  const out = await generateImage(req.body || {});
  res.json(out);
}));
appRouter.post("/integrations/core/UploadFile", (req, res) => {
  const bb = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024 } });
  let saved = null, had = false;
  bb.on("file", (_name, stream, info) => {
    had = true;
    const id = uid("file");
    const dest = path.join(cfg.FILES_DIR, id);
    const out = fs.createWriteStream(dest);
    let size = 0;
    stream.on("data", (d) => { size += d.length; });
    stream.pipe(out);
    out.on("close", () => {
      q.run("INSERT INTO files (id,app_id,user_id,filename,mime,size,path,created_date) VALUES (?,?,?,?,?,?,?,?)",
        id, req.params.appId, req.user.id, info.filename || id, info.mimeType || "application/octet-stream", size, dest, now());
      saved = { id, filename: info.filename, mime: info.mimeType, size, file_url: `${cfg.PUBLIC_URL}/files/${id}` };
    });
  });
  bb.on("close", () => {
    if (!had) { res.set("X-Error-Code", "no_file"); return res.status(400).json({ error: "no_file" }); }
    const wait = setInterval(() => { if (saved) { clearInterval(wait); res.status(201).json(saved); } }, 10);
  });
  bb.on("error", () => { res.set("X-Error-Code", "upload_error"); res.status(500).json({ error: "upload_error" }); });
  req.pipe(bb);
});

// register a function handler (makes /functions/:fn usable; no code exec by design)
appRouter.post("/functions", (req, res) => {
  const name = req.body && req.body.name;
  const handler_url = req.body && req.body.handler_url;
  if (!name || !handler_url) { res.set("X-Error-Code", "bad_request"); return res.status(400).json({ error: "name and handler_url required" }); }
  q.run("INSERT OR REPLACE INTO app_functions (app_id,name,handler_url) VALUES (?,?,?)", req.params.appId, name, handler_url);
  res.status(201).json({ name, handler_url });
});
// invoke a registered function: forwards to its handler URL (no eval)
appRouter.post("/functions/:fn", asyncH(async (req, res) => {
  const row = q.get("SELECT handler_url FROM app_functions WHERE app_id=? AND name=?", req.params.appId, req.params.fn);
  if (!row) { res.set("X-Error-Code", "function_not_registered"); return res.status(404).json({ error: "function_not_registered", fn: req.params.fn }); }
  const upstream = await fetch(row.handler_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req.body || {}) });
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") || "application/json").send(text);
}));

// AI builder: generate an app schema from a prompt and materialize it
appRouter.get("/schema", (req, res) => res.json(builder.getSchema(req.params.appId)));
// Manual schema editing (not just agent-generated)
appRouter.put("/schema", (req, res) => {
  const body = req.body || {};
  const sch = schema.mutateSchema(req.params.appId, (s) => {
    if (Array.isArray(body.entities)) s.entities = body.entities;
    if (body.app_name) s.app_name = body.app_name;
    if (body.description !== undefined) s.description = body.description;
  });
  res.json(sch);
});
appRouter.post("/schema/entities", (req, res) => {
  const name = schema.cleanName(req.body && req.body.name);
  if (!name) { res.set("X-Error-Code", "bad_request"); return res.status(400).json({ error: "name required" }); }
  const sch = schema.mutateSchema(req.params.appId, (s) => {
    if (!s.entities.find((e) => e.name === name)) s.entities.push({ name, icon: (req.body && req.body.icon) || "box", fields: Array.isArray(req.body && req.body.fields) ? req.body.fields : [] });
  });
  res.status(201).json(sch);
});
appRouter.delete("/schema/entities/:name", (req, res) => {
  const sch = schema.mutateSchema(req.params.appId, (s) => { s.entities = s.entities.filter((e) => e.name !== req.params.name); });
  res.json(sch);
});

// Export a standalone runnable app (generated HTML with data embedded)
appRouter.get("/export", (req, res) => {
  res.set("Content-Disposition", `attachment; filename="${(req.app888.name || "app").replace(/[^A-Za-z0-9_-]/g, "_")}.html"`);
  res.type("html").send(appHtml(req.params.appId, req.app888));
});
// Editable app code (Monaco-backed): the AI generates it; the user edits it.
appRouter.get("/code", (req, res) => res.json({ code: req.app888.app_code || "", generated: !req.app888.app_code }));
appRouter.put("/code", (req, res) => { q.run("UPDATE apps SET app_code=?, updated_date=? WHERE id=?", String((req.body && req.body.code) || ""), now(), req.params.appId); res.json({ ok: true }); });
appRouter.post("/code/generate", (req, res) => {
  const { schema: sch, dataByEntity } = collectAppData(req.params.appId);
  const code = codegen.generateStandaloneHtml({ appName: req.app888.name, description: req.app888.description, schema: sch, dataByEntity });
  q.run("UPDATE apps SET app_code=?, updated_date=? WHERE id=?", code, now(), req.params.appId);
  res.json({ code });
});

// Real GitHub export (uses a user-supplied Personal Access Token with 'repo' scope)
appRouter.post("/github/export", asyncH(async (req, res) => {
  const token = req.body && req.body.token;
  if (!token) { res.set("X-Error-Code", "github_token_required"); return res.status(400).json({ error: "github_token_required", hint: "Provide a GitHub PAT with 'repo' scope." }); }
  const repoName = ((req.body && req.body.repo_name) || `base888-${String(req.app888.name || "app").toLowerCase().replace(/[^a-z0-9-]/g, "-")}`).slice(0, 90);
  const html = appHtml(req.params.appId, req.app888);
  const readme = `# ${req.app888.name}\n\n${req.app888.description || ""}\n\nGenerated and exported by Base888.`;
  const out = await github.exportToGithub({ token, repoName, description: req.app888.description, files: { "index.html": html, "README.md": readme } });
  res.json(out);
}));
// Connectors: register + invoke real outbound HTTP integrations (no eval)
appRouter.get("/connectors", (req, res) => res.json({ items: q.all("SELECT id,type,name,config,created_date FROM connectors WHERE app_id=?", req.params.appId).map((c) => ({ id: c.id, type: c.type, name: c.name, config: JSON.parse(c.config || "{}"), created_date: c.created_date })) }));
appRouter.post("/connectors", (req, res) => {
  const id = uid("conn");
  q.run("INSERT INTO connectors (id,app_id,type,name,config,created_date) VALUES (?,?,?,?,?,?)", id, req.params.appId, (req.body && req.body.type) || "http", (req.body && req.body.name) || "connector", JSON.stringify((req.body && req.body.config) || {}), now());
  res.status(201).json({ id });
});
// Scheduled tasks (workflows): interval-based, fired by the in-process scheduler below
appRouter.get("/tasks", (req, res) => res.json({ items: q.all("SELECT id,name,cron,handler_url,enabled,last_run,created_date FROM scheduled_tasks WHERE app_id=?", req.params.appId) }));
appRouter.post("/tasks", (req, res) => {
  const id = uid("task");
  q.run("INSERT INTO scheduled_tasks (id,app_id,name,cron,handler_url,enabled,created_date) VALUES (?,?,?,?,?,1,?)",
    id, req.params.appId, (req.body && req.body.name) || "task", String(Math.max(1, Number(req.body && req.body.every_minutes) || 60)), (req.body && req.body.handler_url) || "", now());
  res.status(201).json({ id });
});
appRouter.delete("/tasks/:tid", (req, res) => { q.run("DELETE FROM scheduled_tasks WHERE id=? AND app_id=?", req.params.tid, req.params.appId); res.json({ ok: true }); });
appRouter.post("/connectors/:cid/invoke", asyncH(async (req, res) => {
  const c = q.get("SELECT * FROM connectors WHERE id=? AND app_id=?", req.params.cid, req.params.appId);
  if (!c) { res.set("X-Error-Code", "not_found"); return res.status(404).json({ error: "not_found" }); }
  const cc = JSON.parse(c.config || "{}");
  const url = cc.url || cc.base_url;
  if (!url) { res.set("X-Error-Code", "bad_config"); return res.status(400).json({ error: "connector has no url" }); }
  const method = String(cc.method || (c.type === "webhook" ? "POST" : "GET")).toUpperCase();
  const headers = { "content-type": "application/json", ...(cc.headers || {}) };
  if (cc.api_key_header && cc.api_key) headers[cc.api_key_header] = cc.api_key;
  const r = await fetch(url, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(req.body || {}) });
  const text = await r.text();
  res.json({ status: r.status, body: text.slice(0, 8000) });
}));
// Publish (set visibility; public apps render at /p/:appId without auth)
appRouter.put("/publish", (req, res) => {
  const vis = (req.body && req.body.visibility) === "public" ? "public" : "private";
  q.run("UPDATE apps SET visibility=?, updated_date=? WHERE id=?", vis, now(), req.params.appId);
  res.json({ visibility: vis, public_url: vis === "public" ? `${cfg.PUBLIC_URL}/p/${req.params.appId}` : null });
});
// Checkpoints / version history
appRouter.post("/checkpoints", (req, res) => {
  const snap = collectAppData(req.params.appId);
  const id = uid("ckpt");
  q.run("INSERT INTO checkpoints (id,app_id,label,snapshot,created_date) VALUES (?,?,?,?,?)", id, req.params.appId, (req.body && req.body.label) || "checkpoint", JSON.stringify(snap), now());
  res.status(201).json({ id, label: (req.body && req.body.label) || "checkpoint" });
});
appRouter.get("/checkpoints", (req, res) => {
  res.json({ items: q.all("SELECT id,label,created_date FROM checkpoints WHERE app_id=? ORDER BY created_date DESC", req.params.appId) });
});
appRouter.post("/checkpoints/:id/restore", (req, res) => {
  const row = q.get("SELECT snapshot FROM checkpoints WHERE id=? AND app_id=?", req.params.id, req.params.appId);
  if (!row) { res.set("X-Error-Code", "not_found"); return res.status(404).json({ error: "not_found" }); }
  const snap = JSON.parse(row.snapshot);
  schema.saveSchema(req.params.appId, snap.schema || { entities: [] });
  q.run("DELETE FROM entities WHERE app_id=?", req.params.appId);
  for (const [name, recs] of Object.entries(snap.dataByEntity || {})) for (const r of recs) {
    const data = Object.fromEntries(Object.entries(r).filter(([k]) => !["id", "created_date", "updated_date", "created_by"].includes(k)));
    q.run("INSERT INTO entities (id,app_id,entity_name,data,created_by,created_date,updated_date) VALUES (?,?,?,?,?,?,?)",
      r.id, req.params.appId, name, JSON.stringify(data), r.created_by || req.user.id, r.created_date || now(), now());
  }
  res.json({ ok: true, entities: Object.keys(snap.dataByEntity || {}).length });
});
// Dashboard / analytics computed from live data (counts + enum breakdowns)
appRouter.get("/dashboard", (req, res) => {
  const { schema: sch, dataByEntity } = collectAppData(req.params.appId);
  const cards = [], charts = [];
  for (const e of (sch.entities || [])) {
    const recs = dataByEntity[e.name] || [];
    cards.push({ label: e.name, value: recs.length });
    for (const f of (e.fields || [])) if (f.type === "enum") {
      const counts = {};
      for (const r of recs) { const v = r[f.name]; if (v != null && v !== "") counts[v] = (counts[v] || 0) + 1; }
      if (Object.keys(counts).length) charts.push({ entity: e.name, field: f.name, counts });
    }
  }
  res.json({ cards, charts });
});
appRouter.post("/builder/generate", asyncH(async (req, res) => {
  const prompt = ((req.body && req.body.prompt) || "").trim();
  if (!prompt) { res.set("X-Error-Code", "bad_request"); return res.status(400).json({ error: "prompt required" }); }
  if (!charge(req.user.id, 1)) { res.set("X-Error-Code", "insufficient_credits"); return res.status(402).json({ error: "insufficient_credits" }); }
  const out = await builder.buildApp({ appId: req.params.appId, prompt, userId: req.user.id });
  res.json(out);
}));

// Conversational builder agent (Base44 superagent core loop) — SSE streamed.
appRouter.post("/conversations", (req, res) => {
  const id = uid("conv");
  q.run("INSERT INTO conversations (id,app_id,user_id,phase,created_date) VALUES (?,?,?,?,?)", id, req.params.appId, req.user.id, "new", now());
  res.status(201).json({ id, phase: "new" });
});
appRouter.get("/conversations/:cid/messages", (req, res) => {
  const msgs = q.all("SELECT id,role,content,meta,created_date FROM messages WHERE conversation_id=? ORDER BY created_date", req.params.cid);
  res.json({ items: msgs.map((m) => ({ ...m, meta: m.meta ? JSON.parse(m.meta) : null })) });
});
appRouter.post("/conversations/:cid/messages", asyncH(async (req, res) => {
  const conv = q.get("SELECT * FROM conversations WHERE id=? AND app_id=?", req.params.cid, req.params.appId);
  if (!conv) { res.set("X-Error-Code", "not_found"); return res.status(404).json({ error: "not_found" }); }
  const content = ((req.body && req.body.content) || "").trim();
  if (!content) { res.set("X-Error-Code", "bad_request"); return res.status(400).json({ error: "content required" }); }
  if (!charge(req.user.id, 1)) { res.set("X-Error-Code", "insufficient_credits"); return res.status(402).json({ error: "insufficient_credits" }); }
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ } };
  const hb = setInterval(() => { try { res.write(": hb\n\n"); } catch { /* ignore */ } }, 15000);
  try {
    await agent.runTurn({ appId: req.params.appId, userId: req.user.id, conv, content, send });
  } catch (e) {
    send({ type: "error", message: e.message, code: e.code || "agent_error" });
  } finally {
    clearInterval(hb); res.end();
  }
}));

app.use("/apps/:appId", appRouter);

// serve stored files by unguessable id (CDN-style)
app.get("/files/:id", (req, res) => {
  const row = q.get("SELECT * FROM files WHERE id = ?", req.params.id);
  if (!row || !fs.existsSync(row.path)) { res.set("X-Error-Code", "not_found"); return res.status(404).json({ error: "not_found" }); }
  res.type(row.mime).sendFile(row.path);
});

// Public published app (read-only, no auth) — Base44-style preview/publish
app.get("/p/:appId", (req, res) => {
  const a = q.get("SELECT * FROM apps WHERE id=?", req.params.appId);
  if (!a || a.visibility !== "public") { res.set("X-Error-Code", "not_found"); return res.status(404).type("html").send("<p>App not found or not published.</p>"); }
  let html = appHtml(req.params.appId, a);
  // Make the published app an installable PWA
  const inject = `<link rel="manifest" href="/p/${req.params.appId}/manifest.webmanifest"><meta name="theme-color" content="#0b0f17"><script>if('serviceWorker'in navigator)navigator.serviceWorker.register('/p/${req.params.appId}/sw.js').catch(()=>{})</script>`;
  html = html.includes("</head>") ? html.replace("</head>", inject + "</head>") : inject + html;
  res.type("html").send(html);
});
app.get("/p/:appId/manifest.webmanifest", (req, res) => {
  const a = q.get("SELECT name,description FROM apps WHERE id=?", req.params.appId);
  res.type("application/manifest+json").send(JSON.stringify({
    name: a ? a.name : "App", short_name: ((a && a.name) || "App").slice(0, 12), description: (a && a.description) || "",
    start_url: `/p/${req.params.appId}`, scope: `/p/${req.params.appId}`, display: "standalone",
    background_color: "#0b0f17", theme_color: "#0b0f17",
    icons: [{ src: `/p/${req.params.appId}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" }]
  }));
});
app.get("/p/:appId/sw.js", (_req, res) => {
  res.type("application/javascript").send("const C='b888-v1';self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{e.respondWith(caches.open(C).then(c=>fetch(e.request).then(r=>{try{c.put(e.request,r.clone())}catch(_){}return r}).catch(()=>c.match(e.request))))});");
});
app.get("/p/:appId/icon.svg", (req, res) => {
  const a = q.get("SELECT name FROM apps WHERE id=?", req.params.appId);
  const letter = (((a && a.name) || "A").trim().charAt(0) || "A").toUpperCase().replace(/[<&>]/g, "");
  res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="96" fill="#0b0f17"/><text x="256" y="350" font-size="300" text-anchor="middle" fill="#7affc6" font-family="system-ui,sans-serif">${letter}</text></svg>`);
});

function collectAppData(appId) {
  const sch = schema.loadSchema(appId) || { entities: [] };
  const dataByEntity = {};
  for (const e of (sch.entities || [])) dataByEntity[e.name] = q.all("SELECT * FROM entities WHERE app_id=? AND entity_name=?", appId, e.name).map(rowToRecord);
  return { schema: sch, dataByEntity };
}
// The app's HTML: the user's edited code if present, else auto-generated from schema+data.
function appHtml(appId, a) {
  if (a && a.app_code) return a.app_code;
  const { schema: sch, dataByEntity } = collectAppData(appId);
  return codegen.generateStandaloneHtml({ appName: a ? a.name : "App", description: a ? a.description : "", schema: sch, dataByEntity });
}

function rowToRecord(row) {
  return { id: row.id, created_date: row.created_date, updated_date: row.updated_date, created_by: row.created_by, ...JSON.parse(row.data) };
}

// ---- errors ----------------------------------------------------------------
app.use((req, res) => { res.set("X-Error-Code", "not_found"); res.status(404).json({ error: "not_found", path: req.path }); });
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err instanceof IntegrationError ? err.status : err.status || 500;
  const code = err.code || (status === 500 ? "internal_error" : "error");
  res.set("X-Error-Code", code);
  if (status >= 500) console.error("[base888]", err);
  res.status(status).json({ error: code, message: err.message });
});

// ---- start -----------------------------------------------------------------
const server = app.listen(cfg.PORT, () => console.log(`[base888] real API on ${cfg.PUBLIC_URL} (db: ${cfg.DB_PATH})`));
server.requestTimeout = 15 * 60 * 1000; // allow slow local-LLM generations
server.headersTimeout = 16 * 60 * 1000;
startWs(cfg.WS_PORT);
console.log(`[base888] real WS on ws://localhost:${cfg.WS_PORT}`);

// In-process scheduler: fires due interval tasks (real outbound POST to handler_url).
setInterval(() => {
  try {
    const nowMs = Date.now();
    for (const t of q.all("SELECT * FROM scheduled_tasks WHERE enabled=1")) {
      const every = Number(t.cron) || 60;
      const last = t.last_run ? Date.parse(t.last_run) : 0;
      if (t.handler_url && nowMs - last >= every * 60000) {
        q.run("UPDATE scheduled_tasks SET last_run=? WHERE id=?", now(), t.id);
        fetch(t.handler_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: t.name, app_id: t.app_id, fired_at: now() }) }).catch(() => {});
      }
    }
  } catch { /* keep scheduler alive */ }
}, 60000);
