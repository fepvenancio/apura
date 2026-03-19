# Roadmap: Apura

## Overview

Apura is an existing NL-to-SQL tool for Primavera P6 that needs production-readiness features across billing, email, security, compliance, export, i18n, and connector packaging. The existing codebase has working core features and worker stubs ready for activation. This roadmap progresses from foundational safety (bugs, CI/CD) through revenue enablement (email, billing) to compliance, security hardening, feature completion, and finally localization and connector polish. Each phase delivers a coherent, verifiable capability that unblocks downstream work.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Bug Fixes and CI/CD** - Fix 5 known bugs and establish automated test/deploy pipeline
- [ ] **Phase 2: Email Activation** - Activate email-worker for password reset, verification, and invitations
- [x] **Phase 3: Billing** - Stripe Checkout, webhook handling, Customer Portal, and plan enforcement (completed 2026-03-18)
- [x] **Phase 4: GDPR Compliance** - Right-to-erasure, data export, consent tracking, DPA, and data retention (completed 2026-03-18)
- [x] **Phase 5: MFA** - TOTP-based multi-factor authentication with recovery codes and org enforcement (completed 2026-03-18)
- [x] **Phase 6: Security Hardening** - mTLS for connector-to-cloud communication (completed 2026-03-18)
- [x] **Phase 7: Export** - CSV download and print-optimized HTML report views (completed 2026-03-19)
- [x] **Phase 8: Sharing and Scheduled Reports** - Internal report sharing and recurring report generation pipeline (completed 2026-03-19)
- [x] **Phase 9: Internationalization** - PT/ES/EN language support across all UI surfaces (completed 2026-03-19)
- [ ] **Phase 10: Connector Packaging** - MSI installer, DPAPI credentials, auto-update, and end-to-end validation

## Phase Details

### Phase 1: Bug Fixes and CI/CD
**Goal**: Known security and reliability bugs are fixed, and every code change is automatically tested and deployed
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, CICD-01, CICD-02, CICD-03, CICD-04
**Success Criteria** (what must be TRUE):
  1. Quota middleware rejects requests when the database is unreachable (fails closed, not open)
  2. AI orchestrator returns generic error messages to users with no internal details or stack traces
  3. User sessions persist correctly across login/logout cycles with no race conditions
  4. Every push to main triggers lint, typecheck, and tests, then auto-deploys to Cloudflare Workers
  5. Pull requests generate frontend preview deployments on Cloudflare Pages
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md -- Fix 5 security/reliability bugs with Vitest test infrastructure and tests
- [ ] 01-02-PLAN.md -- Enhance CI/CD: lint+typecheck+test, D1 migrations, PR preview deploys

### Phase 2: Email Activation
**Goal**: Users receive transactional emails for password reset, email verification, and team invitations
**Depends on**: Phase 1
**Requirements**: MAIL-01, MAIL-02, MAIL-03, MAIL-04, MAIL-05
**Success Criteria** (what must be TRUE):
  1. User can request a password reset and receives an email with a working reset link
  2. New user receives a verification email on signup and can verify their email address
  3. Org admin can invite a user by email and the invitee receives an invitation email
  4. All emails render correctly with proper branding and are delivered via Resend
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md -- Wire api-gateway endpoints to enqueue emails via EMAIL_QUEUE with unit tests
- [ ] 02-02-PLAN.md -- Create reset-password and verify-email frontend pages

### Phase 3: Billing
**Goal**: Organizations can subscribe to paid plans and manage their billing through Stripe
**Depends on**: Phase 2
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06
**Success Criteria** (what must be TRUE):
  1. User can select a plan and complete checkout via Stripe hosted page
  2. Organization plan and query limits update automatically when Stripe subscription changes
  3. User can update payment method, view invoices, and cancel subscription via Stripe Customer Portal
  4. Failed payment displays a banner in the UI and account locks only after final retry failure
  5. Cancelled subscription preserves access until the end of the billing period
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md -- Backend billing infrastructure: D1 migration, Stripe service, webhook handler, billing API routes
- [ ] 03-02-PLAN.md -- Frontend billing UI: pricing page CTAs, billing settings overhaul, payment failure banner

### Phase 4: GDPR Compliance
**Goal**: The application meets EU data protection requirements for user data rights and transparency
**Depends on**: Phase 3
**Requirements**: GDPR-01, GDPR-02, GDPR-03, GDPR-04, GDPR-05, GDPR-06
**Success Criteria** (what must be TRUE):
  1. User can request account deletion and all PII is cascade-deleted across all tables, KV, and R2
  2. User can request a data export and receives an email with a download link to a JSON file of all their PII
  3. User consent for terms and privacy policy is logged with version, IP, and timestamp
  4. DPA page is accessible on the site with current sub-processor list
  5. Stale data (queries older than 12 months, audit logs older than 24 months) is automatically cleaned up
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md -- Backend GDPR infrastructure: D1 migration, erasure service, export service, consent logging, API routes with tests
- [ ] 04-02-PLAN.md -- DPA page, privacy policy sub-processors, cron-worker data retention cleanup
- [ ] 04-03-PLAN.md -- Frontend settings: data export and account deletion controls with visual verification

### Phase 5: MFA
**Goal**: Users can protect their accounts with TOTP-based multi-factor authentication
**Depends on**: Phase 2
**Requirements**: MFA-01, MFA-02, MFA-03, MFA-04, MFA-05
**Success Criteria** (what must be TRUE):
  1. User can enable MFA by scanning a QR code with an authenticator app
  2. Login requires a valid 6-digit TOTP code when MFA is enabled
  3. User receives 10 backup codes on MFA setup and can use any one to bypass TOTP
  4. Org admin can require MFA for all org members and reset MFA for locked-out users
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md -- Backend MFA: D1 migration, crypto utilities, MFA routes, two-phase login, backup codes, tests
- [ ] 05-02-PLAN.md -- Frontend MFA: security settings page, login MFA step, org admin controls
- [ ] 05-03-PLAN.md -- Org MFA enforcement: login redirect for setup, member MFA status, settings toggle

### Phase 6: Security Hardening
**Goal**: Connector-to-cloud communication is secured with mutual TLS authentication
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. Connector WebSocket connections require a valid client certificate issued by Cloudflare
  2. Connector validates the server certificate before establishing a WebSocket connection
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md -- Worker mTLS: D1 migration, cert-auth module, dual-auth in /agent/connect handler
- [ ] 06-02-PLAN.md -- .NET connector: CertificateLoader, client cert loading, SEC-02 server cert audit

### Phase 7: Export
**Goal**: Users can export query results and reports in portable formats
**Depends on**: Phase 1
**Requirements**: EXPORT-01, EXPORT-02
**Success Criteria** (what must be TRUE):
  1. User can click a button to download current query results as a CSV file
  2. User can generate a print-optimized HTML view of any report suitable for browser print-to-PDF
**Plans**: 1 plan

Plans:
- [ ] 07-01-PLAN.md -- Shared CSV utility with proper escaping, print-optimized report view with @media print CSS

### Phase 8: Sharing and Scheduled Reports
**Goal**: Users can share reports within their org and set up automated recurring report generation
**Depends on**: Phase 2, Phase 7
**Requirements**: SHARE-01, SHARE-02, SCHED-01, SCHED-02, SCHED-03, SCHED-04, EXPORT-03
**Success Criteria** (what must be TRUE):
  1. User can mark a report as shared and all org members can see it on their reports page
  2. User can create a daily, weekly, or monthly schedule for recurring report generation
  3. Scheduled reports generate CSV, store in R2, and deliver via email on schedule
  4. User can view the run history and status of their scheduled reports
**Plans**: 2 plans

Plans:
- [ ] 08-01-PLAN.md -- Fix 6 backend bugs, align worker contracts, add schedule runs API and report download endpoint
- [ ] 08-02-PLAN.md -- Frontend: sharing toggle + shared tab on reports, schedule management UI with creation form and run history

### Phase 9: Internationalization
**Goal**: The application is fully usable in Portuguese, Spanish, and English
**Depends on**: Phase 2, Phase 3, Phase 5, Phase 7, Phase 8
**Requirements**: I18N-01, I18N-02, I18N-03, I18N-04
**Success Criteria** (what must be TRUE):
  1. User can switch language to PT, ES, or EN in settings and the entire UI updates
  2. All UI text is rendered from locale JSON files with no hardcoded Portuguese strings
  3. Dates display as DD/MM/YYYY for PT/ES and MM/DD/YYYY for EN; numbers use locale-appropriate separators
**Plans**: 3 plans

Plans:
- [ ] 09-01-PLAN.md -- Foundation: install next-intl, configure plugin, create locale JSON files, restructure app under [locale] segment, wire backend language field
- [ ] 09-02-PLAN.md -- Extract strings from auth pages (7), layout components (2), query components (4), billing banner, and refactor utils.ts formatting
- [ ] 09-03-PLAN.md -- Extract strings from dashboard pages (17) and public pages (3), wire language selector to locale switching

### Phase 10: Connector Packaging
**Goal**: Enterprise IT teams can deploy and maintain the .NET connector via standard Windows tooling
**Depends on**: Phase 6
**Requirements**: CONN-01, CONN-02, CONN-03, CONN-04, CONN-05
**Success Criteria** (what must be TRUE):
  1. Connector installs via MSI with Windows Service registration, firewall rules, and .NET runtime bundled
  2. Enterprise IT can deploy silently via GPO using msiexec /quiet
  3. SQL Server credentials are stored encrypted via DPAPI (not plaintext config files)
  4. Connector checks for updates and can trigger an MSI upgrade automatically
  5. Connector works end-to-end on Windows: connects to Primavera database, relays queries, returns results
**Plans**: 2 plans

Plans:
- [ ] 10-01-PLAN.md -- DPAPI credential store, auto-update checker, UseWindowsService integration, version endpoint
- [ ] 10-02-PLAN.md -- WiX v6 MSI installer project with service/firewall/upgrade elements, IT admin documentation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10
Note: Phases 5, 6, and 7 can execute in parallel after their dependencies are met.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bug Fixes and CI/CD | 0/2 | Planning complete | - |
| 2. Email Activation | 1/2 | In Progress|  |
| 3. Billing | 0/2 | Complete    | 2026-03-18 |
| 4. GDPR Compliance | 0/3 | Complete    | 2026-03-18 |
| 5. MFA | 3/3 | Complete    | 2026-03-18 |
| 6. Security Hardening | 0/? | Complete    | 2026-03-18 |
| 7. Export | 1/1 | Complete    | 2026-03-19 |
| 8. Sharing and Scheduled Reports | 0/2 | Complete    | 2026-03-19 |
| 9. Internationalization | 3/3 | Complete    | 2026-03-19 |
| 10. Connector Packaging | 0/2 | Planning complete | - |
