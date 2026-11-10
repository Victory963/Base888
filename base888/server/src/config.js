"use strict";
// Real runtime configuration. Secrets come from the environment; a JWT signing
// key is generated and persisted on first boot if not supplied.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const FILES_DIR = path.join(DATA_DIR, "files");
const OUTBOX_DIR = path.join(DATA_DIR, "outbox");
for (const d of [DATA_DIR, FILES_DIR, OUTBOX_DIR]) fs.mkdirSync(d, { recursive: true });

function persistentSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(DATA_DIR, ".jwt_secret");
  try {
    return fs.readFileSync(f, "utf8").trim();
  } catch {
    const s = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(f, s, { mode: 0o600 });
    return s;
  }
}

module.exports = {
  ROOT,
  DATA_DIR,
  FILES_DIR,
  OUTBOX_DIR,
  DB_PATH: process.env.DB_PATH || path.join(DATA_DIR, "base888.db"),
  PORT: Number(process.env.PORT || 4488),
  WS_PORT: Number(process.env.WS_PORT || 4489),
  WEB_ORIGIN: process.env.WEB_ORIGIN || "http://localhost:5888",
  PUBLIC_URL: process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT || 4488)}`,
  JWT_SECRET: persistentSecret(),
  ACCESS_TTL: Number(process.env.ACCESS_TTL || 900), // 15 min
  REFRESH_TTL: Number(process.env.REFRESH_TTL || 60 * 60 * 24 * 30), // 30 days
  // Real LLM integration (OpenAI-compatible or Anthropic). Unset => 503.
  LLM: {
    provider: process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.OPENAI_API_KEY ? "openai" : ""),
    apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || "",
    model: process.env.LLM_MODEL || ""
  },
  IMAGE: {
    apiKey: process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.IMAGE_BASE_URL || "https://api.openai.com/v1",
    model: process.env.IMAGE_MODEL || "gpt-image-1"
  },
  SMTP_URL: process.env.SMTP_URL || "",
  MAIL_FROM: process.env.MAIL_FROM || "no-reply@base888.local",
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET || "",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "base888-dev.apps.example.com"
};
