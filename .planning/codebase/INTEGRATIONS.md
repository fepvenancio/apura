# External Integrations

**Analysis Date:** 2026-03-18

## APIs & External Services

**AI Generation:**
- Claude API (Anthropic) - Natural language to SQL generation
  - SDK/Client: `@anthropic-ai/sdk@^0.79.0`
  - Auth: `CLAUDE_API_KEY` environment variable
  - Location: `packages/ai-orchestrator/src/ai/claude-client.ts`
  - Models: claude-sonnet-4-5-20241022 (default), claude-haiku-4-5-20251001 (budget)

**Payment Processing:**
- Stripe - Subscription billing and payment management
  - Integration: Database schema fields in `organizations` table (stripe_customer_id, stripe_subscription_id)
  - Webhook secret: `STRIPE_WEBHOOK_SECRET` (optional env var in `packages/api-gateway/src/types.ts`)
  - Location: Partially configured, webhook handler setup available
  - Usage: Plan-based billing (trial, starter, professional, business, enterprise)

## Data Storage

**Databases:**
- Cloudflare D1 (SQLite) - Primary production database
  - Binding: `DB` (D1Database context in Hono)
  - Location: `packages/api-gateway/wrangler.toml`, `packages/ai-orchestrator/wrangler.toml`, `packages/ws-gateway/wrangler.toml`
  - Database ID: `48a7c67d-223e-4ee1-8c87-9a9b3231def0`
  - Database name: `apura-main`
  - Client: Cloudflare Workers D1Database API (accessed via `c.env.DB.prepare()` in Hono context)
  - Schema: SQLite 3 with strict foreign keys enabled, stored in `migrations/` directory

**SQL Server (On-Prem Connector):**
- Primavera ERP SQL Server database
  - Connection: Microsoft.Data.SqlClient (C# connector)
  - Location: `connector/src/ApuraConnector.Infrastructure/` handles connection pooling
  - Purpose: Extract schema metadata and execute user-generated queries against Primavera

**File Storage:**
- Local filesystem only - No cloud storage integration detected
- Frontend assets: Statically exported from Next.js to CDN/Cloudflare Pages

**Caching:**
- Cloudflare KV Namespace - Session and query result caching
  - Binding: `CACHE` (KVNamespace context in Hono)
  - Location: All three gateways use KV for caching (schema, sessions, connector status)
  - Namespace ID: `290e5fb7d86847b6823b79be9b6d2cb4`
  - TTL examples:
    - Session cache: `CACHE_TTL_SESSION` (shared constant)
    - Schema cache: `CACHE_TTL_SCHEMA` (minutes-based)
    - Connector status: 30 seconds TTL

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication (no third-party provider)
  - Implementation: Custom middleware in `packages/api-gateway/src/middleware/auth.ts`
  - JWT secret: `JWT_SECRET` environment variable
  - Session storage: KV cache (validated against JWT)
  - Token issuing: Custom auth routes in `packages/api-gateway/src/routes/auth.ts`

**User Management:**
- User table in D1 with role-based access control (RBAC)
  - Roles: owner, admin, analyst, viewer
  - Location: `migrations/0001_initial_schema.sql` defines users table

**API Key Authentication:**
- Agent API Key authentication for connector-to-API communication
  - Hashing: @noble/hashes SHA-256
  - Validation: `packages/ws-gateway/src/auth/agent-auth.ts`
  - Storage: organizations.agent_api_key_hash in D1

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry, DataDog, or similar integration

**Logs:**
- Cloudflare Workers tail logs: `wrangler tail` command available
- C# Connector: Serilog structured logging to console and file
  - Sinks: Console (development), File (production)
  - Location: `connector/src/ApuraConnector.Service/` and `connector/src/ApuraConnector.Infrastructure/`

## CI/CD & Deployment

**Hosting:**
- Cloudflare Workers (primary backend)
  - api-gateway: `api.apura.xyz` (custom domain)
  - ai-orchestrator: Internal service binding
  - ws-gateway: `ws.apura.xyz` (custom domain, WebSocket support)
- Cloudflare Pages or static host for frontend (Next.js export)
- .NET Service hosting: On-prem or Docker for Primavera connector

**CI Pipeline:**
- Not detected - No GitHub Actions, GitLab CI, or similar config found
- Manual deployment via `wrangler deploy` or Turbo deploy task

**Database Migrations:**
- Manual migration system via `deploy/migrate.sh`
- Migration tracking: `_migrations` table in D1 records applied migrations
- Files: `migrations/0001_initial_schema.sql`, `migrations/0002_seed_master_schema.sql`

## Environment Configuration

**Required env vars:**

**Frontend:**
- `NEXT_PUBLIC_API_URL` - API gateway URL (defaults to http://localhost:8787)

**Backend Workers:**
- `CLAUDE_API_KEY` - Anthropic Claude API key (required for ai-orchestrator)
- `JWT_SECRET` - Signing key for JWT tokens (required for api-gateway)
- `INTERNAL_SECRET` - Service-to-service communication secret (required for api-gateway, ws-gateway)
- `AI_MODEL_DEFAULT` - Default Claude model (set in wrangler.toml: claude-sonnet-4-5-20241022)
- `AI_MODEL_BUDGET` - Budget model for quota limits (set in wrangler.toml: claude-haiku-4-5-20251001)

**Optional env vars:**
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook validation secret (if billing integration enabled)

**Secrets location:**
- Cloudflare Workers: Environment variables managed via Wrangler and Cloudflare console
- .NET Connector: User Secrets (development), environment variables (production)

## Webhooks & Callbacks

**Incoming:**
- Stripe webhook endpoint: Handler setup scaffolding exists in API gateway, actual implementation not fully deployed
  - Expected endpoint: `/webhooks/stripe` (route not yet implemented in api-gateway)

**Outgoing:**
- None detected - Apura does not push webhooks to external services

## Third-Party Services Integration Status

**Active:**
- Cloudflare (Workers, D1, KV, Durable Objects, Pages)
- Anthropic Claude API
- Primavera ERP SQL Server

**Partially Integrated:**
- Stripe (schema present, webhook scaffolding exists, not fully active)

**Not Integrated:**
- Email/SMS delivery (SendGrid, Twilio, etc.)
- Error tracking (Sentry, DataDog, etc.)
- Analytics (Segment, Amplitude, etc.)
- Logging aggregation (ELK, Datadog, etc.)
- Social OAuth (GitHub, Google, etc.)

---

*Integration audit: 2026-03-18*
