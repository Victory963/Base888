# Base888 — Entity-Relationship Diagram

Storage is a single SQLite database (`base888/server/data/base888.db`, WAL mode)
managed by `base888/server/src/db.js`. Tables are created with
`CREATE TABLE IF NOT EXISTS`; later columns are added by idempotent
`ALTER TABLE` migrations. Dumped from the live database.

```mermaid
erDiagram
  users {
    TEXT id PK
    TEXT email UK
    TEXT full_name
    TEXT role
    TEXT pw_hash
    TEXT pw_salt
    TEXT mfa_secret
    INTEGER mfa_enabled
    INTEGER credits
    TEXT created_date
  }
  workspaces {
    TEXT id PK
    TEXT name
    TEXT owner_id FK
    TEXT created_date
  }
  workspace_members {
    TEXT workspace_id PK_FK
    TEXT user_id PK_FK
    TEXT role
  }
  invites {
    TEXT id PK
    TEXT workspace_id FK
    TEXT email
    TEXT role
    TEXT token
    INTEGER accepted
    TEXT created_date
  }
  refresh_tokens {
    TEXT id PK
    TEXT user_id FK
    TEXT token_hash
    INTEGER expires_at
    INTEGER revoked
    TEXT created_date
  }
  apps {
    TEXT id PK
    TEXT workspace_id FK
    TEXT name
    TEXT description
    TEXT flavor
    TEXT visibility
    TEXT app_code
    TEXT created_by FK
    TEXT created_date
    TEXT updated_date
  }
  app_schemas {
    TEXT app_id PK_FK
    TEXT prompt
    TEXT schema
    TEXT created_date
  }
  entities {
    TEXT id PK
    TEXT app_id FK
    TEXT entity_name
    TEXT data
    TEXT created_by FK
    TEXT created_date
    TEXT updated_date
  }
  conversations {
    TEXT id PK
    TEXT app_id FK
    TEXT user_id FK
    TEXT phase
    TEXT original_prompt
    TEXT answers
    TEXT created_date
  }
  messages {
    TEXT id PK
    TEXT conversation_id FK
    TEXT role
    TEXT content
    TEXT meta
    TEXT created_date
  }
  checkpoints {
    TEXT id PK
    TEXT app_id FK
    TEXT label
    TEXT snapshot
    TEXT created_date
  }
  app_functions {
    TEXT app_id PK_FK
    TEXT name PK
    TEXT handler_url
  }
  connectors {
    TEXT id PK
    TEXT app_id FK
    TEXT type
    TEXT name
    TEXT config
    TEXT created_date
  }
  scheduled_tasks {
    TEXT id PK
    TEXT app_id FK
    TEXT name
    TEXT cron
    TEXT handler_url
    INTEGER enabled
    TEXT last_run
    TEXT created_date
  }
  files {
    TEXT id PK
    TEXT app_id FK
    TEXT user_id FK
    TEXT filename
    TEXT mime
    INTEGER size
    TEXT path
    TEXT created_date
  }
  feature_flags {
    TEXT key PK
    INTEGER enabled
  }
  consent_receipts {
    TEXT id PK
    TEXT user_id FK
    TEXT data
    TEXT created_date
  }

  users ||--o{ workspaces : "owns"
  users ||--o{ workspace_members : "is member"
  workspaces ||--o{ workspace_members : "has"
  workspaces ||--o{ invites : "issues"
  workspaces ||--o{ apps : "contains"
  users ||--o{ refresh_tokens : "holds"
  users ||--o{ consent_receipts : "gives"
  users ||--o{ files : "uploads"
  users ||--o{ apps : "created"
  apps ||--o| app_schemas : "has data model"
  apps ||--o{ entities : "stores records"
  apps ||--o{ conversations : "built through"
  conversations ||--o{ messages : "contains"
  apps ||--o{ checkpoints : "versioned by"
  apps ||--o{ app_functions : "registers"
  apps ||--o{ connectors : "configures"
  apps ||--o{ scheduled_tasks : "schedules"
  apps ||--o{ files : "attaches"
```

## Table notes

| Table | Purpose | Key details |
|-------|---------|-------------|
| `users` | Accounts | scrypt hash + salt; optional TOTP secret; simulated `credits` (default 100). |
| `workspaces` / `workspace_members` | Tenancy | Every app belongs to a workspace; membership drives authorization. |
| `invites` | Workspace invitations | Token-based; `accepted` flag. |
| `refresh_tokens` | Session refresh | Only the SHA-256 hash is stored; single-use (revoked on rotation). |
| `apps` | Apps | `visibility` (`private`/`public`) controls `/p/:id`; `app_code` holds the user-edited generated app. |
| `app_schemas` | Data model | JSON: `{app_name, description, entities:[{name, icon, fields:[{name,type,options?,reference_entity?,required?}]}]}`. |
| `entities` | Records | Schema-less JSON `data` per row, validated server-side against `app_schemas`. |
| `conversations` / `messages` | Agent chats | `phase` ∈ `new → clarifying → built`; messages keep step metadata. |
| `checkpoints` | Versions / branches | Full snapshot of schema + all records; restore replaces both. |
| `app_functions` | User functions | Name → handler URL (invoked by HTTP forward, no code execution). |
| `connectors` | Integrations | `type` ∈ `http` / `webhook` / `rest_api`; JSON `config` (url, method, headers, key). |
| `scheduled_tasks` | Workflows | Interval in minutes stored in `cron`; fired by the in-process scheduler. |
| `files` | Uploads | Stored on disk under `data/files`, served at `/files/:id`. |
| `feature_flags` | Flags | Seeded defaults; exposed pre-auth via `/api/frontend-config.js`. |
| `consent_receipts` | Consent log | Arbitrary JSON per receipt. |

Field types supported by the schema engine: `string, text, number, boolean,
date, datetime, email, url, enum(options[]), reference(reference_entity)`.
