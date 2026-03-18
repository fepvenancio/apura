---
phase: 05-mfa
plan: 01
subsystem: auth
tags: [mfa, totp, otpauth, qrcode, aes-gcm, backup-codes, two-phase-login]

# Dependency graph
requires:
  - phase: 01-bug-fixes-and-cicd
    provides: JWT auth flow, KV session management
provides:
  - D1 migration 0005_mfa.sql with backup_codes table and MFA columns
  - AES-256-GCM crypto utilities for TOTP secret encryption
  - MFA setup/confirm/disable routes at /api/mfa
  - Two-phase login flow with mfa_challenge KV tokens
  - POST /auth/mfa/verify with rate limiting (5 attempts per token)
  - Admin MFA reset route (DELETE /api/mfa/reset/:userId)
  - Backup code generation, hashing, and single-use verification
affects: [05-02, 05-03, frontend-login, frontend-settings]

# Tech tracking
tech-stack:
  added: [otpauth@9.5.0, qrcode@1.5.4, @types/qrcode]
  patterns: [two-phase-login-kv-challenge, aes-gcm-secret-encryption, sha256-salted-backup-codes]

key-files:
  created:
    - migrations/0005_mfa.sql
    - packages/api-gateway/src/utils/crypto.ts
    - packages/api-gateway/src/utils/__tests__/crypto.test.ts
    - packages/api-gateway/src/routes/mfa.ts
    - packages/api-gateway/src/routes/__tests__/mfa.test.ts
  modified:
    - packages/api-gateway/src/routes/auth.ts
    - packages/api-gateway/src/index.ts
    - packages/api-gateway/src/services/org-db.ts
    - packages/api-gateway/src/types.ts
    - packages/api-gateway/package.json

key-decisions:
  - "SHA-256 with per-code salt for backup codes instead of scrypt (high-entropy codes make fast hashing acceptable, avoids 10x verification latency)"
  - "HKDF key derivation from JWT_SECRET with salt 'apura-mfa-v1' for AES-256-GCM TOTP encryption"
  - "MFA challenge tokens stored in KV with 5-min TTL, rate-limited to 5 attempts per token"

patterns-established:
  - "Two-phase login: password verification returns opaque KV challenge token, TOTP verification exchanges it for real JWTs"
  - "TOTP secrets encrypted at rest with AES-256-GCM derived from JWT_SECRET via HKDF"
  - "Backup codes: XXXX-XXXX format, ambiguity-avoiding charset (no I/1/O/0), SHA-256+salt hashing"

requirements-completed: [MFA-01, MFA-02, MFA-03, MFA-05]

# Metrics
duration: 7min
completed: 2026-03-18
---

# Phase 5 Plan 1: MFA Backend Summary

**TOTP-based MFA with two-phase login, AES-256-GCM encrypted secrets, SHA-256 backup codes, and per-token rate limiting**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-18T23:09:03Z
- **Completed:** 2026-03-18T23:15:44Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Complete MFA backend with D1 migration, crypto utilities, and 4 API routes (setup, confirm, disable, admin reset)
- Two-phase login flow: login returns mfaRequired+mfaToken for MFA users, /auth/mfa/verify exchanges challenge+TOTP for real JWTs
- Backup code support: 10 codes generated on setup, SHA-256 hashed, single-use in /auth/mfa/verify
- Rate limiting: 5 attempts per MFA challenge token, then lockout (429)
- 29 new tests (10 crypto + 19 route tests), all 65 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: D1 migration, crypto utilities, and install dependencies** - `3ab0e1a` (feat)
2. **Task 2: MFA routes, two-phase login, and comprehensive tests** - `a8107f2` (feat)

## Files Created/Modified
- `migrations/0005_mfa.sql` - D1 migration: mfa_enabled, totp_secret columns, backup_codes table
- `packages/api-gateway/src/utils/crypto.ts` - AES-256-GCM encrypt/decrypt, backup code generation/hashing/verification
- `packages/api-gateway/src/utils/__tests__/crypto.test.ts` - 10 tests for crypto utilities
- `packages/api-gateway/src/routes/mfa.ts` - MFA setup, confirm, disable, admin reset routes
- `packages/api-gateway/src/routes/__tests__/mfa.test.ts` - 19 tests covering all MFA flows
- `packages/api-gateway/src/routes/auth.ts` - Modified login for two-phase MFA, added /auth/mfa/verify
- `packages/api-gateway/src/index.ts` - Mount MFA routes at /api/mfa
- `packages/api-gateway/src/services/org-db.ts` - Added mfa_enabled, totp_secret, mfa_required to column allowlists
- `packages/api-gateway/src/types.ts` - Added mfa_enabled, totp_secret to User interface
- `packages/api-gateway/package.json` - Added otpauth, qrcode, @types/qrcode dependencies

## Decisions Made
- SHA-256 with per-code salt for backup codes instead of scrypt -- backup codes have ~40 bits of entropy (8 chars from 32-char set), making fast hashing acceptable while avoiding 10x sequential verification latency
- HKDF key derivation from JWT_SECRET with salt 'apura-mfa-v1' for AES-256-GCM -- avoids needing a separate MFA encryption key
- MFA challenge tokens are opaque KV-stored strings (not JWTs) with 5-min TTL -- prevents half-authenticated JWT misuse

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial test approach using `require()` and `__mockValidate` exports failed with ESM module mocking -- resolved by using module-level mutable variable (`totpValidateResult`) for controlling TOTP validate mock behavior across tests

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- MFA backend complete and tested, ready for frontend MFA setup page (05-02) and login flow integration (05-03)
- MFA-04 (org-level MFA enforcement) not in this plan's scope, covered by later plans

---
*Phase: 05-mfa*
*Completed: 2026-03-18*
