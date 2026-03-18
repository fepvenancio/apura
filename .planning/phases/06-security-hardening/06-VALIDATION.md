---
phase: 6
slug: security-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 6 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (ws-gateway) + .NET test project |
| **Quick run command** | `cd packages/ws-gateway && npx vitest run` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| mTLS rejects no-cert connections | SEC-01 | Requires Cloudflare API Shield + real certs | Deploy, connect without cert, verify rejection |
| Connector presents client cert | SEC-02 | Requires .NET connector with PFX cert | Start connector with cert configured, verify connection |

**Approval:** pending
