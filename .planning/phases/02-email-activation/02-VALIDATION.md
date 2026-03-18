---
phase: 2
slug: email-activation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 (existing in api-gateway from Phase 1) |
| **Config file** | `packages/api-gateway/vitest.config.ts` (existing) |
| **Quick run command** | `cd packages/api-gateway && npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | MAIL-04 | integration | `grep 'EMAIL_QUEUE' packages/api-gateway/wrangler.toml` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | MAIL-01 | unit | `cd packages/api-gateway && npx vitest run auth` | ✅ | ⬜ pending |
| 02-01-03 | 01 | 1 | MAIL-02 | unit | `cd packages/api-gateway && npx vitest run auth` | ✅ | ⬜ pending |
| 02-01-04 | 01 | 1 | MAIL-03 | unit | `cd packages/api-gateway && npx vitest run` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | MAIL-05 | manual | Check email renders in browser | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing test infrastructure from Phase 1 covers api-gateway
- [ ] Email-worker test infrastructure may need setup if testing queue consumer

*Email-worker is already fully implemented per research — testing focuses on producer side (api-gateway).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email renders correctly | MAIL-05 | Visual verification needed | Send test email, open in email client, verify branding/links |
| Reset link works E2E | MAIL-01 | Requires Resend API key and real email | Request reset, check inbox, click link, reset password |
| Verification link works E2E | MAIL-02 | Requires Resend API key and real email | Sign up, check inbox, click link, verify email_verified=1 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
