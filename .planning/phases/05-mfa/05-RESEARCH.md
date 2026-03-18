# Phase 5: MFA - Research

**Researched:** 2026-03-18
**Domain:** TOTP-based multi-factor authentication with recovery codes and org enforcement
**Confidence:** HIGH

## Summary

Phase 5 adds TOTP-based MFA to the existing JWT auth flow. The current login flow (email/password -> JWT tokens) must be modified to support a two-phase login when MFA is enabled: first password verification returns a temporary MFA token, then TOTP verification exchanges that token for real JWT access/refresh tokens. This prevents issuing full auth tokens before MFA is verified.

The implementation requires a D1 migration to add MFA columns to the users table and an `mfa_required` column to organizations, new API routes for MFA setup/verification/admin-reset, modifications to the login route, and a frontend MFA setup page plus a TOTP verification step in the login flow. The `otpauth` library (9.5.0) handles TOTP generation/validation using Web Crypto (Workers-compatible), and `qrcode` (1.5.4) generates QR codes for authenticator app setup.

**Primary recommendation:** Implement two-phase login with temporary MFA challenge tokens stored in KV (5-minute TTL), TOTP secrets encrypted at rest using AES-256-GCM with a key derived from JWT_SECRET, and 10 hashed backup codes generated during setup.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MFA-01 | User can enable TOTP-based MFA with QR code setup | otpauth TOTP class generates secrets and otpauth:// URIs; qrcode converts URI to data URL for QR display; new `/api/mfa/setup` and `/api/mfa/confirm` routes |
| MFA-02 | Login requires 6-digit TOTP code when MFA is enabled (30s window +/- 1 step) | otpauth `validate({ token, window: 1 })` handles clock drift; login route returns `mfa_required` response instead of tokens; new `/auth/mfa/verify` route exchanges MFA challenge token + TOTP code for real tokens |
| MFA-03 | 10 single-use backup codes generated on MFA setup, stored hashed | Generate codes via `crypto.getRandomValues()`, hash with scrypt (existing `hashPassword` utility), store in `backup_codes` table; mark used on consumption |
| MFA-04 | Org admin can require MFA for all org members | `organizations.mfa_required` column; auth middleware or login route checks org setting; users without MFA redirected to setup |
| MFA-05 | Admin can reset MFA for a locked-out user | Protected route `DELETE /api/mfa/reset/:userId` for owner/admin roles; clears totp_secret, mfa_enabled, and backup_codes; audit logged |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| otpauth | 9.5.0 | TOTP generation and verification (RFC 6238) | Web Crypto compatible (runs in Workers), under 4KB, actively maintained, generates otpauth:// URIs |
| qrcode | 1.5.4 | QR code generation for authenticator setup | Generates data URLs from otpauth:// URIs; works in Workers via `toDataURL()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @noble/hashes | (already installed) | Scrypt hashing for backup codes | Reuse existing password hashing infrastructure for backup code hashing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| otpauth | otplib | Heavier plugin architecture, less recent maintenance |
| otpauth | speakeasy | Archived/unmaintained repository |
| qrcode (server-side) | Client-side QR generation | Server-side is simpler -- single API response contains QR data URL + secret |

**Installation:**
```bash
cd packages/api-gateway && npm install otpauth qrcode && npm install -D @types/qrcode
```

**Version verification:** otpauth 9.5.0 and qrcode 1.5.4 confirmed via `npm view` on 2026-03-18.

## Architecture Patterns

### D1 Migration (0005_mfa.sql)

```sql
-- MFA columns on users table
ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_secret TEXT;  -- AES-256-GCM encrypted, base64 encoded

-- Org-level MFA enforcement
ALTER TABLE organizations ADD COLUMN mfa_required INTEGER NOT NULL DEFAULT 0;

-- Backup codes table (separate for clean management)
CREATE TABLE backup_codes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_backup_codes_user_id ON backup_codes(user_id);
```

### OrgDatabase Column Allowlists Must Be Updated

The `OrgDatabase` class has strict column allowlists. These MUST be updated:
- `USER_COLUMNS`: add `'mfa_enabled'`, `'totp_secret'`
- `ORG_COLUMNS`: add `'mfa_required'`

### Recommended API Route Structure

```
packages/api-gateway/src/routes/
  mfa.ts           # New file: MFA setup, confirm, disable, admin reset
  auth.ts          # Modified: login returns mfa_required when MFA enabled
                   # New: POST /auth/mfa/verify (exchanges challenge token + TOTP for real tokens)
```

### Pattern 1: Two-Phase Login Flow

**What:** When MFA is enabled, login returns a temporary challenge token instead of real JWT tokens. The client must then submit the TOTP code with this challenge token to get real tokens.

**When to use:** Every login attempt for users with `mfa_enabled = 1`.

**Flow:**
```
1. POST /auth/login { email, password }
   -> If mfa_enabled:
      Return { mfaRequired: true, mfaToken: "<temp-token>" }
      Store in KV: mfa_challenge:<token> -> { userId, orgId, role } with 5-min TTL
   -> If NOT mfa_enabled:
      Return { accessToken, refreshToken } (existing behavior)

2. POST /auth/mfa/verify { mfaToken, totpCode }
   -> Validate mfaToken from KV
   -> Verify TOTP code OR backup code
   -> Delete KV challenge token
   -> Issue real JWT access + refresh tokens (same as current login success path)
```

**Why temporary token:** Prevents issuing full auth tokens before MFA verification. The mfaToken is NOT a JWT -- it is an opaque random string stored in KV with a 5-minute TTL. This avoids creating a "half-authenticated" JWT that could be misused.

### Pattern 2: TOTP Secret Encryption at Rest

**What:** TOTP secrets are encrypted before storage in D1 using AES-256-GCM.

**Implementation:**
```typescript
// Derive encryption key from JWT_SECRET (already available in Env)
async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('apura-mfa-v1'), info: new Uint8Array() },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptSecret(plaintext: string, jwtSecret: string): Promise<string> {
  const key = await deriveEncryptionKey(jwtSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  // Encode as: base64(iv + ciphertext)
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptSecret(encrypted: string, jwtSecret: string): Promise<string> {
  const key = await deriveEncryptionKey(jwtSecret);
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}
```

### Pattern 3: TOTP Verification with otpauth

```typescript
import * as OTPAuth from 'otpauth';

function createTOTP(secret: string, userEmail: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: 'Apura',
    label: userEmail,
    algorithm: 'SHA1',        // SHA1 is standard for TOTP, supported by all authenticator apps
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

// Setup: generate secret and QR
function generateMfaSetup(userEmail: string) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'Apura',
    label: userEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,           // Store encrypted in D1
    uri: totp.toString(),            // otpauth://totp/Apura:user@example.com?...
  };
}

// Verify: check TOTP code with +/- 1 step window
function verifyTOTP(secret: string, token: string, userEmail: string): boolean {
  const totp = createTOTP(secret, userEmail);
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;  // null = invalid, number = valid (offset from current period)
}
```

### Pattern 4: Backup Code Generation and Verification

```typescript
// Generate 10 backup codes: 8 chars alphanumeric each
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/1/O/0 confusion
  for (let i = 0; i < 10; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let code = '';
    for (const b of bytes) {
      code += chars[b % chars.length];
    }
    // Format as XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

// Hash each code with scrypt (reuse existing hashPassword)
// Verify by trying each unused code hash against input
```

### Anti-Patterns to Avoid
- **Issuing real JWTs before MFA verification:** Creates a "half-authenticated" state exploitable by API callers who skip the MFA step.
- **Storing TOTP secret in plaintext:** Database compromise exposes all TOTP secrets, allowing attackers to generate valid codes.
- **Storing backup codes in plaintext:** Same risk as plaintext TOTP secrets.
- **Using bcrypt for backup codes:** Too slow for checking 10 codes sequentially. Use the existing scrypt with a lower N factor, or use SHA-256 with a salt (acceptable since backup codes have high entropy).
- **Skipping rate limiting on MFA verification:** 6-digit TOTP has only 1M combinations. Without rate limiting, brute force is feasible in minutes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP generation/validation | Custom HMAC-SHA1 time-based code generator | otpauth library | RFC 6238 edge cases (time drift, algorithm variants, URI format) are tricky |
| QR code generation | Canvas-based QR renderer | qrcode library | QR encoding has error correction levels, version detection, encoding modes |
| Backup code formatting | Random string generator | Structured generation with ambiguity-avoiding charset | Users misread I/1/O/0; format XXXX-XXXX improves usability |

**Key insight:** TOTP looks simple (it is just HMAC + time counter) but the ecosystem integration (authenticator app URI format, QR encoding, time window handling, secret encoding) has many subtle requirements that otpauth handles correctly.

## Common Pitfalls

### Pitfall 1: MFA Without Recovery Locks Users Out Permanently
**What goes wrong:** TOTP MFA implemented without backup codes. User loses phone or wipes authenticator app. No recovery path. For Primavera/construction users (non-technical), this is catastrophic.
**Why it happens:** Focus on TOTP enrollment, recovery is an afterthought.
**How to avoid:** Generate 10 backup codes during MFA setup. Show ONCE, require user acknowledgment (checkbox). Allow org admin to reset MFA for locked-out users. Log admin reset in audit_log.
**Warning signs:** Users enrolling but not downloading/acknowledging backup codes.

### Pitfall 2: MFA Challenge Token Reuse
**What goes wrong:** Attacker intercepts MFA challenge token and replays it later with a brute-forced TOTP code.
**How to avoid:** Delete KV challenge token immediately after successful verification. Set 5-minute TTL. Rate limit `/auth/mfa/verify` to 5 attempts per challenge token (track in KV).

### Pitfall 3: TOTP Secret Stored Plaintext in D1
**What goes wrong:** Database compromise (backup leak, SQL injection) exposes all TOTP secrets, allowing attackers to generate valid codes for every user.
**How to avoid:** Encrypt TOTP secrets with AES-256-GCM using a key derived from JWT_SECRET via HKDF. All encryption uses Web Crypto API (Workers-compatible).

### Pitfall 4: Org MFA Enforcement Without Grace Period
**What goes wrong:** Admin enables org-wide MFA requirement. All users without MFA are immediately locked out on next login.
**How to avoid:** When org MFA is enabled, users without MFA set up should be redirected to the MFA setup flow after password verification (not blocked). The two-phase login naturally supports this: after password verification succeeds and `org.mfa_required = true` but `user.mfa_enabled = false`, return a response directing the user to set up MFA.

### Pitfall 5: Backup Code Verification is Too Slow
**What goes wrong:** Checking a submitted backup code against 10 scrypt-hashed codes takes 10x the time of a single password verification (scrypt is intentionally slow).
**How to avoid:** Use SHA-256 + per-code salt for backup codes instead of scrypt. Backup codes have high entropy (8 chars from 32-char alphabet = ~40 bits), so fast hashing is acceptable. Alternatively, use scrypt with a much lower N (e.g., 1024 instead of 16384).

### Pitfall 6: Not Rate-Limiting MFA Verification Endpoint
**What goes wrong:** 6-digit TOTP = 1,000,000 combinations. At 1000 requests/second (feasible against Workers), brute force in ~17 minutes. Even with 30s window, 3 valid periods = 3M attempts needed, still feasible.
**How to avoid:** Rate limit `/auth/mfa/verify` to 5 attempts per challenge token. After 5 failures, invalidate the challenge token entirely. The existing auth rate limiter (10/min per IP) helps but is not sufficient -- add per-token attempt counting in KV.

## Code Examples

### MFA Setup Flow (API Route)

```typescript
// POST /api/mfa/setup (authenticated)
// Returns: { secret, qrCodeDataUrl, backupCodes }
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

mfa.post('/setup', async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB
    .prepare('SELECT email, mfa_enabled FROM users WHERE id = ?')
    .bind(userId).first();

  if (user.mfa_enabled) {
    return c.json({ success: false, error: { code: 'MFA_ALREADY_ENABLED', message: 'MFA is already enabled' } }, 400);
  }

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'Apura',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  // Store setup-in-progress in KV (not D1 yet -- user must confirm with a valid code)
  await c.env.CACHE.put(
    `mfa_setup:${userId}`,
    JSON.stringify({ secret: secret.base32 }),
    { expirationTtl: 600 } // 10 min to complete setup
  );

  return c.json({
    success: true,
    data: { qrCodeDataUrl, secret: secret.base32 },  // secret shown for manual entry
  });
});
```

### MFA Confirm Setup (API Route)

```typescript
// POST /api/mfa/confirm { code: "123456" }
// Verifies user can generate valid codes before enabling MFA
mfa.post('/confirm', async (c) => {
  const userId = c.get('userId');
  const { code } = await c.req.json<{ code: string }>();

  // Get pending setup from KV
  const setupData = await c.env.CACHE.get(`mfa_setup:${userId}`);
  if (!setupData) {
    return c.json({ success: false, error: { code: 'NO_SETUP', message: 'No pending MFA setup' } }, 400);
  }

  const { secret } = JSON.parse(setupData);
  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first();

  // Verify the code
  const totp = new OTPAuth.TOTP({
    issuer: 'Apura',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid verification code' } }, 400);
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes(); // 10 codes, XXXX-XXXX format
  const hashedCodes = await Promise.all(
    backupCodes.map(async (code) => ({
      id: crypto.randomUUID(),
      hash: await hashBackupCode(code),
    }))
  );

  // Encrypt secret and store in D1
  const encryptedSecret = await encryptSecret(secret, c.env.JWT_SECRET);

  // Batch: update user + insert backup codes
  const statements = [
    c.env.DB.prepare('UPDATE users SET mfa_enabled = 1, totp_secret = ?, updated_at = ? WHERE id = ?')
      .bind(encryptedSecret, new Date().toISOString(), userId),
    ...hashedCodes.map(({ id, hash }) =>
      c.env.DB.prepare('INSERT INTO backup_codes (id, user_id, code_hash) VALUES (?, ?, ?)')
        .bind(id, userId, hash)
    ),
  ];
  await c.env.DB.batch(statements);

  // Clean up KV
  await c.env.CACHE.delete(`mfa_setup:${userId}`);

  // Audit log
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.logAudit('mfa.enabled', 'user', userId);

  return c.json({
    success: true,
    data: { backupCodes },  // Show ONCE, user must save
  });
});
```

### Modified Login Route (Two-Phase)

```typescript
// In auth.ts login handler, after password verification succeeds:
if (user.mfa_enabled) {
  // Issue temporary MFA challenge token (NOT a JWT)
  const mfaToken = generateJti(); // reuse existing random token generator
  await c.env.CACHE.put(
    `mfa_challenge:${mfaToken}`,
    JSON.stringify({ userId: user.id, orgId: user.org_id, role: user.role }),
    { expirationTtl: 300 } // 5 minutes
  );

  return c.json({
    success: true,
    data: {
      mfaRequired: true,
      mfaToken,
    },
  });
}

// Otherwise, continue with existing token issuance...
```

### MFA Verify Route (Completes Two-Phase Login)

```typescript
// POST /auth/mfa/verify { mfaToken, code }
auth.post('/mfa/verify', async (c) => {
  const { mfaToken, code } = await c.req.json<{ mfaToken: string; code: string }>();

  // Rate limit: max 5 attempts per challenge
  const attemptsKey = `mfa_attempts:${mfaToken}`;
  const attempts = parseInt(await c.env.CACHE.get(attemptsKey) ?? '0', 10);
  if (attempts >= 5) {
    await c.env.CACHE.delete(`mfa_challenge:${mfaToken}`);
    return c.json({ success: false, error: { code: 'MFA_LOCKED', message: 'Too many attempts. Please log in again.' } }, 429);
  }

  // Validate challenge token
  const challengeData = await c.env.CACHE.get(`mfa_challenge:${mfaToken}`);
  if (!challengeData) {
    return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'MFA session expired' } }, 401);
  }

  const { userId, orgId, role } = JSON.parse(challengeData);

  // Get user's TOTP secret
  const user = await c.env.DB.prepare('SELECT email, totp_secret FROM users WHERE id = ?')
    .bind(userId).first();
  const secret = await decryptSecret(user.totp_secret, c.env.JWT_SECRET);

  // Try TOTP first
  const totp = new OTPAuth.TOTP({
    issuer: 'Apura',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  let valid = totp.validate({ token: code, window: 1 }) !== null;

  // If TOTP fails, try backup codes
  if (!valid) {
    valid = await tryBackupCode(c.env.DB, userId, code);
  }

  if (!valid) {
    await c.env.CACHE.put(attemptsKey, String(attempts + 1), { expirationTtl: 300 });
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid verification code' } }, 401);
  }

  // Delete challenge token (single use)
  await c.env.CACHE.delete(`mfa_challenge:${mfaToken}`);
  await c.env.CACHE.delete(attemptsKey);

  // Issue real JWT tokens (same as existing login success path)
  // ... existing token creation code from login handler ...
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| speakeasy library | otpauth library | speakeasy archived ~2022 | otpauth is actively maintained, Web Crypto compatible |
| Plaintext TOTP secrets | Encrypted at rest with AES-GCM | Industry standard post-2020 | Required for compliance; database breach does not expose MFA |
| MFA with no recovery | MFA + backup codes + admin reset | Always best practice | Non-technical users (construction PMs) cannot self-recover without these |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `packages/api-gateway/vitest.config.ts` |
| Quick run command | `cd packages/api-gateway && npx vitest run --reporter=verbose` |
| Full suite command | `npm run test` (Turbo runs all workspaces) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MFA-01 | TOTP setup returns QR code and secret; confirm verifies code and stores encrypted secret | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/mfa.test.ts -t "setup"` | No - Wave 0 |
| MFA-02 | Login returns mfaRequired when MFA enabled; /auth/mfa/verify exchanges challenge token + TOTP for real tokens | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/mfa.test.ts -t "verify"` | No - Wave 0 |
| MFA-03 | 10 backup codes generated, stored hashed, single-use consumption marks used_at | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/mfa.test.ts -t "backup"` | No - Wave 0 |
| MFA-04 | Org mfa_required forces MFA setup for users without MFA | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/mfa.test.ts -t "enforcement"` | No - Wave 0 |
| MFA-05 | Admin reset clears totp_secret, mfa_enabled, backup_codes | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/mfa.test.ts -t "reset"` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/api-gateway && npx vitest run --reporter=verbose`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api-gateway/src/routes/__tests__/mfa.test.ts` -- covers MFA-01 through MFA-05
- [ ] `packages/api-gateway/src/utils/__tests__/crypto.test.ts` -- covers AES-GCM encrypt/decrypt round-trip
- [ ] otpauth + qrcode + @types/qrcode installed in api-gateway workspace

## Open Questions

1. **QR code generation: server-side vs client-side?**
   - What we know: `qrcode.toDataURL()` works in Workers (pure JS, no canvas dependency with the default SVG mode). Server-side is simpler -- one API call returns everything needed.
   - Recommendation: Generate QR server-side in the `/api/mfa/setup` endpoint. Return data URL in response. Avoids adding qrcode dependency to frontend bundle.

2. **Backup code hashing: scrypt vs SHA-256?**
   - What we know: Backup codes have ~40 bits of entropy (8 chars from 32-char set). Scrypt checking 10 codes sequentially would be slow (~500ms total on Workers).
   - Recommendation: Use SHA-256 with a per-code random salt. High entropy of codes makes fast hashing acceptable. Store as `salt:hash` format.

3. **Should MFA setup page be accessible before email verification?**
   - What we know: Current schema has `email_verified` column. Research pitfall warns against MFA before email verification.
   - Recommendation: Require `email_verified = 1` before allowing MFA setup. Prevents accounts with unverified emails from adding MFA (attack vector: attacker signs up with victim's email, adds MFA, victim cannot recover).

## Sources

### Primary (HIGH confidence)
- otpauth npm registry -- version 9.5.0 verified, API confirmed via GitHub README
- qrcode npm registry -- version 1.5.4 verified
- Existing codebase analysis: auth.ts login flow, auth middleware, JWT utils, password.ts hashing, OrgDatabase service, D1 schema

### Secondary (MEDIUM confidence)
- [otpauth GitHub](https://github.com/hectorm/otpauth) -- TOTP constructor options, validate() API, Web Crypto support
- [5 Common TOTP Mistakes (Authgear)](https://www.authgear.com/post/5-common-totp-mistakes) -- pitfall patterns
- [MFA Best Practices (WorkOS)](https://workos.com/blog/mfa-best-practices) -- recovery code patterns, org enforcement

### Tertiary (LOW confidence)
- None -- all findings verified against library source or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- otpauth verified on npm, Workers-compatible (Web Crypto), used in project research
- Architecture: HIGH -- two-phase login is established pattern; code based on actual codebase analysis of auth.ts, middleware, JWT utils
- Pitfalls: HIGH -- verified against multiple MFA best-practice sources and project-specific concerns (non-technical Primavera users)

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain, libraries well-established)
