---
phase: 10-connector-packaging
plan: 02
subsystem: connector
tags: [wix, msi, windows-service, firewall, installer, enterprise-deployment]

requires:
  - phase: 10-connector-packaging
    provides: DPAPI credential store, auto-update checker, Windows Service integration
provides:
  - WiX v6 MSI installer project with service registration and firewall rules
  - IT admin deployment guide covering standard, silent, and GPO installation
affects: []

tech-stack:
  added: [WixToolset.Sdk 6.0.2, WixToolset.Firewall.wixext 6.0]
  patterns: [WiX v6 SDK project with ProjectReference Publish=true, ServiceInstall/ServiceControl for Windows Service MSI]

key-files:
  created:
    - connector/src/ApuraConnector.Installer/ApuraConnector.Installer.wixproj
    - connector/src/ApuraConnector.Installer/Package.wxs
    - connector/docs/INSTALLATION.md
  modified:
    - connector/src/ApuraConnector.Service/ApuraConnector.Service.csproj
    - connector/ApuraConnector.sln

key-decisions:
  - "UpgradeCode GUID B7E3F2A1-8C4D-4E6F-9A2B-1D3E5F7A8B9C must never change across versions for in-place upgrades"
  - "Service runs as NT AUTHORITY\\LocalService for least-privilege (matches DPAPI LocalMachine scope from Plan 01)"
  - "PublishSingleFile=false because WiX needs individual files for MSI component model"

patterns-established:
  - "WiX v6 installer: SDK-style wixproj with ProjectReference Publish=true for self-contained service output"
  - "MSI component pattern: ServiceInstall + ServiceControl + FirewallException in single component"

requirements-completed: [CONN-01, CONN-02, CONN-05]

duration: 3min
completed: 2026-03-19
---

# Phase 10 Plan 02: WiX MSI Installer and IT Admin Deployment Guide Summary

**WiX v6 MSI installer with Windows Service registration (LocalService, auto-start), outbound 443 firewall rule, MajorUpgrade support, and comprehensive enterprise deployment documentation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T02:19:52Z
- **Completed:** 2026-03-19T02:22:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- WiX v6 installer project produces MSI with ServiceInstall (ApuraConnector, LocalService, auto-start), ServiceControl, and MajorUpgrade for in-place version upgrades
- Outbound TCP 443 firewall rule via WiX Firewall extension -- no inbound ports required
- Service csproj configured for self-contained win-x64 publish so target machines need no .NET runtime
- INSTALLATION.md covers Windows 10/11/Server 2016-2022, silent install (msiexec /quiet), GPO deployment, firewall requirements, DPAPI credentials, auto-update, and troubleshooting
- Old ApuraConnector.Setup placeholder removed from solution, replaced by real WiX installer

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WiX v6 installer project with service registration and firewall rules** - `cd33da8` (feat)
2. **Task 2: Create IT admin installation documentation** - `f4b8aa9` (docs)

## Files Created/Modified
- `connector/src/ApuraConnector.Installer/ApuraConnector.Installer.wixproj` - WiX v6 SDK project with ProjectReference to Service
- `connector/src/ApuraConnector.Installer/Package.wxs` - MSI package definition with ServiceInstall, ServiceControl, FirewallException, MajorUpgrade
- `connector/docs/INSTALLATION.md` - Enterprise IT admin deployment guide (293 lines)
- `connector/src/ApuraConnector.Service/ApuraConnector.Service.csproj` - Added RuntimeIdentifier=win-x64, SelfContained=true
- `connector/ApuraConnector.sln` - Added Installer project, removed Setup placeholder

## Decisions Made
- UpgradeCode GUID fixed as B7E3F2A1-8C4D-4E6F-9A2B-1D3E5F7A8B9C -- must never change across versions for MajorUpgrade to work
- Service account set to NT AUTHORITY\LocalService for least-privilege, consistent with DPAPI LocalMachine scope from Plan 01
- PublishSingleFile kept false because WiX requires individual files for its component model (each file tracked separately in MSI)
- MajorUpgrade placed before Feature elements per WiX best practice to prevent duplicate installations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 (connector-packaging) is fully complete
- MSI installer project ready for CI/CD build pipeline integration
- INSTALLATION.md ready for enterprise IT distribution

---
*Phase: 10-connector-packaging*
*Completed: 2026-03-19*
