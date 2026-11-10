# Base888 — Project Tree (annotated)

Generated artifacts (`node_modules`, `dist`, `server/data`), third-party tool
clones (`tools/`) and captured bundles (`evidence/`) are excluded from the
repository by `.gitignore`.

```
Base888/
├── README.md                      中文 README (default)
├── README_EN.md                   English README
├── README_JA.md                   日本語 README
├── LICENSE                        MIT + trademark notice
├── .gitignore
│
├── base888/                       ── the application ──
│   ├── package.json               root scripts: install:all, dev (concurrently), build, typecheck
│   ├── README.md                  app-level overview, run instructions, caveats
│   ├── PARITY-LEDGER.md           honest feature-by-feature parity vs Base44 (4 rounds)
│   ├── SECURITY-FINDINGS.md       audited security checkup results
│   ├── SECURITY-CHECKUP.md        PentAGI runbook (own deployment only)
│   ├── .gitignore
│   │
│   ├── web/                       ── frontend: Vite 5 · React 18 · TypeScript ──
│   │   ├── index.html             loads /api/frontend-config.js before the bundle
│   │   ├── vite.config.ts         dev proxy (/api /auth /apps /workspaces → :4488), named vendor chunks
│   │   ├── package.json           deps: react, react-router-dom, zustand, axios, i18next, @monaco-editor/react
│   │   ├── tsconfig.json          strict TS, "@/" alias
│   │   └── src/
│   │       ├── main.tsx           React root
│   │       ├── App.tsx            routing: /login · full-screen editor/code · AppShell routes
│   │       ├── styles.css         light builder theme, sidebar/composer/editor/superagent layout
│   │       ├── vite-env.d.ts      window.__APP_CONFIG__ typing
│   │       ├── components/
│   │       │   ├── AppShell.tsx   sidebar shell: App/Agent modes, nav, recent, upgrade, workspace footer
│   │       │   ├── Layout.tsx     (legacy simple layout)
│   │       │   └── Toast.tsx      toast viewport
│   │       ├── pages/
│   │       │   ├── HomePage.tsx            greeting + prompt composer + recent/community/templates
│   │       │   ├── EditorView.tsx          vibe-coding workspace: build chat + live preview + toolbar
│   │       │   ├── SuperagentView.tsx      wide agent chat, channel bar, action chips
│   │       │   ├── CodeEditorPage.tsx      Monaco editor over generated source + preview
│   │       │   ├── PreviewPage.tsx         schema-driven CRUD preview + publish/export/snapshot
│   │       │   ├── AppDashboardPage.tsx    KPI cards + enum charts
│   │       │   ├── AppEditorPage.tsx       entity data editor + live InvokeLLM
│   │       │   ├── SettingsPage.tsx        credits, models, TOTP 2FA
│   │       │   ├── SimplePages.tsx         AllApps · Search · Templates · Community · Connectors
│   │       │   │                           · Workflows · Channels · Artifacts · CodePicker · Partners
│   │       │   ├── AgentBuilderPage.tsx    (earlier agent chat page)
│   │       │   ├── BuilderPage.tsx         (earlier one-shot builder page)
│   │       │   ├── DashboardPage.tsx       (earlier app list page)
│   │       │   └── LoginPage.tsx           login + registration
│   │       ├── hooks/
│   │       │   ├── useAgentChat.ts         shared SSE conversation state machine
│   │       │   ├── useToast.ts · useFeatureFlags.ts · useDesignSystem.ts · useMobile.ts
│   │       ├── api/
│   │       │   ├── axiosClient.ts          Bearer auth, custom headers, single-flight refresh
│   │       │   ├── agentApi.ts             createConversation, streamMessage (SSE parser)
│   │       │   ├── appManageApi.ts         dashboard, publish, export, checkpoints, schema, code
│   │       │   ├── builderApi.ts · workspaceApi.ts · authApi.ts · accountApi.ts
│   │       ├── sdk/base888Sdk.ts           client.auth / entities.<Name> / integrations.core / functions
│   │       ├── stores/                     zustand: createStore (persist), authStore, workspaceStore
│   │       ├── context/                    AuthContext, WorkspaceContext, I18nProvider
│   │       ├── config/appConfig.ts         runtime config (window.__APP_CONFIG__ with fallbacks)
│   │       └── i18n/index.ts               i18next resources (en, zh)
│   │
│   └── server/                    ── backend: Node 22 · Express 4 · node:sqlite ──
│       ├── index.js               69 routes, security headers, CORS, rate limiting, SSE, public /p + PWA,
│       │                          in-process task scheduler, WebSocket start
│       ├── package.json           deps: express, cors, cookie-parser, ws, busboy, nodemailer, undici
│       └── src/
│           ├── config.js          env config, persisted JWT secret, LLM/image/SMTP settings
│           ├── db.js              17-table schema, ALTER migrations, demo seed, query helpers
│           ├── auth.js            scrypt, HS256 JWT, rotating refresh tokens, requireAuth, requireAppAccess
│           ├── totp.js            RFC 6238 TOTP (base32, HMAC-SHA1)
│           ├── schema.js          validation (types/required/enum/reference), query engine, schema edits
│           ├── agent.js           clarify → build → materialize; SSE step events
│           ├── builder.js         one-shot generator, tolerant JSON extraction/repair
│           ├── llm.js             OpenAI-compatible / Anthropic via undici, JSON mode, temp 0
│           ├── codegen.js         dashboard-style standalone single-file app generator
│           ├── mailer.js          SMTP or real .eml outbox
│           ├── github.js          create repo + commit files with a user PAT
│           └── ws.js              token-authenticated WebSocket, workspace broadcast
│
├── docs/                          ── documentation ──
│   ├── ARCHITECTURE.md            system/front/back architecture, pipelines, sequence diagram
│   ├── ER-DIAGRAM.md              field-level ER diagram + table notes
│   ├── TREE.md                    this file
│   ├── UI-SCREENS.md              every screen with screenshots and features
│   ├── DEPLOYMENT.md              install, env vars, production, Docker, backup, troubleshooting
│   ├── MODELS.md                  models & external services
│   ├── API.md                     endpoint reference
│   └── screenshots/               home · editor-preview · superagent · code-editor · preview ·
│                                  dashboard · data-editor · settings · all-apps · templates ·
│                                  community · connectors · workflows · artifacts · login
│
├── analysis/                      ── reverse-engineering outputs ──
│   ├── REVERSE-ENGINEERING-REPORT.md
│   ├── endpoints_paths.txt        endpoint literals recovered from the bundle
│   └── routes.txt
│
└── work/base888/                  ── reverse-skill case (process record) ──
    ├── scope.md                   authorization scope (own deployment only)
    ├── timeline.md                append-only timeline
    ├── workitems.md · README.md
    └── evidence/                  E-001 … E-004 evidence notes
```

Runtime (not committed): `base888/server/data/` holds `base888.db` (+WAL), `files/`,
`outbox/` and `.jwt_secret`.
