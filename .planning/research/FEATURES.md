# Feature Landscape

**Domain:** B2B SaaS NL-to-SQL query tool for Primavera P6 (enterprise construction/engineering ERP)
**Researched:** 2026-03-18
**Confidence:** HIGH (verified against official docs, existing codebase, and multiple sources)

---

## Table Stakes

Features users expect. Missing = product feels incomplete or untrustworthy for enterprise B2B.

### Billing (Stripe)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Stripe Checkout for plan signup | Users expect hosted payment page; never build your own card form | Low | Use `checkout.session.completed` to provision. DB already has `stripe_customer_id` and `stripe_subscription_id` columns. |
| Webhook handler (6 critical events) | Subscriptions break without webhooks -- renewals, failures, cancellations all happen async | Medium | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required` (SCA). Verify signatures with `stripe-signature` header. |
| Plan enforcement on subscription change | When Stripe says plan changed, D1 org record must update immediately | Low | Map Stripe price IDs to PlanType enum. Update `plan`, `max_users`, `max_queries_per_month` on org. |
| Subscription cancellation (end-of-period) | Users expect to keep access until billing period ends | Low | On `customer.subscription.updated` with `cancel_at_period_end: true`, show "cancelling" state in UI but do NOT revoke access. Revoke only on `customer.subscription.deleted`. |
| Failed payment handling (dunning) | Enterprise customers expect grace period, not instant lockout | Low | Enable Stripe Smart Retries (dashboard setting). On `invoice.payment_failed`, show banner in UI. Lock account only after final retry fails (Stripe sends `customer.subscription.deleted`). |
| Customer Portal for self-service billing | Users expect to update cards, view invoices, cancel without contacting support | Low | Stripe Customer Portal is a hosted page. One API call to generate portal session URL. No custom UI needed. |
| Invoice generation | Enterprise/B2B customers need invoices for accounting | Low | Stripe generates invoices automatically for subscriptions. Expose invoice list via Stripe API or Customer Portal link. |

### Email (Transactional)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Password reset emails | Currently broken -- KV stores token but no email sent. Users cannot recover accounts. | Low | Email worker stub exists with Resend integration and HTML template. Wire API gateway to publish to `email-outbound` queue. |
| Email verification on signup | Standard security expectation. DB has `email_verified` column already. | Low | Template exists in email-worker. Publish verification message on signup, gate sensitive operations on `email_verified = 1`. |
| Team invitation emails | Invitations table exists but no email delivery. Invites are useless without email. | Low | Template exists. Wire invite endpoint to publish to queue. |
| Scheduled report delivery | Cron-worker and report-worker stubs handle this flow end-to-end. Need to activate. | Medium | Full pipeline exists: cron-worker finds due schedules, publishes to report-generation queue, report-worker generates CSV/HTML, stores in R2, publishes to email-outbound queue. Needs integration testing and wrangler queue configuration. |

### Report Export

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| CSV export of query results | Every data tool has CSV export. Table stakes for any analytics product. | Low | `generateCsv()` already implemented in report-worker. Need frontend "Export CSV" button that either (a) generates client-side from result data, or (b) calls report-worker via queue. Client-side is simpler and faster for on-demand exports. |
| PDF export of reports | Enterprise users need printable reports for management review | Medium | Workers cannot run headless browsers. Two options: (1) Cloudflare Browser Rendering (Workers Paid, 2 concurrent limit), (2) generate styled HTML and let user print-to-PDF. Recommend option 2 for v1 -- generate print-optimized HTML with `@media print` CSS. Actual PDF generation can be deferred. |

### MFA (Multi-Factor Authentication)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| TOTP setup with QR code | Enterprise B2B customers require MFA. Without it, security-conscious orgs will not adopt. | Medium | Generate TOTP secret, store encrypted in D1 (new `users.totp_secret` and `users.mfa_enabled` columns). Use `otpauth://` URI for QR code. Verify 6-digit code on login. Allow 30-second time window +/- 1 step for clock drift. |
| Backup codes (one-time recovery) | Users lose phones. Without recovery, they are permanently locked out. | Low | Generate 10 single-use codes on MFA setup. Store hashed in D1. Mark used on consumption. Display once, user must save them. |
| MFA enforcement per org | Org admins expect to require MFA for all members | Low | Add `organizations.mfa_required` boolean. Check on login -- if org requires MFA and user has not set up, redirect to setup flow. |

### CI/CD

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Automated test + build pipeline | Cannot ship reliably without CI. Currently no tests run on push. | Medium | GitHub Actions: lint, type-check, run existing tests (sql-validator has 805 lines of tests). Deploy to Cloudflare Workers via `wrangler deploy`. |
| Preview environments | Need to test changes before production | Medium | Cloudflare Pages has built-in preview deployments for frontend. Workers preview requires separate worker names or Cloudflare Environments (beta). |

---

## Differentiators

Features that set Apura apart from generic BI tools. Not expected, but valued by target market.

### Query Sharing

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Shareable report links (within org) | Team collaboration without everyone running the same query. `is_shared` column exists but no endpoint. | Low | Add `GET /reports/:id/shared` endpoint that serves report to any authenticated org member when `is_shared = 1`. No public links needed for v1. |
| Shareable links with expiring tokens | Share a specific report view externally (e.g., to a PM without an Apura account) | Medium | Generate signed URL with expiry (HMAC token in query param). Serve read-only HTML report. Useful for Primavera project stakeholders who don't need full access. |

### i18n (Internationalization)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-language UI (PT/ES/EN) | Primavera P6 is heavily used in Portugal, Brazil, Spain, Latin America. Portuguese is a must-have for this market. | Medium | Use `next-intl` -- 931K weekly downloads, excellent Next.js App Router support, ICU message syntax. DB already has `users.language` column defaulting to `pt`. Create JSON translation files per locale. |
| Locale-aware date/number formatting | Dates in DD/MM/YYYY (PT/ES) vs MM/DD/YYYY (EN). Currency formatting varies. | Low | `next-intl` uses native `Intl` APIs. Configure `useFormatter()` hook. Dates, numbers, currencies format automatically per locale. |

### Scheduled Reports

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cron-based report scheduling with email delivery | "Set it and forget it" reporting. Construction PMs want weekly cost reports without logging in. | Low (infrastructure exists) | Cron-worker, report-worker, email-worker pipeline is fully stubbed. Need: (1) wrangler queue bindings, (2) API routes for CRUD on schedules (already exist in routes/schedules.ts), (3) frontend schedule management UI. |
| Schedule run history and error visibility | Users need to know if their scheduled report failed and why | Low | `schedule_runs` table exists with status tracking. Add API endpoint and UI to view run history per schedule. |

### .NET Connector Polish

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| MSI installer with silent install option | IT admins deploying to servers expect MSI, not manual copy. Must support `msiexec /quiet` for GPO deployment. | High | Use WiX Toolset (open source, Microsoft-recommended). Package .NET runtime, register Windows Service, configure firewall rules. WiX Burn bootstrapper handles .NET runtime prerequisite. |
| DPAPI credential storage | Connector needs to store SQL Server credentials securely. DPAPI is Windows-native, no external dependency. | Medium | Use `System.Security.Cryptography.ProtectedData` for machine-scope encryption. Credentials encrypted at rest, decrypted only by the same Windows machine/user. |
| Auto-update mechanism | IT admins cannot manually update agents on 50 servers | High | Check version endpoint on startup and periodically. Download new MSI from R2/CDN. Trigger update via separate updater service (cannot update running service). WiX major upgrade handles replacing previous version. |

---

## Anti-Features

Features to explicitly NOT build. Including reasoning to prevent scope creep.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom payment form / card input UI | PCI compliance burden is enormous. Stripe Checkout handles this. Building custom forms means PCI SAQ-A escalates to SAQ-D. | Use Stripe Checkout (hosted) and Stripe Customer Portal exclusively. Never touch card numbers. |
| Real-time collaborative query editing | Google Docs-style collaboration is massive complexity (OT/CRDT). Not core to "ask a question, get data" value prop. | Share results via links. Each user runs their own queries. |
| RTL language support (Arabic, Hebrew) | Primavera P6 market is PT/ES/EN. RTL adds CSS complexity (mirrored layouts, bidirectional text) with near-zero user demand. | Support LTR languages only. Add RTL if Arabic market demand materializes. |
| XLSX export | XLSX generation requires heavy libraries (ExcelJS ~2MB). CSV covers 95% of export needs. Excel can open CSV files. | Offer CSV export. Users open in Excel. If demand emerges, add XLSX in a later phase. |
| OAuth/social login (Google, GitHub) | Custom JWT auth is already built and working. Adding OAuth providers means new dependencies, consent screens, account linking edge cases. | Keep email/password + MFA. Revisit if enterprise SSO (SAML) is requested. |
| Marketing email / newsletters | Transactional email (Resend) is sufficient. Marketing email needs separate infrastructure (unsubscribe, CAN-SPAM compliance, list management). | Use Resend for transactional only. If marketing needed later, use a separate service (Mailchimp, ConvertKit). |
| Custom consent management platform | Cookie consent banners are complex (A/B button sizing regulations, granular category toggles, audit trails). Third-party tools do this well. | Use Cookiebot, OneTrust, or similar SaaS for cookie consent. Build only the data subject rights endpoints (erasure, export). |
| Full PDF rendering engine | Running headless Chrome in Workers is limited (2 concurrent browsers, Workers Paid plan required). Not worth the complexity for v1. | Generate print-optimized HTML. Users print-to-PDF from browser. Add server-side PDF via Cloudflare Browser Rendering in a future phase if demand warrants. |
| Usage-based billing (metered) | Adds billing complexity (meter events, aggregation, invoice line items). Fixed tier pricing with overage charges is simpler and already defined in PLAN_LIMITS. | Use fixed tiers with `overagePerQuery` pricing already defined. Track usage via `queries_this_month` counter. Bill overages at end of period via Stripe usage records if needed. |

---

## GDPR Compliance

Separated because GDPR is a legal requirement, not a feature choice. Must-do for any product serving EU customers (Portugal is primary market).

| Requirement | Complexity | Notes |
|-------------|------------|-------|
| Right to erasure endpoint (`DELETE /gdpr/erase`) | Medium | Must cascade-delete across all tables: users, queries, reports, dashboards, schedules, schedule_runs, audit_log, few_shot_examples, api_keys, invitations. Hard-delete PII, keep anonymized aggregate data for business metrics. Must also delete from KV (sessions, cached results) and R2 (report files). Respond within 30 days per GDPR. |
| Data export endpoint (`GET /gdpr/export`) | Medium | Export all user PII in machine-readable format (JSON). Include: profile data, query history, reports, audit log entries. Must respond within 30 days. Store export in R2, email download link. |
| Consent logging | Low | Log when users accepted terms/privacy policy, what version they accepted, and IP/timestamp. Add `consent_log` table. Display current consent status in settings. |
| DPA (Data Processing Agreement) template | Low | Static legal document. Host as page on site (like existing terms/privacy pages). Required for B2B customers whose data Apura processes. |
| Data retention policy | Low | Define retention periods: queries (12 months), audit logs (24 months), deleted user data (30 days then hard-delete). Implement via cron-worker cleanup job. |
| Privacy policy updates | Low | Already have privacy page. Ensure it accurately describes data processing, sub-processors (Cloudflare, Anthropic, Resend, Stripe), and data flows. |

---

## Feature Dependencies

```
Email Worker activation
  -> Password reset (requires email delivery)
  -> Email verification (requires email delivery)
  -> Team invitations (requires email delivery)
  -> Scheduled report delivery (requires email delivery)

Stripe Checkout integration
  -> Webhook handler (required for subscription lifecycle)
  -> Plan enforcement (depends on webhook updating org record)
  -> Customer Portal (depends on Stripe customer existing)

Report Worker activation
  -> CSV export (report-worker generates CSV)
  -> Scheduled report delivery (report-worker stores in R2)
  -> Email delivery of reports (report-worker publishes to email queue)

Cron Worker activation
  -> Scheduled reports (cron-worker triggers report generation)
  -> Data retention cleanup (cron-worker deletes expired data)
  -> Query counter reset (cron-worker resets monthly counters)

MFA (TOTP)
  -> Backup codes (generated during MFA setup)
  -> Org enforcement (requires MFA to be available first)

i18n (next-intl)
  -> All UI strings must be extracted to locale JSON files
  -> Date/number formatting (uses same next-intl infrastructure)

CI/CD pipeline
  -> All other features depend on CI/CD for safe deployment
  -> Should be implemented first or in parallel with earliest features

GDPR erasure
  -> Must account for all data created by other features (queries, reports, schedules, etc.)
  -> Implement after all data-creating features are in place

.NET connector installer
  -> Independent of cloud features
  -> Can be developed in parallel
```

---

## MVP Recommendation

### Prioritize (ship first, unblocks everything):

1. **CI/CD pipeline** -- Cannot safely ship anything without automated tests and deployment. Existing sql-validator tests provide a foundation.
2. **Email worker activation** -- Unblocks password reset (currently broken), email verification, invitations, and scheduled reports. Worker code is already written.
3. **Stripe billing** -- Cannot charge customers without billing. Checkout + webhooks + portal. Org schema already has Stripe fields.
4. **CSV export** -- Simplest export. Client-side generation from existing query results. One button in the UI.
5. **MFA (TOTP + backup codes)** -- Enterprise B2B customers will ask about this in every sales conversation. Security requirement for adoption.

### Defer:

- **i18n**: Ship EN-only initially. Add PT/ES after core features stabilize. The `users.language` column is ready, but extracting all strings is a significant effort.
- **PDF export**: HTML print view is sufficient for v1. Server-side PDF generation via Cloudflare Browser Rendering adds complexity and cost.
- **.NET MSI installer**: Functional connector exists. MSI polish is important but not blocking for early customers who can do manual installation.
- **Auto-update for connector**: Nice-to-have. Manual updates are acceptable for <50 customers.
- **External shareable links (signed URLs)**: Internal org sharing is sufficient for v1. External sharing adds security surface area.
- **GDPR data export/erasure**: Important for compliance but unlikely to receive requests in early days. Implement before launching to EU customers at scale.

---

## Sources

- [Stripe SaaS Subscription Docs](https://docs.stripe.com/get-started/use-cases/saas-subscriptions)
- [Stripe Subscription Lifecycle](https://docs.stripe.com/billing/subscriptions/overview)
- [Stripe Webhooks for Subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe Customer Portal](https://docs.stripe.com/billing/subscriptions/build-subscriptions)
- [GDPR SaaS Compliance Checklist (ComplyDog)](https://complydog.com/blog/gdpr-compliance-checklist-complete-guide-b2b-saas-companies)
- [GDPR for SaaS Complete Guide (Vanta)](https://www.vanta.com/resources/gdpr-compliance-for-saas)
- [MFA Best Practices (WorkOS)](https://workos.com/blog/mfa-best-practices)
- [MFA for SaaS Strategies (LoginRadius)](https://www.loginradius.com/blog/identity/mfa-strategies-saas-platforms)
- [Resend vs SendGrid 2026](https://xmit.sh/versus/resend-vs-sendgrid)
- [next-intl Documentation](https://next-intl.dev/docs/design-principles)
- [next-intl Date/Time Formatting](https://next-intl.dev/docs/usage/dates-times)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Browser Rendering PDF](https://developers.cloudflare.com/browser-rendering/how-to/pdf-generation/)
- [PDF Generation on Cloudflare Workers](https://www.formepdf.com/blog/pdf-cloudflare-workers)
- [WiX Installer for Windows Services](https://cmartcoding.com/creating-a-windows-service-and-installer-using-net-and-wix/)
