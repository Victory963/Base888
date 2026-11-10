"use strict";
// Base888 one-shot data-model generator. Asks the LLM to design a JSON data model
// (entities + fields + sample rows) and materializes it into SQLite.
// NOTE: generates DATA (schema + sample records), not application code.
const { invokeLLM } = require("./llm");
const { q, uid, now } = require("./db");

const SYSTEM = `You design a small app from the user's request and reply with STRICT JSON ONLY — no prose, no markdown, no code fences.
Example (for "a book library"):
{"app_name":"Library","description":"Track books and who borrowed them","entities":[{"name":"Book","fields":[{"name":"title","type":"string"},{"name":"author","type":"string"},{"name":"year","type":"number"}],"sample_records":[{"title":"Dune","author":"Frank Herbert","year":1965},{"title":"1984","author":"George Orwell","year":1949}]},{"name":"Member","fields":[{"name":"full_name","type":"string"},{"name":"email","type":"string"}],"sample_records":[{"full_name":"Ada Lovelace","email":"ada@example.com"},{"full_name":"Alan Turing","email":"alan@example.com"}]}]}
Now design for the user's request. Use real, request-appropriate names: entity names are singular PascalCase (e.g. Book, Invoice, Client), field names are snake_case. Exactly 2 entities; 3-4 fields each; 2 sample_records each. Output ONLY the JSON object, nothing else.`;

// Close any open strings/brackets so a truncated LLM response still parses.
function balance(str) {
  let out = "", inStr = false, esc = false;
  const stack = [];
  for (const ch of str) {
    out += ch;
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === "{" ? "}" : "]";
  return out;
}

function extractJson(text) {
  if (!text) throw new Error("empty LLM output");
  let t = String(text).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const s = t.indexOf("{");
  if (s === -1) throw new Error("no JSON object in LLM output");
  const body = t.slice(s);
  const e = body.lastIndexOf("}");
  const candidates = [];
  if (e >= 0) candidates.push(body.slice(0, e + 1)); // longest complete-looking object
  candidates.push(balance(body));                    // repaired (handles truncation)
  for (const c of candidates) { try { return JSON.parse(c); } catch { /* next */ } }
  throw new Error("unparseable JSON from model");
}

async function buildApp({ appId, prompt, userId }) {
  const res = await invokeLLM({ prompt, system: SYSTEM, max_tokens: 1800, response_json_schema: true });
  const spec = res.output && typeof res.output === "object" ? res.output : extractJson(res.output);
  const entities = Array.isArray(spec.entities) ? spec.entities.slice(0, 4) : [];

  if (spec.app_name || spec.description) {
    q.run("UPDATE apps SET name = COALESCE(?, name), description = COALESCE(?, description), updated_date = ? WHERE id = ?",
      spec.app_name || null, spec.description || null, now(), appId);
  }
  q.run("INSERT OR REPLACE INTO app_schemas (app_id, prompt, schema, created_date) VALUES (?,?,?,?)",
    appId, prompt, JSON.stringify({ app_name: spec.app_name, description: spec.description, entities }), now());

  const created = {};
  for (const ent of entities) {
    const name = String(ent.name || "").replace(/[^A-Za-z0-9_]/g, "");
    if (!name) continue;
    const recs = Array.isArray(ent.sample_records) ? ent.sample_records.slice(0, 5) : [];
    let n = 0;
    for (const r of recs) {
      if (!r || typeof r !== "object") continue;
      const data = { ...r }; delete data.id;
      const ts = now();
      q.run("INSERT INTO entities (id,app_id,entity_name,data,created_by,created_date,updated_date) VALUES (?,?,?,?,?,?,?)",
        uid("rec"), appId, name, JSON.stringify(data), userId, ts, ts);
      n++;
    }
    created[name] = n;
  }
  return { app_name: spec.app_name, description: spec.description, entities, created, raw_model: res.raw_model };
}

function getSchema(appId) {
  const row = q.get("SELECT schema, prompt, created_date FROM app_schemas WHERE app_id = ?", appId);
  if (!row) return { entities: [] };
  const s = JSON.parse(row.schema);
  s.prompt = row.prompt;
  s.created_date = row.created_date;
  return s;
}

module.exports = { buildApp, getSchema };
