"use strict";
// Base888 builder agent — a faithful (partial) reimplementation of Base44's
// superagent core loop: clarify -> build -> preview. Streams step events over SSE.
// NOT a full reimplementation: no code editor, deploy, connectors marketplace.
const { invokeLLM } = require("./llm");
const { q, uid, now } = require("./db");
const { extractJson } = require("./builder");

const FIELD_TYPES = "string | text | number | boolean | date | datetime | email | url | enum | reference";

const CLARIFY_SYS = `You are Base888's app-building agent. The user describes an app they want.
Before building, ask 2-4 short clarifying questions to pin down scope (entities, users, key workflows).
Reply with STRICT JSON ONLY, no prose/markdown:
{"summary":"one sentence restating what they want","questions":["q1","q2","q3"]}
Keep questions concrete and answerable in a few words. Output ONLY the JSON object.`;

const BUILD_SYS = `You are Base888's app-building agent. Design a COMPLETE data model for the user's app.
Reply with STRICT JSON ONLY (no prose, no markdown, no code fences).
Shape:
{"app_name":"PascalCase or Title","description":"one line",
 "entities":[
   {"name":"SingularPascalCase","icon":"one-word",
    "fields":[{"name":"snake_case","type":"${FIELD_TYPES}","options":["for enum only"],"reference_entity":"EntityName for reference only"}],
    "sample_records":[{"field":"value"}]}
 ]}
Rules: 4 to 7 entities that together form a realistic working app; 4-8 fields each; use enum (with options) and reference (reference_entity) where natural; 3-5 sample_records per entity with realistic values. Entity names singular PascalCase, field names snake_case. Output ONLY the JSON object.`;

async function clarify(prompt) {
  const res = await invokeLLM({ prompt, system: CLARIFY_SYS, max_tokens: 500, response_json_schema: true });
  const spec = res.output && typeof res.output === "object" ? res.output : extractJson(res.output);
  const questions = Array.isArray(spec.questions) ? spec.questions.slice(0, 4).map(String) : [];
  return { summary: String(spec.summary || ""), questions, model: res.raw_model };
}

async function generateSchema(prompt, answers) {
  const full = answers ? `${prompt}\n\nClarifications:\n${answers}` : prompt;
  const res = await invokeLLM({ prompt: full, system: BUILD_SYS, max_tokens: 3200, response_json_schema: true });
  const spec = res.output && typeof res.output === "object" ? res.output : extractJson(res.output);
  spec.entities = Array.isArray(spec.entities) ? spec.entities.slice(0, 8) : [];
  spec.raw_model = res.raw_model;
  return spec;
}

function materialize(appId, userId, spec) {
  if (spec.app_name || spec.description) {
    q.run("UPDATE apps SET name=COALESCE(?,name), description=COALESCE(?,description), updated_date=? WHERE id=?",
      spec.app_name || null, spec.description || null, now(), appId);
  }
  const normEntities = [];
  const created = {};
  for (const ent of spec.entities) {
    const name = String(ent.name || "").replace(/[^A-Za-z0-9_]/g, "");
    if (!name) continue;
    const fields = (Array.isArray(ent.fields) ? ent.fields : []).map((f) => ({
      name: String(f.name || "").replace(/[^A-Za-z0-9_]/g, "") || "field",
      type: String(f.type || "string"),
      options: Array.isArray(f.options) ? f.options.map(String) : undefined,
      reference_entity: f.reference_entity ? String(f.reference_entity) : undefined
    }));
    normEntities.push({ name, icon: ent.icon || "box", fields });
    let n = 0;
    for (const r of (Array.isArray(ent.sample_records) ? ent.sample_records.slice(0, 8) : [])) {
      if (!r || typeof r !== "object") continue;
      const data = { ...r }; delete data.id;
      const ts = now();
      q.run("INSERT INTO entities (id,app_id,entity_name,data,created_by,created_date,updated_date) VALUES (?,?,?,?,?,?,?)",
        uid("rec"), appId, name, JSON.stringify(data), userId, ts, ts);
      n++;
    }
    created[name] = n;
  }
  const schema = { app_name: spec.app_name, description: spec.description, entities: normEntities };
  q.run("INSERT OR REPLACE INTO app_schemas (app_id,prompt,schema,created_date) VALUES (?,?,?,?)",
    appId, spec.description || "", JSON.stringify(schema), now());
  return { entities: normEntities, created };
}

// Orchestrates one conversation turn, emitting SSE step events via send().
async function runTurn({ appId, userId, conv, content, send }) {
  const addMsg = (role, text, meta) => {
    const id = uid("msg");
    q.run("INSERT INTO messages (id,conversation_id,role,content,meta,created_date) VALUES (?,?,?,?,?,?)",
      id, conv.id, role, text, meta ? JSON.stringify(meta) : null, now());
    return id;
  };
  addMsg("user", content);
  send({ type: "status", phase: conv.phase, text: "thinking" });

  if (conv.phase === "new") {
    // first turn: clarify
    const { summary, questions, model } = await clarify(content);
    if (questions.length) {
      q.run("UPDATE conversations SET phase='clarifying', original_prompt=? WHERE id=?", content, conv.id);
      send({ type: "summary", text: summary });
      for (const qx of questions) send({ type: "question", text: qx });
      addMsg("assistant", summary + "\n\n" + questions.map((x, i) => `${i + 1}. ${x}`).join("\n"), { questions, model });
      send({ type: "await_answers", count: questions.length });
      return;
    }
    // no questions needed -> build directly
    conv.phase = "clarifying";
    q.run("UPDATE conversations SET phase='clarifying', original_prompt=? WHERE id=?", content, conv.id);
  }

  // build phase (user just sent answers, or we go straight to build)
  const row = q.get("SELECT original_prompt FROM conversations WHERE id=?", conv.id);
  const prompt = (row && row.original_prompt) || content;
  const answers = conv.phase === "clarifying" ? content : "";
  send({ type: "status", phase: "building", text: "Designing the data model…" });

  const spec = await generateSchema(prompt, answers);
  send({ type: "plan", app_name: spec.app_name, description: spec.description, entity_names: spec.entities.map((e) => e.name) });
  for (const e of spec.entities) send({ type: "building_entity", name: e.name, fields: (e.fields || []).map((f) => f.name) });

  const result = materialize(appId, userId, spec);
  q.run("UPDATE conversations SET phase='built', answers=? WHERE id=?", answers, conv.id);
  const summary = `Built ${result.entities.length} entities: ${result.entities.map((e) => e.name).join(", ")}.`;
  addMsg("assistant", summary, { schema: result.entities, created: result.created, model: spec.raw_model });
  send({ type: "built", app_name: spec.app_name, entities: result.entities, created: result.created, model: spec.raw_model });
  send({ type: "done" });
}

module.exports = { clarify, generateSchema, materialize, runTurn };
