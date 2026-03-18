import { Hono } from 'hono';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import type { Env, AppVariables } from '../types';
import { OrgDatabase } from '../services/org-db';
import {
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from '../utils/crypto';

const mfa = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// ---------------------------------------------------------------------------
// POST /setup — Begin MFA enrollment (authenticated)
// ---------------------------------------------------------------------------
mfa.post('/setup', async (c) => {
  const userId = c.get('userId');

  const user = await c.env.DB
    .prepare('SELECT email, mfa_enabled FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email: string; mfa_enabled: number }>();

  if (!user) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

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

  const qrCodeDataUrl = await QRCode.toDataURL(totp.toString());

  // Store pending setup in KV (10 min TTL)
  await c.env.CACHE.put(
    `mfa_setup:${userId}`,
    JSON.stringify({ secret: secret.base32 }),
    { expirationTtl: 600 },
  );

  return c.json({
    success: true,
    data: { qrCodeDataUrl, secret: secret.base32 },
  });
});

// ---------------------------------------------------------------------------
// POST /confirm — Verify TOTP code and enable MFA (authenticated)
// ---------------------------------------------------------------------------
mfa.post('/confirm', async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');

  // Read pending setup from KV
  const setupData = await c.env.CACHE.get(`mfa_setup:${userId}`);
  if (!setupData) {
    return c.json({ success: false, error: { code: 'NO_SETUP', message: 'No pending MFA setup. Call /setup first.' } }, 400);
  }

  const { secret } = JSON.parse(setupData) as { secret: string };

  const body = await c.req.json<{ code: string }>();
  if (!body.code) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Verification code required' } }, 400);
  }

  // Get user email for TOTP label
  const user = await c.env.DB
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email: string }>();

  if (!user) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  // Verify the TOTP code
  const totp = new OTPAuth.TOTP({
    issuer: 'Apura',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token: body.code, window: 1 });
  if (delta === null) {
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid verification code' } }, 400);
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes();
  const hashedCodes = await Promise.all(
    backupCodes.map(async (code) => ({
      id: crypto.randomUUID(),
      hash: await hashBackupCode(code),
    })),
  );

  // Encrypt TOTP secret for storage
  const encryptedSecret = await encryptSecret(secret, c.env.JWT_SECRET);
  const now = new Date().toISOString();

  // Batch: enable MFA + insert backup codes
  const statements: D1PreparedStatement[] = [
    c.env.DB
      .prepare('UPDATE users SET mfa_enabled = 1, totp_secret = ?, updated_at = ? WHERE id = ?')
      .bind(encryptedSecret, now, userId),
    ...hashedCodes.map(({ id, hash }) =>
      c.env.DB
        .prepare('INSERT INTO backup_codes (id, user_id, code_hash) VALUES (?, ?, ?)')
        .bind(id, userId, hash),
    ),
  ];
  await c.env.DB.batch(statements);

  // Clean up KV setup token
  await c.env.CACHE.delete(`mfa_setup:${userId}`);

  // Audit log
  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.logAudit('mfa.enabled', 'user', userId);

  return c.json({
    success: true,
    data: { backupCodes },
  });
});

// ---------------------------------------------------------------------------
// POST /disable — Disable own MFA (authenticated, requires valid code)
// ---------------------------------------------------------------------------
mfa.post('/disable', async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');

  const user = await c.env.DB
    .prepare('SELECT email, mfa_enabled, totp_secret FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email: string; mfa_enabled: number; totp_secret: string | null }>();

  if (!user || !user.mfa_enabled) {
    return c.json({ success: false, error: { code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled' } }, 400);
  }

  const body = await c.req.json<{ code: string }>();
  if (!body.code) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Verification code required' } }, 400);
  }

  // Verify TOTP code or backup code before allowing disable
  let valid = false;

  if (user.totp_secret) {
    const secret = await decryptSecret(user.totp_secret, c.env.JWT_SECRET);
    const totp = new OTPAuth.TOTP({
      issuer: 'Apura',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    valid = totp.validate({ token: body.code, window: 1 }) !== null;
  }

  // Try backup code if TOTP did not match
  if (!valid) {
    const { results: codes } = await c.env.DB
      .prepare('SELECT id, code_hash FROM backup_codes WHERE user_id = ? AND used_at IS NULL')
      .bind(userId)
      .all<{ id: string; code_hash: string }>();

    if (codes) {
      for (const row of codes) {
        if (await verifyBackupCode(body.code, row.code_hash)) {
          valid = true;
          break;
        }
      }
    }
  }

  if (!valid) {
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid verification code' } }, 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET mfa_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?').bind(now, userId),
    c.env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(userId),
  ]);

  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.logAudit('mfa.disabled', 'user', userId);

  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /reset/:userId — Admin resets another user's MFA (owner/admin only)
// ---------------------------------------------------------------------------
mfa.delete('/reset/:userId', async (c) => {
  const role = c.get('role');
  const requestingUserId = c.get('userId');
  const orgId = c.get('orgId');
  const targetUserId = c.req.param('userId');

  // Only owner or admin can reset MFA
  if (role !== 'owner' && role !== 'admin') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }

  // Cannot reset own MFA via this route
  if (targetUserId === requestingUserId) {
    return c.json({ success: false, error: { code: 'SELF_RESET', message: 'Use /disable to remove your own MFA' } }, 400);
  }

  // Verify target user belongs to same org
  const targetUser = await c.env.DB
    .prepare('SELECT id FROM users WHERE id = ? AND org_id = ?')
    .bind(targetUserId, orgId)
    .first();

  if (!targetUser) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET mfa_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?').bind(now, targetUserId),
    c.env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(targetUserId),
  ]);

  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.logAudit('mfa.admin_reset', 'user', targetUserId);

  return c.json({ success: true });
});

export default mfa;
