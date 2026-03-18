---
phase: 06-security-hardening
verified: 2026-03-18T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 6: Security Hardening Verification Report

**Phase Goal:** Connector-to-cloud communication is secured with mutual TLS authentication
**Verified:** 2026-03-18
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                   | Status     | Evidence                                                                                                   |
| --- | --------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Worker accepts connector requests authenticated by valid client certificate              | VERIFIED   | index.ts:35-44 reads `cf.tlsClientAuth`, checks `certPresented === '1'` and `certVerified === 'SUCCESS'`, calls `lookupOrgByCertSerial` |
| 2   | Worker falls back to API key auth when no certificate is presented                      | VERIFIED   | index.ts:48-63 falls back to Bearer token + `validateAgentApiKey` when `orgId` is still unset after cert path |
| 3   | Certificate serial is mapped to org_id via D1 connector_certificates table              | VERIFIED   | cert-auth.ts:14 `SELECT org_id FROM connector_certificates WHERE cert_serial = ? AND revoked_at IS NULL`   |
| 4   | Revoked certificates are rejected even if Cloudflare validated the TLS handshake        | VERIFIED   | cert-auth.ts:14 `AND revoked_at IS NULL` — revoked rows simply return null; index.ts falls back to API key (or 401 if none) |
| 5   | Connector loads a client certificate from PFX file and presents it during WebSocket TLS handshake | VERIFIED | CloudTunnelService.cs:67-71 `CertificateLoader.Load(_config)` then `_ws.Options.ClientCertificates.Add(clientCert)` |
| 6   | Connector validates the server certificate (no bypass callback exists)                  | VERIFIED   | Exhaustive grep of connector/src/ finds zero implementations of `ServerCertificateCustomValidationCallback` or `RemoteCertificateValidationCallback` — only a comment on line 78 explicitly forbidding it |
| 7   | Connector works without a certificate configured (backward compatible)                  | VERIFIED   | CertificateLoader.cs:14-16 returns `null` when `ClientCertificatePath` is null/empty; CloudTunnelService.cs:68 guards with `if (clientCert != null)` |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact                                                                                    | Expected                              | Status    | Details                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| `migrations/0006_connector_certificates.sql`                                                | Certificate-to-org mapping table      | VERIFIED  | `CREATE TABLE connector_certificates` with `cert_serial TEXT NOT NULL UNIQUE`, `revoked_at TEXT`, FK to organizations, 2 indexes |
| `packages/ws-gateway/src/auth/cert-auth.ts`                                                 | Certificate authentication logic      | VERIFIED  | Exports `lookupOrgByCertSerial`, queries D1 with `revoked_at IS NULL`, 19 substantive lines |
| `packages/ws-gateway/src/types.ts`                                                          | TlsClientAuth type definition         | VERIFIED  | `TlsClientAuth` interface with string-typed `certPresented: '0' \| '1'` and `certVerified: string` |
| `packages/ws-gateway/src/__tests__/cert-auth.test.ts`                                       | Unit tests for cert auth              | VERIFIED  | 3 tests: valid serial returns org_id, missing serial returns null, revoked returns null |
| `connector/src/ApuraConnector.Infrastructure/Certificates/CertificateLoader.cs`             | PFX certificate loading utility       | VERIFIED  | Static class `CertificateLoader.Load(config)`, uses `X509KeyStorageFlags.EphemeralKeySet`, null-safe |
| `connector/src/ApuraConnector.Core/Models/ConnectorConfig.cs`                               | Certificate config fields             | VERIFIED  | `ClientCertificatePath`, `ClientCertificatePassword`, `ClientCertificateThumbprint` all present as nullable strings |
| `connector/src/ApuraConnector.Infrastructure/Tunnel/CloudTunnelService.cs`                  | WebSocket with client cert            | VERIFIED  | `CertificateLoader.Load(_config)` called, result added to `_ws.Options.ClientCertificates` before `ConnectAsync` |
| `connector/test/ApuraConnector.Core.Tests/CertificateLoaderTests.cs`                        | Unit tests for CertificateLoader      | VERIFIED  | 3 tests: null path returns null, empty path returns null, missing file throws `FileNotFoundException` |

### Key Link Verification

| From                               | To                                         | Via                                  | Status  | Details                                                                                       |
| ---------------------------------- | ------------------------------------------ | ------------------------------------ | ------- | --------------------------------------------------------------------------------------------- |
| `packages/ws-gateway/src/index.ts` | `packages/ws-gateway/src/auth/cert-auth.ts` | `import { lookupOrgByCertSerial }`   | WIRED   | index.ts:4 imports `lookupOrgByCertSerial`; index.ts:41 calls it with `cf.tlsClientAuth.certSerial` |
| `packages/ws-gateway/src/auth/cert-auth.ts` | D1 connector_certificates table   | SQL query by cert_serial             | WIRED   | cert-auth.ts:13-16 `SELECT org_id FROM connector_certificates WHERE cert_serial = ? AND revoked_at IS NULL` |
| `CloudTunnelService.cs`            | `CertificateLoader.cs`                     | `CertificateLoader.Load` call        | WIRED   | CloudTunnelService.cs:8 `using ApuraConnector.Infrastructure.Certificates`; line 67 `CertificateLoader.Load(_config)` |
| `CloudTunnelService.cs`            | `ClientWebSocket.Options.ClientCertificates` | .NET built-in mTLS                  | WIRED   | CloudTunnelService.cs:70 `_ws.Options.ClientCertificates.Add(clientCert)` before `ConnectAsync` at line 79 |

### Requirements Coverage

| Requirement | Source Plan | Description                                                         | Status    | Evidence                                                                                                    |
| ----------- | ----------- | ------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| SEC-01      | 06-01, 06-02 | mTLS configured for connector-to-cloud communication via Cloudflare API Shield | SATISFIED | Worker validates client certs via `request.cf.tlsClientAuth`; D1 maps cert serials to orgs; revocation enforced; connector presents certs via `ClientCertificates.Add` |
| SEC-02      | 06-02       | Connector validates server certificate on WebSocket connection       | SATISFIED | .NET default behavior validates server cert via OS trust store; no bypass callback (`ServerCertificateCustomValidationCallback`) exists anywhere in connector/src/ .cs files |

No orphaned requirements found. Both SEC-01 and SEC-02 map to Phase 6 in REQUIREMENTS.md traceability table. No additional Phase 6 requirements exist.

### Anti-Patterns Found

No blocker or warning anti-patterns found in the modified files.

- No `TODO`/`FIXME`/`PLACEHOLDER` comments in implementation files
- No empty return stubs (`return null` only in the intentional backward-compat path of `CertificateLoader.Load`)
- No `console.log`-only handlers
- The only occurrence of `ServerCertificateCustomValidationCallback` in connector source is a comment on CloudTunnelService.cs:78 explicitly forbidding it — this is the correct SEC-02 implementation pattern

### Human Verification Required

Two items require deployment-level confirmation that cannot be verified by static analysis:

#### 1. Cloudflare API Shield WAF Rule Enforcement

**Test:** Deploy Worker, attempt WebSocket connection from a connector with NO client certificate configured but a valid API key.
**Expected:** Connection should succeed (API key fallback path). Then configure a Cloudflare WAF rule requiring mTLS and retry — the no-cert request should be blocked at the edge before reaching the Worker.
**Why human:** WAF rule configuration is an operational step outside the codebase. The Worker-side dual-auth logic is verified, but the API Shield WAF rule that enforces "cert required" at the Cloudflare edge cannot be verified statically.

#### 2. End-to-End mTLS Handshake

**Test:** Configure the .NET connector with a valid PFX certificate issued and registered in the `connector_certificates` D1 table. Start the connector. Verify it connects successfully to `wss://ws.apura.xyz/agent/connect`.
**Expected:** WebSocket connection established, connector log shows "Client certificate loaded: {Thumbprint}" and "Connected to Apura cloud".
**Why human:** Requires a real X.509 certificate, a running Cloudflare Worker, and a populated D1 database row. Cannot simulate the full TLS handshake or Cloudflare `request.cf.tlsClientAuth` payload in unit tests.

### Gaps Summary

No gaps. All 7 observable truths verified, all 8 artifacts exist and are substantively implemented, all 4 key links wired, both SEC-01 and SEC-02 satisfied.

The two human verification items are operational/integration concerns — they do not block the goal of having the correct code in place for mTLS authentication.

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
