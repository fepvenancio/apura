---
phase: 3
slug: billing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 (existing in api-gateway) |
| **Config file** | `packages/api-gateway/vitest.config.ts` (existing) |
| **Quick run command** | `cd packages/api-gateway && npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | BILL-01,02 | unit | `npx vitest run stripe` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | BILL-02,03 | unit | `npx vitest run stripe` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | BILL-04,05,06 | unit | `grep` checks on frontend | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api-gateway/src/routes/__tests__/stripe.test.ts` — stubs for webhook handler tests
- [ ] D1 migration for subscription_status, current_period_end, stripe_events table

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stripe Checkout completes | BILL-01 | Requires live/test Stripe keys | Create checkout session, complete with test card 4242... |
| Customer Portal accessible | BILL-04 | Requires Stripe customer and portal config | Click "Manage Billing", verify portal loads |
| Webhook processes real events | BILL-02 | Requires Stripe CLI or dashboard test | `stripe trigger checkout.session.completed` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
