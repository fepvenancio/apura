# Codebase Structure

**Analysis Date:** 2026-03-18

## Directory Layout

```
apura/
├── packages/                    # Monorepo workspaces (Turbo)
│   ├── api-gateway/             # Main Cloudflare Worker (HTTP API)
│   ├── ai-orchestrator/         # Claude API integration worker
│   ├── ws-gateway/              # WebSocket + Durable Object proxy
│   ├── query-executor/          # Query execution routing (stub)
│   ├── report-worker/           # Report generation (stub)
│   ├── email-worker/            # Email sending (stub)
│   ├── cron-worker/             # Scheduled jobs (stub)
│   └── shared/                  # Type definitions & validators
├── frontend/                    # Next.js 15 React app
│   ├── src/
│   │   ├── app/                 # Next.js app router (route groups)
│   │   ├── components/          # React components
│   │   ├── stores/              # Zustand state management
│   │   └── lib/                 # API client, utils, types
│   ├── public/                  # Static assets
│   └── out/                     # Static export output (generated)
├── connector/                   # .NET 8 Windows Service (on-premise)
├── migrations/                  # D1 SQL migration files
├── docs/                        # Documentation
├── .github/                     # GitHub workflows
├── .planning/                   # GSD phase planning documents
├── deploy/                      # Deployment scripts
├── tsconfig.base.json           # Root TypeScript config (shared)
├── turbo.json                   # Turbo build orchestration
├── package.json                 # Root workspace config
├── PLAN.md                      # Project plan
├── README.md                    # Project overview
└── .gitignore                   # Version control exclusions
```

## Directory Purposes

**packages/api-gateway/:**
- Purpose: Main REST API for frontend and external clients
- Contains: Hono app with routes (auth, queries, reports, org, schema), middleware, services
- Key files: `src/index.ts` (app entry), `src/routes/` (endpoint handlers), `src/middleware/` (auth/rate-limit/quota)
- Dependencies: D1 (database), KV (cache), Fetcher to AI Orchestrator and WS Gateway

**packages/ai-orchestrator/:**
- Purpose: Natural language to SQL conversion via Claude API
- Contains: Query classification, schema loading, example selection, prompt building, SQL validation, Claude client
- Key files: `src/index.ts` (app entry), `src/orchestrator.ts` (main pipeline), `src/schema/` (category/table loading), `src/validation/` (SQL validation)
- Dependencies: D1 (schema + examples), KV (cache), Claude API

**packages/ws-gateway/:**
- Purpose: WebSocket upgrade handling and connector session routing via Durable Objects
- Contains: Connection upgrade logic, session routing, Durable Object connector state management
- Key files: `src/index.ts` (fetch handler), `src/connector-session.ts` (DO class)
- Dependencies: D1 (agent API key validation), Durable Objects (CONNECTOR binding)

**packages/query-executor/ (stub):**
- Purpose: Route queries to appropriate executor (reserved for expansion)
- Status: Minimal implementation, not actively used
- Key files: `src/index.ts`

**packages/report-worker/ (stub):**
- Purpose: Generate PDF/CSV reports from query results (reserved for expansion)
- Status: Minimal implementation, not actively used
- Key files: `src/index.ts`

**packages/email-worker/ (stub):**
- Purpose: Send emails (notifications, report delivery, etc.) (reserved for expansion)
- Status: Minimal implementation, not actively used
- Key files: `src/index.ts`

**packages/cron-worker/ (stub):**
- Purpose: Scheduled job triggers (report generation, cache refresh, etc.) (reserved for expansion)
- Status: Minimal implementation, not actively used
- Key files: `src/index.ts`

**packages/shared/:**
- Purpose: Centralized type definitions and validators used by all packages and frontend
- Contains: Auth types, Organization types, Query types, Connector protocol types, Report types, Validators, Constants
- Key files: `src/index.ts` (re-exports), `src/types/` (type definitions), `src/validation/` (input/SQL validation)
- No dependencies (leaf package)

**frontend/src/app/:**
- Purpose: Next.js App Router page components organized by route group
- Structure:
  - `(public)/`: Public pages (landing, privacy, terms, docs, pricing)
  - `(auth)/`: Auth pages (login, signup) with shared layout
  - `(dashboard)/`: Protected pages (home, query, reports, history, settings) with shared dashboard layout
- Layout files: `layout.tsx` in each group provides route-group-specific layout wrapper

**frontend/src/components/:**
- Purpose: Reusable React components
- Organization:
  - `ui/`: Base components (button, input, card, badge, etc.)
  - `layout/`: Layout wrappers (topbar, sidebar, etc.)
  - `query/`: Query-specific components (query-input, result-panel, result-table, chart, etc.)

**frontend/src/stores/:**
- Purpose: Zustand global state containers
- Key stores:
  - `auth-store.ts`: User, org, authentication methods (login, signup, logout)
  - `connector-store.ts`: Connector status, connection state
  - `query-store.ts`: Query results, query history, execution state

**frontend/src/lib/:**
- Purpose: Utilities and HTTP client
- Key files:
  - `api.ts`: ApiClient class with methods for each endpoint (login, signup, queries, reports, etc.)
  - `types.ts`: Frontend-specific type definitions
  - `utils.ts`: Helper functions (date formatting, class merging, etc.)

**connector/:**
- Purpose: On-premise .NET 8 Windows Service for database connectivity
- Status: Separate repository/solution, connects via WebSocket to WS Gateway
- Handles: SQL execution, schema discovery, database authentication

**migrations/:**
- Purpose: D1 database schema and migration scripts
- Contains: SQL files for creating tables (users, organizations, queries, saved_queries, reports, schema, etc.)
- Execution: Run via `npm run db:migrate` script

**deploy/:**
- Purpose: Deployment scripts and configuration
- Key files: `migrate.sh` (run D1 migrations)

**docs/:**
- Purpose: Project documentation and guides
- Key files: `PRICING_MODEL.md` (pricing tier definitions)

## Key File Locations

**Entry Points:**

- `packages/api-gateway/src/index.ts`: Main API Worker Hono app, route registration, middleware setup
- `packages/ai-orchestrator/src/index.ts`: AI Worker Hono app, `/generate` and `/classify` endpoints
- `packages/ws-gateway/src/index.ts`: WebSocket proxy Worker fetch handler
- `frontend/src/app/layout.tsx`: Root Next.js layout, metadata, font setup
- `frontend/src/app/(dashboard)/page.tsx`: Main dashboard page, entry point for authenticated users
- `frontend/src/app/(public)/page.tsx`: Marketing landing page for unauthenticated users

**Configuration:**

- `tsconfig.base.json`: Root TypeScript config (shared by all packages)
- `turbo.json`: Turbo build task orchestration and dependencies
- `package.json`: Root workspace definition, scripts, versions
- `frontend/next.config.ts`: Next.js build configuration
- `frontend/tailwind.config.ts`: Tailwind CSS theme and utilities

**Core Logic:**

- `packages/api-gateway/src/routes/auth.ts`: Signup/login/refresh endpoints
- `packages/api-gateway/src/routes/queries.ts`: Query execution endpoints
- `packages/api-gateway/src/routes/reports.ts`: Report management endpoints
- `packages/api-gateway/src/middleware/auth.ts`: JWT verification middleware
- `packages/ai-orchestrator/src/orchestrator.ts`: Main NL→SQL pipeline
- `packages/ai-orchestrator/src/schema/schema-loader.ts`: Schema table loading
- `packages/ai-orchestrator/src/schema/query-classifier.ts`: Query category classification
- `packages/ai-orchestrator/src/ai/claude-client.ts`: Claude API integration

**Testing:**

- `packages/ai-orchestrator/src/validation/__tests__/sql-validator.test.ts`: SQL validation tests

**Stores:**

- `frontend/src/stores/auth-store.ts`: Authentication and user state
- `frontend/src/stores/connector-store.ts`: Connector connection status
- `frontend/src/stores/query-store.ts`: Query execution results and history

## Naming Conventions

**Files:**

- TypeScript workers: `index.ts` (entry point), lowercase with hyphens for nested modules (`auth.ts`, `jwt.ts`, `query-classifier.ts`)
- React components: PascalCase for component files (`QueryInput.tsx`, `ResultPanel.tsx`)
- Pages: `page.tsx` (Next.js convention)
- Layouts: `layout.tsx` (Next.js convention)
- Stores: `*-store.ts` suffix for Zustand stores
- Tests: `*.test.ts` or `*.spec.ts` suffix, in `__tests__` directory
- Exports: `index.ts` for barrel files (re-export from subdirectory)

**Directories:**

- Lowercase with hyphens: `api-gateway`, `ws-gateway`, `query-executor`
- Feature/route groupings: Route groups in parentheses `(public)`, `(auth)`, `(dashboard)` per Next.js convention
- Feature-based: `components/`, `stores/`, `lib/`, `middleware/`, `routes/`, `services/`, `utils/`, `validation/`

**Functions & Variables:**

- camelCase for functions and variables
- UPPERCASE for constants (e.g., `ACCESS_TOKEN_TTL`, `MAX_CONTEXT_TABLES`)
- Prefix private methods/variables: unused in this codebase (no private conventions observed)
- Schema categories, query classifiers use descriptive names: `SchemaLoader`, `QueryOrchestrator`, `ClaudeClient`

**Types:**

- PascalCase for types and interfaces (e.g., `QueryRequest`, `GenerateSqlResponse`, `ConnectorSession`)
- Suffix conventions: `Request`, `Response`, `Payload` for message types
- Enums: `QueryStatus`, `UserRole` (PascalCase, values UPPERCASE or camelCase depending on serialization)

## Where to Add New Code

**New Feature (Full Stack):**
- Backend: Add route handler in `packages/api-gateway/src/routes/[feature].ts`
- Middleware: Add if needs auth/validation in `packages/api-gateway/src/middleware/`
- Shared types: Add type definition in `packages/shared/src/types/[domain].ts`
- Database: Add migration in `migrations/` directory
- Frontend: Add page in `frontend/src/app/(dashboard)/[feature]/page.tsx`
- Components: Add components in `frontend/src/components/[feature]/` if needed
- State: Add store in `frontend/src/stores/[feature]-store.ts` if needs global state

**New Worker Service:**
- Create directory: `packages/[service-name]/`
- Copy structure from `packages/query-executor/` or `packages/api-gateway/`
- Add `package.json`, `wrangler.toml`, `src/index.ts` entry point
- Register in root `package.json` workspaces
- Add build/deploy task in `turbo.json`

**New Component:**
- Create file: `frontend/src/components/[category]/[ComponentName].tsx`
- Use server component if no interactivity, `"use client"` for interactive components
- Import UI components from `frontend/src/components/ui/`
- Use Tailwind classes directly (no CSS modules)

**New Utility or Helper:**
- Shared validation: `packages/shared/src/validation/[validator-name].ts`, export from `src/index.ts`
- Frontend utils: `frontend/src/lib/[utility-name].ts`, import as needed
- API client methods: Add method to `ApiClient` class in `frontend/src/lib/api.ts`

**New Database Table:**
- Create migration file in `migrations/` with `timestamp_description.sql` format
- Reference migration list in deployment script
- Add types to `packages/shared/src/types/` if used across services
- Add schema validation to orchestrator if relevant to NL→SQL

## Special Directories

**node_modules/:**
- Purpose: npm dependency packages
- Generated: Yes (created by `npm install`)
- Committed: No (listed in .gitignore)

**frontend/out/:**
- Purpose: Static export output from `next build && next export`
- Generated: Yes (created by Next.js build process)
- Committed: No (temporary build artifact)

**frontend/.next/:**
- Purpose: Next.js build cache and compiled output
- Generated: Yes (created by `next build` or `next dev`)
- Committed: No (build artifact)

**frontend/.wrangler/:**
- Purpose: Wrangler (Cloudflare Workers CLI) cache and temporary files
- Generated: Yes (created by wrangler during dev/deploy)
- Committed: No (.gitignore)

**packages/*/dist/:**
- Purpose: Compiled TypeScript output (if applicable to package)
- Generated: Yes (created by `tsc` or build process)
- Committed: No (build artifact)

**.planning/codebase/:**
- Purpose: GSD phase planning documents (generated by codebase mapper)
- Generated: Yes (created during GSD analysis)
- Committed: No (working files)

---

*Structure analysis: 2026-03-18*
