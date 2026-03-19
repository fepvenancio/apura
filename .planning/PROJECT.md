# Apura

## What This Is

Apura is a production-ready natural language to SQL query platform for Primavera P6 ERP databases. Users ask questions in plain English (Portuguese, Spanish, or English), Claude converts them to validated SQL, and results are executed against on-premise SQL Server databases via a secure .NET connector agent with mTLS. Built on Cloudflare Workers with a Next.js frontend, Stripe billing, GDPR compliance, and TOTP MFA.

## Core Value

Users can query their Primavera database using natural language and get accurate, validated SQL results — without knowing SQL.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ User signup/login with email and password (JWT auth) — v1.0
- ✓ JWT session management with refresh tokens — v1.0
- ✓ Role-based access control (owner, admin, analyst, viewer) — v1.0
- ✓ Multi-tenant organization management — v1.0
- ✓ Natural language → SQL conversion via Claude API — v1.0
- ✓ SQL validation with AST parsing (injection prevention) — v1.0
- ✓ Query execution via WebSocket/Durable Object relay — v1.0
- ✓ Query history, report saving/viewing, dashboard — v1.0
- ✓ Data visualization with ECharts — v1.0
- ✓ Rate limiting and quota enforcement — v1.0
- ✓ CI/CD pipeline (lint, typecheck, test, auto-deploy, PR previews) — v1.0
- ✓ Transactional email (password reset, verification, invitations) — v1.0
- ✓ Stripe billing (Checkout, webhooks, Customer Portal, dunning) — v1.0
- ✓ GDPR compliance (erasure, data export, consent, DPA, retention) — v1.0
- ✓ TOTP MFA (two-phase login, backup codes, org enforcement) — v1.0
- ✓ mTLS security hardening (Cloudflare API Shield, dual-auth) — v1.0
- ✓ CSV export and print-optimized report views — v1.0
- ✓ Report sharing and scheduled report generation pipeline — v1.0
- ✓ Internationalization (PT/ES/EN, 522 translation keys) — v1.0
- ✓ .NET connector packaging (MSI, DPAPI, auto-update) — v1.0

### Active

<!-- Current scope. Building toward these. -->

(None yet — plan next milestone)

### Out of Scope

- Real-time chat — high complexity, not core to query value
- Mobile app — web-first, PWA works well
- OAuth login (Google/GitHub) — email/password + MFA sufficient
- Multi-database support — Primavera focus
- XLSX export — CSV covers 95% of needs
- Server-side PDF — print-to-PDF sufficient for v1

## Context

Shipped v1.0 with ~37,000 lines across 290 files. 10 phases, 22 plans, 51 requirements — all delivered and verified.

**Stack:** Cloudflare Workers (Hono), D1, KV, Durable Objects, Next.js 15, .NET 8.0
**Services:** 7 Workers (api-gateway, ai-orchestrator, ws-gateway, email-worker, report-worker, cron-worker, query-executor)
**Frontend:** Next.js with next-intl (PT/ES/EN), Zustand, Tailwind CSS, ECharts
**Connector:** .NET Windows Service with MSI installer, DPAPI, mTLS, auto-update

## Constraints

- **Platform**: Cloudflare Workers ecosystem (Workers, D1, KV, Durable Objects, Pages)
- **AI Provider**: Anthropic Claude API (sonnet default, haiku budget)
- **On-prem**: .NET connector on customer Windows servers (10/11/Server 2016-2022)
- **Database**: D1/SQLite — single-writer limitation, plan migration path for scale
- **Frontend**: Next.js with [locale] routing for i18n

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cloudflare Workers over traditional server | Serverless, edge-distributed, cost-effective | ✓ Good |
| D1 over PostgreSQL | Simplicity for v1, native integration | ✓ Good (monitor for scale) |
| Custom JWT auth over Auth0/Clerk | Full control, no external dependency | ✓ Good |
| Durable Objects for connector sessions | Stateful WebSocket management per-org | ✓ Good |
| Resend for email over Cloudflare Email Service | Mature, Workers-compatible, React Email templates | ✓ Good |
| Stripe hosted Checkout over custom forms | PCI compliance handled by Stripe | ✓ Good |
| DPAPI over custom encryption for credentials | Windows-native, no key management | ✓ Good |
| next-intl over react-i18next | Better Next.js App Router support, static export compat | ✓ Good |
| AES-256-GCM for TOTP secrets at rest | Web Crypto API available in Workers | ✓ Good |
| WiX v6 for MSI installer | Microsoft-recommended, MSBuild integration | — Pending |

---
*Last updated: 2026-03-19 after v1.0 milestone*
