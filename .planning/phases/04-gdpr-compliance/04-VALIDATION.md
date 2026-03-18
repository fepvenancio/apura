---
phase: 4
slug: gdpr-compliance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 4 — Validation Strategy

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
| 04-01-01 | 01 | 1 | GDPR-01 | unit | `npx vitest run gdpr` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | GDPR-02 | unit | `npx vitest run gdpr` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | GDPR-03 | unit | `npx vitest run consent` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | GDPR-04 | grep | `test -f frontend/src/app/(public)/dpa/page.tsx` | ❌ | ⬜ pending |
| 04-02-02 | 02 | 1 | GDPR-05 | unit | `grep 'retention' packages/cron-worker/src/index.ts` | ❌ | ⬜ pending |
| 04-02-03 | 02 | 1 | GDPR-06 | grep | `grep 'sub-processor' frontend/src/app/(public)/privacy/page.tsx` | ❌ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] D1 migration for consent_log table
- [ ] R2 binding added to api-gateway wrangler.toml

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Erasure cascades across all tables | GDPR-01 | Requires populated D1 with test data | Create user, add queries/reports, request deletion, verify all tables empty |
| Export JSON contains all PII | GDPR-02 | Requires populated D1 | Create user with data, request export, download JSON, verify completeness |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity
- [ ] Wave 0 covers all MISSING references
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
