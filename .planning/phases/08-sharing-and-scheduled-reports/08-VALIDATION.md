---
phase: 8
slug: sharing-and-scheduled-reports
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 8 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 (existing in api-gateway) |
| **Config file** | `packages/api-gateway/vitest.config.ts` |
| **Quick run command** | `cd packages/api-gateway && npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SHARE-01,SCHED-01,02,04,EXPORT-03 | unit | `npx vitest run` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | SCHED-03,04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 2 | SHARE-01,02 | grep | `grep 'is_shared' frontend/src/app` | N/A | ⬜ pending |
| 08-02-02 | 02 | 2 | SCHED-01,03 | grep | `test -f frontend/src/app/(dashboard)/schedules` | N/A | ⬜ pending |

---

## Wave 0 Requirements

- [ ] D1 migration 0007 for schedule_runs columns
- [ ] REPORT_QUEUE binding in api-gateway wrangler.toml

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end scheduled report delivery | EXPORT-03 | Requires live Queue + R2 + Resend | Create schedule, wait for cron, verify email received |
| Shared reports visible to org members | SHARE-02 | Requires multi-user session | Login as two org members, share report, verify visibility |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
