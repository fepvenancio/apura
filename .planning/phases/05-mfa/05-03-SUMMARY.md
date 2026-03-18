---
phase: 05-mfa
plan: 03
subsystem: auth
tags: [mfa, totp, org-enforcement, two-factor, login-flow]

# Dependency graph
requires:
  - phase: 05-mfa
    provides: MFA backend routes, two-phase login flow, frontend MFA pages
provides:
  - Org-level MFA enforcement in login flow (mfaSetupRequired response)
  - Short-TTL token issuance for org-enforced MFA setup
  - mfa_enabled field in member listings
  - mfa_required in org settings update
  - Frontend MfaSetupRequiredError and redirect to /settings/security
affects: [frontend-login, frontend-settings]

# Tech tracking
tech-stack:
  added: []
  patterns: [org-mfa-enforcement-short-ttl-tokens, mfa-setup-redirect-flow]

key-files:
  created: []
  modified:
    - packages/api-gateway/src/routes/auth.ts
    - packages/api-gateway/src/routes/org.ts
    - packages/api-gateway/src/services/org-db.ts
    - packages/api-gateway/src/routes/__tests__/mfa.test.ts
    - frontend/src/lib/api.ts
    - frontend/src/stores/auth-store.ts
    - frontend/src/app/(auth)/login/page.tsx

key-decisions:
  - "Short-TTL tokens (300s) for org-enforced MFA setup instead of opaque setup tokens -- reuses existing auth middleware, user can access /settings/security normally"
  - "Org enforcement check runs AFTER user.mfa_enabled check so existing MFA users get normal challenge flow regardless of org setting"

patterns-established:
  - "Org MFA enforcement: login issues short-lived real JWTs + mfaSetupRequired flag, frontend redirects to /settings/security"
  - "mfa_enabled exposed in member listing for org admin visibility"

requirements-completed: [MFA-04]

# Metrics
duration: 3min
completed: 2026-03-18
---

# Phase 5 Plan 3: Org MFA Enforcement Summary

**Org-level MFA enforcement with short-TTL login tokens redirecting unenrolled users to MFA setup, plus member MFA status visibility**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-18T23:24:42Z
- **Completed:** 2026-03-18T23:27:49Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Login handler checks org.mfa_required when user has no MFA, issues 300s tokens with mfaSetupRequired flag
- PUT /api/org accepts mfa_required field for org settings toggle
- listUsers query includes mfa_enabled for admin visibility of member MFA status
- Frontend detects mfaSetupRequired and redirects to /settings/security for MFA enrollment
- 4 new org enforcement test cases (69 total tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Org MFA enforcement in login and member/settings API updates** - `5df61b5` (feat)
2. **Task 2: Frontend org enforcement handling** - `3cf7c0f` (feat)

## Files Created/Modified
- `packages/api-gateway/src/routes/auth.ts` - Org MFA enforcement check after password verification, short-TTL token issuance
- `packages/api-gateway/src/routes/org.ts` - mfa_required accepted in org update body
- `packages/api-gateway/src/services/org-db.ts` - mfa_enabled added to listUsers SELECT
- `packages/api-gateway/src/routes/__tests__/mfa.test.ts` - 4 new org enforcement tests
- `frontend/src/lib/api.ts` - MfaSetupRequiredError class, login() returns mfaSetupRequired flag
- `frontend/src/stores/auth-store.ts` - mfaSetupRequired state field, handled in login action
- `frontend/src/app/(auth)/login/page.tsx` - Redirect to /settings/security when mfaSetupRequired

## Decisions Made
- Short-TTL tokens (300s) for org-enforced MFA setup instead of opaque setup tokens -- reuses existing auth middleware so user can access security settings page normally
- Org enforcement check placed AFTER user.mfa_enabled check so existing MFA users get the normal challenge flow regardless of org setting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 05 (MFA) fully complete: backend routes, frontend pages, and org enforcement all implemented
- All 69 api-gateway tests passing
- Ready for next phase

---
*Phase: 05-mfa*
*Completed: 2026-03-18*
