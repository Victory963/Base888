# Base44 → Base888 — Reverse-Engineering Report

**Target analysed:** `https://app.base44.com/` (public, client-side delivery only)
**Reconstruction project:** Base888 (`/home/zhao/Bass888-REA/base888`)
**Date:** 2026-10-26
**Primary tool:** REA (`analyze_javascript_application`), plus static asset capture
**Analyst:** automated session

---

## 0. Scope & authorization boundary

This analysis is limited to **client-side code that Base44 serves publicly to any
browser** (HTML, JS/CSS chunks, and the runtime config endpoint). No
authentication was bypassed, no private API was exercised with credentials, and
no server-side code was accessed.

All tokens recovered from `frontend-config.js` (Turnstile site key, Google OAuth
client id, Datadog client token) are **public client-side identifiers by design**
and are safe to document. No secret material was found or sought.

The downstream security testing (PentAGI) is scoped **only to the user's own
Base888 deployment**, never to `app.base44.com` or any Base44/Wix
infrastructure. Unauthorized testing of third-party production systems is out of
scope and was not performed.

---

## 1. Method & evidence

| Step | Action | Evidence |
|------|--------|----------|
| 1 | Fetched landing HTML | `evidence/base44_index.html` (10.3 KB, HTTP/2 via Cloudflare) |
| 2 | Crawled eager module graph | 40 JS chunks + 1 CSS, 1.66 MB — `evidence/base44_app/static/` |
| 3 | Pulled runtime config | `evidence/frontend-config.js` (`window.__APP_CONFIG__`) |
| 4 | REA static analysis | `analyze_javascript_application` — parent evidence `ev_e49b99fe…e200f` |

REA statistics: 41 parsed JS files, 425,362 AST nodes, 3,386 findings, 43
request/endpoint relations, 7,976 closure + 68,784 data-flow relations retained.
Coverage is **partial** (semantic graph ceiling hit) and all conclusions are
static — no bundle code was executed. Two inline `<script>` bodies in
`index.html` were not analysed.

---

## 2. Technology stack (observed)

- **Build tool:** Vite with the **rolldown** bundler (`rolldown-runtime-*.js`,
  `runtime-*.js`, `preload-helper-*.js`).
- **UI framework:** React (`vendor-react`, `react-*.js`), `prop-types`.
- **State:** Zustand (`create-zustand-store`, `actions.middleware`,
  `persist-to-storage`).
- **Data layer:** `vendor-data` (TanStack-Query-style request/cache layer).
- **HTTP:** Axios (`axiosClient`, `backend`, `bridge`).
- **i18n:** i18next-style (`i18n`, `I18nProvider`).
- **Design system / UI kit:** `vendor-ui`, `useDesignSystem`, `toast`,
  `use-toast`, `use-mobile`.
- **Native shell:** `native-mobile-app`, `useHideNativeBottomTabs` (Capacitor-style
  web↔native bridge for the mobile wrapper).
- **Dates:** `moment`. **Analytics:** Mixpanel (`mixpanelUtils`). **Errors/RUM:**
  Datadog (`errorReporting`).
- **Feature flags / experiments:** `useFeatureFlags` + `PRE_AUTH_FLAGS` /
  `PRE_AUTH_EXPERIMENTS` in config.

---

## 3. Backend topology (from `window.__APP_CONFIG__`)

| Key | Value | Role |
|-----|-------|------|
| `BACKEND_URL` | `https://app.base44.com` | main REST API |
| `SDK_BACKEND_URL` | `https://base44.app` | SDK backend; user apps hosted as `*.base44.app` |
| `WS_BACKEND_URL` | `https://ws.base44.com` | realtime WebSocket |
| `SUPERAGENT_PLATFORM_URL` | `https://superagent.base44.com` | AI "superagent" |
| `BACKOFFICE_URL` | `https://backoffice.base44.com` | internal back-office |
| `APPS_BASE_DOMAIN` | `base44.app` | per-app subdomain hosting |
| `TURNSTILE_*` | site key + flags | Cloudflare Turnstile on login / reset |
| `GOOGLE_CLIENT_ID` | …apps.googleusercontent.com | Google OAuth |
| `DATADOG_*` | app id + client token | RUM / error reporting |
| `MP_CDN_DOMAIN` | `media.base44.com` | Mixpanel proxy CDN |
| `APP_FLAVOR` | `platform` | runtime flavor switch |

---

## 4. API surface (literal endpoints recovered)

**Auth:** `/auth/login`, `/auth/refresh`, `/auth/sso/login`, `/auth/sso/my-tokens`,
`/auth/oidc/login`, `/auth/github/login`, `/auth/apple/login`,
`/auth/mobile/google/token-exchange`, `/api/auth/oidc/session/exchange`,
`/api/auth/oidc/logout`, `/workspaces/{id}/auth/sso/login`.

**Apps / editor:** `/apps/`, `/apps/:appId`, `/apps/{id}/editor`,
`/apps/{id}/editor/preview`, `/apps/{id}/editor/workspace/workflow-{n}`.

**Consent / invite / RUM:** `/api/consent/config`, `/api/consent/receipts`,
`/api/invite/invitation/{id}/auth-routing`, `/api/v2/rum`.

**Custom request headers (axios):** `Authorization: Bearer …`, `X-Active-Workspace-Id`,
`X-Active-App-Id`, `X-Request-ID`, `X-Socket-Id`, `X-Builder-Model-Selection`,
`X-Preview-Lens-Client-Platform`, `X-Origin-URL`, `X-Skip-Active-Workspace`,
`X-Base`, `X-Error-Code`; `withCredentials: true`.

---

## 5. SDK shape (`entities` / `integrations` / `functions` / `auth`)

The client exposes a Base44-style SDK whose top-level namespaces are `auth`,
`entities`, `integrations`, and `functions`, keyed by `appId` / `app_id`. This is
the public `@base44/sdk` surface: `client.entities.<Name>.list/create/update/delete`,
`client.auth.me()/login()/logout()`, `client.integrations.*`, `client.functions.*`.

---

## 6. Reconstruction mapping → Base888

| Base44 chunk / concept | Base888 module |
|------------------------|----------------|
| `frontend-config.js` (`__APP_CONFIG__`) | `web/src/config/appConfig.ts` |
| `axiosClient` (headers, interceptors) | `web/src/api/axiosClient.ts` |
| `AuthAPI` / `AuthContext` | `web/src/api/authApi.ts`, `web/src/context/AuthContext.tsx` |
| `WorkspaceAPI` / `WorkspaceContext` | `web/src/api/workspaceApi.ts`, `web/src/context/WorkspaceContext.tsx` |
| `create-zustand-store` / `persist-to-storage` | `web/src/stores/*` |
| SDK (`entities`/`integrations`/`functions`) | `web/src/sdk/base888Sdk.ts` |
| `i18n` / `I18nProvider` | `web/src/i18n/*`, `web/src/context/I18nProvider.tsx` |
| `useFeatureFlags` | `web/src/hooks/useFeatureFlags.ts` |
| `useDesignSystem` / `toast` | `web/src/hooks/*`, `web/src/components/Toast.tsx` |
| backend endpoints | `server/index.js` + `server/src/*` (real REST + WebSocket, SQLite) |

Base888 is a **clean-room architectural reimplementation**: it reproduces the
*structure* and *contracts* observed above, with its own original code, its own
name/branding, and a real backend (SQLite persistence, scrypt/JWT auth). It
contains no Base44 source, assets, or trademarks.

---

## 7. Limitations & unknowns (from REA)

- Static only; no runtime execution observed. Dynamic/lazy route chunks loaded
  after bootstrap may be absent (eager modulepreload graph was captured).
- Minification removes original identifiers; module *roles* are inferred from
  chunk names, config, and endpoint literals, not from source symbols.
- 41,807 semantic-graph unknowns remain in the parent evidence; graph coverage
  is explicitly partial.
- Server-side behaviour is inferred from client calls only and is not observed.
