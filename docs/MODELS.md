# Base888 — Models & External Services

Base888 is **model-agnostic**. One LLM powers the agent (clarifying questions +
data-model generation), the one-shot builder, `InvokeLLM` and `CompareModels`.
Everything else is optional and env-gated — nothing is faked when a key is
missing (you get an honest `503 *_not_configured`).

## 1. LLM (required)

| Option | Config | Quality | Latency (per build) | Cost |
|--------|--------|---------|---------------------|------|
| **Local — ollama `qwen2.5:3b`** (default) | `LLM_PROVIDER=openai LLM_BASE_URL=http://localhost:11434/v1 LLM_API_KEY=ollama LLM_MODEL=qwen2.5:3b` | modest (4–7 entities, clean JSON) | ~20–60 s on GPU; minutes on CPU; first load ~30–150 s | free |
| Local — larger ollama models (`qwen3:4b`, `gemma2:9b`, …) | same, change `LLM_MODEL` | better | slower; needs more VRAM/RAM | free |
| **Anthropic** | `ANTHROPIC_API_KEY=sk-ant-…` (+ `LLM_MODEL`, e.g. `claude-3-5-sonnet-latest`) | high | seconds | paid |
| **OpenAI / any OpenAI-compatible** (OpenAI, Azure, OpenRouter, DeepSeek, vLLM, …) | `OPENAI_API_KEY=…` or `LLM_PROVIDER=openai LLM_BASE_URL=… LLM_API_KEY=… LLM_MODEL=…` | high | seconds | paid |

Requirements for a model to work well: supports **JSON-mode** output
(`response_format: json_object`) or reliably emits a single JSON object; context
≥ 4k tokens. The builder uses temperature 0 and a tolerant JSON repair step.

Install the default locally:

```bash
curl -fsSL https://ollama.com/install.sh | sh     # if ollama is not installed
ollama pull qwen2.5:3b                             # ~1.9 GB
```

Hardware: the 3B model needs ~2.5 GB of GPU VRAM (any 4–8 GB GPU) or ~4 GB RAM
on CPU. Keep only the model you use loaded; other resident models compete for
the GPU and slow generation dramatically.

## 2. Optional services

| Capability | Service | Config | Without it |
|------------|---------|--------|------------|
| `GenerateImage` | OpenAI Images (or compatible) | `IMAGE_API_KEY`, `IMAGE_BASE_URL`, `IMAGE_MODEL` | `503 image_not_configured` |
| `SendEmail` | any SMTP | `SMTP_URL=smtps://user:pass@host:465`, `MAIL_FROM` | a real `.eml` is written to `data/outbox` |
| Credit top-ups | Stripe Checkout | `STRIPE_SECRET_KEY` (test mode works) | `503 billing_not_configured` (credits still tracked) |
| Export to GitHub | GitHub REST API | user supplies a PAT (scope `repo`) per request | `400 github_token_required` |
| Bot protection | Cloudflare Turnstile | `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` | verification skipped |
| OAuth sign-in | Google / GitHub / Apple / OIDC | *not implemented* | `501 oauth_not_configured` |
| Messaging channels | WhatsApp / Telegram / LINE / iMessage / Slack | *not connected* (shown in UI as 未接続) | — |

## 3. Choosing a model

- **Trying it out / offline:** ollama `qwen2.5:3b`.
- **Demo quality / speed:** a cloud key — the same prompts produce richer models in seconds.
- **Private deployment with good quality:** a 7B–14B instruct model behind vLLM
  or ollama with an OpenAI-compatible endpoint (`LLM_BASE_URL`).

Switching models needs no code change — restart the API with new env vars.
`/api/models` lists what the configured provider exposes; `CompareModels` runs a
prompt across several of them.
