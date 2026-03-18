# Codebase Concerns

**Analysis Date:** 2026-03-18

## Tech Debt

**Incomplete Password Reset Flow:**
- Issue: Password reset endpoint stores reset tokens in KV but never sends email (TODO comment remains). Users can reset passwords but don't receive the reset link.
- Files: `packages/api-gateway/src/routes/auth.ts` (lines 337, 352)
- Impact: Feature is non-functional until email service (Resend) is integrated. Users cannot reset forgotten passwords.
- Fix approach: Integrate Resend API to send reset emails on `/forgot-password` endpoint, include reset token in email link, and verify token validity on reset.

**Type Safety Issues with `as any` Casts:**
- Issue: Multiple locations use unsafe `as any` type casts, bypassing TypeScript compiler checks and risking runtime errors
- Files:
  - `packages/api-gateway/src/routes/auth.ts` (lines 74, 388) - org name fallback, password hash update
  - `packages/api-gateway/src/routes/org.ts` (lines 54, 196) - org/user updates
- Impact: Type-related bugs may go undetected until production. Updates to dynamic objects could silently fail or introduce security issues.
- Fix approach: Replace `as any` with proper type definitions. Create update request interfaces that explicitly define allowed fields rather than using `Record<string, unknown>`.

**Console.error in Production Error Paths:**
- Issue: Multiple error handlers use `console.error()` which is sufficient for local development but provides no structured logging for production debugging
- Files:
  - `packages/api-gateway/src/index.ts` (line 85)
  - `packages/api-gateway/src/routes/queries.ts` (line 174)
  - `packages/api-gateway/src/middleware/quota.ts` (line 69)
  - `packages/api-gateway/src/middleware/rate-limit.ts` (line 77)
  - `packages/ai-orchestrator/src/index.ts` (lines 36, 55)
  - `packages/ws-gateway/src/connector-session.ts` (lines 190, 215)
- Impact: Cannot trace errors in production, difficult to debug issues. No central error tracking or monitoring.
- Fix approach: Replace `console.error()` with structured logging service that captures error context (user_id, org_id, request_id) and sends to observability platform (e.g., Sentry, Datadog, or Cloudflare's native monitoring).

**AST Type Safety in SQL Validator:**
- Issue: `node-sql-parser` AST is typed as `any` due to incomplete type definitions from the library
- Files: `packages/ai-orchestrator/src/validation/sql-validator.ts` (line 16)
- Impact: Walking the AST tree to find blocked functions and count JOINs relies on duck typing. SQL injection through unexpected AST structures could theoretically bypass validation if parser updates change output format.
- Fix approach: Create a comprehensive test suite that validates parser output against known SQL injection patterns. Document expected AST structure and add runtime assertions for critical paths (blocked function detection).

## Known Bugs

**Quota Middleware Fails Open:**
- Symptoms: When quota check throws an error (database unavailable), middleware calls `next()` and allows request through without quota enforcement
- Files: `packages/api-gateway/src/middleware/quota.ts` (lines 68-71)
- Trigger: Database connection failure during quota check, any unexpected error in the quota query
- Workaround: None — users will overuse queries if database is unavailable
- Impact: Security/business logic gap — quota enforcement is bypassed on database errors
- Fix approach: Implement fallback behavior: cache last-known quota state in KV with longer TTL, or fail-closed (return 503) if quota check fails. Never allow unverified requests through.

**Error Message Leaking from AI Orchestrator:**
- Symptoms: AI generation failures expose raw error responses to users
- Files: `packages/api-gateway/src/routes/queries.ts` (line 76)
- Trigger: AI orchestrator returns error response
- Impact: May leak internal service details, API structure, or debug information to client
- Fix approach: Sanitize error messages from AI service — log full error internally, return generic "Generation failed" to user.

**Missing Error Handling for JSON Parse in Reset Token:**
- Symptoms: If KV cache corrupts reset token data, `JSON.parse()` will throw and crash the endpoint
- Files: `packages/api-gateway/src/routes/auth.ts` (line 383)
- Trigger: Malformed JSON in KV reset token value
- Impact: 500 error instead of graceful "invalid token" response
- Fix approach: Wrap `JSON.parse()` in try-catch, return 401 if parsing fails.

## Security Considerations

**Email Enumeration in Forgot Password:**
- Risk: Endpoint returns different timing for existing vs non-existing emails (performs DB lookup before returning success). Attacker can enumerate valid email addresses.
- Files: `packages/api-gateway/src/routes/auth.ts` (lines 338-354)
- Current mitigation: Returns same success message for both cases. However, the DB lookup happens before the response, and the TODO indicates no email is actually sent yet.
- Recommendations: Add rate limiting per email address (separate from IP rate limit), implement account lockout after N reset requests, use constant-time comparison if email existence is checked.

**Hardcoded CORS Origins:**
- Risk: CORS configuration hardcodes production domains. If domain changes or multiple subdomains needed, code deployment is required.
- Files: `packages/api-gateway/src/index.ts` (lines 21, 33)
- Current mitigation: Only allows specific origins, not wildcards
- Recommendations: Move CORS allowed origins to environment variables (ENV.CORS_ORIGINS), validate against environment-specific settings.

**No Rate Limiting on Critical Endpoints:**
- Risk: Password reset, signup, and login endpoints use shared IP-based rate limit (10 requests/minute). If customer's office is behind single NAT, legitimate users will hit limit.
- Files: `packages/api-gateway/src/index.ts` (lines 56-66)
- Current mitigation: 10 req/min is high enough for most scenarios
- Recommendations: Implement exponential backoff, per-user account lockout (after N failed logins), and email verification of reset attempts.

**Internal Secret Header Not Validated:**
- Risk: `X-Internal-Secret` header is checked for presence but value is never validated against actual secret
- Files: `packages/api-gateway/src/routes/queries.ts` (line 104)
- Impact: Any service can call WS gateway if header is present
- Fix approach: Compare header value to `c.env.INTERNAL_SECRET` using constant-time comparison (`crypto.timingSafeEqual()` equivalent).

**KV Session State Race Condition:**
- Risk: Session revocation on refresh token endpoint deletes old session before new one is stored. If request fails between delete and store, user loses access.
- Files: `packages/api-gateway/src/routes/auth.ts` (lines 268-308)
- Impact: User logged out unexpectedly, must re-login
- Fix approach: Store new session first, then delete old one. Or use atomic KV operations with batch API if available.

## Performance Bottlenecks

**Synchronous Database Calls Without Batching:**
- Problem: Query execution creates 3-4 separate database calls (create, update status x2, increment counter, audit log) without transaction grouping
- Files: `packages/api-gateway/src/routes/queries.ts` (lines 50-58, 90-94, 139-155)
- Cause: Status updates happen sequentially rather than batched
- Current capacity: Works for <100 concurrent queries, but will be slow at scale
- Improvement path: Use D1 batch API to group status updates and audit logging into single round-trip.

**Schema Loading Per Request:**
- Problem: Schema tables are loaded from database on every query generation, even if schema is rarely updated
- Files: `packages/ai-orchestrator/src/orchestrator.ts` (lines 72-91)
- Cause: No schema caching strategy or TTL
- Current capacity: OK for <1000 tenants, but multiplies API calls at scale
- Improvement path: Cache schema metadata in KV with longer TTL (1 hour default, 5-minute refresh on update), implement schema invalidation webhook from API gateway.

**Example Selector Loads All Examples:**
- Problem: Example selector may load all stored examples to select best 5
- Files: `packages/ai-orchestrator/src/schema/example-selector.ts` (implied, not fully read)
- Impact: Slow for orgs with thousands of stored examples
- Improvement path: Implement vector embeddings with semantic search (if Claude API supports) or pre-compute relevance scores for common query types.

**No Connection Pooling for D1:**
- Problem: D1 (SQLite) doesn't have connection pooling — each request opens a connection
- Files: All route handlers use `c.env.DB.prepare()`
- Impact: At >100 concurrent connections, database may become bottleneck
- Scaling limit: SQLite is single-writer. Concurrent write requests will queue.
- Scaling path: Migrate to PostgreSQL hosted on Cloudflare or external provider before reaching 1000+ concurrent users.

## Fragile Areas

**SQL Validator AST Parsing:**
- Files: `packages/ai-orchestrator/src/validation/sql-validator.ts` (entire file)
- Why fragile: Depends on `node-sql-parser` library output format. If library updates or parser behavior changes, validator may accept/reject different queries.
- Safe modification: Never remove validation checks, only add more restrictive ones. Test against comprehensive SQL injection attack examples. Pin parser version.
- Test coverage: 805 lines of test coverage exists (sql-validator.test.ts) but should be expanded for edge cases with CTEs, window functions, and exotic dialects.

**Service Binding Communication:**
- Files: `packages/api-gateway/src/routes/queries.ts` (lines 60-72, 101-113)
- Why fragile: Hardcoded URLs (`https://ai-orchestrator/generate`, `http://internal/query/execute`) and response type assumptions. If service binding configuration changes or responses change, code breaks.
- Safe modification: Extract service URLs to environment variables, add response validation before JSON parse, implement retry logic with exponential backoff.
- Test coverage: No integration tests for service binding calls currently exist.

**Query Orchestrator State Machine:**
- Files: `packages/api-orchestrator/src/orchestrator.ts` (entire file)
- Why fragile: Complex multi-step flow (sanitize → cache check → classify → load schema → select examples → prompt → AI call → sanitize → validate → retry). Failure at any step leaves query in intermediate state.
- Safe modification: Idempotency — all operations should be repeatable. Store orchestration state in database, not just in-memory.
- Test coverage: Minimal coverage for orchestrator integration. `sql-validator` has good coverage but orchestrator flow does not.

**Database Schema Assumptions in OrgDatabase:**
- Files: `packages/api-gateway/src/services/org-db.ts` (entire file)
- Why fragile: Column allowlists are hardcoded (lines 12-15). Adding new columns requires code changes. If migration adds column but allowlist isn't updated, column is silently ignored.
- Safe modification: Make column allowlists configurable per environment or auto-discover from schema. Add runtime validation that all columns in allowlist exist in database.
- Test coverage: Column allowlist logic is untested.

## Scaling Limits

**Cloudflare D1 (SQLite) Limits:**
- Current capacity: Up to ~10GB database size (Cloudflare limit)
- Write bottleneck: Single-writer SQLite. Concurrent writes lock table.
- Limit: Database will become write-bottleneck at 100+ concurrent users performing queries simultaneously
- Scaling path:
  1. Short term: Implement query batching (group updates), use background job queue for non-critical operations (audit logs, analytics)
  2. Medium term: Migrate audit logs to separate append-only log in R2
  3. Long term: Migrate to PostgreSQL or MySQL for multi-writer support

**KV Cache Size:**
- Current capacity: Cloudflare KV allows up to 25MB value size, unlimited key count
- Limit: Caching raw query results (rows can be large) may exceed 25MB for complex reports
- Scaling path: Implement chunked result storage in R2, with KV storing only metadata and result pointers.

**Claude API Rate Limits:**
- Current capacity: Depends on Anthropic plan. Standard tier allows ~10-20 requests/second
- Limit: At peak load with 100 concurrent users generating queries, may exceed rate limit
- Scaling path: Implement request queue (Cloudflare Queues), prioritize by plan tier, cache query results aggressively.

**Connector WebSocket Connections:**
- Current capacity: Single Durable Object per tenant can handle ~100 WebSocket connections
- Limit: If customer has multiple on-premises agents (redundancy), each needs separate connection
- Scaling path: Implement connection pooling/load balancing across multiple Durable Objects per high-traffic tenant.

## Dependencies at Risk

**node-sql-parser (Unmaintained):**
- Risk: Library appears unmaintained. No recent updates, limited community activity.
- Impact: Security fixes may lag. Parser behavior may not match latest SQL Server versions. Primavera SQL Server may use newer syntax (T-SQL window functions, CTEs) that parser doesn't support.
- Migration plan:
  1. Evaluate `sql-bricks` or `sqlite3` built-in parser (if supporting only read-only queries)
  2. Consider LLM-based validation as secondary check (Claude can validate if SQL is safe for read-only execution)
  3. Pin current version and maintain own fork if necessary

**Anthropic Claude API Dependency:**
- Risk: All SQL generation depends on single API provider. If API is down or pricing changes dramatically, product breaks.
- Impact: Service unavailability, unexpected costs
- Mitigation: Implement Claude API fallback (cache pre-computed queries for common reports), add cost per query tracking with alerts.

**Cloudflare Workers Environment:**
- Risk: Vendor lock-in. Code is tightly coupled to Cloudflare APIs (Workers, D1, KV, Durable Objects).
- Impact: Migration to other providers requires rewrite of service binding, database, and cache layers.
- Mitigation: Encapsulate Cloudflare-specific code in adapter layer (`packages/api-gateway/src/env.ts` exists). Abstract database queries behind repository pattern.

## Missing Critical Features

**No Audit Trail for Schema Changes:**
- Problem: Schema is stored in D1 but no audit log tracks who updated it, when, or what changed
- Blocks: Cannot troubleshoot "query suddenly stopped working" or answer "when was this table added?"
- Fix: Add versioned schema storage and audit table for schema modifications

**No Soft Delete for Queries/Reports:**
- Problem: Reports and queries use hard delete. No recovery if user accidentally deletes.
- Blocks: Cannot restore deleted reports
- Fix: Implement soft delete (add `deleted_at` timestamp), add restore endpoint

**No Bulk Query Export:**
- Problem: Users cannot export query history as CSV/JSON for analysis or compliance
- Blocks: Compliance reporting, data portability
- Fix: Implement batch export to R2, email link

**No Query Sharing/Collaboration:**
- Problem: Reports are marked `is_shared` but no endpoint to generate public links or share with specific users
- Blocks: Team collaboration, report distribution
- Fix: Add shareable report links with optional expiration, user-level sharing with granular permissions

## Test Coverage Gaps

**API Integration Tests:**
- What's not tested: End-to-end flows (signup → login → execute query → get results), multi-user scenarios, error recovery
- Files: No integration test suite exists for `packages/api-gateway`
- Risk: Regressions in authentication flow, quota enforcement, or service binding calls go undetected
- Priority: High (affects user-facing flows)

**Query Orchestrator Integration:**
- What's not tested: Full orchestrator pipeline (sanitize → cache → classify → prompt → AI → validate → cache response). Only SQL validator is unit tested.
- Files: `packages/ai-orchestrator/src/orchestrator.ts` has no tests
- Risk: Changes to orchestration flow (cache invalidation, retry logic, prompt building) may break silently
- Priority: High (critical path for query generation)

**Database Operations:**
- What's not tested: OrgDatabase methods, column allowlist filtering, query pagination, concurrent updates
- Files: No tests for `packages/api-gateway/src/services/org-db.ts`
- Risk: Silent data corruption or auth bypass if column allowlist logic breaks
- Priority: High (data integrity)

**WebSocket Connector Protocol:**
- What's not tested: Message ordering, reconnection logic, concurrent requests, timeout handling
- Files: `packages/ws-gateway/src/connector-session.ts` has no tests
- Risk: Stale connections, message loss, or protocol violations under network stress
- Priority: Medium (edge cases, but critical when they occur)

**Frontend Error Handling:**
- What's not tested: Network errors, API timeout, graceful degradation, error recovery UI
- Files: `frontend/src/lib/api.ts` has no tests
- Risk: Poor user experience when API fails, unclear error messages
- Priority: Medium (affects UX)

---

*Concerns audit: 2026-03-18*
