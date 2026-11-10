# Base888 ↔ Base44 — Honest Parity Ledger

**Purpose:** an honest, no-虚标 accounting of what Base888 implements versus Base44,
grounded in the reverse-engineering of Base44's full client bundle (571 chunks /
538 component names, GIT_SHA `800c6210…`, captured in `evidence/base44_v2/`).

**Headline (no spin):** Base44 is a complete commercial AI app-building platform
(acquired by Wix for ~$80M). Base888 reproduces the **core build→data→preview
loop at a basic level, driven by a weak local model**. Realistic coverage of
Base44's feature surface is roughly **~35% after round-3 engineering** (see the
Round-2 and Round-3 sections at the bottom), and generation *quality* is far
below Base44's (which orchestrates frontier models: Claude, GPT o1/o3, Gemini —
seen in the bundle). Full 1:1 parity is years of work and is not claimed.

Legend: ✅ implemented · 🟡 partial/basic · 🔴 stub only · ⬜ not implemented

| # | Base44 feature (evidence) | Base888 status | Honest note |
|---|---------------------------|----------------|-------------|
| 1 | Password auth, refresh tokens | ✅ | real scrypt+JWT+rotating refresh |
| 2 | OAuth/SSO (Google/GitHub/Apple/OIDC), external-auth tokens | 🔴 | `/auth/:provider/login` returns 501 |
| 3 | Workspaces/teams, invite links, SSO, roles (`WorkspaceInviteLinksAPI`, `WorkspaceSSOAPI`) | 🟡 | list/create + membership authz only; no invites/SSO/roles |
| 4 | Apps: create/list/get | 🟡 | basic CRUD |
| 5 | Apps: trash, branches, versions, settings (`BranchSmall`, `app-publish.store`) | ⬜ | none |
| 6 | **Superagent chat builder** (`Chat`, `PromptInput`, `conversations/v2`) | 🟡 | implemented: streaming SSE chat, one conversation thread |
| 7 | **Clarifying questions** (`ClarifyingQuestions`) | ✅ | agent asks 2–4 questions before building |
| 8 | **Multi-entity app generation** | 🟡 | 4–7 entities with field types/enums/references; **local-model quality**, ~30–60s |
| 9 | Model arena / multi-model (`CompareModelsModelField`, `modelArenaMessageParams`) | ⬜ | single configured model |
| 10 | Agent skills & proactivity (`WorkspaceSkillsAPI`, `/superagent/proactivity`) | ⬜ | none |
| 11 | Prompt attachments / images (`PromptAttachments`, `chatUploadStore`) | ⬜ | text prompts only |
| 12 | **Entity data model & CRUD** (`Table`, `DataCollectionSmall`) | 🟡 | generic JSON CRUD + filter; **no server-side type/relation enforcement** |
| 13 | **Live preview** (`app-preview.store`, `preview-overlay`) | 🟡 | auto-generated tables + typed forms (enum selects, reference pickers); **not** the real generated React app |
| 14 | **Code editor** (Monaco, `code-input`, `code-diff`, `monacoTypeScriptUtils`) | ⬜ | none — Base44 generates & edits real app code; Base888 does not |
| 15 | Publish/deploy to app subdomains (`DsPublishButton`, GitHub publish) | ⬜ | none |
| 16 | Integrations: InvokeLLM / SendEmail / UploadFile / GenerateImage | 🟡 | LLM via local ollama (or cloud key); email→SMTP or local outbox; file→disk; image→needs key |
| 17 | Connectors marketplace (`IntegrationsCatalogAPI`, `ConnectorsDialog`, Google Ads, Stripe/payments) | ⬜ | none |
| 18 | Serverless functions (`FunctionDisplay`, `FunctionSmall`) | 🔴 | `/functions/:fn` forwards to a registered webhook URL only |
| 19 | Scheduled tasks (`/editor/workspace/scheduled-tasks`) | ⬜ | none |
| 20 | Dashboards / BI (`WorkspaceDashboardContext`, `TableChartSmall`) | ⬜ | none |
| 21 | Community / marketplace / templates (`promptGalleryData`, `/superagent/:id/community`) | ⬜ | none |

## What is genuinely aligned (verified, with evidence)

- Conversational agent loop: `POST /apps/:id/conversations` → `POST …/messages`
  (SSE), matching Base44's `conversations/v2/:id/messages` shape. Verified: a
  gym prompt → 3 clarifying questions (4s) → streamed build of 4 related entities
  (`Member`,`Trainer`,`Class`,`Booking`) in ~34s, with enum + reference fields.
- Live preview renders a working CRUD app from the generated schema
  (`evidence/base888_preview.png`).

## What is explicitly NOT aligned (so there is no 虚标)

No code editor, no app-code generation, no deploy/hosting, no branches/versions,
no connectors marketplace, no payments/ads, no model arena, no skills/proactivity,
no attachments, no dashboards, no scheduled tasks, no OAuth/SSO. Server-side
schema types and relationships are **not enforced** (they drive the preview UI
only). Generation quality is bounded by the local model.

Also entirely MISSING (from the full 571-chunk / 1466-file crawl): checkpoints /
version history (`CheckpointsAPI`, `RestoreVersionModalGate`), GitHub
export/import (`ExportToGithubModal`, `WorkspaceGithubAPI`), billing / credits /
subscriptions (`BillingAPI`, `CreditsAPI` — Base888's `unlock-state` just
hardcodes `unlocked:true`), admin / backoffice (`BackofficeHomePage`,
`AdminUsersAPI`), marketing OS / campaigns / ads (`MarketingOsAPI`,
`GoogleAdsAPI`), analytics / BI dashboards (`AnalyticsAPI`, `KpiCards`), native
mobile app builder (`NativeMobileApp`, `MobileBuildsAPI`), workflows / scheduled
automations (`WorkflowPage`, `triggerRegistry`), and MFA / passkeys (`MfaAPI`,
`PasskeySmall`). `/auth/sso/my-tokens` only lists refresh tokens (misnamed, not
real SSO).

## To close the biggest quality gap

Set a frontier key on the backend (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) — the
agent is model-agnostic and will immediately produce faster, richer apps. That
narrows the *quality* gap but not the *feature* gap above.

## Independent adversarial audit (2026-10-26)

Two adversarial agents audited this project (one for RE coverage, one hunting
overstatements). Both **concurred with the ~10–15% estimate**. Key findings and
what was corrected:

- **"AI coding" was overstated.** The loop produces a JSON data model + sample
  rows and renders canned CRUD tables — it generates **data, not application
  code**. Corrected the framing in `builder.js`, `BuilderPage.tsx`, and this repo's
  README; the agent UI already says "build a data model and sample data."
- **Core-product gap, stated plainly:** Base44's headline ("it builds you an
  app") means generated/editable **code** + deploy; Base888's is a
  schema-to-table mock. This is the honest ceiling of the reconstruction.
- **Data layer is cosmetic:** entity rows are a JSON blob; field types and
  relationships drive the preview UI only and are **not enforced** server-side;
  `/entities/:name/filter` is in-memory equality (no operators/sort).
- **Functions were inert** (no way to register a handler). Fixed: added
  `POST /apps/:id/functions` to register `{name, handler_url}`; `/functions/:fn`
  then forwards to it (still no code execution, by design).
- **Stale/false README lines fixed:** "any email with password demo works" (false
  — only the seeded or a registered user logs in) and "InvokeLLM → 503 when
  unconfigured" (stale — it returns real output via the local model;
  `GenerateImage` is the 503 one).

What the audit **confirmed as real (not 虚标):** password auth + rotating refresh,
per-workspace authorization (IDOR → 403, JWT tamper → 401), the four integrations
(InvokeLLM real; SendEmail → real `.eml`; UploadFile → disk + served;
GenerateImage → honest 503), and the clarify → build → preview loop.

## Round-2 engineering — new real features (each verified against the live API)

Added this round (no stubs; tested):

- **Server-side data enforcement:** entity create/update validate field types,
  `required`, `enum` membership, and `reference` integrity → bad values `400`.
  (Fixes the "cosmetic data layer" finding.)
- **Rich query:** `/entities/:name/filter` supports operators (`$gt` `$lt` `$gte`
  `$lte` `$ne` `$in` `$contains`), `sort`, `limit`/`offset`.
- **Manual schema editor API:** `PUT /schema`, `POST`/`DELETE /schema/entities`.
- **Checkpoints / version history:** snapshot + list + restore (schema + data).
- **Publish:** `PUT /publish` → public read-only app at `/p/:appId` (no auth).
- **App export (codegen):** `GET /export` generates a standalone, runnable
  single-file HTML app with embedded data (real generated code — not Base44's
  editable React app).
- **Per-app dashboard:** KPI cards + enum-breakdown charts from live data.
- **Real TOTP 2FA (RFC 6238):** setup/enable/disable; login blocked without a
  valid code once enabled.
- **Model listing + compare:** `/api/models`; `CompareModels` runs several models.
- **Simulated credits:** `/api/credits`; each generation costs 1 (402 when
  exhausted). Honest: no real payment is processed.

These move coverage from ~10–15% to ~25%. **Still genuinely out of scope** (would
be 虚标 if claimed done): Monaco in-browser IDE editing generated React code; real
cloud deploy with custom domains; real payment processing; GitHub OAuth repo sync;
native mobile build pipelines; the full connectors marketplace; and frontier-model
generation quality. Those need an engineering team, not a prompt.

## Round-3 engineering — tackling the "remaining 75%", honestly

Built real and verified this round:

- **Monaco code editor + editable generated app:** the AI generates a
  self-contained single-file app's real source; you edit it in Monaco; `/export`,
  Publish, and the public `/p/:id` URL all serve YOUR edited code (verified: an
  injected marker appears in export and the public page). Closes "generates no
  code". Honest scope: a single-file HTML/JS app, not Base44's multi-file React
  project with their runtime.
- **GitHub export:** `POST /apps/:id/github/export` with your Personal Access
  Token actually creates a repo and commits the app files via the GitHub REST
  API. Gated (400 without a token) — no fakery.
- **Connectors + framework:** a catalog plus real outbound HTTP / webhook / REST
  connectors that genuinely fire (verified: a connector called a live API and
  returned real data). Not "dozens of pre-built OAuth integrations" — the
  framework + real generic connectors.
- **Payments (Stripe Checkout):** `POST /api/billing/checkout` creates a real
  Stripe Checkout session, gated on `STRIPE_SECRET_KEY` (503 without it). No fake
  charges.
- **Installable PWA:** published apps serve a real web manifest + service worker +
  icon, so `/p/:id` installs as an app. The honest substitute for "native mobile"
  — not a compiled App Store binary.

Coverage is now ~35%.

### Still genuinely NOT done (claiming otherwise would be 虚标) — and why
- **Real cloud deploy + custom domains:** needs YOUR cloud account + DNS. Shipped
  substitute: `/p/:id` is a real served app; `/export` + GitHub give deployable
  artifacts to point any static host / Caddy / nginx at.
- **Native iOS/Android binaries:** need Xcode / Android SDK, signing certs, and
  Apple/Google developer accounts. The PWA is the honest substitute.
- **Full connectors marketplace (dozens of branded OAuth integrations):** each is
  its own OAuth+API project; only the framework + generic connectors exist.
- **Editing a full multi-file React codebase with Base44's runtime:** only
  single-file app editing is real.
- **Frontier-model generation quality:** only a frontier API key delivers it; the
  system is model-agnostic and key-ready, but it cannot be conjured locally.

Verification note: this sandbox blocks the *server's* outbound internet, so GitHub
push / external connectors / Stripe were verified by credential-gating and (for
connectors) a loopback call. They make real external calls when the server runs on
a normal network (your machine).

## Round-4 — UI/UX alignment to the real builder (2026-11-09)

Reverse-engineered from the captured bundle (`ja-CqLVNOCF.js` locale strings,
component inventory) plus live screenshots, then rebuilt Base888's frontend as
three views matching Base44's actual builder UX:

- **Home** (`/`): sidebar with アプリ/エージェント modes and the full nav
  (ホーム・検索・すべてのアプリ・ベースコード・アプリテンプレート・コミュニティ・
  コネクター・パートナー, お気に入り, 最近の項目, upgrade card, workspace footer);
  personalized greeting「こんにちは、{name}さん。次は何を作りますか?」; prompt
  composer (＋ / 自動 / 作成 / 音声 / send); 最近のアプリ・コミュニティ・テンプレート tabs.
- **Editor / Preview** (`/apps/:id/editor/preview`): left build-chat with 提案
  chips and the「何を変更しますか?」composer (自動/ビルド); right **live preview**
  iframe; toolbar with branch selector (= checkpoints, incl. 新しいブランチを作成),
  プレビュー/ダッシュボード tabs, 編集 (Monaco), domain bar, 公開.
- **Superagent** (`/superagent/...`): agent-mode sidebar (新しい会話・ワークフロー・
  プラグイン・チャネル・アーティファクト・エージェント設定・会話), wide chat, channel
  bar, action chips (デプロイしたサイトを確認する / Slackに共有リンクを送る /
  ダッシュボードを改善する), composer.
- Generated apps are now **dashboard-style** single-file apps (side nav, KPI
  cards, overview, activity feed, searchable tables).
- Supporting pages are real: all apps, search, templates (create from prompt),
  community (published apps), connectors (real HTTP), workflows (real interval
  scheduler), artifacts (export/code/public URL), code picker, settings.

Honest notes (no 虚標): messaging channels (WhatsApp/Telegram/LINE/iMessage/Slack)
are displayed but **not connected** and say so; パートナー is marked 未実装;
「ドメインを取得」and voice/attachment buttons are UI affordances without a backend;
Base44's logo and name are **not** reproduced — Base888 uses its own mark.
