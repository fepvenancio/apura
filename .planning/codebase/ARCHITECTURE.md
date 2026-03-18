# Architecture

**Analysis Date:** 2026-03-18

## Pattern Overview

**Overall:** Microservices on Cloudflare Workers + Durable Objects, with hybrid frontend/backend separation.

**Key Characteristics:**
- Distributed serverless architecture across multiple Cloudflare Worker services
- Stateful session/connector management via Durable Objects
- Monorepo with isolated npm packages (Turbo workspaces)
- Synchronous API gateway pattern with AI orchestration pipeline
- On-premise .NET connector for SQL Server database access

## Layers

**API Gateway (Hono):**
- Purpose: HTTP request routing, authentication, rate limiting, response formatting
- Location: `packages/api-gateway/src/index.ts`
- Contains: Route handlers, middleware (auth, rate limit, quota, CORS)
- Depends on: D1 database, KV cache, AI Orchestrator service (Fetcher), WS Gateway (Fetcher)
- Used by: Frontend, external API clients

**AI Orchestrator (Hono):**
- Purpose: Convert natural language to SQL via Claude API
- Location: `packages/ai-orchestrator/src/index.ts`
- Contains: Query classification, schema loading, prompt building, validation, Claude client
- Depends on: D1 database, KV cache, Claude API, shared validation utilities
- Used by: API Gateway, directly invoked via POST /generate

**WebSocket Gateway (Durable Object proxy):**
- Purpose: Agent connection upgrade, session routing, connector communication
- Location: `packages/ws-gateway/src/index.ts`
- Contains: WebSocket upgrade handling, connector-session routing to Durable Objects
- Depends on: D1 database, Durable Objects (CONNECTOR binding), Internal Secret auth
- Used by: Agent connectors, API Gateway (for query execution)

**Shared Package (Types & Utilities):**
- Purpose: Centralized type definitions and validators used across all services
- Location: `packages/shared/src/index.ts`
- Contains: Auth types, Query types, Connector protocol types, Report types, Validators
- Depends on: None (leaf package)
- Used by: All other packages, frontend

**Frontend (Next.js 15):**
- Purpose: React client, user interface, state management
- Location: `frontend/src/app/` and `frontend/src/components/`
- Contains: Pages (auth, dashboard, query, reports, settings), Zustand stores, API client
- Depends on: API Gateway (external fetch)
- Used by: End users via Cloudflare Pages

## Data Flow

**User Authentication:**

1. User submits email/password on login page (`frontend/src/app/(auth)/login/page.tsx`)
2. API Client (`frontend/src/lib/api.ts`) sends POST `/auth/login` to API Gateway
3. API Gateway validates credentials, creates JWT, returns tokens + user + org
4. Frontend stores tokens in localStorage, sets API client authorization header
5. Subsequent requests include `Authorization: Bearer {JWT}` header
6. Auth middleware (`packages/api-gateway/src/middleware/auth.ts`) verifies JWT

**Natural Language Query to Results:**

1. User enters natural language question in QueryInput component
2. Frontend calls `POST /api/queries` with `{ naturalLanguage, orgId }`
3. API Gateway validates auth, forwards to AI Orchestrator via Fetcher binding
4. Orchestrator processes:
   - Sanitizes input
   - Checks KV cache for identical query
   - Classifies query into schema categories
   - Loads relevant schema tables from D1
   - Selects few-shot examples
   - Builds Claude prompt with schema + examples
   - Calls Claude API to generate SQL
   - Validates SQL with AST parser
   - Retries with error feedback if validation fails
   - Caches result in KV (15 min TTL)
5. Returns `GenerateSqlResponse` with SQL, metadata
6. API Gateway returns result to frontend
7. Frontend displays SQL, then executes query via `POST /api/queries/{id}/execute`
8. API Gateway routes to WS Gateway to invoke Durable Object for that org
9. Durable Object relays query to .NET connector via WebSocket
10. Connector executes query on Primavera database, streams results
11. Results flow back through DO → WS Gateway → API Gateway → Frontend
12. Frontend displays results (table + chart via ECharts)

**Connector Session Management:**

1. .NET agent establishes WebSocket to `wrangler-proxy/agent/connect`
2. WS Gateway verifies API key via `validateAgentApiKey()` (D1 lookup)
3. Maps org_id → Durable Object ID via `env.CONNECTOR.idFromName(orgId)`
4. Upgrades WebSocket and forwards to correct Durable Object
5. DO maintains long-lived session, buffers messages, handles reconnection
6. DO receives queries from API Gateway, executes via connector, returns results

**State Management:**

- **Frontend stores:** Zustand stores (`frontend/src/stores/`) hold auth, connector status, query results in memory
- **Server stores:** JWT + refresh tokens in localStorage (browser), D1 holds schema + users + orgs
- **Cache layer:** KV cache stores query results, schema data, session state (15-60 min TTL)
- **Connector state:** Durable Objects maintain per-org session with agent (connection status, query queue)

## Key Abstractions

**Hono App Builder Pattern:**

All Worker services use Hono microframework with middleware chains and route registrations:
- API Gateway: `app.use('/api/*', authMiddleware); app.route('/api/queries', queries);`
- Orchestrator: `app.post('/generate', ...); app.post('/classify', ...)`
- Middleware stack: CORS → secureHeaders → bodySize → rate limiting → auth

**Query Orchestrator (Facade):**
- Purpose: Encapsulate multi-step NL→SQL pipeline
- Examples: `packages/ai-orchestrator/src/orchestrator.ts`
- Pattern: Single entry point `processQuery()` orchestrates schema loading, example selection, prompt building, Claude call, validation, caching

**Durable Object for Stateful Connector Session:**
- Purpose: Maintain per-org WebSocket connection to .NET agent
- Location: `packages/ws-gateway/src/connector-session.ts`
- Pattern: Binding name `CONNECTOR`, ID generation via `idFromName(orgId)`, fetch-based RPC to invoke

**API Client Singleton (Frontend):**
- Purpose: Centralized HTTP communication with token management, auto-refresh on 401
- Location: `frontend/src/lib/api.ts`
- Pattern: Class-based singleton, methods for each endpoint, automatic JWT refresh retry logic

**Zustand Store Pattern (Frontend):**
- Purpose: Global state containers for auth, connector status, query results
- Location: `frontend/src/stores/*.ts`
- Pattern: `create<T>((set) => ({ ...state, ...actions }))`, selectors via `store((s) => s.field)`

## Entry Points

**API Gateway:**
- Location: `packages/api-gateway/src/index.ts`
- Triggers: HTTP requests from frontend/clients
- Responsibilities: Route to auth/queries/reports/org/schema endpoints, validate auth, handle middleware chain

**AI Orchestrator Service:**
- Location: `packages/ai-orchestrator/src/index.ts`
- Triggers: `POST /generate` (from API Gateway via Fetcher)
- Responsibilities: Convert natural language to SQL via Claude

**WebSocket Gateway:**
- Location: `packages/ws-gateway/src/index.ts`
- Triggers: WebSocket upgrade from agent (`/agent/connect`), internal query execution requests
- Responsibilities: Route connections to Durable Objects, relay internal commands (query execute, status check, schema sync)

**Frontend App:**
- Location: `frontend/src/app/layout.tsx` (root layout)
- Triggers: Browser navigation to https://app.apura.xyz
- Responsibilities: Render root layout, setup auth store from localStorage, render child pages

**Route Entry Points (Frontend):**
- `frontend/src/app/(public)/page.tsx`: Marketing landing
- `frontend/src/app/(auth)/login/page.tsx`: Login form
- `frontend/src/app/(auth)/signup/page.tsx`: Signup form
- `frontend/src/app/(dashboard)/page.tsx`: Main dashboard (query input + results)
- `frontend/src/app/(dashboard)/query/page.tsx`: Full query editor
- `frontend/src/app/(dashboard)/reports/page.tsx`: Saved reports list
- `frontend/src/app/(dashboard)/history/page.tsx`: Query history
- `frontend/src/app/(dashboard)/settings/page.tsx`: User settings, connector setup

## Error Handling

**Strategy:** Layered error handling with typed error classes and HTTP status codes.

**Patterns:**

**Orchestrator Errors:**
- Class: `OrchestratorError` (packages/ai-orchestrator/src/orchestrator.ts)
- Usage: Thrown on validation failures, caught in `/generate` handler, returned as JSON with statusCode
- Example: `throw new OrchestratorError('Query is empty', 400);`

**API Error Response Format:**
- Success: `{ success: true, data: {...} }`
- Error: `{ success: false, error: { code: 'ERROR_CODE', message: 'Human readable message' } }`
- HTTP status: Appropriate status code (400, 401, 429, 500)

**Frontend Error Handling:**
- ApiClient catches HTTP errors: `if (!res.ok) throw new ApiError(res.status, await res.json());`
- Components catch errors with try/catch, set local error state, display to user
- Example: Login error displayed as toast/alert on failed credentials

**Unhandled Errors:**
- Hono `app.onError()` catches exceptions, logs to console, returns 500 with generic message
- Frontend logs unhandled promise rejections (configurable)

## Cross-Cutting Concerns

**Logging:** `console.error()` and `console.log()` throughout. Workers logs appear in `wrangler tail`. No structured logging framework detected.

**Validation:**
- Input: `@apura/shared` validators (email, slug, natural language sanitization)
- Schema: Custom SQL validator with AST parsing in `packages/ai-orchestrator/src/validation/sql-validator.ts`
- Database: Type-safe queries via D1 parameterized statements (`.bind()`)
- Frontend: Zod validation in form components

**Authentication:**
- Method: JWT (HS256) with refresh token pattern
- Tokens stored in localStorage (frontend) and KV cache (optional server-side)
- Issued by: `packages/api-gateway/src/routes/auth.ts` on login/signup
- Verified by: `packages/api-gateway/src/middleware/auth.ts` on protected routes

**Rate Limiting:**
- Auth routes: 10 requests per minute per IP
- Implemented in API Gateway via KV counter per minute bucket
- Key: `rate:auth:{ip}:{minute}`

**Quota Enforcement:**
- Per-org query limit based on plan (trial: 100, pro: 5000, etc.)
- Checked in routes before executing
- Limit definition: `@apura/shared` PLAN_LIMITS constant

**CORS:**
- Strict allowlist: only `https://apura.xyz` and `https://app.apura.xyz`
- Credentials: true
- Methods: GET, POST, PUT, DELETE
- Headers: Content-Type, Authorization

**Body Size Limits:**
- API Gateway enforces 1MB max request body
- Checked before processing via `Content-Length` header

---

*Architecture analysis: 2026-03-18*
