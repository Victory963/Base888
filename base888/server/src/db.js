"use strict";
// Real persistence with the built-in node:sqlite engine.
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const cfg = require("./config");

const db = new DatabaseSync(cfg.DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL,
  created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '',
  flavor TEXT NOT NULL DEFAULT 'platform', created_by TEXT NOT NULL,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, app_id TEXT NOT NULL, entity_name TEXT NOT NULL, data TEXT NOT NULL,
  created_by TEXT NOT NULL, created_date TEXT NOT NULL, updated_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entities_app_name ON entities (app_id, entity_name);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_hash ON refresh_tokens (token_hash);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, app_id TEXT, user_id TEXT NOT NULL, filename TEXT NOT NULL,
  mime TEXT NOT NULL, size INTEGER NOT NULL, path TEXT NOT NULL, created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_functions (
  app_id TEXT NOT NULL, name TEXT NOT NULL, handler_url TEXT NOT NULL,
  PRIMARY KEY (app_id, name)
);
CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS consent_receipts (
  id TEXT PRIMARY KEY, user_id TEXT, data TEXT NOT NULL, created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_schemas (
  app_id TEXT PRIMARY KEY, prompt TEXT, schema TEXT NOT NULL, created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, app_id TEXT NOT NULL, user_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'new', original_prompt TEXT, answers TEXT, created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, meta TEXT, created_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id);
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY, app_id TEXT NOT NULL, label TEXT, snapshot TEXT NOT NULL, created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT, role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL, accepted INTEGER NOT NULL DEFAULT 0, created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY, app_id TEXT NOT NULL, name TEXT, cron TEXT, handler_url TEXT, enabled INTEGER DEFAULT 1,
  last_run TEXT, created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY, app_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT, config TEXT, created_date TEXT NOT NULL
);
`);
// Lightweight column migrations (ignored if the column already exists).
for (const sql of [
  "ALTER TABLE apps ADD COLUMN visibility TEXT DEFAULT 'private'",
  "ALTER TABLE users ADD COLUMN mfa_secret TEXT",
  "ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 100",
  "ALTER TABLE apps ADD COLUMN app_code TEXT"
]) { try { db.exec(sql); } catch { /* exists */ } }

const uid = (p) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
const now = () => new Date().toISOString();

// Minimal typed helpers over node:sqlite prepared statements.
const q = {
  get: (sql, ...a) => db.prepare(sql).get(...a),
  all: (sql, ...a) => db.prepare(sql).all(...a),
  run: (sql, ...a) => db.prepare(sql).run(...a)
};

function seed() {
  const existing = q.get("SELECT COUNT(*) AS n FROM users");
  if (existing.n > 0) return;
  const scrypt = crypto.scryptSync("demo", "base888-seed-salt", 64).toString("hex");
  const userId = uid("usr");
  q.run(
    "INSERT INTO users (id,email,full_name,role,pw_hash,pw_salt,created_date) VALUES (?,?,?,?,?,?,?)",
    userId, "demo@base888.local", "Base888 Demo", "user", scrypt, "base888-seed-salt", now()
  );
  const wsId = uid("ws");
  q.run("INSERT INTO workspaces (id,name,owner_id,created_date) VALUES (?,?,?,?)", wsId, "My Workspace", userId, now());
  q.run("INSERT INTO workspace_members (workspace_id,user_id,role) VALUES (?,?,?)", wsId, userId, "owner");
  const appId = uid("app");
  q.run(
    "INSERT INTO apps (id,workspace_id,name,description,flavor,created_by,created_date,updated_date) VALUES (?,?,?,?,?,?,?,?)",
    appId, wsId, "Starter CRM", "Sample reconstructed app", "platform", userId, now(), now()
  );
  for (const [k, v] of [["launchpad-multi-contests", 1], ["editor-live-preview", 1], ["native-consent", 1]])
    q.run("INSERT OR REPLACE INTO feature_flags (key,enabled) VALUES (?,?)", k, v);
  // eslint-disable-next-line no-console
  console.log(`[base888] seeded demo user (demo@base888.local / demo), workspace ${wsId}, app ${appId}`);
}

module.exports = { db, q, uid, now, seed };

if (require.main === module && process.argv.includes("--migrate")) {
  seed();
  console.log("[base888] migrate+seed complete:", cfg.DB_PATH);
}
