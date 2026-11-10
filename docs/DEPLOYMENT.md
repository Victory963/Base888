# Base888 — Deployment

## Prerequisites

| Requirement | Why |
|-------------|-----|
| **Node.js ≥ 22.5** (22.x LTS recommended) | the server uses the built-in `node:sqlite` module |
| **pnpm** (`npm i -g pnpm`) | installs are lighter than npm; required for the web app |
| **An LLM** — local **ollama** with `qwen2.5:3b`, or a cloud key | the agent / builder / InvokeLLM |
| Optional: SMTP, Stripe, GitHub PAT, OpenAI (images), Cloudflare Turnstile | real email, payments, repo export, image generation, bot protection |

No Docker is required. A GPU is optional (the default 3B model runs on CPU, slower).

## 1. Install

```bash
git clone https://github.com/Victory963/Base888.git
cd Base888/base888
pnpm -C web install
pnpm -C server install
```

## 2. Configure the server (environment variables)

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `4488` | API port |
| `WS_PORT` | `4489` | WebSocket port |
| `WEB_ORIGIN` | `http://localhost:5888` | allowed browser origin (CORS, cookies) |
| `PUBLIC_URL` | `http://localhost:4488` | base URL used in file links / public URLs |
| `DATA_DIR` | `server/data` | SQLite db, uploads, outbox, generated JWT secret |
| `JWT_SECRET` | *(generated once)* | HS256 signing key; keep stable across restarts |
| `ACCESS_TTL` / `REFRESH_TTL` | `900` / `2592000` | token lifetimes (seconds) |
| **LLM** `LLM_PROVIDER` | auto | `openai` (any OpenAI-compatible endpoint, incl. ollama) or `anthropic` |
| `LLM_BASE_URL` | provider default | e.g. `http://localhost:11434/v1` for ollama |
| `LLM_API_KEY` | — | API key (any string for ollama) |
| `LLM_MODEL` | provider default | e.g. `qwen2.5:3b`, `claude-3-5-sonnet-latest`, `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | — | shortcut: sets provider + key |
| `IMAGE_API_KEY` / `IMAGE_BASE_URL` / `IMAGE_MODEL` | OpenAI defaults | GenerateImage |
| `SMTP_URL` / `MAIL_FROM` | — | real email; without SMTP, `.eml` files go to `data/outbox` |
| `STRIPE_SECRET_KEY` | — | enables real Stripe Checkout for credit top-ups |
| `TURNSTILE_SECRET` / `TURNSTILE_SITE_KEY` | — | Cloudflare Turnstile on login/register |
| `GOOGLE_CLIENT_ID` | placeholder | exposed in frontend config |
| `ENABLE_HSTS` | `false` | send HSTS header (set `true` behind HTTPS) |

GitHub export does not use an env var: the user supplies a Personal Access Token
(scope `repo`) per request.

## 3. Run in development

```bash
# terminal 1 — API (local ollama example)
cd base888/server
LLM_PROVIDER=openai LLM_BASE_URL=http://localhost:11434/v1 LLM_API_KEY=ollama LLM_MODEL=qwen2.5:3b \
  node --no-warnings index.js
# terminal 2 — web
cd base888/web && pnpm dev          # http://localhost:5888
```

Or from `base888/`: `npm run dev` (runs both with `concurrently`).
Demo account: `demo@base888.local` / `demo` (seeded on first boot).

## 4. Production build

```bash
cd base888/web && pnpm build        # → web/dist
```

Serve `web/dist` as static files and reverse-proxy the API paths to `:4488`.
The SPA uses history routing, so unknown paths must fall back to `index.html`.

**Caddy**

```caddy
example.com {
  encode gzip
  @api path /api/* /auth/* /apps/* /workspaces/* /p/* /files/*
  reverse_proxy @api 127.0.0.1:4488 { flush_interval -1 }   # SSE
  root * /srv/base888/web/dist
  try_files {path} /index.html
  file_server
}
```

**nginx (excerpt)**

```nginx
location ~ ^/(api|auth|apps|workspaces|p|files)/ {
  proxy_pass http://127.0.0.1:4488;
  proxy_buffering off;              # SSE streaming
  proxy_set_header Host $host;
}
location / { root /srv/base888/web/dist; try_files $uri /index.html; }
```

Set `WEB_ORIGIN=https://example.com`, `PUBLIC_URL=https://example.com`,
`ENABLE_HSTS=true`, and a fixed `JWT_SECRET`. Run the API under a supervisor
(systemd, pm2) with `node --no-warnings index.js`.

**systemd unit (example)**

```ini
[Unit]
Description=Base888 API
After=network.target
[Service]
WorkingDirectory=/srv/base888/base888/server
EnvironmentFile=/srv/base888/base888/server/.env
ExecStart=/usr/bin/node --no-warnings index.js
Restart=always
User=base888
[Install]
WantedBy=multi-user.target
```

## 5. Docker (optional)

```dockerfile
# Dockerfile (server + prebuilt web)
FROM node:22-alpine
WORKDIR /app
RUN npm i -g pnpm
COPY base888/server/package.json base888/server/pnpm-lock.yaml ./server/
RUN cd server && pnpm install --prod
COPY base888/server ./server
COPY base888/web/dist ./web-dist
ENV PORT=4488 WS_PORT=4489 DATA_DIR=/data
VOLUME /data
EXPOSE 4488 4489
CMD ["node", "--no-warnings", "server/index.js"]
```

Serve `web-dist` with any static server (or the reverse proxy above) and point
it at the container. Mount `/data` to persist the database, uploads and the
JWT secret.

## 6. Data & backup

Everything persistent lives in `DATA_DIR` (default `base888/server/data`):
`base888.db` (+ `-wal`, `-shm`), `files/`, `outbox/`, `.jwt_secret`. Back up the
directory while the server is stopped, or copy the db with `sqlite3 .backup`.

## 7. Health & ports

| Check | Command |
|-------|---------|
| API up | `curl -s localhost:4488/api/feature-flags` |
| Login | `curl -s -X POST localhost:4488/auth/login -H 'content-type: application/json' -d '{"email":"demo@base888.local","password":"demo"}'` |
| Model | `curl -s localhost:11434/api/tags` (ollama) |
| Published app | `curl -s localhost:4488/p/<appId>` |

## 8. Troubleshooting

- **"model 'qwen2.5:3b' not found"** → `ollama pull qwen2.5:3b`, then warm it:
  `curl localhost:11434/api/chat -d '{"model":"qwen2.5:3b","messages":[{"role":"user","content":"ok"}],"stream":false,"keep_alive":"4h"}'`.
- **Generation is slow / times out** → another model is occupying the GPU; unload it
  (`curl localhost:11434/api/generate -d '{"model":"<name>","keep_alive":0,"prompt":""}'`),
  or use a cloud key. The API allows up to 15 min per generation.
- **429 on login** → rate limiter (10 attempts / 15 min per IP + email); wait or register another user.
- **SSE stalls behind a proxy** → disable response buffering (see Caddy/nginx above).
- **Lost sessions after restart** → set a fixed `JWT_SECRET` or keep `DATA_DIR/.jwt_secret`.
