# Requirements: Apura

**Defined:** 2026-03-18
**Core Value:** Users can query their Primavera database using natural language and get accurate, validated SQL results — without knowing SQL.

## v1 Requirements

Requirements for production-ready v1 release. Each maps to roadmap phases.

### Bug Fixes

- [x] **BUG-01**: Quota middleware fails closed on DB error instead of allowing unverified requests through
- [x] **BUG-02**: AI orchestrator error messages are sanitized before returning to users (no internal details leak)
- [x] **BUG-03**: KV session race condition fixed — new session stored before old one deleted
- [x] **BUG-04**: Internal secret header value validated against actual secret using constant-time comparison
- [x] **BUG-05**: JSON parse errors in password reset token handled gracefully (return 401, not 500)

### CI/CD

- [x] **CICD-01**: GitHub Actions pipeline runs lint, typecheck, and tests on every push/PR
- [x] **CICD-02**: Automated deployment to Cloudflare Workers on merge to main
- [x] **CICD-03**: Frontend preview deployments on PRs via Cloudflare Pages
- [x] **CICD-04**: D1 migrations run automatically during deployment

### Email

- [x] **MAIL-01**: Password reset email sent with valid reset link when user requests password reset
- [x] **MAIL-02**: Email verification sent on signup with verification link
- [x] **MAIL-03**: Team invitation email sent when org admin invites a user
- [x] **MAIL-04**: Email worker connected to api-gateway via Cloudflare Queue binding
- [x] **MAIL-05**: Email templates render correctly with Resend + HTML templates

### Billing

- [x] **BILL-01**: User can subscribe to a plan via Stripe Checkout hosted page
- [x] **BILL-02**: Webhook handler processes 6 critical Stripe events (checkout.session.completed, subscription.updated, subscription.deleted, invoice.payment_succeeded, invoice.payment_failed, invoice.payment_action_required)
- [x] **BILL-03**: Org plan/limits update immediately when Stripe subscription changes
- [x] **BILL-04**: User can manage billing (update card, view invoices, cancel) via Stripe Customer Portal
- [x] **BILL-05**: Failed payment shows banner in UI; account locked only after final retry fails
- [x] **BILL-06**: Subscription cancellation preserves access until end of billing period

### MFA

- [ ] **MFA-01**: User can enable TOTP-based MFA with QR code setup
- [ ] **MFA-02**: Login requires 6-digit TOTP code when MFA is enabled (30s window +/- 1 step)
- [ ] **MFA-03**: 10 single-use backup codes generated on MFA setup, stored hashed
- [ ] **MFA-04**: Org admin can require MFA for all org members
- [ ] **MFA-05**: Admin can reset MFA for a locked-out user

### Export

- [ ] **EXPORT-01**: User can download current query results as CSV from the UI
- [ ] **EXPORT-02**: User can generate a print-optimized HTML view of a report (print-to-PDF)
- [ ] **EXPORT-03**: Scheduled reports generate CSV and deliver via email

### Query Sharing

- [ ] **SHARE-01**: User can share a report with other authenticated org members via `is_shared` flag
- [ ] **SHARE-02**: Shared reports visible to all org members on reports page

### Scheduled Reports

- [ ] **SCHED-01**: User can create a schedule for recurring report generation (daily/weekly/monthly)
- [ ] **SCHED-02**: Cron worker triggers report generation on schedule
- [ ] **SCHED-03**: User can view schedule run history and status
- [ ] **SCHED-04**: Generated reports stored in R2 and delivered via email

### GDPR

- [ ] **GDPR-01**: Right-to-erasure endpoint cascade-deletes all user PII across all tables and KV/R2
- [ ] **GDPR-02**: Data export endpoint generates JSON of all user PII, stores in R2, emails download link
- [ ] **GDPR-03**: Consent logging tracks terms/privacy acceptance with version, IP, and timestamp
- [x] **GDPR-04**: DPA (Data Processing Agreement) page hosted on site
- [x] **GDPR-05**: Data retention policy enforced via cron-worker cleanup (queries 12mo, audit 24mo)
- [x] **GDPR-06**: Privacy policy updated to list sub-processors (Cloudflare, Anthropic, Resend, Stripe)

### i18n

- [ ] **I18N-01**: UI supports PT, ES, and EN languages via next-intl
- [ ] **I18N-02**: User can select preferred language in settings (stored in users.language)
- [ ] **I18N-03**: Date and number formatting follows locale conventions (DD/MM/YYYY for PT/ES)
- [ ] **I18N-04**: All hardcoded UI strings extracted to locale JSON files

### Security Hardening

- [ ] **SEC-01**: mTLS configured for connector-to-cloud communication via Cloudflare API Shield
- [ ] **SEC-02**: Connector validates server certificate on WebSocket connection

### .NET Connector

- [ ] **CONN-01**: MSI installer packages connector with .NET runtime, registers Windows Service, configures firewall
- [ ] **CONN-02**: Silent install support for enterprise GPO deployment (msiexec /quiet)
- [ ] **CONN-03**: DPAPI-based credential storage for SQL Server connection strings
- [ ] **CONN-04**: Auto-update mechanism checks version endpoint and triggers MSI upgrade
- [ ] **CONN-05**: Connector validated working end-to-end on Windows with Primavera database

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Sharing

- **SHARE-03**: External shareable links with expiring signed tokens for non-Apura users
- **SHARE-04**: Granular per-user sharing permissions (view, edit, comment)

### Advanced Export

- **EXPORT-04**: Server-side PDF generation via Cloudflare Browser Rendering
- **EXPORT-05**: XLSX export of query results

### Enterprise SSO

- **SSO-01**: SAML-based SSO for enterprise identity providers
- **SSO-02**: SCIM provisioning for automated user management

### Analytics

- **ANLYT-01**: Usage analytics dashboard (queries per user, popular tables, peak hours)
- **ANLYT-02**: Query performance metrics and optimization suggestions

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Custom payment form / card input | PCI compliance burden — use Stripe Checkout exclusively |
| Real-time collaborative query editing | Massive CRDT/OT complexity, not core to value prop |
| RTL language support (Arabic, Hebrew) | Market is PT/ES/EN; zero demand for RTL |
| XLSX export | Heavy library (~2MB); CSV covers 95% of needs, Excel opens CSV |
| OAuth/social login | Custom JWT auth already works; adds complexity with minimal value |
| Marketing email / newsletters | Transactional email sufficient; marketing needs separate infrastructure |
| Custom cookie consent UI | Use third-party tool (Cookiebot, OneTrust); build only data rights endpoints |
| Full server-side PDF engine | Workers memory/runtime constraints; print-to-PDF sufficient for v1 |
| Usage-based metered billing | Fixed tiers with overage pricing already defined; metering adds complexity |
| Mobile app | Web-first; mobile later based on demand |
| Multi-database support | Primavera focus for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUG-01 | Phase 1: Bug Fixes and CI/CD | Complete |
| BUG-02 | Phase 1: Bug Fixes and CI/CD | Complete |
| BUG-03 | Phase 1: Bug Fixes and CI/CD | Complete |
| BUG-04 | Phase 1: Bug Fixes and CI/CD | Complete |
| BUG-05 | Phase 1: Bug Fixes and CI/CD | Complete |
| CICD-01 | Phase 1: Bug Fixes and CI/CD | Complete |
| CICD-02 | Phase 1: Bug Fixes and CI/CD | Complete |
| CICD-03 | Phase 1: Bug Fixes and CI/CD | Complete |
| CICD-04 | Phase 1: Bug Fixes and CI/CD | Complete |
| MAIL-01 | Phase 2: Email Activation | Complete |
| MAIL-02 | Phase 2: Email Activation | Complete |
| MAIL-03 | Phase 2: Email Activation | Complete |
| MAIL-04 | Phase 2: Email Activation | Complete |
| MAIL-05 | Phase 2: Email Activation | Complete |
| BILL-01 | Phase 3: Billing | Complete |
| BILL-02 | Phase 3: Billing | Complete |
| BILL-03 | Phase 3: Billing | Complete |
| BILL-04 | Phase 3: Billing | Complete |
| BILL-05 | Phase 3: Billing | Complete |
| BILL-06 | Phase 3: Billing | Complete |
| GDPR-01 | Phase 4: GDPR Compliance | Pending |
| GDPR-02 | Phase 4: GDPR Compliance | Pending |
| GDPR-03 | Phase 4: GDPR Compliance | Pending |
| GDPR-04 | Phase 4: GDPR Compliance | Complete |
| GDPR-05 | Phase 4: GDPR Compliance | Complete |
| GDPR-06 | Phase 4: GDPR Compliance | Complete |
| MFA-01 | Phase 5: MFA | Pending |
| MFA-02 | Phase 5: MFA | Pending |
| MFA-03 | Phase 5: MFA | Pending |
| MFA-04 | Phase 5: MFA | Pending |
| MFA-05 | Phase 5: MFA | Pending |
| SEC-01 | Phase 6: Security Hardening | Pending |
| SEC-02 | Phase 6: Security Hardening | Pending |
| EXPORT-01 | Phase 7: Export | Pending |
| EXPORT-02 | Phase 7: Export | Pending |
| SHARE-01 | Phase 8: Sharing and Scheduled Reports | Pending |
| SHARE-02 | Phase 8: Sharing and Scheduled Reports | Pending |
| SCHED-01 | Phase 8: Sharing and Scheduled Reports | Pending |
| SCHED-02 | Phase 8: Sharing and Scheduled Reports | Pending |
| SCHED-03 | Phase 8: Sharing and Scheduled Reports | Pending |
| SCHED-04 | Phase 8: Sharing and Scheduled Reports | Pending |
| EXPORT-03 | Phase 8: Sharing and Scheduled Reports | Pending |
| I18N-01 | Phase 9: Internationalization | Pending |
| I18N-02 | Phase 9: Internationalization | Pending |
| I18N-03 | Phase 9: Internationalization | Pending |
| I18N-04 | Phase 9: Internationalization | Pending |
| CONN-01 | Phase 10: Connector Packaging | Pending |
| CONN-02 | Phase 10: Connector Packaging | Pending |
| CONN-03 | Phase 10: Connector Packaging | Pending |
| CONN-04 | Phase 10: Connector Packaging | Pending |
| CONN-05 | Phase 10: Connector Packaging | Pending |

**Coverage:**
- v1 requirements: 51 total
- Mapped to phases: 51
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after roadmap creation*
