# Domain Pitfalls

**Domain:** SaaS production features (billing, GDPR, MFA, i18n, email, export) on Cloudflare Workers
**Researched:** 2026-03-18
**Confidence:** HIGH (multiple verified sources per pitfall)

## Critical Pitfalls

Mistakes that cause rewrites, data loss, revenue loss, or legal exposure.

### Pitfall 1: Stripe Webhook Race Conditions with D1 Single-Writer

**What goes wrong:** Stripe sends webhooks out of order and may retry them. With D1's single-writer SQLite, concurrent webhook deliveries cause race conditions: a `customer.subscription.updated` event arrives before `customer.subscription.created`, or two retries of the same event write simultaneously. The result is corrupted subscription state -- users on wrong plans, lost payments, or duplicate charges.

**Why it happens:** D1 has no row-level locking or `SELECT ... FOR UPDATE`. Stripe does not guarantee event ordering. The `organizations` table already has `stripe_customer_id` and `stripe_subscription_id` columns but no `stripe_event_id` tracking for idempotency.

**Consequences:** Users billed incorrectly, plan enforcement out of sync with Stripe, revenue leakage, customer support burden.

**Prevention:**
1. Create a `stripe_events` table to track processed event IDs -- return 200 immediately for duplicates.
2. Use Cloudflare Queues (already have `REPORT_QUEUE` binding in types.ts) to serialize webhook processing. Accept webhook, verify signature, enqueue event, return 200. Process from queue with single consumer.
3. Store Stripe subscription status and period dates directly (not just IDs). On any webhook, fetch canonical state from Stripe API (`stripe.subscriptions.retrieve()`) rather than trusting event payload alone.
4. Use `constructEventAsync` (not `constructEvent`) and `SubtleCryptoProvider` -- the sync version fails in Workers V8 isolate.

**Detection:** Monitor for `stripe_customer_id` mismatches between Stripe dashboard and D1. Alert on webhook handler errors (currently no error tracking exists -- see CONCERNS.md).

**Phase:** Billing integration. Must be correct from day one.

---

### Pitfall 2: Stripe Webhook Signature Verification Timeout

**What goes wrong:** Stripe webhook signatures expire after 5 minutes. If your handler does heavy processing before verifying the signature (e.g., database lookups, external API calls), verification fails on retries or slow paths. You cannot persist raw webhooks and reprocess them later because signature verification will fail.

**Why it happens:** Developers often validate signature as the last step, or try to build a "store and replay" architecture for webhooks. Stripe's replay-attack prevention makes this impossible.

**Consequences:** Webhook handler silently rejects valid events. Subscription state drifts from Stripe. No error because signature check throws, not application logic.

**Prevention:**
1. Verify signature as the FIRST operation in the webhook handler. Use raw request body (not parsed JSON).
2. Return 200 immediately after enqueueing. Do NOT do database writes in the webhook handler itself.
3. In the Hono route, access `await c.req.text()` for raw body before any JSON parsing.

**Detection:** Log signature verification failures separately from business logic errors. Monitor Stripe dashboard for webhook delivery failures.

**Phase:** Billing integration.

---

### Pitfall 3: GDPR Erasure with Cascading Foreign Keys in D1

**What goes wrong:** The schema has deep foreign key chains: `organizations` -> `users` -> `queries` -> `reports` -> `dashboard_widgets`, plus `audit_log`, `schedules`, `schedule_runs`, `few_shot_examples`, `invitations`, `api_keys`. A GDPR erasure request for a user requires deleting across 10+ tables. D1 enforces `PRAGMA foreign_keys = ON` and you cannot disable it (all queries run in implicit transactions). Without `ON DELETE CASCADE` on every FK (current schema lacks it), deletion order matters and fails on constraint violations.

**Why it happens:** The current migration `0001_initial_schema.sql` defines foreign keys without CASCADE actions. Deleting a user requires manually deleting in reverse-dependency order: `dashboard_widgets` -> `reports` -> `queries` -> `invitations` -> `api_keys` -> `audit_log` -> `users`. Miss one table and the DELETE fails. Add a new table with a user FK later and the erasure endpoint silently becomes incomplete.

**Consequences:** GDPR non-compliance (EDPB is actively enforcing right-to-erasure in 2025-2026 with 32 DPAs coordinating). Erasure requests fail silently or partially. Legal liability under GDPR Article 17.

**Prevention:**
1. Add a migration adding `ON DELETE CASCADE` to user-linked foreign keys (queries, reports, invitations, api_keys). Be surgical -- do NOT cascade from organizations to users (org deletion is different from user erasure).
2. Build an erasure service that: (a) identifies ALL tables containing user PII, (b) anonymizes audit_log entries (replace user details with "DELETED_USER" but keep action records for compliance), (c) deletes user row last (cascades handle the rest).
3. Maintain a "PII map" document listing every table/column containing personal data. Update it when adding tables.
4. Distinguish between data erasure (GDPR right) and data anonymization (audit trail preservation). Audit logs may need anonymization, not deletion.

**Detection:** Automated test that attempts user erasure on a fully-populated test database and verifies zero references remain. Run on every migration.

**Phase:** GDPR compliance. Must be designed before billing (billing adds more user data to erase).

---

### Pitfall 4: next-intl with Static Export Breaks Middleware and Routing

**What goes wrong:** Apura's frontend uses `output: 'export'` (static Next.js deployed to Cloudflare Pages). next-intl's locale detection middleware does NOT run on static exports. Developers add next-intl, configure middleware for locale detection/redirect, and nothing works -- no locale prefix routing, no automatic detection, no redirect from `/` to `/pt`.

**Why it happens:** Static export means no server-side execution. next-intl middleware requires a Node.js server or edge runtime. The `withNextIntl` config option conflicts with `output: 'export'`. This is a fundamental architectural constraint, not a bug.

**Consequences:** i18n appears to work in development (where Next.js dev server runs middleware) but breaks completely in production static export. Discovery happens at deploy time.

**Prevention:**
1. Use next-intl's "without middleware" mode explicitly. Structure routes as `[locale]/page.tsx` with static params generation.
2. Use `generateStaticParams` to pre-render all locale variants at build time.
3. Handle locale detection on the client side (browser `navigator.language` or stored preference in localStorage), then redirect via client-side router.
4. The `users.language` column (already defaulting to `'pt'`) should drive locale after login. Before login, use browser preference.
5. Test the production build (`next build && next export`) early -- do not wait until deploy.

**Detection:** Build the static export in CI and verify locale-prefixed routes exist in the output directory.

**Phase:** i18n implementation. Research next-intl static export docs before writing any code.

---

### Pitfall 5: MFA Recovery Gap Locks Users Out Permanently

**What goes wrong:** TOTP MFA is implemented without adequate recovery codes. User loses phone, authenticator app data is wiped, or phone is factory-reset. No recovery path exists. For a B2B SaaS targeting construction/ERP users (not developers), this is especially dangerous -- users are less likely to understand backup procedures.

**Why it happens:** Developers focus on the TOTP enrollment flow and forget recovery. Or they implement recovery codes but store them in plaintext, or generate too few, or don't explain their importance during enrollment.

**Consequences:** Users permanently locked out. Support burden for manual account recovery (which itself is an attack vector if not properly verified). Enterprise customers will reject MFA without documented recovery procedures.

**Prevention:**
1. Generate 8-10 single-use recovery codes during MFA enrollment. Hash them (bcrypt) in the database. Show them ONCE and require user acknowledgment.
2. Allow org admins (owner/admin role) to reset MFA for users in their org -- this is critical for enterprise. Log this action in audit_log.
3. Implement a 30-second time-step window (accept codes from t-1, t, t+1) to handle clock drift. NTP sync on server is handled by Cloudflare, but user devices may drift.
4. Rate-limit TOTP verification to 5 attempts per 5 minutes. A 6-digit TOTP has 1M combinations -- without rate limiting, brute force is feasible.
5. Store TOTP secrets encrypted at rest (use Workers encryption or a derived key from `JWT_SECRET`), not plaintext in D1.

**Detection:** Track MFA enrollment vs. recovery code download rates. Alert if users enroll but never acknowledge recovery codes.

**Phase:** MFA implementation.

---

## Moderate Pitfalls

### Pitfall 6: Email Delivery Reputation and Transactional vs. Marketing Split

**What goes wrong:** All emails (password reset, email verification, report delivery, billing receipts) sent from the same domain/IP without proper SPF/DKIM/DMARC. Report delivery emails (potentially bulk) tank sender reputation, causing password reset emails to land in spam.

**Prevention:**
1. Use Resend (or Cloudflare Email Service, now in beta) with verified domain and proper DNS records (SPF, DKIM, DMARC).
2. Separate transactional emails (auth, billing) from bulk/scheduled emails (report delivery) using different sending domains or subdomains (e.g., `mail.apura.xyz` for transactional, `reports.apura.xyz` for delivery).
3. The `email-worker` package already exists as a stub. Implement it as a queue consumer (not inline in API routes) so email failures don't block auth flows.
4. Implement exponential backoff for failed sends. Do NOT retry password reset emails aggressively -- it looks like spam.

**Detection:** Monitor bounce rates and delivery rates in Resend dashboard. Alert on > 2% bounce rate.

**Phase:** Email integration (prerequisite for password reset fix, billing receipts, report delivery).

---

### Pitfall 7: PDF Generation Hits Workers Memory/Runtime Limits

**What goes wrong:** Generating PDFs for report export inside a Cloudflare Worker. Puppeteer/Chromium cannot run in Workers (200MB binary, no child processes). Libraries like `react-pdf` fail due to WASM restrictions. Large report datasets (thousands of rows from Primavera queries) exceed the 128MB Worker memory limit during PDF rendering.

**Prevention:**
1. Use Cloudflare Browser Rendering API (managed Puppeteer) for PDF generation. It runs headless Chrome externally and returns PDF via binding.
2. Alternative: Use a Rust-to-WASM PDF library (e.g., Forme, ~3MB) for simple tabular reports. Reserve Browser Rendering for complex layouts with charts.
3. For large datasets, paginate results in the PDF. Do NOT buffer entire query results in memory -- stream rows from D1/connector and render page-by-page.
4. Store generated PDFs in R2 (not KV -- KV has 25MB value limit). Return a signed R2 URL to the user.
5. Process PDF generation asynchronously via the `report-worker` queue. Return a job ID, let client poll for completion.

**Detection:** Monitor Worker memory usage and CPU time metrics. Set alerts for Workers approaching 128MB or 30s CPU time.

**Phase:** Report export (CSV first, PDF second -- CSV is simpler and validates the export pipeline).

---

### Pitfall 8: Billing Plan Enforcement Drift from Stripe State

**What goes wrong:** App stores plan tier in `organizations.plan` column and checks it for feature gating. Stripe subscription changes (upgrade, downgrade, cancellation, payment failure) update Stripe's records, but the webhook handler fails to update D1, or updates are lost due to the race conditions in Pitfall 1. Users end up on the wrong plan -- either getting features they haven't paid for, or losing access they should have.

**Prevention:**
1. Treat Stripe as the source of truth for billing state. On critical feature-gated actions (not every request), verify against Stripe API if local state is stale (> 5 minutes since last sync).
2. Cache Stripe subscription state in KV with a 5-minute TTL. On cache miss, fetch from Stripe API.
3. Handle the `customer.subscription.deleted` event to downgrade to trial/free. Handle `invoice.payment_failed` to mark org as past-due with a grace period (don't cut access immediately).
4. Add `subscription_status` and `current_period_end` columns to organizations table. Check `current_period_end` for expiry, not just plan name.

**Detection:** Weekly reconciliation job (cron-worker) that compares all orgs' plan status against Stripe API and flags mismatches.

**Phase:** Billing integration.

---

### Pitfall 9: i18n Applied Only to UI, Not to Data and Errors

**What goes wrong:** Translations added to frontend labels and buttons, but error messages from API remain in English, email templates are hardcoded in one language, PDF reports ignore locale for date/number formatting, and the NL-to-SQL prompt doesn't adapt to user's language (Portuguese user gets English explanation).

**Why it happens:** i18n is treated as a frontend-only concern. The API, email templates, and AI prompts are forgotten.

**Prevention:**
1. Send `Accept-Language` header (or user's `language` field from JWT) to API. Return translated error messages from a server-side message catalog.
2. Email templates must be locale-aware. Use a template engine that supports locale switching (e.g., separate template files per locale).
3. The `few_shot_examples` table already has `natural_language_pt` and `natural_language_en` columns. The AI orchestrator must select examples matching the user's language and instruct Claude to respond in that language.
4. Date/number formatting in CSV and PDF exports must respect locale (PT: `dd/MM/yyyy`, `1.234,56` vs EN: `MM/dd/yyyy`, `1,234.56`).

**Detection:** Test each user-facing output (API errors, emails, PDFs) in each supported locale. Automated screenshot testing for UI.

**Phase:** i18n (but plan for it during email and export implementation -- don't build monolingual templates that need rewriting).

---

### Pitfall 10: Quota Enforcement Bypass During Plan Transitions

**What goes wrong:** User is on trial (100 queries). They upgrade to starter (1000 queries). The `queries_this_month` counter doesn't reset. Or: user downgrades mid-month and the counter exceeds the new plan's limit, but the check passes because it compared against the old plan cached in KV. The existing "quota middleware fails open" bug (CONCERNS.md) compounds this.

**Prevention:**
1. Fix the fail-open bug first (return 503 on quota check failure, not pass-through).
2. On plan change webhook, reset `queries_this_month` to 0 only on upgrade. On downgrade, do NOT reset -- let the user finish the current period.
3. Read `max_queries_per_month` from the plan definition, not from a cached value. Plan definitions should be in code (constant map), not in the database.
4. The `queries_month_reset` column exists but needs a cron job to actually reset counters monthly. The `cron-worker` stub must implement this.

**Detection:** Log every quota check result (allowed/denied, current count, max). Alert on orgs exceeding their plan limit.

**Phase:** Billing integration (tightly coupled with plan enforcement).

---

## Minor Pitfalls

### Pitfall 11: CSV Export Injection

**What goes wrong:** Query results containing formulas (`=SUM(...)`, `=CMD(...)`) are exported to CSV. When opened in Excel, the formulas execute (DDE injection / CSV injection attack). This is especially relevant for Primavera data which may contain user-entered text in description fields.

**Prevention:** Prefix cell values starting with `=`, `+`, `-`, `@`, `\t`, `\r` with a single quote (`'`). Apply this sanitization in the CSV export worker, not in the query layer.

**Detection:** Unit test CSV output with formula-like inputs.

**Phase:** Export implementation.

---

### Pitfall 12: GDPR Consent Before Stripe Customer Creation

**What goes wrong:** Creating a Stripe customer (which stores PII: email, name) before obtaining proper GDPR consent. Also: storing billing data without clear data processing agreement (DPA) terms, or not disclosing Stripe as a sub-processor in the privacy policy.

**Prevention:**
1. Update privacy policy and terms of service to list Stripe as a data sub-processor before enabling billing.
2. Ensure signup flow includes consent checkbox for data processing (already have terms/privacy pages per PROJECT.md).
3. Only create Stripe customer when user initiates a paid plan, not at signup.
4. Include DPA template as mentioned in PROJECT.md active requirements.

**Detection:** Legal review of privacy policy before billing launch.

**Phase:** GDPR compliance should complete before or alongside billing launch.

---

### Pitfall 13: Hardcoded Locale Assumptions in Existing Code

**What goes wrong:** Existing code assumes Portuguese locale in subtle ways -- date formats, default timezone (`Europe/Lisbon` in schema), currency assumptions, error messages. When adding i18n, these become bugs for non-Portuguese users.

**Prevention:**
1. Audit existing code for hardcoded locale assumptions before starting i18n work.
2. The `organizations.timezone` and `organizations.country` fields exist. Use them for server-side formatting.
3. The `users.language` column (defaulting to `'pt'`) is the user-level locale indicator. Ensure it's included in JWT claims so every service can access it.

**Detection:** Grep for hardcoded date format strings, currency symbols, and timezone references.

**Phase:** i18n (audit phase, before implementation).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Email integration | Email blocks auth flows if sent inline | Use queue-based email worker; never await email send in auth routes |
| Email integration | Password reset token in email link is guessable | Use crypto.randomUUID() (already using hex(randomblob)), enforce 1-hour expiry, single-use |
| Stripe billing | Webhook handler does too much work, times out | Return 200 immediately, process via Cloudflare Queue |
| Stripe billing | Test mode vs live mode key confusion | Use separate wrangler environments (dev/staging/prod) with different Stripe keys |
| Stripe billing | No Stripe customer created at signup, causes null reference on plan check | Lazy-create Stripe customer on first billing action, not at org creation |
| GDPR compliance | Audit log deletion destroys compliance evidence | Anonymize audit logs (remove PII), do not delete them |
| GDPR compliance | Backups contain deleted user data | Document that D1 snapshots may contain erased data; set retention policy |
| MFA / TOTP | TOTP secret stored plaintext in D1 | Encrypt with AES-256-GCM using derived key before storage |
| MFA / TOTP | MFA required before email is verified | Enforce email verification before allowing MFA enrollment |
| i18n | Translation keys diverge from source | Use extraction tooling (e.g., next-intl's TypeScript-based approach) to catch missing keys at build time |
| i18n | RTL languages not considered | Out of scope for PT/ES/EN (all LTR), but structure CSS to not hardcode direction |
| CSV export | Large Primavera result sets (100K+ rows) OOM Worker | Stream CSV rows; set a row limit per export (e.g., 50K); offer paginated download |
| PDF export | Chart rendering requires browser context | Use Browser Rendering API; do not try to render ECharts in Worker directly |
| Report sharing | Shared link exposes data without auth | Implement signed URLs with expiry; require org membership for non-public reports |

## Sources

- [Stripe Webhook in Cloudflare Workers](https://gebna.gg/blog/stripe-webhook-cloudflare-workers) - Workers-specific Stripe integration guide
- [Hono Stripe Webhook Example](https://hono.dev/examples/stripe-webhook) - Framework-specific integration
- [Stripe Webhooks Best Practices (Stigg)](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks) - Idempotency and race conditions
- [Stripe Webhook Race Conditions (DEV Community)](https://dev.to/belazy/the-race-condition-youre-probably-shipping-right-now-with-stripe-webhooks-mj4) - Race condition patterns
- [Billing Webhook Race Condition Solution Guide](https://excessivecoding.com/blog/billing-webhook-race-condition-solution-guide) - Single-writer pattern
- [Stripe Subscription Webhooks Documentation](https://docs.stripe.com/billing/subscriptions/webhooks) - Official event lifecycle
- [EDPB Right to Erasure Enforcement 2025](https://www.edpb.europa.eu/our-work-tools/our-documents/other/coordinated-enforcement-action-implementation-right-erasure_en) - Regulatory enforcement focus
- [Cloudflare D1 Foreign Keys](https://developers.cloudflare.com/d1/build-with-d1/foreign-keys/) - D1-specific FK behavior
- [5 Common TOTP Mistakes (Authgear)](https://www.authgear.com/post/5-common-totp-mistakes) - TOTP implementation errors
- [Common Pitfalls of MFA (WorkOS)](https://workos.com/blog/common-pitfalls-of-mfa-and-how-to-avoid-them) - MFA operational pitfalls
- [next-intl Static Export Issue #334](https://github.com/amannn/next-intl/issues/334) - Static export limitations
- [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) - Memory limits, streaming
- [Generate PDFs with Cloudflare Browser Rendering](https://developers.cloudflare.com/browser-rendering/how-to/pdf-generation/) - PDF generation approach
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) - Memory and CPU constraints
- [Resend on Cloudflare Workers](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/) - Email integration

---

*Pitfalls audit: 2026-03-18*
