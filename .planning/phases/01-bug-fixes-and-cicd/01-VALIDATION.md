---
phase: 1
slug: bug-fixes-and-cicd
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 (existing in ai-orchestrator) |
| **Config file** | `packages/ai-orchestrator/vitest.config.ts` (existing); `packages/api-gateway/vitest.config.ts` (Wave 0) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test` (Turbo runs all workspace tests) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | BUG-01 | unit | `npx vitest run quota` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | BUG-02 | unit | `npx vitest run queries` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | BUG-03 | unit | `npx vitest run auth` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | BUG-04 | unit | `npx vitest run internal-secret` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 1 | BUG-05 | unit | `npx vitest run reset-token` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | CICD-01 | integration | `gh workflow run ci.yml` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | CICD-02 | integration | `gh workflow run deploy.yml` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 2 | CICD-03 | manual | Verify PR preview URL | ❌ | ⬜ pending |
| 01-02-04 | 02 | 2 | CICD-04 | integration | `gh workflow run deploy.yml` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api-gateway/vitest.config.ts` — Vitest config for api-gateway
- [ ] `packages/api-gateway/package.json` — add vitest dev dependency and test script
- [ ] `packages/api-gateway/src/middleware/__tests__/quota.test.ts` — stubs for BUG-01
- [ ] `packages/api-gateway/src/routes/__tests__/queries.test.ts` — stubs for BUG-02, BUG-04
- [ ] `packages/api-gateway/src/routes/__tests__/auth.test.ts` — stubs for BUG-03, BUG-05

*api-gateway has no test infrastructure currently. Wave 0 must set up Vitest before bug fix tests can be written.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend preview on PR | CICD-03 | Requires GitHub PR + Cloudflare Pages integration | Open PR, wait for check, click preview URL |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
