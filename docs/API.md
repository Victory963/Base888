# Base888 — API Reference

Base URL `http://localhost:4488`. JSON in/out unless noted. Authenticated routes
need `Authorization: Bearer <access_token>`. App-scoped routes (`/apps/:appId/…`)
also require workspace membership (otherwise `403`). Errors carry an
`X-Error-Code` header and `{ "error": "<code>" }`.

Useful request headers mirrored from the reconstructed client:
`X-Request-ID`, `X-Active-Workspace-Id`, `X-Active-App-Id`, `X-Socket-Id`,
`X-Builder-Model-Selection`.

## Auth

| Method | Path | Body / Notes |
|--------|------|--------------|
| POST | `/auth/register` | `{email, full_name?, password, turnstile_token?}` → `{access_token, user}` + refresh cookie. Rate-limited. |
| POST | `/auth/login` | `{email, password, mfa_code?, turnstile_token?}` → `{access_token, user}`. `401 mfa_required` when 2FA is on. |
| POST | `/auth/refresh` | uses `b888_rt` cookie → `{access_token}`; rotates the refresh token (single-use). |
| GET | `/api/me` | current user |
| POST | `/api/auth/oidc/logout` | revokes all refresh tokens, clears cookie |
| GET | `/auth/sso/my-tokens` | lists refresh-token metadata |
| GET | `/auth/:provider/login` | `501 oauth_not_configured` |
| GET | `/auth/mfa/status` | `{enabled}` |
| POST | `/auth/mfa/setup` | → `{secret, otpauth_url}` |
| POST | `/auth/mfa/enable` | `{code}` |
| POST | `/auth/mfa/disable` | `{code}` |

## System

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/frontend-config.js` | `window.__APP_CONFIG__ = {...}` (pre-auth config + flags) |
| GET | `/api/feature-flags` | `{flags}` |
| GET | `/api/consent/config` · POST `/api/consent/receipts` | consent |
| POST | `/api/v2/rum` | telemetry sink → `204` |
| GET | `/api/credits` | `{credits}` |
| GET | `/api/models` | `{models[], current, provider}` from the LLM provider |
| GET | `/api/connectors/catalog` | connector types |
| POST | `/api/billing/checkout` | `{credits}` → `{checkout_url}` (Stripe; `503` without key) |
| GET | `/api/community/apps` | public apps (no auth) |

## Workspaces & apps

| Method | Path | Notes |
|--------|------|-------|
| GET | `/workspaces` | memberships |
| POST | `/workspaces` | `{name}` |
| GET | `/workspaces/:id/unlock-state` | |
| GET | `/apps/` | apps across your workspaces |
| POST | `/apps/` | `{name, description?, workspace_id?}` |
| GET | `/apps/:appId` | app |
| PUT | `/apps/:appId/publish` | `{visibility: "public"|"private"}` → `{public_url}` |
| GET | `/apps/:appId/export` | standalone HTML (attachment) |
| GET | `/apps/:appId/dashboard` | `{cards[], charts[]}` |

## Data model & records

| Method | Path | Notes |
|--------|------|-------|
| GET | `/apps/:appId/schema` | `{app_name, description, entities[]}` |
| PUT | `/apps/:appId/schema` | replace entities / name / description |
| POST | `/apps/:appId/schema/entities` | `{name, icon?, fields[]}` |
| DELETE | `/apps/:appId/schema/entities/:name` | |
| GET | `/apps/:appId/entities/:name` | `?sort=-field&limit&offset` → `{items, total}` |
| POST | `/apps/:appId/entities/:name/filter` | `{query:{field: value | {$gt,$gte,$lt,$lte,$ne,$in,$contains}}, sort, limit, offset}` |
| POST | `/apps/:appId/entities/:name` | validated against the schema → `201` or `400 validation_error {details[]}` |
| GET / PUT / DELETE | `/apps/:appId/entities/:name/:id` | |

## Agent & builder

| Method | Path | Notes |
|--------|------|-------|
| POST | `/apps/:appId/conversations` | → `{id, phase}` |
| GET | `/apps/:appId/conversations/:cid/messages` | history |
| POST | `/apps/:appId/conversations/:cid/messages` | `{content}` → **SSE** `data: {type: status|summary|question|await_answers|plan|building_entity|built|done|error, …}`. Costs 1 credit. |
| POST | `/apps/:appId/builder/generate` | `{prompt}` one-shot → `{app_name, entities, created}`. 1 credit. |

## Generated code, versions, deploy

| Method | Path | Notes |
|--------|------|-------|
| GET | `/apps/:appId/code` | `{code, generated}` |
| PUT | `/apps/:appId/code` | `{code}` — saved code feeds `/p`, `/export`, GitHub |
| POST | `/apps/:appId/code/generate` | regenerate from schema + data |
| POST | `/apps/:appId/checkpoints` | `{label}` → snapshot schema + records |
| GET | `/apps/:appId/checkpoints` | |
| POST | `/apps/:appId/checkpoints/:id/restore` | replaces schema + records |
| POST | `/apps/:appId/github/export` | `{token, repo_name?}` → creates repo, commits `index.html` + `README.md` |
| GET | `/p/:appId` | **public** published app (HTML, PWA-enabled); `404` unless `visibility=public` |
| GET | `/p/:appId/manifest.webmanifest` · `/sw.js` · `/icon.svg` | PWA assets |
| GET | `/files/:id` | uploaded file |

## Integrations, functions, connectors, tasks

| Method | Path | Notes |
|--------|------|-------|
| POST | `/apps/:appId/integrations/core/InvokeLLM` | `{prompt, system?, model?, max_tokens?, response_json_schema?}` → `{output, raw_model}`. 1 credit. |
| POST | `/apps/:appId/integrations/core/CompareModels` | `{prompt, models[]}` → `{results}`. 1 credit per model. |
| POST | `/apps/:appId/integrations/core/SendEmail` | `{to, subject, body, html?}` → `{delivery: "smtp"|"outbox"}` |
| POST | `/apps/:appId/integrations/core/UploadFile` | multipart `file` → `{file_url}` |
| POST | `/apps/:appId/integrations/core/GenerateImage` | `{prompt, size?}` → `{url}` (`503` without key) |
| POST | `/apps/:appId/functions` | `{name, handler_url}` register |
| POST | `/apps/:appId/functions/:fn` | forwards body to the handler URL (no code execution) |
| GET / POST | `/apps/:appId/connectors` | list / `{type, name, config:{url, method, headers?, api_key_header?, api_key?}}` |
| POST | `/apps/:appId/connectors/:cid/invoke` | performs the real HTTP request → `{status, body}` |
| GET / POST | `/apps/:appId/tasks` | list / `{name, every_minutes, handler_url}` |
| DELETE | `/apps/:appId/tasks/:tid` | |

## WebSocket

`ws://localhost:4489/?token=<access_token>` → `{type:"welcome", socket_id}`.
Send `{type:"broadcast", workspace_id, data}` to fan out to workspace members;
anything else is echoed.

## SDK shape (web)

```ts
const client = createClient({ appId });
await client.auth.me();
await client.entities.Member.list("-created_date", 20);
await client.entities.Member.create({ full_name: "Ada" });
await client.integrations.core.InvokeLLM({ prompt: "…" });
await client.functions.myFn({ payload: 1 });
```
