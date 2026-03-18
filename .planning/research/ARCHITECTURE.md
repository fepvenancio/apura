# Architecture Patterns

**Domain:** SaaS NL-to-SQL query tool (Primavera P6) -- new feature integration into existing Cloudflare Workers microservices
**Researched:** 2026-03-18

## Current Architecture Summary

The existing system is a Cloudflare Workers microservices architecture with:
- **api-gateway** (apura-api): Hono HTTP API, auth, routing. Bindings: D1, KV, AI_ORCHESTRATOR (Fetcher), WS_GATEWAY (Fetcher), REPORT_QUEUE (Queue producer)
- **ai-orchestrator** (apura-ai): NL-to-SQL via Claude API. Bindings: D1, KV
- **ws-gateway** (apura-ws): WebSocket proxy + Durable Objects for connector sessions. Bindings: D1, KV, CONNECTOR (DO)
- **report-worker** (apura-report-worker): Queue consumer for report generation. Bindings: D1, R2, EMAIL_QUEUE (Queue producer), WS_GATEWAY (Fetcher). **Stub -- implemented but not deployed/tested**
- **email-worker** (apura-email-worker): Queue consumer for transactional email via Resend. Bindings: R2, RESEND_API_KEY. **Stub -- implemented but not deployed/tested**
- **cron-worker** (apura-cron-worker): Cron trigger for scheduled reports. Bindings: D1, REPORT_QUEUE (Queue producer). **Stub -- implemented but not deployed/tested**
- **Frontend**: Next.js 15 static export on Cloudflare Pages

Key insight: The stub workers are already well-designed with correct queue topology and R2 bindings. They need activation, not redesign.

## Recommended Architecture for New Features

### Component Placement Matrix

| Feature | Worker | Why There | New Bindings Needed |
|---------|--------|-----------|---------------------|
| Stripe webhooks | api-gateway | Webhook endpoint is HTTP; needs D1 to update org plan | STRIPE_WEBHOOK_SECRET (already in types) |
| Email sending | email-worker | Already designed as queue consumer | None (already configured) |
| Email triggering | api-gateway | Auth routes need to enqueue emails (reset, verify) | EMAIL_QUEUE (Queue producer, add to wrangler.toml) |
| PDF/CSV export (on-demand) | api-gateway | Synchronous user request, return file directly | None (CSV is string generation) |
| PDF/CSV export (scheduled) | report-worker | Async, queue-driven, stores in R2 | None (already configured) |
| Cron scheduling | cron-worker | Already configured with cron trigger | None (already configured) |
| MFA (TOTP) | api-gateway | Auth flow lives here; TOTP verification is part of login | None (crypto.subtle available in Workers) |
| i18n | frontend | Translation is a presentation concern; static export | None (next-intl, build-time) |
| GDPR erasure | api-gateway | Authenticated API endpoint, cascading D1 deletes | None |
| mTLS | ws-gateway | Connector connections arrive here | Cloudflare mTLS certificate config (not a binding) |

### Component Boundaries

```
                                    [Cloudflare Edge]
                                          |
              +---------------------------+---------------------------+
              |                           |                           |
        [Pages CDN]              [api-gateway]                  [ws-gateway]
        Next.js 15               Hono HTTP API                 WebSocket + DO
        Static Export            Auth, CRUD, Billing            Connector Relay
        + next-intl              Stripe Webhooks                mTLS termination
              |                  GDPR Erasure                        |
              |                  MFA/TOTP                            |
              |                       |                              |
              |            +----------+----------+                   |
              |            |                     |              [Durable Object]
              |     [ai-orchestrator]      [Queue: report-     ConnectorSession
              |      NL-to-SQL              generation]         per-org state
              |      Claude API                  |                   |
              |                                  |              [.NET Agent]
              |                           [report-worker]       On-premise
              |                            CSV/HTML gen          SQL Server
              |                            R2 storage
              |                                  |
              |                           [Queue: email-
              |                            outbound]
              |                                  |
              |                           [email-worker]
              |                            Resend API
              |
        [cron-worker]
        Scheduled trigger
        every minute
              |
        [Queue: report-
         generation]
```

### Data Flow: New Features

**Stripe Billing Flow:**

```
Stripe Dashboard --> webhook POST --> api-gateway /webhooks/stripe
  1. Verify signature with stripe.webhooks.constructEventAsync()
  2. Switch on event.type:
     - checkout.session.completed --> create subscription, update org plan
     - customer.subscription.updated --> update org plan + limits
     - customer.subscription.deleted --> downgrade to trial
     - invoice.payment_failed --> flag org, send email via EMAIL_QUEUE
  3. Update organizations table (plan, stripe_customer_id, stripe_subscription_id, max_queries_per_month, max_users)
  4. ctx.waitUntil() for non-critical follow-up (audit log, email notification)
```

Why api-gateway: Stripe sends HTTP POST webhooks. The api-gateway already handles all HTTP traffic and has D1 access to update org records. Adding a `/webhooks/stripe` route is the natural fit. No auth middleware needed (Stripe signature verification replaces JWT). The STRIPE_WEBHOOK_SECRET env var is already declared in the types.

**Email Integration Flow:**

```
api-gateway (auth routes):
  POST /auth/signup --> enqueue { type: 'email_verification', ... } to EMAIL_QUEUE
  POST /auth/forgot-password --> enqueue { type: 'password_reset', ... } to EMAIL_QUEUE
  POST /api/org/invite --> enqueue { type: 'team_invitation', ... } to EMAIL_QUEUE

report-worker:
  After generating report --> enqueue { type: 'scheduled_report', ... } to EMAIL_QUEUE

email-worker (queue consumer):
  Dequeue --> switch on type --> render HTML template --> Resend API
```

api-gateway needs a new binding: `EMAIL_QUEUE` (Queue producer) pointing to `email-outbound` queue. The email-worker already fully implements all four email types with HTML templates and Resend integration. The forgot-password route already generates tokens and stores them in KV -- it just needs the queue.send() call added.

**MFA (TOTP) Flow:**

```
SETUP:
  1. POST /api/mfa/setup (authenticated)
     - Generate TOTP secret (crypto.getRandomValues + base32 encode)
     - Store encrypted secret in users table (new column: totp_secret, totp_enabled)
     - Return otpauth:// URI for QR code generation on frontend
  2. POST /api/mfa/verify-setup (authenticated)
     - User submits TOTP code from authenticator app
     - Verify TOTP code against stored secret
     - Set totp_enabled = 1
     - Generate and return recovery codes (store hashed in D1)

LOGIN WITH MFA:
  1. POST /auth/login (existing)
     - Verify email/password as normal
     - If user.totp_enabled: return { requiresMfa: true, mfaToken: <short-lived token> }
       Do NOT return access/refresh tokens yet
  2. POST /auth/mfa/verify
     - Verify mfaToken + TOTP code
     - If valid: issue access + refresh tokens (normal login response)
     - If invalid: increment attempt counter, lock after 5 failures
```

Why api-gateway: MFA is an authentication concern. The login flow already lives in api-gateway auth routes. TOTP verification uses HMAC-SHA1 which is available via Web Crypto API in Workers (no external library needed for core TOTP, though `otpauth` npm package simplifies it). The two-step login (password then TOTP) is a standard pattern that fits cleanly into the existing auth route structure.

**Report Export Flow (On-Demand):**

```
On-demand CSV:
  1. POST /api/reports/:id/export?format=csv
  2. api-gateway fetches query results (from cache or re-execute via ws-gateway)
  3. Generate CSV string in-memory
  4. Return as Response with Content-Type: text/csv, Content-Disposition: attachment

On-demand PDF:
  Option A (recommended): Generate styled HTML report, return with Content-Type: text/html
  Option B (future): Use Cloudflare Browser Rendering binding to convert HTML to PDF
  Option C: Use formepdf (Rust/WASM, ~3MB, 20-40ms render) for true PDF
```

The report-worker already handles scheduled exports with CSV and HTML generation. On-demand exports should live in api-gateway since they are synchronous user requests. True PDF generation in Workers is possible via Browser Rendering (Puppeteer) or WASM-based libraries like formepdf, but HTML export is the pragmatic v1 approach -- the report-worker already takes this approach for its "pdf" format.

**GDPR Erasure Flow:**

```
DELETE /api/gdpr/erasure (authenticated, owner only)
  1. Verify user is org owner
  2. Begin cascade deletion (D1 batch):
     - DELETE FROM dashboard_widgets WHERE dashboard_id IN (SELECT id FROM dashboards WHERE org_id = ?)
     - DELETE FROM dashboards WHERE org_id = ?
     - DELETE FROM schedule_runs WHERE schedule_id IN (SELECT id FROM schedules WHERE org_id = ?)
     - DELETE FROM schedules WHERE org_id = ?
     - DELETE FROM reports WHERE org_id = ?
     - DELETE FROM queries WHERE org_id = ?
     - DELETE FROM schema_columns WHERE org_id = ?
     - DELETE FROM schema_tables WHERE org_id = ?
     - DELETE FROM few_shot_examples WHERE org_id = ?
     - DELETE FROM invitations WHERE org_id = ?
     - DELETE FROM api_keys WHERE org_id = ?
     - DELETE FROM audit_log WHERE org_id = ?
     - DELETE FROM users WHERE org_id = ?
     - DELETE FROM organizations WHERE id = ?
  3. Purge R2 objects: list and delete `reports/{orgId}/*`
  4. Purge KV sessions: scan and delete `session:*` for affected users
  5. Return confirmation with deletion timestamp
  6. Log erasure request separately (for compliance proof, minimal data)
```

Critical ordering: D1 foreign keys require child-first deletion. The schema already has REFERENCES constraints but not ON DELETE CASCADE, so explicit ordered deletion is required. D1 supports batch operations (`db.batch([...])`) for atomicity within a single batch, but the batch size may need splitting for orgs with large data volumes. KV does not support prefix scanning natively -- user session JTIs would need to be tracked (e.g., store a list of active JTIs per user in KV or D1).

**i18n (Internationalization) Flow:**

```
Frontend (build-time):
  1. Install next-intl
  2. Create message files: messages/en.json, messages/pt.json, messages/es.json
  3. Configure middleware.ts for locale detection (or static locale from user preference)
  4. Wrap layouts with NextIntlClientProvider
  5. Use useTranslations() in components
  6. For static export: use generateStaticParams to generate pages for each locale
  7. Use setRequestLocale() in server components for static rendering

Route structure change:
  frontend/src/app/[locale]/(public)/page.tsx
  frontend/src/app/[locale]/(auth)/login/page.tsx
  frontend/src/app/[locale]/(dashboard)/page.tsx

User preference:
  - users.language column already exists (default: 'pt')
  - Frontend reads user.language from auth store, sets locale accordingly
  - Language switcher updates user preference via PUT /api/org/users/:id
```

Static export compatibility: next-intl supports `output: "export"` with App Router. The key requirement is calling `setRequestLocale(locale)` in every layout and page, and implementing `generateStaticParams` that returns all locale variants. This generates `/en/dashboard`, `/pt/dashboard`, `/es/dashboard` as static HTML at build time. No SSR needed -- fully compatible with Cloudflare Pages.

**mTLS for Connector Communication:**

```
Cloudflare mTLS setup:
  1. Create client CA certificate in Cloudflare Dashboard
  2. Configure mTLS rule on ws.apura.xyz zone
  3. Generate per-org client certificates signed by the CA
  4. .NET connector includes client cert in WebSocket TLS handshake
  5. Cloudflare validates cert at edge, passes cf.tls_client_auth headers to ws-gateway
  6. ws-gateway reads cf.tls_client_auth.cert_serial to identify org

Worker-side changes (ws-gateway):
  - Read request.cf.tlsClientAuth for certificate validation result
  - Map certificate serial/fingerprint to org_id
  - New D1 table: connector_certificates (org_id, cert_serial, cert_fingerprint, issued_at, revoked_at)
  - Dual auth during transition: accept either API key OR valid client cert

.NET connector changes:
  - Load client certificate from Windows certificate store (or PFX file)
  - Configure WebSocket client to present certificate during TLS handshake
  - MSI installer provisions certificate to LocalMachine store
```

## Patterns to Follow

### Pattern 1: Queue-Driven Async Processing
**What:** Use Cloudflare Queues for any work that does not need a synchronous response.
**When:** Email sending, scheduled report generation, billing notifications.
**Why:** Workers have 30-second CPU time limits. Queues provide retry semantics, dead-letter handling, and decouple producers from consumers.
```
Queue topology (already designed):
  api-gateway --[report-generation]--> report-worker --[email-outbound]--> email-worker
  cron-worker --[report-generation]--> report-worker
  api-gateway --[email-outbound]--> email-worker  (NEW: direct email for auth flows)
```

### Pattern 2: ctx.waitUntil() for Non-Critical Follow-Up
**What:** Use `ctx.waitUntil()` to perform work after the response is sent.
**When:** Audit logging, cache warming, analytics, Stripe webhook follow-up notifications.
**Why:** Keeps response latency low while still completing background work within the same invocation.
```typescript
// In Stripe webhook handler:
c.executionCtx.waitUntil(
  env.EMAIL_QUEUE.send({ type: 'billing_notification', ... })
);
return c.json({ received: true }, 200);
```

### Pattern 3: Two-Phase Authentication (for MFA)
**What:** Login returns a temporary MFA token instead of access tokens when TOTP is enabled.
**When:** User has MFA enabled.
**Why:** Never issue access tokens until all authentication factors are verified. The MFA token is short-lived (5 min), single-use, stored in KV.
```typescript
// Step 1: password verified, MFA required
return c.json({ requiresMfa: true, mfaToken: '<uuid>' });
// Step 2: TOTP verified, issue real tokens
return c.json({ accessToken, refreshToken, ... });
```

### Pattern 4: Service Binding for Internal Communication
**What:** Use Cloudflare Service Bindings (Fetcher) for worker-to-worker calls.
**When:** api-gateway calling ai-orchestrator or ws-gateway.
**Why:** Zero-latency internal calls, no public internet traversal, shared authentication via INTERNAL_SECRET header. Already established pattern in the codebase.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Handling Stripe Webhooks in a Separate Worker
**What:** Creating a new `billing-worker` just for Stripe webhooks.
**Why bad:** Stripe webhooks need to update D1 org records. The api-gateway already has D1 bindings and org database utilities. A separate worker would need duplicate bindings and would add deployment complexity for minimal benefit.
**Instead:** Add a `/webhooks/stripe` route to api-gateway. It is a simple HTTP POST handler.

### Anti-Pattern 2: Synchronous PDF Generation via External API
**What:** Calling an external PDF generation API from the request handler and waiting for the result.
**Why bad:** External API latency (2-10s) plus Workers CPU limits. If the external API is slow or down, the user request fails.
**Instead:** For on-demand export, use CSV or HTML (instant generation). For true PDF, use the queue-based report-worker with R2 storage, then poll or notify when ready.

### Anti-Pattern 3: Storing TOTP Secrets in KV
**What:** Using KV to store TOTP secrets because "it's a key-value thing."
**Why bad:** KV is eventually consistent and designed for caching. TOTP secrets are permanent credentials that must not be lost. KV has no backup or transaction guarantees.
**Instead:** Store TOTP secrets in D1 (the `users` table, new column `totp_secret`). D1 is the source of truth for user data.

### Anti-Pattern 4: Building i18n as Server-Side Middleware
**What:** Creating a Workers middleware that intercepts requests and translates responses.
**Why bad:** The frontend is a static export. There is no server to intercept. Adding SSR just for i18n defeats the static-export architecture.
**Instead:** Use next-intl with `generateStaticParams` to generate all locale variants at build time. The CDN serves pre-rendered locale-specific pages.

### Anti-Pattern 5: GDPR Erasure via Individual DELETE Statements
**What:** Running separate `db.prepare().run()` calls for each table deletion.
**Why bad:** Not atomic. If the Worker times out mid-deletion, you have partial erasure -- a compliance nightmare.
**Instead:** Use `db.batch([...])` to execute all deletions in a single D1 batch. D1 batch operations are atomic. For very large orgs, split into two batches: child tables first, then parent tables.

## Scalability Considerations

| Concern | Current (100 orgs) | At 1K orgs | At 10K orgs |
|---------|---------------------|------------|-------------|
| D1 single-writer | Fine | Monitor write latency | Migrate to Hyperdrive + Postgres |
| KV session storage | Fine | Fine (KV scales horizontally) | Fine |
| Queue throughput | Fine | Fine (Queues scale automatically) | Monitor batch sizes |
| R2 report storage | Fine | Fine (object storage scales) | Add lifecycle rules for old reports |
| Cron every-minute | Fine | Fine (queries D1 for due schedules) | Shard by org hash or use Workflows |
| Durable Objects | 1 DO per org | Fine (DOs scale per-org) | Fine (Cloudflare manages placement) |
| Static export build | Fast (3 locales) | N/A (build-time, not runtime) | N/A |
| Stripe webhooks | Low volume | Fine | Fine (single endpoint, idempotent) |

## Suggested Build Order (Dependencies)

```
Phase 1: Foundation (no external dependencies)
  - Email worker activation (already implemented, needs queue binding in api-gateway)
  - CSV export (pure string generation, no new dependencies)
  - GDPR erasure endpoint (D1 cascade, self-contained)

Phase 2: Auth Enhancement
  - MFA/TOTP (depends on: email working for recovery code delivery)
  - i18n (independent, but affects all UI -- do before adding more UI)

Phase 3: Billing
  - Stripe integration (depends on: email for payment failure notifications)
  - Plan enforcement updates (depends on: Stripe subscription status)

Phase 4: Async Pipeline
  - Cron worker activation (depends on: nothing, but useful only with report-worker)
  - Report worker activation (depends on: email-worker for delivery)
  - Scheduled reports UI (depends on: cron + report workers)

Phase 5: Security Hardening
  - mTLS for connector (depends on: .NET connector being validated E2E first)
  - .NET connector MSI packaging (depends on: mTLS cert provisioning flow)
```

**Build order rationale:**
- Email is the foundation -- MFA needs it for recovery codes, billing needs it for payment alerts, reports need it for delivery. Activate it first.
- GDPR erasure is self-contained and required for EU compliance before public launch.
- MFA and i18n are auth/UI features that should be in place before billing drives user growth.
- Stripe billing depends on email for dunning (payment failure) notifications.
- The async pipeline (cron/reports) is the most complex integration with the most moving parts -- it should come after the simpler features are proven.
- mTLS and the .NET installer are the final hardening steps, needed for production customers but not for the initial launch.

## Sources

- [Cloudflare Blog: Stripe SDK support in Workers](https://blog.cloudflare.com/announcing-stripe-support-in-workers/)
- [Stripe Node.js Cloudflare Worker Template](https://github.com/stripe-samples/stripe-node-cloudflare-worker-template)
- [Hono Stripe Webhook Example](https://hono.dev/examples/stripe-webhook)
- [Cloudflare Browser Rendering PDF docs](https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/)
- [Cloudflare Browser Rendering PDF generation guide](https://developers.cloudflare.com/browser-rendering/how-to/pdf-generation/)
- [Forme PDF: WASM-based PDF generation in Workers](https://www.formepdf.com/blog/pdf-cloudflare-workers)
- [next-intl: Static export with App Router](https://next-intl.dev/docs/routing/setup)
- [next-intl static export example](https://github.com/azu/next-intl-example)
- [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Cloudflare GDPR compliance](https://www.cloudflare.com/trust-hub/gdpr/)

---

*Architecture analysis: 2026-03-18*
