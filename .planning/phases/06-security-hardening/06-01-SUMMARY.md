---
phase: 06-security-hardening
plan: 01
subsystem: auth
tags: [mtls, certificates, cloudflare, d1, websocket, dual-auth]

requires:
  - phase: 01-bug-fixes-and-cicd
    provides: ws-gateway Worker with API key auth
provides:
  - D1 connector_certificates table for cert-to-org mapping
  - TlsClientAuth TypeScript interface for Cloudflare mTLS fields
  - lookupOrgByCertSerial cert auth module
  - Dual-auth /agent/connect handler (mTLS + API key fallback)
affects: [06-security-hardening, connector-packaging]

tech-stack:
  added: []
  patterns: [mTLS dual-auth with API key fallback, string comparison for Cloudflare TLS fields]

key-files:
  created:
    - migrations/0006_connector_certificates.sql
    - packages/ws-gateway/src/auth/cert-auth.ts
    - packages/ws-gateway/src/__tests__/cert-auth.test.ts
  modified:
    - packages/ws-gateway/src/types.ts
    - packages/ws-gateway/src/index.ts

key-decisions:
  - "String comparison for tlsClientAuth fields (certPresented === '1', not truthy) per Cloudflare runtime behavior"
  - "Dual-auth during transition: mTLS first, API key fallback for backward compatibility"

patterns-established:
  - "mTLS cert auth: read request.cf.tlsClientAuth, map cert_serial to org_id via D1"
  - "Dual-auth pattern: try stronger auth first, fall back to weaker during migration"

requirements-completed: [SEC-01]

duration: 2min
completed: 2026-03-18
---

# Phase 6 Plan 1: mTLS Certificate Authentication Summary

**mTLS cert auth for ws-gateway with D1 cert-to-org mapping, revocation check, and dual-auth fallback to API key**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T23:53:28Z
- **Completed:** 2026-03-18T23:55:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- D1 migration creates connector_certificates table with cert serial, fingerprint, org mapping, and revocation tracking
- TlsClientAuth interface with proper string-typed fields (not booleans) avoiding the Cloudflare pitfall
- lookupOrgByCertSerial module queries D1 excluding revoked certificates
- /agent/connect handler upgraded to dual-auth: tries mTLS cert first, falls back to API key

## Task Commits

Each task was committed atomically:

1. **Task 1: D1 migration, types, and cert-auth module with tests** - `f64f303` (feat) - TDD: RED/GREEN
2. **Task 2: Wire dual-auth into /agent/connect handler** - `4da807c` (feat)

## Files Created/Modified
- `migrations/0006_connector_certificates.sql` - Certificate-to-org mapping table with revocation support
- `packages/ws-gateway/src/types.ts` - Added TlsClientAuth interface with string-typed fields
- `packages/ws-gateway/src/auth/cert-auth.ts` - lookupOrgByCertSerial function querying D1
- `packages/ws-gateway/src/__tests__/cert-auth.test.ts` - 3 unit tests for valid, missing, and revoked certs
- `packages/ws-gateway/src/index.ts` - Dual-auth /agent/connect handler (mTLS + API key)

## Decisions Made
- String comparison for tlsClientAuth fields (`certPresented === '1'`, not truthy check) per Cloudflare runtime behavior where `'0'` is truthy in JS
- Dual-auth during transition period: mTLS preferred, API key fallback for connectors not yet provisioned with certificates
- 403 for invalid certificates (presented but verification failed), 401 for no authentication at all

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. WAF rule and certificate provisioning are separate operational steps documented in RESEARCH.md.

## Next Phase Readiness
- Worker-side mTLS validation complete, ready for connector-side certificate loading (Plan 02)
- WAF rule deployment is an operational step after all connectors have certificates

## Self-Check: PASSED

All 5 files verified on disk. Both task commits (f64f303, 4da807c) verified in git log.

---
*Phase: 06-security-hardening*
*Completed: 2026-03-18*
