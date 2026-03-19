# Apura

## What This Is

Apura is a natural language to SQL query tool for Primavera P6 ERP databases. Users ask questions in plain English, Claude converts them to SQL, and results are executed against on-premise SQL Server databases via a .NET connector agent. Built on Cloudflare Workers with a Next.js frontend.

## Core Value

Users can query their Primavera database using natural language and get accurate, validated SQL results — without knowing SQL.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ User signup/login with email and password (JWT auth) — existing
- ✓ JWT session management with refresh tokens — existing
- ✓ Role-based access control (owner, admin, analyst, viewer) — existing
- ✓ Multi-tenant organization management — existing
- ✓ Natural language → SQL conversion via Claude API — existing
- ✓ SQL validation with AST parsing (injection prevention) — existing
- ✓ Query execution via WebSocket/Durable Object relay to .NET connector — existing
- ✓ Query history viewing — existing
- ✓ Report saving, listing, and viewing — existing
- ✓ Dashboard with query input and results display — existing
- ✓ Data visualization with ECharts — existing
- ✓ Rate limiting on auth routes — existing
- ✓ Per-org quota enforcement by plan tier — existing
- ✓ Schema management (category-based loading, few-shot examples) — existing
- ✓ Connector session management via Durable Objects — existing
- ✓ Settings page — existing
- ✓ Landing/marketing page — existing
- ✓ Privacy, terms, docs pages — existing
- ✓ Quota middleware fails closed on DB error — Phase 1
- ✓ AI orchestrator error messages sanitized — Phase 1
- ✓ KV session race condition fixed (store-before-delete) — Phase 1
- ✓ Internal secret validated with timing-safe comparison — Phase 1
- ✓ JSON parse error handling in password reset token — Phase 1
- ✓ CI/CD pipeline (lint, typecheck, test, auto-deploy, PR previews) — Phase 1
- ✓ Email service integration (password reset, email verification, team invitations) — Phase 2
- ✓ Stripe billing (Checkout, webhooks, Customer Portal, plan enforcement) — Phase 3
- ✓ GDPR compliance (erasure, data export, consent, DPA, retention) — Phase 4
- ✓ MFA (TOTP setup, two-phase login, backup codes, org enforcement, admin reset) — Phase 5
- ✓ mTLS security hardening (Cloudflare API Shield, .NET client cert, dual-auth) — Phase 6
- ✓ Export (CSV download with proper escaping, print-optimized report view) — Phase 7
- ✓ Sharing and Scheduled Reports (sharing toggle, schedule CRUD, cron pipeline, run history) — Phase 8

### Active

<!-- Current scope. Building toward these. -->
- [ ] CSV export of query results
- [ ] PDF report generation
- [ ] Query/report sharing via links
- [ ] Scheduled reports and cache refresh (cron worker)
- [ ] CI/CD pipeline (GitHub Actions for test/build/deploy)
- [ ] Validate .NET connector works end-to-end on Windows
- [ ] GDPR compliance (right-to-erasure endpoint, DPA template, privacy content)
- [ ] i18n support (PT/ES/EN) via next-intl
- [ ] MFA (TOTP-based) for user accounts
- [ ] mTLS for connector-to-cloud communication
- [ ] .NET connector production installer (MSI, DPAPI credential storage, auto-update)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Real-time chat — high complexity, not core to query value
- Mobile app — web-first, mobile later
- OAuth login (Google/GitHub) — email/password sufficient for v1
- Video/media uploads — not relevant to query tool
- Multi-database support (non-Primavera) — Primavera focus for v1

## Context

- Existing monorepo with 3 active Workers (api-gateway, ai-orchestrator, ws-gateway) and 4 stub Workers (query-executor, report-worker, email-worker, cron-worker)
- .NET connector exists in `connector/` directory for on-premise SQL Server access
- Cloudflare D1 (SQLite) as primary database, KV for caching, Durable Objects for WebSocket state
- Frontend is statically exported Next.js 15 deployed to Cloudflare Pages
- Pricing tiers defined: trial (100 queries), starter, professional, business, enterprise
- Stripe schema fields present in organizations table but webhook handler not implemented

## Constraints

- **Platform**: Cloudflare Workers ecosystem (Workers, D1, KV, Durable Objects, Pages)
- **AI Provider**: Anthropic Claude API (sonnet default, haiku budget)
- **On-prem**: .NET connector must run on customer Windows servers with SQL Server access
- **Database**: D1/SQLite — single-writer limitation, plan migration path for scale
- **Frontend**: Static export (no SSR) — deployed to CDN/Pages

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cloudflare Workers over traditional server | Serverless, edge-distributed, cost-effective at low scale | — Pending |
| D1 over PostgreSQL | Simplicity for v1, native Cloudflare integration | — Pending |
| Custom JWT auth over Auth0/Clerk | Full control, no external dependency for auth | — Pending |
| Static Next.js export over SSR | Simpler deployment to CDN, no server needed for frontend | — Pending |
| Durable Objects for connector sessions | Stateful WebSocket management per-org | — Pending |

---
*Last updated: 2026-03-19 after Phase 8 completion*
