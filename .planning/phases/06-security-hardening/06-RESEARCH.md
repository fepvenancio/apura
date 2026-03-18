# Phase 6: Security Hardening (mTLS) - Research

**Researched:** 2026-03-18
**Domain:** Mutual TLS (mTLS) for connector-to-cloud WebSocket communication
**Confidence:** HIGH

## Summary

Phase 6 secures the WebSocket channel between the .NET on-premise connector and the Cloudflare ws-gateway Worker using mutual TLS (mTLS). The connector currently authenticates via an API key sent as a Bearer token in the WebSocket upgrade request. mTLS adds a transport-layer authentication requirement: the connector must present a valid client certificate signed by Cloudflare's managed CA before the connection reaches the Worker.

Cloudflare API Shield provides the mTLS infrastructure. The approach is: (1) enable mTLS on the `ws.apura.xyz` hostname, (2) create a WAF custom rule to block requests without valid client certificates on the `/agent/connect` path, (3) read `request.cf.tlsClientAuth` in the ws-gateway Worker to extract certificate details and map them to organizations, and (4) modify the .NET connector to load and present a client certificate during the WebSocket TLS handshake using `ClientWebSocket.Options.ClientCertificates`.

**Primary recommendation:** Use Cloudflare's managed CA for client certificates, enforce mTLS via WAF rule on `/agent/connect`, validate certificate details in Worker code, and support dual-auth (API key OR mTLS) during a transition period. For SEC-02 (server certificate validation), the .NET `ClientWebSocket` validates Cloudflare's server certificate by default via the OS trust store -- ensure `ServerCertificateCustomValidationCallback` is NOT set to bypass validation.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-01 | mTLS configured for connector-to-cloud communication via Cloudflare API Shield | Cloudflare API Shield mTLS on `ws.apura.xyz`, WAF rule enforcement, `request.cf.tlsClientAuth` validation in Worker, D1 certificate tracking table, per-org client certificate provisioning |
| SEC-02 | Connector validates server certificate on WebSocket connection | .NET `ClientWebSocket` validates server certificates by default via system trust store; verify no `ServerCertificateCustomValidationCallback` bypass exists; Cloudflare serves valid TLS certificates on `ws.apura.xyz` |
</phase_requirements>

## Standard Stack

### Core
| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Cloudflare API Shield (mTLS) | - | Incoming mTLS enforcement at edge | Native Cloudflare feature; validates client certs before traffic reaches Worker |
| Cloudflare Managed CA | - | Issue client certificates | No external PKI needed; certificates managed via dashboard/API |
| WAF Custom Rules | - | Block requests without valid client cert | Declarative enforcement; no code needed for basic reject/allow |
| `request.cf.tlsClientAuth` | - | Access client cert details in Worker | Built into Workers runtime; no library needed |
| .NET `ClientWebSocket.Options.ClientCertificates` | .NET 8 | Present client cert on WebSocket connection | Built into .NET; no third-party library needed |
| `X509Certificate2` (.NET) | .NET 8 | Load PFX/PEM certificate files | Built into System.Security.Cryptography.X509Certificates |

### Supporting
| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| Cloudflare API (`POST /zones/{zone_id}/client_certificates`) | v4 | Programmatic certificate creation | Automating per-org certificate provisioning |
| Windows Certificate Store | - | Secure certificate storage on Windows | Production deployments where PFX file storage is unacceptable |
| D1 migration | - | `connector_certificates` table | Track cert-to-org mapping, serial numbers, revocation status |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cloudflare Managed CA | Bring Your Own CA (BYOCA) | Enterprise-only, API-only, certs not shown in dashboard; unnecessary for current scale |
| WAF rule enforcement | Worker-only enforcement | WAF rule blocks at edge before Worker runs; more secure and cheaper (no Worker invocation for invalid certs) |
| PFX file on disk | Windows Certificate Store | Store is more secure but adds installer complexity; PFX with DPAPI is acceptable for v1 |

**Installation:**
```bash
# No npm packages needed -- all Cloudflare-native and .NET built-in

# Cloudflare CLI for certificate management (already installed)
# wrangler is already in the project

# D1 migration for certificate tracking
# Create: migrations/0006_connector_certificates.sql
```

## Architecture Patterns

### mTLS Flow Architecture
```
.NET Connector                     Cloudflare Edge                    ws-gateway Worker
     |                                  |                                  |
     |--- WSS + Client Cert ---------> |                                  |
     |    (TLS handshake with          |                                  |
     |     X509Certificate2)           |                                  |
     |                                  |-- Validate cert against CA -->   |
     |                                  |                                  |
     |                                  |-- WAF Rule Check:               |
     |                                  |   cert_verified == true? ------> |
     |                                  |   (if not: 403 Block)           |
     |                                  |                                  |
     |                                  |-- Forward with cf.tlsClientAuth |
     |                                  |   headers to Worker ----------> |
     |                                  |                                  |
     |                                  |                    Read certSerial,
     |                                  |                    certFingerprintSHA256,
     |                                  |                    certVerified
     |                                  |                    Map cert -> org_id
     |                                  |                    Continue to DO
```

### Recommended Project Structure Changes
```
packages/ws-gateway/src/
  index.ts              # Add mTLS cert validation before DO routing
  auth/
    agent-auth.ts       # Existing API key auth (keep for dual-auth)
    cert-auth.ts        # NEW: Certificate-based org identification
  types.ts              # Add tlsClientAuth types

connector/src/ApuraConnector.Infrastructure/
  Tunnel/
    CloudTunnelService.cs  # Add client cert loading to ClientWebSocket
  Certificates/
    CertificateLoader.cs   # NEW: Load cert from PFX or Windows store

migrations/
  0006_connector_certificates.sql  # NEW: Certificate tracking table
```

### Pattern 1: Dual Authentication During Transition
**What:** Accept either API key OR valid client certificate for org identification during rollout.
**When to use:** Transition period while deploying certificates to all connectors.
**Example:**
```typescript
// In ws-gateway/src/index.ts, /agent/connect handler
async function identifyOrg(request: Request, env: Env): Promise<{ orgId: string } | null> {
  // Try mTLS first (preferred)
  const cf = request.cf as { tlsClientAuth?: TlsClientAuth };
  if (cf?.tlsClientAuth?.certPresented === '1' && cf.tlsClientAuth.certVerified === 'SUCCESS') {
    const orgId = await lookupOrgByCertSerial(cf.tlsClientAuth.certSerial, env.DB);
    if (orgId) return { orgId };
  }

  // Fall back to API key
  const authHeader = request.headers.get('Authorization') ?? '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (apiKey) {
    const result = await validateAgentApiKey(apiKey, env.DB);
    if (result.valid && result.orgId) return { orgId: result.orgId };
  }

  return null;
}
```

### Pattern 2: Certificate-to-Organization Mapping
**What:** Map client certificate serial/fingerprint to an org_id via D1 table.
**When to use:** Every authenticated connector request.
**Example:**
```typescript
// In ws-gateway/src/auth/cert-auth.ts
export async function lookupOrgByCertSerial(
  certSerial: string,
  db: D1Database
): Promise<string | null> {
  const result = await db
    .prepare(
      'SELECT org_id FROM connector_certificates WHERE cert_serial = ? AND revoked_at IS NULL'
    )
    .bind(certSerial)
    .first<{ org_id: string }>();
  return result?.org_id ?? null;
}
```

### Pattern 3: .NET Client Certificate Loading
**What:** Load X509Certificate2 from PFX file and attach to WebSocket.
**When to use:** Connector startup, before WebSocket connection.
**Example:**
```csharp
// In CloudTunnelService.ConnectAndRunAsync
private async Task ConnectAndRunAsync(CancellationToken ct)
{
    _ws = new ClientWebSocket();
    _ws.Options.SetRequestHeader("Authorization", $"Bearer {_config.ApiKey}");
    _ws.Options.SetRequestHeader("X-Connector-Version", "0.1.0");
    _ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(_config.HeartbeatIntervalSeconds);

    // Add client certificate for mTLS
    if (!string.IsNullOrEmpty(_config.ClientCertificatePath))
    {
        var cert = new X509Certificate2(
            _config.ClientCertificatePath,
            _config.ClientCertificatePassword,
            X509KeyStorageFlags.EphemeralKeySet
        );
        _ws.Options.ClientCertificates.Add(cert);
        _logger.Information("Client certificate loaded: {Thumbprint}", cert.Thumbprint);
    }

    var uri = new Uri(_config.TunnelEndpoint);
    await _ws.ConnectAsync(uri, ct);
    // ...
}
```

### Anti-Patterns to Avoid
- **Skipping WAF rule and only checking in Worker code:** The WAF rule blocks unauthenticated requests at the edge before Worker invocation. Without it, every request (even without a cert) invokes the Worker and costs compute.
- **Storing private keys in appsettings.json:** Private keys must never be in config files. Use PFX file path + password (password from DPAPI or environment variable), or Windows Certificate Store.
- **Using ServerCertificateCustomValidationCallback to bypass validation:** This would defeat SEC-02. The .NET connector must validate Cloudflare's server certificate against the system trust store.
- **Creating one CA per org:** Use a single Cloudflare-managed CA. Issue per-org client certificates signed by that CA. The cert serial/fingerprint identifies the org, not the CA.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Certificate Authority | Custom PKI infrastructure | Cloudflare Managed CA | PKI is extremely complex; certificate lifecycle, revocation, CRL distribution |
| TLS termination | Custom TLS proxy | Cloudflare Edge (API Shield) | Cloudflare terminates TLS at edge; validates client certs natively |
| Certificate validation | Custom cert validation logic in Worker | WAF rule + `cf.tlsClientAuth` | Cloudflare validates cert chain, expiry, revocation automatically |
| Certificate storage on Windows | Custom encryption for cert files | DPAPI / Windows Certificate Store | OS-level secure storage; handles key protection |

**Key insight:** Cloudflare handles all the hard PKI work (CA management, certificate chain validation, revocation checking, CRL). The Worker only needs to read the validation result from `cf.tlsClientAuth` and map the cert to an org.

## Common Pitfalls

### Pitfall 1: Confusing Workers mTLS Binding with API Shield mTLS
**What goes wrong:** Workers mTLS binding (`mtls_certificates` in wrangler.toml) is for Workers making OUTBOUND requests to external services that require client certs. API Shield mTLS is for validating INCOMING client certificates. The connector connects TO Cloudflare (incoming), so API Shield is the correct feature.
**Why it happens:** Both features mention "mTLS" and "Workers." Documentation is separate but the naming is confusing.
**How to avoid:** Use API Shield / Client Certificates (SSL/TLS section in dashboard) for incoming mTLS. The `mtls_certificates` wrangler.toml binding is NOT needed.
**Warning signs:** If you find yourself adding `mtls_certificates` to ws-gateway's wrangler.toml, you are using the wrong feature.

### Pitfall 2: tlsClientAuth Fields Are Strings, Not Booleans
**What goes wrong:** Code checks `if (cf.tlsClientAuth.certPresented)` expecting a boolean, but `certPresented` is the string `'0'` or `'1'`, and `certVerified` is `'SUCCESS'`, `'FAILED:reason'`, or `'NONE'`. String `'0'` is truthy in JavaScript.
**Why it happens:** Cloudflare documentation shows types inconsistently. The Workers types may show `boolean` but the runtime values are strings.
**How to avoid:** Always compare as strings: `certPresented === '1'` and `certVerified === 'SUCCESS'`. Add explicit type assertions.
**Warning signs:** All requests pass cert validation even when no cert is presented.

### Pitfall 3: mTLS Must Be Enabled Per-Hostname Before WAF Rules Work
**What goes wrong:** You create a WAF rule checking `cf.tls_client_auth.cert_verified` but forget to enable mTLS on the `ws.apura.xyz` hostname. Cloudflare never asks clients for certificates, so `certPresented` is always `'0'` and the WAF rule blocks all traffic.
**Why it happens:** mTLS hostname enablement and WAF rules are configured in different dashboard sections.
**How to avoid:** Enable mTLS on `ws.apura.xyz` FIRST (SSL/TLS > Client Certificates > Hosts > Edit), THEN create the WAF rule.
**Warning signs:** All connector requests are blocked after deploying the WAF rule. `certPresented` is always `'0'`.

### Pitfall 4: .NET ClientWebSocket Certificate Loading on Linux
**What goes wrong:** The connector targets .NET 8 and may run on Linux (Docker, CI). `X509Certificate2` with PFX works differently on Linux -- private key file permissions matter, and the `EphemeralKeySet` flag behaves differently.
**Why it happens:** The connector is designed for Windows (Windows Service), but tests may run on Linux CI.
**How to avoid:** Use `X509KeyStorageFlags.EphemeralKeySet` for cross-platform compatibility. For Windows production, prefer the Windows Certificate Store (`StoreLocation.LocalMachine`).
**Warning signs:** Tests pass on Windows, fail on Linux CI with "The key does not exist" errors.

### Pitfall 5: WAF Rule Blocks Internal Service Binding Calls
**What goes wrong:** The WAF rule blocks ALL requests to `ws.apura.xyz` without a client cert, including internal service binding calls from api-gateway to ws-gateway. Service bindings don't go through Cloudflare's edge/WAF, so this should not happen -- but if the rule is overly broad (hostname-only instead of path-scoped), it could interfere.
**Why it happens:** Misunderstanding of service binding routing (internal) vs external routing (through edge).
**How to avoid:** Scope the WAF rule to `http.request.uri.path eq "/agent/connect"` AND `not cf.tls_client_auth.cert_verified`. Internal service binding calls to `/query/execute`, `/connector/status/*`, `/schema/sync/*` bypass the edge entirely.
**Warning signs:** API gateway calls to ws-gateway start failing after WAF rule deployment.

## Code Examples

### D1 Migration: connector_certificates table
```sql
-- migrations/0006_connector_certificates.sql
CREATE TABLE connector_certificates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  cert_serial TEXT NOT NULL UNIQUE,
  cert_fingerprint_sha256 TEXT NOT NULL,
  cert_subject_dn TEXT,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_connector_certs_org ON connector_certificates(org_id);
CREATE INDEX idx_connector_certs_serial ON connector_certificates(cert_serial);
```

### TypeScript: tlsClientAuth Type Definition
```typescript
// In ws-gateway/src/types.ts
export interface TlsClientAuth {
  certPresented: '0' | '1';
  certVerified: string; // 'SUCCESS' | 'FAILED:reason' | 'NONE'
  certSerial: string;
  certFingerprintSHA1: string;
  certFingerprintSHA256: string;
  certSubjectDN: string;
  certSubjectDNLegacy: string;
  certSubjectDNRFC2253: string;
  certIssuerDN: string;
  certIssuerDNLegacy: string;
  certIssuerDNRFC2253: string;
  certIssuerSKI: string;
  certIssuerSerial: string;
  certNotBefore: string;
  certNotAfter: string;
  certSKI: string;
  certRevoked: '0' | '1';
}
```

### Worker: mTLS Validation in ws-gateway/src/index.ts
```typescript
// Source: Cloudflare Workers request.cf documentation
if (url.pathname === '/agent/connect') {
  const cf = (request as any).cf as { tlsClientAuth?: TlsClientAuth } | undefined;

  // Try mTLS authentication first
  let orgId: string | undefined;

  if (cf?.tlsClientAuth?.certPresented === '1') {
    if (cf.tlsClientAuth.certVerified !== 'SUCCESS') {
      return Response.json(
        { error: 'Invalid client certificate' },
        { status: 403 }
      );
    }
    // Look up org by certificate serial
    const certResult = await db
      .prepare('SELECT org_id FROM connector_certificates WHERE cert_serial = ? AND revoked_at IS NULL')
      .bind(cf.tlsClientAuth.certSerial)
      .first<{ org_id: string }>();

    if (certResult) {
      orgId = certResult.org_id;
    }
  }

  // Fall back to API key auth if no cert or cert not in DB
  if (!orgId) {
    const authHeader = request.headers.get('Authorization') ?? '';
    const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!apiKey) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    const keyResult = await validateAgentApiKey(apiKey, env.DB);
    if (!keyResult.valid || !keyResult.orgId) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    orgId = keyResult.orgId;
  }

  // Route to Durable Object
  const id = env.CONNECTOR.idFromName(orgId);
  const stub = env.CONNECTOR.get(id);
  return stub.fetch('http://do/agent/connect', {
    headers: {
      'Upgrade': 'websocket',
      'X-Org-Id': orgId,
      'X-Connector-Version': request.headers.get('X-Connector-Version') ?? 'unknown',
    },
  });
}
```

### .NET: ConnectorConfig with Certificate Fields
```csharp
// Add to ConnectorConfig.cs
public class ConnectorConfig
{
    // ... existing fields ...
    public string? ClientCertificatePath { get; set; }      // Path to PFX file
    public string? ClientCertificatePassword { get; set; }  // PFX password
    public string? ClientCertificateThumbprint { get; set; } // For Windows store lookup
}
```

### .NET: Server Certificate Validation (SEC-02)
```csharp
// In CloudTunnelService.ConnectAndRunAsync
// DO NOT add this line -- it bypasses server cert validation:
// _ws.Options.RemoteCertificateValidationCallback = (_, _, _, _) => true; // NEVER DO THIS

// .NET validates server certificates by default using the OS trust store.
// Cloudflare serves valid TLS certificates on ws.apura.xyz.
// No additional code needed for SEC-02 -- just verify the bypass is NOT present.
```

### WAF Rule Expression
```
(http.request.uri.path eq "/agent/connect") and (not cf.tls_client_auth.cert_verified)
```
Action: **Block**

This blocks only unauthenticated requests to the agent connect endpoint. All other paths (health, internal routes) are unaffected.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workers outbound mTLS binding | API Shield incoming mTLS | 2023 (API Shield mTLS GA) | Correct feature for validating inbound client certs |
| Custom CA + cert management | Cloudflare Managed CA | Available since 2022 | No need for external PKI; certs managed via dashboard/API |
| API key only auth | API key + mTLS dual auth | This phase | Transport-layer security in addition to application-layer |

**Deprecated/outdated:**
- Workers mTLS binding: NOT deprecated, but is for outbound requests only -- not applicable to this use case
- API Shield is the correct feature for incoming mTLS validation

## Certificate Provisioning Workflow

### Per-Organization Certificate Lifecycle
```
1. Admin creates org in Apura
2. Generate CSR (OpenSSL or programmatic)
   openssl req -new -newkey rsa:2048 -nodes \
     -keyout org-{slug}.key -out org-{slug}.csr \
     -subj "/CN={org-slug}.connector.apura.xyz/O=Apura/OU={org-id}"
3. Submit CSR to Cloudflare API:
   POST /zones/{zone_id}/client_certificates
   Body: { "csr": "<pem>", "validity_days": 3650 }
4. Store returned cert serial + fingerprint in connector_certificates table
5. Package cert (PFX) for connector:
   openssl pkcs12 -export -out org-{slug}.pfx \
     -inkey org-{slug}.key -in org-{slug}.crt
6. Deliver PFX + password to customer (secure channel)
7. Customer configures connector appsettings.json:
   { "Connector": { "ClientCertificatePath": "certs/org.pfx", "ClientCertificatePassword": "..." } }
```

### Certificate Revocation
```
1. PATCH /zones/{zone_id}/client_certificates/{cert_id} with status "revoke"
2. UPDATE connector_certificates SET revoked_at = datetime('now') WHERE cert_serial = ?
3. WAF rule + cf.tls_client_auth.cert_revoked handles enforcement
```

## Open Questions

1. **Certificate delivery to customers**
   - What we know: PFX files need to reach on-premise installations securely
   - What's unclear: Delivery mechanism (download from dashboard? email? MSI installer bundles cert?)
   - Recommendation: For v1, manual delivery (admin downloads PFX, provides to customer). Phase 10 (Connector Packaging) can bundle cert provisioning into MSI installer.

2. **Certificate rotation policy**
   - What we know: Cloudflare allows up to 3650-day validity
   - What's unclear: Whether to set short-lived certs (90 days) with auto-rotation or long-lived (10 years)
   - Recommendation: Use 3650-day (10-year) certs for v1 simplicity. On-premise connectors at construction companies are hard to update. Build rotation support but don't mandate frequent rotation yet.

3. **WAF rule deployment timing**
   - What we know: WAF rule will block all connectors without certificates
   - What's unclear: How to coordinate deploying the WAF rule with distributing certs to all existing connectors
   - Recommendation: Deploy Worker code changes first (dual-auth), then distribute certificates, then enable WAF rule last. Keep dual-auth for at least one release cycle.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing in project) + manual Cloudflare verification |
| Config file | vitest.config.ts (workspace-level) |
| Quick run command | `cd packages/ws-gateway && npx vitest run --reporter=verbose` |
| Full suite command | `npx turbo test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01a | Worker reads tlsClientAuth and identifies org | unit | `cd packages/ws-gateway && npx vitest run src/auth/cert-auth.test.ts -x` | Wave 0 |
| SEC-01b | Dual-auth accepts API key when no cert | unit | `cd packages/ws-gateway && npx vitest run src/auth/cert-auth.test.ts -x` | Wave 0 |
| SEC-01c | WAF rule blocks uncertified requests | manual-only | Dashboard verification + curl test | N/A (Cloudflare infrastructure) |
| SEC-01d | connector_certificates D1 migration | smoke | `npx wrangler d1 migrations apply apura-main --local` | Wave 0 |
| SEC-02a | .NET connector does NOT bypass server cert validation | unit (grep/audit) | `grep -r 'RemoteCertificateValidationCallback\|ServerCertificateCustomValidationCallback' connector/` | Wave 0 |
| SEC-02b | .NET connector loads client cert from PFX | unit | `cd connector && dotnet test --filter CertificateLoader` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/ws-gateway && npx vitest run`
- **Per wave merge:** `npx turbo test`
- **Phase gate:** Full suite green + manual WAF rule verification before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ws-gateway/src/auth/cert-auth.test.ts` -- covers SEC-01a, SEC-01b
- [ ] `connector/test/ApuraConnector.Core.Tests/CertificateLoaderTests.cs` -- covers SEC-02b
- [ ] `migrations/0006_connector_certificates.sql` -- migration file needed

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers Request API - tlsClientAuth fields](https://developers.cloudflare.com/workers/runtime-apis/request/) - Complete field list for `request.cf.tlsClientAuth`
- [Cloudflare Client Certificates (mTLS)](https://developers.cloudflare.com/ssl/client-certificates/) - CA management, certificate creation
- [Cloudflare API Shield mTLS](https://developers.cloudflare.com/api-shield/security/mtls/) - Incoming mTLS enforcement
- [Cloudflare API Shield mTLS Configuration](https://developers.cloudflare.com/api-shield/security/mtls/configure/) - WAF rule setup
- [Cloudflare Enable mTLS](https://developers.cloudflare.com/ssl/client-certificates/enable-mtls/) - Hostname enablement
- [Cloudflare API: Create Client Certificate](https://developers.cloudflare.com/api/resources/client_certificates/methods/create/) - API endpoint for cert provisioning
- [.NET ClientWebSocketOptions.ClientCertificates](https://learn.microsoft.com/en-us/dotnet/api/system.net.websockets.clientwebsocketoptions.clientcertificates?view=net-8.0) - .NET client cert API

### Secondary (MEDIUM confidence)
- [Cloudflare Blog: mTLS for Workers](https://blog.cloudflare.com/mtls-workers/) - Background on Workers mTLS (outbound vs incoming distinction)
- [Cloudflare Blog: Mutual TLS for Workers](https://blog.cloudflare.com/mutual-tls-for-workers/) - Architecture patterns

### Tertiary (LOW confidence)
- [dotnet/runtime#21916](https://github.com/dotnet/runtime/issues/21916) - ClientWebSocket client certificate issues (older .NET Core; may be resolved in .NET 8)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All Cloudflare-native features, well-documented APIs
- Architecture: HIGH - Pattern follows Cloudflare's documented mTLS architecture for API Shield
- Pitfalls: HIGH - Verified against official docs (string vs boolean types, hostname enablement requirement)
- .NET integration: MEDIUM - `ClientWebSocket.Options.ClientCertificates` is documented but has had platform-specific issues in older .NET versions

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (30 days -- Cloudflare API Shield mTLS is stable/GA)
