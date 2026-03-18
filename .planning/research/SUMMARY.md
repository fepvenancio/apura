# Project Research Summary

**Project:** Apura (NL-to-SQL for Primavera P6)
**Domain:** B2B SaaS -- enterprise query tool with billing, compliance, and connector packaging
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

Apura is an existing Cloudflare Workers microservices application that needs production-readiness features: billing (Stripe), transactional email (Resend), MFA (TOTP), i18n (PT/ES/EN), report export (CSV/PDF), GDPR compliance, CI/CD, mTLS for connector security, and .NET installer packaging. The critical insight from research is that most of the infrastructure already exists as implemented-but-undeployed worker stubs (email-worker, report-worker, cron-worker) with correct queue topology and bindings. The work is primarily activation and integration, not greenfield architecture.

The recommended approach is dependency-ordered phasing: email activation first (it unblocks password reset, MFA recovery, billing notifications, and report delivery), then billing and GDPR together (billing creates PII that GDPR must account for), then MFA and i18n (auth hardening before user growth), then the async report pipeline, and finally connector hardening. Every recommended technology runs natively on Cloudflare Workers without Node.js compatibility hacks -- this was a deliberate selection criterion.

The top risks are Stripe webhook race conditions with D1's single-writer model (mitigate by serializing webhooks through a queue and using idempotency tracking), GDPR erasure across 10+ tables without CASCADE constraints (mitigate by adding a migration and using D1 batch operations), and next-intl breaking on static export if middleware is configured (mitigate by using the "without middleware" mode with client-side locale detection). All three are well-documented with clear prevention strategies.

## Key Findings

### Recommended Stack

The existing stack (Next.js 15, Hono on Workers, D1, KV, Durable Objects) remains unchanged. All additions were selected for native Workers compatibility and minimal dependency footprint. See `.planning/research/STACK.md` for full details.

**Core additions:**
- **Stripe** (stripe ^20.4.1): Billing -- natively supports Workers, uses SubtleCryptoProvider for webhook verification. DB already has stripe fields.
- **Resend** (resend ^6.9.4): Transactional email -- fetch-based API, no Node.js dependencies. Email-worker stub already uses it.
- **next-intl** (^4.8.3): i18n -- standard for Next.js App Router, supports static export with generateStaticParams.
- **otpauth** (^9.5.0): TOTP MFA -- RFC 6238 compliant, Web Crypto based, under 4KB.
- **jsPDF** (^4.2.1): Client-side PDF generation -- avoids Workers memory limits for large reports.
- **WiX Toolset** (6.0.2): .NET MSI installer -- MSBuild-native, enterprise GPO compatible.
- **GitHub Actions + wrangler-action v3**: CI/CD -- official Cloudflare support, Turbo cache compatible.

**No library needed for:** CSV export (20-line utility), GDPR endpoints (SQL + D1 batch), Cloudflare Cron Triggers (native).

### Expected Features

**Must have (table stakes):**
- Stripe Checkout + webhooks + Customer Portal -- cannot charge customers without billing
- Email delivery -- password reset is currently broken, verification and invitations are wired but not connected
- CSV export -- every data tool has this, trivial to implement client-side
- MFA with TOTP + recovery codes -- enterprise B2B requirement, asked about in every sales conversation
- CI/CD pipeline -- cannot safely ship any of the above without automated tests and deployment

**Should have (differentiators):**
- i18n (PT/ES/EN) -- Primavera P6 market is heavily Portuguese/Spanish-speaking
- Scheduled reports with email delivery -- "set and forget" for construction PMs
- Internal query/report sharing -- collaboration within org
- .NET connector MSI installer -- enterprise IT expects MSI for GPO deployment

**Defer (v2+):**
- PDF export via server-side rendering (use HTML print view for v1)
- External shareable links with signed URLs
- .NET connector auto-update mechanism
- XLSX export (CSV covers 95% of needs)
- OAuth/social login (current JWT auth works fine)
- Usage-based/metered billing (use fixed tiers with PLAN_LIMITS)

### Architecture Approach

The architecture is already well-designed as queue-driven microservices. New features slot into existing workers rather than requiring new ones. The key pattern is: api-gateway handles all synchronous HTTP (billing webhooks, MFA, GDPR, on-demand export), queue-based workers handle async processing (email, reports, cron), and the frontend handles i18n at build time via static export. See `.planning/research/ARCHITECTURE.md` for component placement matrix and data flow diagrams.

**Major components (existing, to be extended):**
1. **api-gateway** -- Stripe webhooks, MFA/TOTP auth flow, GDPR erasure, on-demand CSV export, EMAIL_QUEUE producer
2. **email-worker** -- Queue consumer for all transactional email via Resend (stub exists, needs activation)
3. **report-worker** -- Queue consumer for scheduled CSV/HTML generation, R2 storage (stub exists)
4. **cron-worker** -- Scheduled triggers for report generation, data retention cleanup, quota resets (stub exists)
5. **ws-gateway** -- mTLS termination for connector authentication (extend existing)
6. **frontend** -- next-intl integration, export UI buttons, MFA enrollment flow, billing management

### Critical Pitfalls

1. **Stripe webhook race conditions with D1** -- Stripe sends events out of order and retries. D1 has no row locking. Serialize webhooks through a Cloudflare Queue, track processed event IDs in a `stripe_events` table, and fetch canonical state from Stripe API rather than trusting event payloads.
2. **GDPR erasure across 10+ tables without CASCADE** -- Current schema has foreign keys without ON DELETE CASCADE. Partial deletion is a compliance nightmare. Add a migration for CASCADE on user-linked FKs, use D1 batch operations for atomicity, and maintain a PII map document.
3. **next-intl middleware breaks static export** -- Middleware does not run on static exports. Use "without middleware" mode, client-side locale detection, and generateStaticParams. Test production build early -- it works in dev but breaks on export.
4. **MFA recovery gap locks users out** -- Generate 8-10 hashed recovery codes during enrollment, allow org admins to reset MFA for members, encrypt TOTP secrets at rest, rate-limit verification attempts.
5. **Billing plan enforcement drift** -- Local plan state in D1 diverges from Stripe. Cache subscription state in KV with 5-minute TTL, add `subscription_status` and `current_period_end` columns, run weekly reconciliation via cron-worker.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: CI/CD and Email Activation
**Rationale:** CI/CD is the safety net for everything else. Email is the foundation dependency -- MFA needs it for recovery codes, billing needs it for payment failure notifications, reports need it for delivery. Password reset is currently broken.
**Delivers:** Automated test/deploy pipeline; working transactional email for password reset, email verification, and team invitations.
**Addresses:** CI/CD pipeline (table stakes), email delivery (table stakes), password reset fix (critical bug).
**Avoids:** Pitfall 6 (email reputation) by setting up proper SPF/DKIM/DMARC from the start and using queue-based delivery.
**Stack:** GitHub Actions, wrangler-action v3, Resend, email-worker activation.

### Phase 2: Billing and GDPR
**Rationale:** Cannot charge customers without billing. GDPR must be in place before billing launches because billing creates additional PII (Stripe customer records). These are tightly coupled -- Pitfall 12 warns that GDPR consent must precede Stripe customer creation.
**Delivers:** Stripe Checkout, webhook handling, Customer Portal, plan enforcement; GDPR erasure endpoint, data export, consent tracking, DPA template.
**Addresses:** Stripe billing (table stakes), GDPR compliance (legal requirement for EU market).
**Avoids:** Pitfall 1 (webhook race conditions) via queue serialization, Pitfall 3 (cascade deletion) via migration + batch operations, Pitfall 8 (plan drift) via reconciliation, Pitfall 12 (consent before billing).
**Stack:** Stripe SDK, D1 migrations for CASCADE + stripe_events table.

### Phase 3: MFA and Security Hardening
**Rationale:** Enterprise customers require MFA before adoption. Depends on email (Phase 1) for recovery code delivery and billing notifications. Should be in place before marketing drives user growth.
**Delivers:** TOTP enrollment with QR code, recovery codes, org-level MFA enforcement, mTLS for connector communication.
**Addresses:** MFA (table stakes for enterprise B2B), connector security.
**Avoids:** Pitfall 5 (MFA recovery gap) via recovery codes + admin reset, Pitfall 10 (quota bypass) by fixing fail-open bug alongside auth work.
**Stack:** otpauth, qrcode, Cloudflare API Shield mTLS.

### Phase 4: Export and Scheduled Reports
**Rationale:** The async pipeline (cron-worker, report-worker, email-worker) is the most complex integration. All three workers must be active and tested together. Simpler features should be proven first.
**Delivers:** CSV export (on-demand), HTML/print-optimized report export, scheduled report delivery via email, schedule management UI.
**Addresses:** CSV export (table stakes), scheduled reports (differentiator), report delivery.
**Avoids:** Pitfall 7 (PDF memory limits) by using client-side generation and deferring true PDF, Pitfall 11 (CSV injection) via cell sanitization.
**Stack:** jsPDF (client-side), cron-worker + report-worker activation.

### Phase 5: Internationalization
**Rationale:** Significant refactoring effort (extracting all UI strings, restructuring routes to `[locale]/...`). Better to do after all UI features are built to avoid extracting strings twice. But must happen before public launch in PT/ES markets.
**Delivers:** Full UI in Portuguese, Spanish, English; locale-aware date/number formatting; language preference in user settings.
**Addresses:** i18n (differentiator for Primavera P6 market).
**Avoids:** Pitfall 4 (static export middleware break) via "without middleware" mode, Pitfall 9 (i18n only in UI) by also localizing email templates and error messages, Pitfall 13 (hardcoded locale assumptions) via audit before implementation.
**Stack:** next-intl ^4.8.3.

### Phase 6: Connector Packaging
**Rationale:** Independent of cloud features. The functional .NET connector already exists. MSI packaging and auto-update are polish for enterprise deployment at scale. Can be developed in parallel with other phases but ships last.
**Delivers:** MSI installer with silent install, DPAPI credential storage, auto-update mechanism.
**Addresses:** .NET connector polish (differentiator for enterprise IT).
**Stack:** WiX Toolset 6.0.2, DPAPI, Windows Certificate Store.

### Phase Ordering Rationale

- Email is the foundational dependency: 4 other features require it (MFA recovery, billing dunning, report delivery, invitations).
- GDPR and billing are co-dependent: billing creates PII, GDPR must account for all PII. Shipping billing without erasure capability is a legal risk in the EU.
- MFA before growth: once billing is live and marketing drives signups, MFA must already be available for enterprise evaluation.
- Export after email: scheduled report delivery requires the full async pipeline (cron -> report -> email) which depends on Phase 1.
- i18n last among cloud features: it touches every UI surface. Doing it after all features are built avoids rework. The `users.language` column is already ready.
- Connector packaging is independently parallel but lowest priority for initial SaaS launch.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Billing):** Stripe webhook handling in Workers has several documented gotchas (signature verification timing, async construction, queue serialization). Research the exact Hono + Stripe pattern before coding.
- **Phase 5 (i18n):** next-intl static export without middleware requires specific configuration. Research the exact `setRequestLocale` + `generateStaticParams` pattern for the current next-intl version.
- **Phase 6 (Connector Packaging):** WiX 6 with .NET 9 Windows Service packaging. Research WiX Burn bootstrapper for .NET runtime prerequisite.

Phases with standard patterns (skip deep research):
- **Phase 1 (CI/CD + Email):** GitHub Actions + Wrangler is well-documented. Email-worker stub is already implemented.
- **Phase 3 (MFA):** TOTP is a well-established standard (RFC 6238). The otpauth library handles the complexity.
- **Phase 4 (Export):** CSV generation is trivial. Queue-based async is already the established codebase pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries verified on npm/NuGet with current versions. Workers compatibility confirmed via official Cloudflare docs. |
| Features | HIGH | Feature list derived from existing DB schema, codebase stubs, and enterprise B2B SaaS best practices. Dependencies mapped from code analysis. |
| Architecture | HIGH | Architecture extends existing patterns already working in production (service bindings, queue topology, Durable Objects). No new architectural concepts needed. |
| Pitfalls | HIGH | All critical pitfalls sourced from multiple verified references (Stripe docs, EDPB enforcement actions, next-intl GitHub issues, Cloudflare Workers limits docs). |

**Overall confidence:** HIGH

### Gaps to Address

- **Cloudflare Email Service (preview):** Currently in private preview. May become a viable alternative to Resend when GA. Revisit during Phase 1 planning but do not wait for it.
- **PDF export strategy:** Deferred true PDF to v2. If enterprise customers demand it sooner, evaluate Cloudflare Browser Rendering (Workers Paid plan, 2 concurrent browsers) or formepdf (Rust/WASM, ~3MB).
- **Error monitoring:** No error tracking service is mentioned in the current stack. Phases 1-4 add significant production surface area. Consider adding Sentry or Cloudflare Logpush before Phase 2 (billing errors must be visible).
- **D1 scaling:** D1 single-writer model is fine for current scale but could become a bottleneck at 10K+ orgs. Monitor write latency; plan migration path to Hyperdrive + Postgres if needed.
- **Stripe test environment:** Need separate Wrangler environments (dev/staging/prod) with distinct Stripe API keys. Not yet configured.

## Sources

### Primary (HIGH confidence)
- Stripe SDK Cloudflare Workers support -- [Cloudflare Blog](https://blog.cloudflare.com/announcing-stripe-support-in-workers/)
- Stripe webhook best practices -- [Stripe Docs](https://docs.stripe.com/billing/subscriptions/webhooks)
- Cloudflare D1 foreign keys -- [Cloudflare Docs](https://developers.cloudflare.com/d1/build-with-d1/foreign-keys/)
- Cloudflare Workers limits -- [Cloudflare Docs](https://developers.cloudflare.com/workers/platform/limits/)
- next-intl static export -- [next-intl Docs](https://next-intl.dev/docs/routing/setup)
- Cloudflare mTLS -- [Cloudflare Docs](https://developers.cloudflare.com/api-shield/security/mtls/)
- EDPB right to erasure enforcement -- [EDPB](https://www.edpb.europa.eu/our-work-tools/our-documents/other/coordinated-enforcement-action-implementation-right-erasure_en)

### Secondary (MEDIUM confidence)
- Stripe webhook race conditions -- [DEV Community](https://dev.to/belazy/the-race-condition-youre-probably-shipping-right-now-with-stripe-webhooks-mj4), [Excessive Coding](https://excessivecoding.com/blog/billing-webhook-race-condition-solution-guide)
- TOTP implementation mistakes -- [Authgear](https://www.authgear.com/post/5-common-totp-mistakes)
- MFA operational pitfalls -- [WorkOS](https://workos.com/blog/common-pitfalls-of-mfa-and-how-to-avoid-them)
- Resend vs SendGrid comparison -- [xmit.sh](https://xmit.sh/versus/resend-vs-sendgrid)

### Tertiary (LOW confidence)
- Cloudflare Email Service availability timeline -- announced Oct 2025, still private preview. Needs re-verification.
- formepdf WASM PDF generation in Workers -- single source, not production-validated.

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
