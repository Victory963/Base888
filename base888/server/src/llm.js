"use strict";
// Real LLM + image integrations over fetch. When no provider is configured the
// caller gets a real 503 (integration_not_configured) — never fabricated text.
const cfg = require("./config");
const { fetch, Agent } = require("undici");

// Local LLMs (ollama on CPU) with stream:false can take minutes to return
// response headers — far beyond undici's 300s default. Use a long-timeout agent.
const llmDispatcher = new Agent({ headersTimeout: 15 * 60 * 1000, bodyTimeout: 15 * 60 * 1000, connectTimeout: 15 * 1000 });

class IntegrationError extends Error {
  constructor(code, message, status = 503) { super(message || code); this.code = code; this.status = status; }
}

async function invokeLLM({ prompt, model, system, response_json_schema, max_tokens }) {
  const { provider, apiKey, baseUrl, model: defModel } = cfg.LLM;
  if (!apiKey || !provider) throw new IntegrationError("llm_not_configured", "Set LLM_PROVIDER + LLM_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY)");
  const chosen = model || defModel;
  const cap = max_tokens || 1024;

  if (provider === "anthropic") {
    const url = `${baseUrl || "https://api.anthropic.com/v1"}/messages`;
    const res = await fetch(url, {
      method: "POST",
      dispatcher: llmDispatcher,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: chosen || "claude-3-5-sonnet-latest",
        max_tokens: cap,
        system: system || (response_json_schema ? "Respond ONLY with JSON matching the provided schema." : undefined),
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new IntegrationError("llm_upstream_error", `anthropic ${res.status}: ${await res.text()}`, 502);
    const data = await res.json();
    const text = (data.content || []).map((c) => c.text || "").join("");
    return { output: tryJson(text, response_json_schema), raw_model: data.model };
  }

  // OpenAI-compatible (OpenAI, Azure, Ollama, OpenRouter, DeepSeek, ...)
  const url = `${baseUrl || "https://api.openai.com/v1"}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    dispatcher: llmDispatcher,
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: chosen || "gpt-4o-mini",
      max_tokens: cap,
      temperature: 0,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt }
      ],
      ...(response_json_schema ? { response_format: { type: "json_object" } } : {})
    })
  });
  if (!res.ok) throw new IntegrationError("llm_upstream_error", `openai ${res.status}: ${await res.text()}`, 502);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return { output: tryJson(text, response_json_schema), raw_model: data.model };
}

function tryJson(text, schema) {
  if (!schema) return text;
  try { return JSON.parse(text); } catch { return text; }
}

async function generateImage({ prompt, size = "1024x1024" }) {
  const { apiKey, baseUrl, model } = cfg.IMAGE;
  if (!apiKey) throw new IntegrationError("image_not_configured", "Set IMAGE_API_KEY (or OPENAI_API_KEY)");
  const res = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    dispatcher: llmDispatcher,
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, size, n: 1 })
  });
  if (!res.ok) throw new IntegrationError("image_upstream_error", `image ${res.status}: ${await res.text()}`, 502);
  const data = await res.json();
  const first = data.data?.[0];
  return { url: first?.url, b64_json: first?.b64_json ? "[omitted]" : undefined };
}

module.exports = { invokeLLM, generateImage, IntegrationError };
