# Base888 — Security Checkup Runbook (PentAGI)

This runbook drives an **autonomous security checkup of your own Base888
deployment** using PentAGI. It is scoped to assets you control.

> **Authorization rule (non-negotiable).** PentAGI runs real offensive tools
> (nmap, sqlmap, Metasploit, …) against whatever target you give it. The only
> authorized target here is **your own Base888** running on `localhost` or your
> own lab host. Never point it at `app.base44.com` or any Base44/Wix host — that
> is unauthorized testing and is out of scope for this project. The reverse-skill
> case (`work/base888/scope.md`) already encodes this: `network_profile =
> authorized_target_only`, in-scope = the two localhost endpoints, with DoS /
> phishing / exfil explicitly out of scope.

## Why this isn't run automatically here

PentAGI requires a running **Docker + Docker Compose** engine. This workstation
has no Docker binary and no privileged access to install one, so the checkup
is prepared but not executed. Run the steps below on a host with Docker.

## Prerequisites

- Docker Engine + Docker Compose v2 (`docker compose version`).
- One LLM provider API key (OpenAI, Anthropic, Gemini, DeepSeek, a local Ollama, …).
- Base888 running and reachable from the PentAGI sandbox container.

## Step 1 — Run Base888 as the target

```bash
cd base888
npm run install:all      # first time only
npm run dev              # web on :5888, real API on :4488, WS on :4489
```

From inside PentAGI's Docker sandbox, your host is `host.docker.internal`
(Docker Desktop / recent Linux). So the target URLs are:

- Web app: `http://host.docker.internal:5888`
- API:     `http://host.docker.internal:4488`

(If `host.docker.internal` is unavailable, use your host's LAN IP and bind the
Base888 server to `0.0.0.0`.)

## Step 2 — Configure PentAGI

A scoped `.env` was prepared at `tools/pentagi/.env` (from `.env.example`) with
`ASK_USER=true` and a scope banner. Add **one** provider key, e.g.:

```bash
cd ../tools/pentagi
# edit .env and set, for example:
#   OPEN_AI_KEY=sk-...
# or ANTHROPIC_API_KEY=sk-ant-...
```

## Step 3 — Bring up the stack

```bash
docker compose up -d           # core: pentagi + pgvector + scraper
docker compose logs -f pentagi # wait for the web UI to come up
```

Open the PentAGI web UI (port per compose, default `https://localhost:8443`),
register the local admin, and add your LLM key in Settings if not via `.env`.

## Step 4 — Launch the checkup flow

In the UI, create a new flow and describe the task in plain language, for example:

> Target: `http://host.docker.internal:4488` (my own Base888 API) and the
> SPA at `http://host.docker.internal:5888`. Perform an authorized security
> checkup. Enumerate endpoints, test authentication and authorization on the
> `/apps/:appId/entities/*` CRUD routes, the `/auth/*` flows, and the
> integration/function endpoints. Check for IDOR across `appId`/workspace,
> missing authz, injection, SSRF in integrations, and insecure CORS. Do not run
> DoS. Produce a report.

## What to look at first (from the reconstruction)

The reverse-engineering report (`analysis/REVERSE-ENGINEERING-REPORT.md`) maps the
surface. High-value checks for a Base44-style design:

1. **Tenant/authz isolation** — `appId` and `X-Active-Workspace-Id` are
   client-supplied. Verify the server enforces that the caller owns the app /
   workspace (IDOR is the classic app-builder risk).
2. **Entities CRUD** — `/apps/:appId/entities/:name` must enforce per-app, per-
   user access and schema validation.
3. **Integrations** — `InvokeLLM` / `UploadFile` / `SendEmail` are SSRF /
   file-abuse / email-abuse surfaces.
4. **Auth flows** — `/auth/refresh` cookie handling, OAuth state, token scoping.
5. **CORS / headers** — credentialed CORS must not reflect arbitrary origins.

> Base888's backend is real (SQLite + scrypt/JWT). A local checkup already ran —
> see `SECURITY-FINDINGS.md` for verified-safe areas, fixes applied, and open
> items. PentAGI adds autonomous, dynamic coverage on top of that.

## Manual fallback (no Docker)

Without PentAGI you can still run authorized checks against local Base888, e.g.
confirm the entities routes reject unauthenticated calls:

```bash
curl -i http://localhost:4488/apps/app_x/entities/Task         # expect 401
curl -i -X POST http://localhost:4488/auth/login \
  -H 'content-type: application/json' -d '{"email":"demo@base888.local","password":"demo"}'
```
