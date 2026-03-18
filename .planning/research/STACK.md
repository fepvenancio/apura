# Technology Stack: Apura v1 Production Features

**Project:** Apura (NL-to-SQL for Primavera P6)
**Researched:** 2026-03-18
**Scope:** Adding billing, email, GDPR, i18n, MFA, report export, CI/CD, mTLS, cron, and .NET packaging to existing Cloudflare Workers + Next.js stack

## Existing Stack (Unchanged)

These are already in place and remain unchanged. Listed for context.

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.5.12 | Frontend (static export) |
| React | 19.1.0 | UI library |
| Hono | 4.6.0+ | API framework on Workers |
| Cloudflare D1 | - | Primary database |
| Cloudflare KV | - | Caching/sessions |
| Cloudflare Durable Objects | - | WebSocket state |
| Turbo | 2.4.0 | Monorepo orchestration |
| Wrangler | 3.114.17 | Workers CLI |
| Zod | 4.3.6 | Schema validation |

---

## Recommended Additions

### 1. Billing: Stripe

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| stripe | ^20.4.1 | Server-side Stripe SDK (Workers) | HIGH |
| @stripe/stripe-js | ^8.10.0 | Client-side Checkout redirect | HIGH |

**Why Stripe:** Already partially integrated (DB schema has stripe_customer_id, stripe_subscription_id). Stripe SDK v11.10+ natively supports Cloudflare Workers without `node_compat`. The project already has `STRIPE_WEBHOOK_SECRET` in env types.

**Why not alternatives:**
- **Paddle/LemonSqueezy:** Merchant-of-record model adds complexity for EU B2B SaaS. Stripe gives more control over invoicing for enterprise customers. Paddle's Workers support is undocumented.
- **Cloudflare Workers Paid Apps:** Too limited for subscription billing with multiple tiers.

**Key implementation detail:** Use `stripe.webhooks.constructEventAsync()` with `Stripe.createSubtleCryptoProvider()` for webhook signature verification in Workers (no Node.js crypto needed). Hono has a documented Stripe webhook pattern.

**Webhook events to handle:**
- `checkout.session.completed` - New subscription
- `customer.subscription.updated` - Plan changes
- `customer.subscription.deleted` - Cancellation
- `invoice.payment_failed` - Failed payment

### 2. Email: Resend

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| resend | ^6.9.4 | Transactional email API | HIGH |
| @react-email/components | ^1.0.8 | Email template components | MEDIUM |
| @react-email/render | ^2.0.4 | Render React to HTML for emails | MEDIUM |

**Why Resend:** Purpose-built for developer-first transactional email. Works in Cloudflare Workers via fetch (no Node.js dependencies). Simple API: one function call to send. React Email integration lets you build type-safe email templates in the same React/TS stack.

**Why not alternatives:**
- **SendGrid:** Bloated SDK, overly complex for transactional-only needs. Corporate Twilio ownership means slower iteration.
- **AWS SES:** Requires AWS SDK, poor Workers compatibility, overkill for this volume.
- **Cloudflare Email Service (Preview):** Announced Oct 2025, still in private preview as of March 2026. Not production-ready. Revisit when GA.
- **Postmark:** Good alternative but Resend has better DX and simpler pricing.

**Emails needed:**
- Email verification (signup)
- Password reset
- Subscription confirmation/changes
- Scheduled report delivery
- MFA recovery codes

### 3. Internationalization: next-intl

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| next-intl | ^4.8.3 | i18n for Next.js App Router | HIGH |

**Why next-intl:** The standard i18n library for Next.js App Router. Supports static export via `setRequestLocale()` + `generateStaticParams()`. TypeScript-first with autocomplete for translation keys. Supports 3 target locales (PT, ES, EN) with ICU message syntax for plurals/dates.

**Why not alternatives:**
- **next-i18next:** Designed for Pages Router. Not recommended for App Router projects.
- **react-intl (FormatJS):** Lower-level, requires more boilerplate. next-intl wraps similar ICU formatting with Next.js-specific conveniences.
- **Custom solution:** Unnecessary when next-intl handles static export, App Router, and message formatting.

**Static export pattern:** Use `[locale]` dynamic segment in app directory. `generateStaticParams` returns `['en', 'pt', 'es']`. All pages statically generated per locale at build time.

### 4. MFA: otpauth + qrcode

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| otpauth | ^9.5.0 | TOTP generation and verification | HIGH |
| qrcode | ^1.5.4 | QR code generation for authenticator setup | HIGH |

**Why otpauth:** RFC 6238 compliant. Works in Workers (uses Web Crypto, no Node.js crypto dependency). Generates `otpauth://` URIs for authenticator apps. Active maintenance (last publish ~1 month ago). Under 4KB.

**Why not alternatives:**
- **otplib:** Heavier, plugin-based architecture is unnecessary for TOTP-only use. Last major update older.
- **speakeasy:** Unmaintained (archived repository).

**Implementation:** Generate TOTP secret server-side, encode as QR via `qrcode.toDataURL()`, verify tokens with `otpauth.TOTP.validate()`. Store encrypted secret in D1 users table. Provide recovery codes (one-time use, stored hashed).

### 5. PDF Export: jsPDF + jspdf-autotable

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| jspdf | ^4.2.1 | PDF document generation | HIGH |
| jspdf-autotable | ^3.8.x | Table rendering in PDFs | MEDIUM |

**Why jsPDF:** Client-side PDF generation avoids Workers memory/CPU limits for large reports. Works in browser. Well-maintained (published yesterday). jspdf-autotable adds automatic table layout for query results.

**Why not alternatives:**
- **PDFKit:** Node.js focused, heavy dependencies, poor Workers compatibility.
- **Puppeteer/Playwright:** Requires headless browser. Cannot run in Workers. Massive overhead.
- **@react-pdf/renderer:** React-based but heavy runtime, designed for complex layouts not tabular data.
- **Server-side generation:** Workers have 128MB memory limit and 30s CPU time. Client-side generation avoids these constraints for large result sets.

**Approach:** Generate PDFs client-side from query results already in browser memory. For scheduled report export (cron), use a minimal server-side approach with jsPDF in the cron worker (results will be bounded by query limits).

### 6. CSV Export: Built-in (no library needed)

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| (none) | - | CSV generation from query results | HIGH |

**Why no library:** CSV generation for tabular query results is trivial: join columns with commas, escape quotes, add headers. Adding PapaParse (34KB) for this is unnecessary overhead. A 20-line utility function handles it.

**Why not PapaParse:** Overkill. PapaParse excels at parsing complex/malformed CSV input. For generating clean CSV output from structured data, native string operations suffice.

### 7. CI/CD: GitHub Actions + Wrangler

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| GitHub Actions | - | CI/CD pipeline | HIGH |
| wrangler (in CI) | ^3.114.17 | Deploy Workers from CI | HIGH |
| cloudflare/wrangler-action | v3 | Official GH Action for Wrangler | HIGH |

**Why GitHub Actions:** Repository is on GitHub. Cloudflare provides official `wrangler-action`. Turbo monorepo caching works well with GH Actions cache. Free tier sufficient for this project's build volume.

**Pipeline structure:**
1. **PR checks:** Lint + typecheck + test (Turbo parallel)
2. **Staging deploy:** On merge to `main`, deploy to staging Workers
3. **Production deploy:** Manual approval or tag-based
4. **DB migrations:** Run `deploy/migrate.sh` as deploy step

**Why not alternatives:**
- **Cloudflare Pages CI:** Only handles frontend, not Workers or .NET connector.
- **GitLab CI:** Repo is on GitHub.
- **CircleCI/Travis:** No advantage over GitHub Actions for this stack.

### 8. Cloudflare Cron Triggers

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Cloudflare Cron Triggers | - | Scheduled report refresh, cache warming | HIGH |

**Why Cron Triggers:** Native to Cloudflare Workers. No external scheduler needed. Configure in `wrangler.toml` with `[triggers]` section. Uses `scheduled()` handler in the cron-worker (stub already exists in monorepo).

**Configuration example:**
```toml
[triggers]
crons = ["0 */6 * * *"]  # Every 6 hours for report refresh
```

**Why not alternatives:**
- **External cron (cron-job.org, EasyCron):** Adds external dependency. Workers cron triggers are free and native.
- **Cloudflare Workflows:** More complex, designed for multi-step durable workflows. Overkill for periodic jobs.

### 9. mTLS: Cloudflare Workers mTLS Bindings

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Cloudflare mTLS certificates | - | Mutual TLS for connector communication | HIGH |

**Why Cloudflare mTLS:** Native Workers feature. Upload client certificates via Wrangler, bind in `wrangler.toml`, and `fetch()` automatically presents certs. GA for all Workers customers. Limit: 1,000 certs per account (more than sufficient).

**Architecture:** The .NET connector initiates outbound WebSocket connections to `ws.apura.xyz`. Cloudflare API Shield can enforce client certificates on incoming requests to the ws-gateway Worker. The connector presents a client cert issued by a private CA you control.

**Important limitation:** mTLS for Workers cannot be used for requests to services proxied by Cloudflare (returns 520). The connector connects to a Cloudflare-proxied domain, so use Cloudflare API Shield (mTLS on incoming) rather than Workers outbound mTLS binding.

### 10. .NET Connector Packaging

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| WiX Toolset | 6.0.2 | MSI installer creation | HIGH |
| DPAPI | (.NET built-in) | Windows credential encryption | HIGH |
| Squirrel.Windows or built-in | - | Auto-update mechanism | MEDIUM |

**Why WiX 6:** Industry standard for MSI creation. .NET SDK integration via `WixToolset.Sdk` NuGet package. MSBuild-native (no separate toolchain). Supports Windows service installation, which the connector needs.

**Why not alternatives:**
- **NSIS:** Script-based, harder to maintain, no MSBuild integration.
- **Inno Setup:** EXE installers, not MSI. Enterprise IT departments often require MSI for GPO deployment.
- **MSIX:** Modern but less supported for Windows services and enterprise GPO scenarios.

**Auto-update:** Use a simple self-update mechanism: connector checks an API endpoint for latest version, downloads new MSI, triggers `msiexec /i` upgrade. Avoids heavy frameworks like Squirrel.

**DPAPI:** .NET's `System.Security.Cryptography.ProtectedData` class encrypts credentials per-machine or per-user. No external dependency. Standard Windows practice for service credential storage.

---

## GDPR Compliance (No New Libraries)

GDPR compliance is a process/architecture concern, not a library concern.

| Requirement | Implementation | Library Needed |
|-------------|---------------|----------------|
| Right to erasure | API endpoint that cascades DELETE across D1 tables | None (SQL) |
| Data export | API endpoint returning user's data as JSON | None (SQL + JSON) |
| DPA template | Legal document, not code | None |
| Consent tracking | Add `consent_*` columns to users table | None (migration) |
| Data retention | Cron worker purges expired data | Cron Triggers |

---

## Full Installation Commands

```bash
# Billing
npm install stripe @stripe/stripe-js

# Email
npm install resend @react-email/components @react-email/render

# i18n (frontend only)
cd frontend && npm install next-intl

# MFA
npm install otpauth qrcode
npm install -D @types/qrcode

# PDF export (frontend only)
cd frontend && npm install jspdf jspdf-autotable

# CI/CD: No npm install needed (GitHub Actions + wrangler-action)

# .NET packaging (NuGet, not npm)
# dotnet add package WixToolset.Sdk --version 6.0.2
```

## Alternatives Considered (Summary)

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Billing | Stripe | Paddle, LemonSqueezy | Less control over B2B invoicing; Workers support unclear |
| Email | Resend | SendGrid, SES | Bloated SDK / poor Workers compat |
| i18n | next-intl | react-intl, next-i18next | More boilerplate / wrong router |
| MFA | otpauth | otplib, speakeasy | Heavier / unmaintained |
| PDF | jsPDF (client) | PDFKit, Puppeteer | Node-only / requires browser runtime |
| CSV | Native JS | PapaParse | Overkill for output-only |
| CI/CD | GitHub Actions | CircleCI, GitLab CI | Repo is on GitHub, official Wrangler action |
| Cron | CF Cron Triggers | External schedulers | Native, free, no external dependency |
| mTLS | CF API Shield | Custom proxy | Native Cloudflare feature |
| Installer | WiX 6 | NSIS, Inno Setup | MSBuild integration, MSI for enterprise |

## Version Verification Sources

| Library | Verified Version | Source | Date Checked |
|---------|-----------------|--------|-------------|
| stripe | 20.4.1 | [npm](https://www.npmjs.com/package/stripe) | 2026-03-18 |
| @stripe/stripe-js | 8.10.0 | [npm](https://www.npmjs.com/package/@stripe/stripe-js) | 2026-03-18 |
| resend | 6.9.4 | [npm](https://www.npmjs.com/package/resend) | 2026-03-18 |
| next-intl | 4.8.3 | [npm](https://www.npmjs.com/package/next-intl) | 2026-03-18 |
| otpauth | 9.5.0 | [npm](https://www.npmjs.com/package/otpauth) | 2026-03-18 |
| jspdf | 4.2.1 | [npm](https://www.npmjs.com/package/jspdf) | 2026-03-18 |
| qrcode | 1.5.4 | [npm](https://www.npmjs.com/package/qrcode) | 2026-03-18 |
| react-email | 5.2.9 | [npm](https://www.npmjs.com/package/react-email) | 2026-03-18 |
| @react-email/components | 1.0.8 | [npm](https://www.npmjs.com/package/@react-email/components) | 2026-03-18 |
| WiX Toolset | 6.0.2 | [NuGet](https://www.nuget.org/packages/wix) | 2026-03-18 |
| wrangler-action | v3 | [GitHub](https://github.com/cloudflare/wrangler-action) | 2026-03-18 |

## Sources

- [Stripe SDK in Cloudflare Workers](https://blog.cloudflare.com/announcing-stripe-support-in-workers/)
- [Stripe Webhook with Hono](https://hono.dev/examples/stripe-webhook)
- [Resend + Cloudflare Workers](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/)
- [Resend + Hono](https://resend.com/hono)
- [next-intl 4.0](https://next-intl.dev/blog/next-intl-4-0)
- [next-intl static export example](https://github.com/azu/next-intl-example)
- [Cloudflare Cron Triggers docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare mTLS for Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/)
- [Cloudflare API Shield mTLS](https://developers.cloudflare.com/api-shield/security/mtls/)
- [WiX Toolset](https://wixtoolset.org/)
- [Cloudflare Node.js compatibility 2025](https://blog.cloudflare.com/nodejs-workers-2025/)
