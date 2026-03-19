---
phase: 10-connector-packaging
plan: 01
subsystem: connector
tags: [dpapi, windows-service, auto-update, msi, schtasks, dotnet]

requires:
  - phase: 06-security-hardening
    provides: mTLS connector authentication pattern
provides:
  - DPAPI credential encryption for SQL Server configs
  - Auto-update checker with MSI download and schtasks elevation
  - Windows Service SCM integration via UseWindowsService
  - Connector version endpoint on API gateway
  - UpdateWorker background service
affects: [10-connector-packaging]

tech-stack:
  added: [System.Security.Cryptography.ProtectedData 9.0.4, Microsoft.Extensions.Hosting.WindowsServices 8.0.1]
  patterns: [DPAPI LocalMachine scope encryption, schtasks-based elevated update, BackgroundService update loop]

key-files:
  created:
    - connector/src/ApuraConnector.Infrastructure/Credentials/DpapiCredentialStore.cs
    - connector/src/ApuraConnector.Infrastructure/Updates/UpdateChecker.cs
    - connector/src/ApuraConnector.Infrastructure/Updates/UpdateInfo.cs
    - connector/src/ApuraConnector.Service/UpdateWorker.cs
    - packages/api-gateway/src/routes/connector.ts
    - connector/test/ApuraConnector.Core.Tests/DpapiCredentialStoreTests.cs
    - connector/test/ApuraConnector.Core.Tests/UpdateCheckerTests.cs
  modified:
    - connector/src/ApuraConnector.Infrastructure/ApuraConnector.Infrastructure.csproj
    - connector/src/ApuraConnector.Service/Program.cs
    - connector/src/ApuraConnector.Service/ApuraConnector.Service.csproj
    - connector/src/ApuraConnector.Core/Models/ConnectorConfig.cs
    - packages/api-gateway/src/index.ts

key-decisions:
  - "DPAPI LocalMachine scope for service credential encryption (not CurrentUser, since service runs as LocalService)"
  - "schtasks + msiexec pattern for elevated update application (service cannot self-elevate)"
  - "Connector version endpoint at /connector/version (public, outside /api/* auth middleware)"
  - "5-minute initial delay before first update check to let service fully start"

patterns-established:
  - "DPAPI credential store: serialize config to JSON, encrypt with ProtectedData.Protect, write bytes to .dpapi file"
  - "Update checker: poll version endpoint, compare semver, download MSI to temp, schedule via schtasks as SYSTEM"
  - "Background update loop: 5-min initial delay, then check every N hours (configurable via UpdateCheckIntervalHours)"

requirements-completed: [CONN-03, CONN-04, CONN-05]

duration: 5min
completed: 2026-03-19
---

# Phase 10 Plan 01: Connector Credential Storage, Auto-Update, and Windows Service Summary

**DPAPI credential encryption with LocalMachine scope, background auto-update via schtasks-elevated MSI, and UseWindowsService SCM integration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T02:12:43Z
- **Completed:** 2026-03-19T02:17:13Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- DpapiCredentialStore encrypts/decrypts SqlServerConfig using DPAPI with LocalMachine scope and fixed entropy
- UpdateChecker compares versions against cloud endpoint, downloads MSI, schedules elevated install via schtasks
- Program.cs wired for Windows Service mode with DPAPI credential fallback to appsettings.json
- Public connector version endpoint at /connector/version returns latest version, download URL, and minimum version
- 14 unit tests passing (DPAPI round-trip, platform guard, version comparison, HTTP error handling, download)

## Task Commits

Each task was committed atomically:

1. **Task 1: DPAPI credential store, update checker, and unit tests** - `ce6f4e4` (feat)
2. **Task 2: Wire UseWindowsService, DPAPI into Program.cs, add UpdateWorker and version endpoint** - `2ac834e` (feat)

## Files Created/Modified
- `connector/src/ApuraConnector.Infrastructure/Credentials/DpapiCredentialStore.cs` - DPAPI encrypt/decrypt for SqlServerConfig
- `connector/src/ApuraConnector.Infrastructure/Updates/UpdateChecker.cs` - Version check, MSI download, schtasks elevation
- `connector/src/ApuraConnector.Infrastructure/Updates/UpdateInfo.cs` - Record type for version endpoint response
- `connector/src/ApuraConnector.Service/UpdateWorker.cs` - BackgroundService that checks for updates periodically
- `connector/src/ApuraConnector.Service/Program.cs` - Added UseWindowsService, DPAPI fallback, UpdateChecker/UpdateWorker registration
- `connector/src/ApuraConnector.Core/Models/ConnectorConfig.cs` - Added UpdateCheckIntervalHours property
- `packages/api-gateway/src/routes/connector.ts` - GET /version endpoint with hardcoded version info
- `packages/api-gateway/src/index.ts` - Registered connector route as public (pre-auth)
- `connector/test/ApuraConnector.Core.Tests/DpapiCredentialStoreTests.cs` - DPAPI round-trip, platform guard, error tests
- `connector/test/ApuraConnector.Core.Tests/UpdateCheckerTests.cs` - Version comparison, HTTP failure, download tests

## Decisions Made
- DPAPI uses LocalMachine scope (not CurrentUser) so credentials encrypted during setup are accessible by the Windows Service running as LocalService
- Update elevation via schtasks: creates a one-time scheduled task as SYSTEM then runs it immediately, since LocalService cannot run msiexec directly
- Version endpoint mounted at /connector/version (outside /api/* path) to avoid requiring user JWT auth -- connectors authenticate via API key
- 5-minute initial delay before first update check to ensure the service is fully operational before checking for updates

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ambiguous ILogger reference in UpdateWorker**
- **Found during:** Task 2
- **Issue:** `ILogger` was ambiguous between `Microsoft.Extensions.Logging.ILogger` and `Serilog.ILogger`
- **Fix:** Fully qualified as `Serilog.ILogger` to match project convention
- **Files modified:** connector/src/ApuraConnector.Service/UpdateWorker.cs
- **Verification:** Build succeeded
- **Committed in:** 2ac834e (Task 2 commit)

**2. [Rule 2 - Missing Critical] Version endpoint path adjusted for auth bypass**
- **Found during:** Task 2
- **Issue:** Plan specified /api/connector/version but /api/* routes require JWT auth middleware; connectors use API keys, not user JWTs
- **Fix:** Mounted at /connector/version (outside /api/* path) to bypass auth middleware
- **Files modified:** packages/api-gateway/src/index.ts, connector/src/ApuraConnector.Service/Program.cs
- **Verification:** TypeScript compilation passes, route accessible without auth
- **Committed in:** 2ac834e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DPAPI credential store and update checker ready for WiX MSI packaging (Plan 02)
- Version endpoint ready for production deployment
- Windows Service integration complete -- connector responds to SCM start/stop/restart

---
*Phase: 10-connector-packaging*
*Completed: 2026-03-19*
