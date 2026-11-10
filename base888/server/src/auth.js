"use strict";
// Real authentication: scrypt password hashing, HS256 JWT access tokens, and
// hashed, rotatable refresh tokens persisted in SQLite.
const crypto = require("crypto");
const cfg = require("./config");
const { q, uid, now } = require("./db");

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const fromB64url = (s) => Buffer.from(s, "base64url");

// ---- passwords -------------------------------------------------------------
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const calc = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return calc.length === known.length && crypto.timingSafeEqual(calc, known);
}

// ---- JWT (HS256) -----------------------------------------------------------
function signAccess(userId) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const iat = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub: userId, type: "access", iat, exp: iat + cfg.ACCESS_TTL }));
  const sig = b64url(crypto.createHmac("sha256", cfg.JWT_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}
function verifyAccess(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto.createHmac("sha256", cfg.JWT_SECRET).update(`${header}.${payload}`).digest();
  const got = fromB64url(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  let claims;
  try { claims = JSON.parse(fromB64url(payload).toString("utf8")); } catch { return null; }
  if (claims.type !== "access" || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

// ---- refresh tokens (opaque, hashed at rest) -------------------------------
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function issueRefresh(userId) {
  const raw = crypto.randomBytes(32).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + cfg.REFRESH_TTL;
  q.run(
    "INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at,revoked,created_date) VALUES (?,?,?,?,0,?)",
    uid("rt"), userId, sha256(raw), expires, now()
  );
  return raw;
}
function consumeRefresh(raw) {
  if (!raw) return null;
  const row = q.get("SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0", sha256(raw));
  if (!row || row.expires_at < Math.floor(Date.now() / 1000)) return null;
  q.run("UPDATE refresh_tokens SET revoked = 1 WHERE id = ?", row.id); // rotate (single use)
  return row.user_id;
}
function revokeAllRefresh(userId) {
  q.run("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?", userId);
}

// ---- middleware ------------------------------------------------------------
function currentUser(req) {
  const m = (req.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const claims = verifyAccess(m[1]);
  if (!claims) return null;
  return q.get("SELECT id,email,full_name,role,created_date FROM users WHERE id = ?", claims.sub) || null;
}
function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) { res.set("X-Error-Code", "unauthenticated"); return res.status(401).json({ error: "unauthenticated" }); }
  req.user = u;
  next();
}
// Real authorization: the app must belong to a workspace the user is a member of.
function requireAppAccess(req, res, next) {
  const app = q.get("SELECT * FROM apps WHERE id = ?", req.params.appId);
  if (!app) { res.set("X-Error-Code", "not_found"); return res.status(404).json({ error: "not_found" }); }
  const member = q.get(
    "SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    app.workspace_id, req.user.id
  );
  if (!member) { res.set("X-Error-Code", "forbidden"); return res.status(403).json({ error: "forbidden" }); }
  req.app888 = app;
  next();
}

module.exports = {
  hashPassword, verifyPassword, signAccess, verifyAccess,
  issueRefresh, consumeRefresh, revokeAllRefresh,
  currentUser, requireAuth, requireAppAccess
};
