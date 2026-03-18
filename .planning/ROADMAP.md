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
- [ ] **Phase 3: Billing** - Stripe Checkout, webhook handling, Customer Portal, and plan enforcement
- [ ] **Phase 4: GDPR Compliance** - Right-to-erasure, data export, consent tracking, DPA, and data retention
- [ ] **Phase 5: MFA** - TOTP-based multi-factor authentication with recovery codes and org enforcement
- [ ] **Phase 6: Security Hardening** - mTLS for connector-to-cloud communication
- [ ] **Phase 7: Export** - CSV download and print-optimized HTML report views
- [ ] **Phase 8: Sharing and Scheduled Reports** - Internal report sharing and recurring report generation pipeline
- [ ] **Phase 9: Internationalization** - PT/ES/EN language support across all UI surfaces
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
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Email Activation
**Goal**: Users receive transactional emails for password reset, email verification, and team invitations
**Depends on**: Phase 1
**Requirements**: MAIL-01, MAIL-02, MAIL-03, MAIL-04, MAIL-05
**Success Criteria** (what must be TRUE):
  1. User can request a password reset and receives an email with a working reset link
  2. New user receives a verification email on signup and can verify their email address
  3. Org admin can invite a user by email and the invitee receives an invitation email
  4. All emails render correctly with proper branding and are delivered via Resend
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

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
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

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
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: MFA
**Goal**: Users can protect their accounts with TOTP-based multi-factor authentication
**Depends on**: Phase 2
**Requirements**: MFA-01, MFA-02, MFA-03, MFA-04, MFA-05
**Success Criteria** (what must be TRUE):
  1. User can enable MFA by scanning a QR code with an authenticator app
  2. Login requires a valid 6-digit TOTP code when MFA is enabled
  3. User receives 10 backup codes on MFA setup and can use any one to bypass TOTP
  4. Org admin can require MFA for all org members and reset MFA for locked-out users
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Security Hardening
**Goal**: Connector-to-cloud communication is secured with mutual TLS authentication
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. Connector WebSocket connections require a valid client certificate issued by Cloudflare
  2. Connector validates the server certificate before establishing a WebSocket connection
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

### Phase 7: Export
**Goal**: Users can export query results and reports in portable formats
**Depends on**: Phase 1
**Requirements**: EXPORT-01, EXPORT-02
**Success Criteria** (what must be TRUE):
  1. User can click a button to download current query results as a CSV file
  2. User can generate a print-optimized HTML view of any report suitable for browser print-to-PDF
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Sharing and Scheduled Reports
**Goal**: Users can share reports within their org and set up automated recurring report generation
**Depends on**: Phase 2, Phase 7
**Requirements**: SHARE-01, SHARE-02, SCHED-01, SCHED-02, SCHED-03, SCHED-04, EXPORT-03
**Success Criteria** (what must be TRUE):
  1. User can mark a report as shared and all org members can see it on their reports page
  2. User can create a daily, weekly, or monthly schedule for recurring report generation
  3. Scheduled reports generate CSV, store in R2, and deliver via email on schedule
  4. User can view the run history and status of their scheduled reports
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

### Phase 9: Internationalization
**Goal**: The application is fully usable in Portuguese, Spanish, and English
**Depends on**: Phase 2, Phase 3, Phase 5, Phase 7, Phase 8
**Requirements**: I18N-01, I18N-02, I18N-03, I18N-04
**Success Criteria** (what must be TRUE):
  1. User can switch language to PT, ES, or EN in settings and the entire UI updates
  2. All UI text is rendered from locale JSON files with no hardcoded English strings
  3. Dates display as DD/MM/YYYY for PT/ES and MM/DD/YYYY for EN; numbers use locale-appropriate separators
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

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
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10
Note: Phases 5, 6, and 7 can execute in parallel after their dependencies are met.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bug Fixes and CI/CD | 0/? | Not started | - |
| 2. Email Activation | 0/? | Not started | - |
| 3. Billing | 0/? | Not started | - |
| 4. GDPR Compliance | 0/? | Not started | - |
| 5. MFA | 0/? | Not started | - |
| 6. Security Hardening | 0/? | Not started | - |
| 7. Export | 0/? | Not started | - |
| 8. Sharing and Scheduled Reports | 0/? | Not started | - |
| 9. Internationalization | 0/? | Not started | - |
| 10. Connector Packaging | 0/? | Not started | - |
