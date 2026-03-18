---
phase: 06-security-hardening
plan: 02
subsystem: infra
tags: [mtls, x509, certificate, websocket, dotnet, security]

requires:
  - phase: none
    provides: none
provides:
  - CertificateLoader for PFX-based client certificate loading
  - mTLS-ready CloudTunnelService with client cert presentation
  - SEC-02 audit confirming no server cert validation bypass
affects: [10-connector-packaging]

tech-stack:
  added: [System.Security.Cryptography.X509Certificates]
  patterns: [EphemeralKeySet for cross-platform PFX loading, static loader utility]

key-files:
  created:
    - connector/src/ApuraConnector.Infrastructure/Certificates/CertificateLoader.cs
    - connector/test/ApuraConnector.Core.Tests/CertificateLoaderTests.cs
  modified:
    - connector/src/ApuraConnector.Core/Models/ConnectorConfig.cs
    - connector/src/ApuraConnector.Infrastructure/Tunnel/CloudTunnelService.cs
    - connector/test/ApuraConnector.Core.Tests/ApuraConnector.Core.Tests.csproj

key-decisions:
  - "EphemeralKeySet flag for cross-platform PFX loading (avoids macOS keychain and Linux permission issues)"
  - "SEC-02 implemented by absence -- no ServerCertificateCustomValidationCallback means .NET validates server certs by default"
  - "Added Infrastructure project reference to test project for CertificateLoader testing"

patterns-established:
  - "Static loader utility pattern: CertificateLoader.Load(config) returns null when not configured"
  - "Security audit by absence: documenting that NOT adding code is the correct implementation"

requirements-completed: [SEC-01, SEC-02]

duration: 2min
completed: 2026-03-18
---

# Phase 6 Plan 2: Connector mTLS Certificate Loading Summary

**PFX client certificate loading via CertificateLoader with EphemeralKeySet, wired into CloudTunnelService for mTLS; SEC-02 audit confirms no server cert validation bypass**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T23:53:14Z
- **Completed:** 2026-03-18T23:54:45Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- CertificateLoader static class loads PFX certificates with EphemeralKeySet for cross-platform compatibility
- ConnectorConfig extended with ClientCertificatePath, ClientCertificatePassword, and ClientCertificateThumbprint fields
- CloudTunnelService presents client certificate during WebSocket TLS handshake when configured
- SEC-02 audit confirms no ServerCertificateCustomValidationCallback or RemoteCertificateValidationCallback bypass exists
- Backward compatible -- connector works without certificate configured (null path returns null cert)

## Task Commits

Each task was committed atomically:

1. **Task 1: CertificateLoader, ConnectorConfig update, and unit tests** - `fa4c968` (feat)
2. **Task 2: Wire cert into CloudTunnelService and audit SEC-02** - `9ce9e8d` (feat)

## Files Created/Modified
- `connector/src/ApuraConnector.Infrastructure/Certificates/CertificateLoader.cs` - Static PFX certificate loader with null-safe config handling
- `connector/test/ApuraConnector.Core.Tests/CertificateLoaderTests.cs` - Tests for null path, empty path, and missing file cases
- `connector/src/ApuraConnector.Core/Models/ConnectorConfig.cs` - Added 3 certificate config properties
- `connector/src/ApuraConnector.Infrastructure/Tunnel/CloudTunnelService.cs` - Wired CertificateLoader into WebSocket connect, added SEC-02 comment
- `connector/test/ApuraConnector.Core.Tests/ApuraConnector.Core.Tests.csproj` - Added Infrastructure project reference

## Decisions Made
- Used EphemeralKeySet flag for cross-platform PFX loading (avoids macOS keychain and Linux permission issues)
- SEC-02 implemented by verifying absence of validation bypass callbacks rather than adding code
- Added Infrastructure project reference to test project since CertificateLoader lives in Infrastructure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added Infrastructure project reference to test project**
- **Found during:** Task 1 (CertificateLoader tests)
- **Issue:** Test project only referenced Core, but CertificateLoader is in Infrastructure
- **Fix:** Added ProjectReference to ApuraConnector.Infrastructure.csproj in test csproj
- **Files modified:** connector/test/ApuraConnector.Core.Tests/ApuraConnector.Core.Tests.csproj
- **Verification:** Tests compile and pass
- **Committed in:** fa4c968 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for test compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Certificate path is configured via ConnectorConfig when mTLS is needed.

## Next Phase Readiness
- mTLS client certificate support ready for connector packaging (Phase 10)
- Server certificate validation confirmed secure by default
- Certificate configuration fields ready for appsettings.json binding

---
*Phase: 06-security-hardening*
*Completed: 2026-03-18*
