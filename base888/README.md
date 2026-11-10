# Base888

A **clean-room architectural reconstruction** of a Base44-style app-builder SPA,
derived from reverse-engineering Base44's *public* client bundle with REA.

> Base888 is original code. It reproduces the observed **architecture and API
> contracts**, not Base44's source, assets, or branding. See
> [`../analysis/REVERSE-ENGINEERING-REPORT.md`](../analysis/REVERSE-ENGINEERING-REPORT.md)
> for how each piece was derived and
> [`SECURITY-CHECKUP.md`](./SECURITY-CHECKUP.md) for the authorized security test.

## What this is — and is not (no 虚标)

The builder generates a **data model + sample data** (entities, fields, enums,
references) from a chat, and renders a **working CRUD preview**. It does **not**
generate or edit application code, and it is **not** a Base44 clone — Base44 is a
full platform (code editor, deploy, billing, connectors, analytics, native mobile,
…). Honest coverage is ~10–15%; see [`PARITY-LEDGER.md`](./PARITY-LEDGER.md) for the
feature-by-feature accounting, independently confirmed by adversarial audit.
Generation runs on a **small local model (`qwen2.5:3b`)** by default, so quality is
modest and a build takes ~30–60s; set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` for
frontier-model quality.

## What it reproduces

| Area | Base44 (observed) | Base888 (this repo) |
|------|-------------------|---------------------|
| Build | Vite + rolldown | Vite (Rollup) + named vendor chunks |
| UI | React | React 18 + React Router |
| State | Zustand + persist + action middleware | `src/stores/createStore.ts` |
| HTTP | Axios w/ Bearer, `X-Active-Workspace-Id`, `X-Active-App-Id`, `X-Builder-Model-Selection`, `X-Socket-Id`, single-flight refresh | `src/api/axiosClient.ts` |
| SDK | `auth` / `entities` / `integrations` / `functions` | `src/sdk/base888Sdk.ts` |
| Auth | Google/GitHub/Apple/OIDC/SSO + Turnstile | `src/api/authApi.ts`, `LoginPage` |
| Workspaces/apps | workspace + apps/editor | `src/api/workspaceApi.ts`, pages |
| i18n | i18next | `src/i18n`, `I18nProvider` |
| Flags | pre-auth flags + experiments | `src/hooks/useFeatureFlags.ts` |
| Runtime config | `/api/frontend-config.js` → `window.__APP_CONFIG__` | same pattern, served by the mock API |

## Run it

```bash
npm run install:all     # installs web + server deps (use pnpm if npm is CPU-limited)
npm run dev             # web http://localhost:5888 · API :4488 · WS :4489
```

Demo login: `demo@base888.local` / `demo`. Other accounts must register first (`/auth/register`); arbitrary emails are rejected (real password auth).

- `npm run build` — production build (emits named vendor chunks under `web/dist`).
- `npm run typecheck` — strict TypeScript check.

## Layout

```
base888/
  web/      Vite + React + TS SPA  (src/{api,sdk,stores,context,hooks,components,pages,i18n,config})
  server/   Real backend: Express + node:sqlite, scrypt+JWT auth, authz, uploads,
            real LLM/email integrations, authenticated WebSocket
            (src/{config,db,auth,llm,mailer,ws}.js + index.js)
```

## Real backend (not a mock)

Persistence is **SQLite** (`node:sqlite`, file `server/data/base888.db`). Auth is
real: scrypt password hashing, HS256 JWT access tokens, single-use rotating
refresh tokens (httpOnly cookie). Authorization is enforced per workspace.
Integrations are real: `InvokeLLM` / `GenerateImage` call a configured provider
(env), `SendEmail` sends via SMTP or writes a real `.eml` to the outbox,
`UploadFile` stores files on disk and serves them, user `functions` forward to a
registered handler URL. The WebSocket requires a valid token.

Configure integrations with env vars (unset → real `503 *_not_configured`):

```bash
# any one LLM provider:
ANTHROPIC_API_KEY=sk-ant-...            # or OPENAI_API_KEY / LLM_* for OpenAI-compatible
# optional:
SMTP_URL=smtps://user:pass@smtp.host:465   MAIL_FROM=you@domain
TURNSTILE_SECRET=...                        # enables real Turnstile verification
```

## Verified (2026-10-26)

`typecheck` clean · `build` OK (141 modules) · **real** API end-to-end, incl.
security: scrypt login (wrong pw → 401), registration, **IDOR blocked (403)**,
**JWT tamper → 401**, **single-use refresh rotation**, entities persisted to
SQLite (survive restart), **real file upload round-trip**, `SendEmail` → real
`.eml` in outbox, `GenerateImage` → honest `503` when no image key, login **rate limit
(429)**, security headers set, `X-Powered-By` removed. See `SECURITY-FINDINGS.md`.

## Caveats (dev-grade)

Single-node; the rate limiter is in-memory; a `demo@base888.local` / `demo` user
is seeded. Harden (shared rate store, remove seed, password policy, signed file
URLs, SSRF allowlist on function handlers) before production.
