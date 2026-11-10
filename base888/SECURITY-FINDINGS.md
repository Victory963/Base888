# Base888 — Security Checkup Findings (2026-10-26)

Authorized checkup of the **user's own Base888** real backend on `localhost`
(scope: `work/base888/scope.md`, `authorized_target_only`). Method: live probes
against the running API + source review of `server/` + functional security tests.

> This is a local, non-Docker checkup. The deeper **autonomous** PentAGI scan is
> prepared but needs Docker (unavailable on this host) — see `SECURITY-CHECKUP.md`.

## Verified safe (tested against the live server)

| Check | Result |
|-------|--------|
| Tenant/authorization (IDOR) | user A cannot read user B's app → **403** |
| JWT integrity | tampered access token → **401** (HS256 verify) |
| Refresh tokens | single-use rotation; reused old token → **401** |
| SQL injection | parameterized `node:sqlite` statements; quote-in-email → 401, no 500 |
| CORS | origin allowlisted; arbitrary origin not reflected |
| Password storage | scrypt + per-user salt, `timingSafeEqual` compare |
| File access | random/unknown id → 404 |

## Findings fixed in this pass

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | Low | `X-Powered-By: Express` disclosure | `app.disable("x-powered-by")` |
| 2 | Low/Med | Missing security headers | added `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Resource-Policy` (HSTS via `ENABLE_HSTS`) |
| 3 | Medium | No brute-force protection on `/auth/login`,`/auth/register` | in-memory rate limiter (10 / 15 min per IP+email → 429) — verified |

## Open / accepted risk (dev-grade; harden before production)

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 4 | Low | Files served by unguessable id without authz (CDN pattern) | signed URLs or per-request authz if files are sensitive |
| 5 | Low | No password-strength policy; demo seed creds exist | enforce min strength; remove seed user in prod |
| 6 | Low | CSRF: state-changing routes rely on Bearer + `SameSite=Lax` cookie | add CSRF tokens if any state-changing route accepts cookie-only auth |
| 7 | Info | Rate limiter is in-memory (per process) | use a shared store (Redis) when scaling out |
| 8 | Info | Integrations call external providers (LLM/image/webhook functions) | SSRF review on `functions.handler_url`; allowlist egress |

## Residual (needs the autonomous scan)

Dynamic fuzzing of every entity/integration route, auth-flow edge cases, and
dependency CVEs are left to the PentAGI run against your own Base888 once Docker
is available. The function-dispatch route (`/apps/:appId/functions/:fn` →
`handler_url`) is the top SSRF candidate to exercise there.
