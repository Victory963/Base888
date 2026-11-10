"use strict";
// Real data layer: server-side schema enforcement (types, required, enum,
// reference integrity) and a rich query engine (operators, sort, pagination).
// Closes the "cosmetic data layer" gap — field types now actually mean something.
const { q, now } = require("./db");

function loadSchema(appId) {
  const row = q.get("SELECT schema FROM app_schemas WHERE app_id=?", appId);
  if (!row) return null;
  try { return JSON.parse(row.schema); } catch { return null; }
}
function saveSchema(appId, schema) {
  q.run("INSERT OR REPLACE INTO app_schemas (app_id,prompt,schema,created_date) VALUES (?,COALESCE((SELECT prompt FROM app_schemas WHERE app_id=?),''),?,?)",
    appId, appId, JSON.stringify(schema), now());
}
function entityDef(schema, name) {
  return schema && Array.isArray(schema.entities) ? schema.entities.find((e) => e.name === name) : null;
}

const COERCE = {
  number: (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; },
  boolean: (v) => (typeof v === "boolean" ? v : v === "true" || v === true || v === 1 || v === "1"),
  string: (v) => String(v), text: (v) => String(v), email: (v) => String(v), url: (v) => String(v),
  date: (v) => String(v), datetime: (v) => String(v)
};
const RE = { email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, url: /^https?:\/\/.+/, date: /^\d{4}-\d{2}-\d{2}/ };

// Validate + coerce a record against the entity definition. Returns {data, errors}.
function validateRecord(appId, schema, entityName, input, { partial = false } = {}) {
  const ent = entityDef(schema, entityName);
  if (!ent) return { data: { ...input }, errors: [] }; // no schema -> permissive (back-compat)
  const out = {}; const errors = [];
  for (const f of ent.fields || []) {
    const present = Object.prototype.hasOwnProperty.call(input, f.name);
    let v = input[f.name];
    if (!present || v === "" || v === null || v === undefined) {
      if (f.required && !partial) errors.push(`${f.name} is required`);
      if (present) out[f.name] = v;
      continue;
    }
    if (f.type === "enum") {
      if (Array.isArray(f.options) && f.options.length && !f.options.map(String).includes(String(v))) errors.push(`${f.name} must be one of ${f.options.join(", ")}`);
      out[f.name] = String(v);
    } else if (f.type === "reference") {
      const target = f.reference_entity;
      const exists = q.get("SELECT 1 x FROM entities WHERE app_id=? AND entity_name=? AND id=?", appId, target, String(v));
      if (!exists) errors.push(`${f.name} must reference an existing ${target}`);
      out[f.name] = String(v);
    } else if (f.type === "number") {
      const n = COERCE.number(v); if (Number.isNaN(n)) errors.push(`${f.name} must be a number`); else out[f.name] = n;
    } else if (f.type === "boolean") {
      out[f.name] = COERCE.boolean(v);
    } else {
      const s = String(v);
      if (f.type === "email" && !RE.email.test(s)) errors.push(`${f.name} must be an email`);
      if (f.type === "url" && !RE.url.test(s)) errors.push(`${f.name} must be a URL`);
      if (f.type === "date" && !RE.date.test(s)) errors.push(`${f.name} must be a date (YYYY-MM-DD)`);
      out[f.name] = s;
    }
  }
  // keep unknown fields the schema doesn't mention (lenient superset)
  for (const [k, v] of Object.entries(input)) if (!(k in out) && !["id", "created_date", "updated_date", "created_by"].includes(k)) out[k] = v;
  return { data: out, errors };
}

const OPS = {
  $gt: (a, b) => a > b, $gte: (a, b) => a >= b, $lt: (a, b) => a < b, $lte: (a, b) => a <= b,
  $ne: (a, b) => a !== b, $in: (a, b) => Array.isArray(b) && b.includes(a),
  $contains: (a, b) => String(a ?? "").toLowerCase().includes(String(b).toLowerCase())
};
// Query engine: equality + operator objects, sort ("-field" desc), limit/offset.
function runQuery(items, { query = {}, sort, limit = 50, offset = 0 } = {}) {
  let out = items.filter((rec) => Object.entries(query || {}).every(([k, cond]) => {
    if (cond && typeof cond === "object" && !Array.isArray(cond)) return Object.entries(cond).every(([op, val]) => (OPS[op] ? OPS[op](rec[k], val) : rec[k] === val));
    return rec[k] === cond;
  }));
  if (sort) { const desc = sort.startsWith("-"); const key = desc ? sort.slice(1) : sort; out.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (desc ? -1 : 1)); }
  const total = out.length;
  out = out.slice(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 50));
  return { items: out, total };
}

// ---- schema editing (manual entity/field CRUD) ----
function mutateSchema(appId, fn) {
  const schema = loadSchema(appId) || { app_name: null, description: null, entities: [] };
  schema.entities = Array.isArray(schema.entities) ? schema.entities : [];
  fn(schema);
  saveSchema(appId, schema);
  return schema;
}
const cleanName = (s) => String(s || "").replace(/[^A-Za-z0-9_]/g, "");

module.exports = {
  loadSchema, saveSchema, entityDef, validateRecord, runQuery, mutateSchema, cleanName
};
