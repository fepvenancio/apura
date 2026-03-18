import { Hono } from 'hono';
import * as OTPAuth from 'otpauth';
import type { JWTPayload, SignupRequest, LoginRequest, RefreshRequest } from '@apura/shared';
import { PLAN_LIMITS, CACHE_TTL_SESSION, validateEmail, validateSlug } from '@apura/shared';
import type { Env, AppVariables } from '../types';
import { createJWT, verifyJWT, generateJti } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import { generateApiKey } from '../utils/api-key';
import { OrgDatabase } from '../services/org-db';
import { decryptSecret, verifyBackupCode } from '../utils/crypto';

const auth = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/** Access token lifetime: 1 hour. */
const ACCESS_TOKEN_TTL = 3600;
/** Refresh token lifetime: 7 days. */
const REFRESH_TOKEN_TTL = 7 * 24 * 3600;

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------
auth.post('/signup', async (c) => {
  const body = await c.req.json<SignupRequest>();

  // Validate input
  if (!body.email || !body.password || !body.organizationName || !body.slug) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: email, password, organizationName, slug' } }, 400);
  }

  if (!validateEmail(body.email)) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid email address' } }, 400);
  }

  if (body.password.length < 8) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' } }, 400);
  }

  if (!validateSlug(body.slug)) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid slug. Must be 3-50 lowercase alphanumeric characters and hyphens.' } }, 400);
  }

  if (!body.name || body.name.length < 1 || body.name.length > 100) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required (max 100 chars)' } }, 400);
  }

  // Check email uniqueness
  const existingUser = await c.env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(body.email)
    .first();

  if (existingUser) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email already registered' } }, 409);
  }

  // Check slug uniqueness
  const existingOrg = await c.env.DB
    .prepare('SELECT id FROM organizations WHERE slug = ?')
    .bind(body.slug)
    .first();

  if (existingOrg) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Organization slug already taken' } }, 409);
  }

  // Hash password and generate API key
  const passwordHash = await hashPassword(body.password);
  const apiKey = await generateApiKey();

  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const trialLimits = PLAN_LIMITS.trial;

  // Create org + user in D1 (batch for atomicity)
  const orgName = body.organizationName || (body as any).orgName || 'My Organization';
  if (orgName.length > 100) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Organization name too long (max 100 chars)' } }, 400);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO organizations (id, name, slug, plan, primavera_version, agent_api_key, agent_api_key_hash, max_users, max_queries_per_month, queries_this_month, billing_email, country, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      orgId,
      orgName,
      body.slug,
      'trial',
      'V10',
      apiKey.prefix,
      apiKey.hash,
      trialLimits.maxUsers,
      trialLimits.maxQueries,
      0,
      body.email,
      'PT',
      'Europe/Lisbon',
      now,
      now,
    ),
    c.env.DB.prepare(
      `INSERT INTO users (id, org_id, email, name, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(userId, orgId, body.email, body.name, passwordHash, 'owner', now, now),
    c.env.DB.prepare(
      `INSERT INTO consent_log (id, user_id, org_id, consent_type, policy_version, ip_address, user_agent, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      userId,
      orgId,
      'terms_and_privacy',
      'v1.0',
      c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('User-Agent') || 'unknown',
      now,
    ),
  ]);

  // Generate email verification token and enqueue verification email
  const verifyToken = generateJti();
  await c.env.CACHE.put(
    `email_verify:${verifyToken}`,
    JSON.stringify({ userId, orgId }),
    { expirationTtl: 24 * 3600 },
  );
  c.executionCtx.waitUntil(
    c.env.EMAIL_QUEUE.send({
      type: 'email_verification',
      to: [body.email],
      verifyUrl: `https://app.apura.xyz/verify-email/${verifyToken}`,
      userName: body.name,
    })
  );

  // Create JWT
  const jti = generateJti();
  const iat = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: userId,
    org: orgId,
    role: 'owner',
    jti,
    iat,
    exp: iat + ACCESS_TOKEN_TTL,
  };

  const accessToken = await createJWT(payload, c.env.JWT_SECRET);

  // Create refresh token
  const refreshJti = generateJti();
  const refreshPayload: JWTPayload = {
    sub: userId,
    org: orgId,
    role: 'owner',
    jti: refreshJti,
    iat,
    exp: iat + REFRESH_TOKEN_TTL,
  };
  const refreshToken = await createJWT(refreshPayload, c.env.JWT_SECRET);

  // Store sessions in KV
  await Promise.all([
    c.env.CACHE.put(`session:${jti}`, JSON.stringify({ userId, orgId }), { expirationTtl: ACCESS_TOKEN_TTL }),
    c.env.CACHE.put(`session:${refreshJti}`, JSON.stringify({ userId, orgId, type: 'refresh' }), { expirationTtl: REFRESH_TOKEN_TTL }),
  ]);

  return c.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
      org: {
        id: orgId,
        name: body.organizationName,
        slug: body.slug,
        plan: 'trial',
        agentApiKey: apiKey.key, // Show full key only on signup
        agentApiKeyPrefix: apiKey.prefix,
      },
      user: {
        userId,
        orgId,
        role: 'owner' as const,
        email: body.email,
      },
    },
  }, 201);
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
auth.post('/login', async (c) => {
  const body = await c.req.json<LoginRequest>();

  if (!body.email || !body.password) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email and password required' } }, 400);
  }

  // Find user by email (global lookup)
  const user = await c.env.DB
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(body.email)
    .first<{ id: string; org_id: string; email: string; name: string; password_hash: string; role: string; mfa_enabled: number }>();

  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, 401);
  }

  // Verify password
  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, 401);
  }

  // MFA two-phase login: if MFA enabled, return challenge token instead of real tokens
  if (user.mfa_enabled) {
    const mfaToken = generateJti();
    await c.env.CACHE.put(
      `mfa_challenge:${mfaToken}`,
      JSON.stringify({ userId: user.id, orgId: user.org_id, role: user.role }),
      { expirationTtl: 300 },
    );

    return c.json({
      success: true,
      data: {
        mfaRequired: true,
        mfaToken,
      },
    });
  }

  // Create access token
  const jti = generateJti();
  const iat = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: user.id,
    org: user.org_id,
    role: user.role as JWTPayload['role'],
    jti,
    iat,
    exp: iat + ACCESS_TOKEN_TTL,
  };
  const accessToken = await createJWT(payload, c.env.JWT_SECRET);

  // Create refresh token
  const refreshJti = generateJti();
  const refreshPayload: JWTPayload = {
    sub: user.id,
    org: user.org_id,
    role: user.role as JWTPayload['role'],
    jti: refreshJti,
    iat,
    exp: iat + REFRESH_TOKEN_TTL,
  };
  const refreshToken = await createJWT(refreshPayload, c.env.JWT_SECRET);

  // Store sessions in KV
  await Promise.all([
    c.env.CACHE.put(`session:${jti}`, JSON.stringify({ userId: user.id, orgId: user.org_id }), { expirationTtl: ACCESS_TOKEN_TTL }),
    c.env.CACHE.put(`session:${refreshJti}`, JSON.stringify({ userId: user.id, orgId: user.org_id, type: 'refresh' }), { expirationTtl: REFRESH_TOKEN_TTL }),
  ]);

  // Audit log
  const orgDb = new OrgDatabase(c.env.DB, user.org_id);
  await orgDb.logAudit('login', 'user', user.id, undefined, c.req.header('CF-Connecting-IP'));

  return c.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
      user: {
        userId: user.id,
        orgId: user.org_id,
        role: user.role,
        email: user.email,
      },
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------
auth.post('/refresh', async (c) => {
  const body = await c.req.json<RefreshRequest>();

  if (!body.refreshToken) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Refresh token required' } }, 400);
  }

  let payload: JWTPayload;
  try {
    payload = await verifyJWT(body.refreshToken, c.env.JWT_SECRET);
  } catch {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } }, 401);
  }

  // Check session validity
  const sessionKey = `session:${payload.jti}`;
  const session = await c.env.CACHE.get(sessionKey);
  if (!session) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Refresh token expired or revoked' } }, 401);
  }

  const sessionData = JSON.parse(session);
  if (sessionData.type !== 'refresh') {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token type' } }, 401);
  }

  // Get current user data (role may have changed)
  const user = await c.env.DB
    .prepare('SELECT id, org_id, role, email FROM users WHERE id = ? AND org_id = ?')
    .bind(payload.sub, payload.org)
    .first<{ id: string; org_id: string; role: string; email: string }>();

  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } }, 401);
  }

  // Issue new tokens
  const jti = generateJti();
  const iat = Math.floor(Date.now() / 1000);
  const newPayload: JWTPayload = {
    sub: user.id,
    org: user.org_id,
    role: user.role as JWTPayload['role'],
    jti,
    iat,
    exp: iat + ACCESS_TOKEN_TTL,
  };
  const accessToken = await createJWT(newPayload, c.env.JWT_SECRET);

  const refreshJti = generateJti();
  const refreshPayload: JWTPayload = {
    sub: user.id,
    org: user.org_id,
    role: user.role as JWTPayload['role'],
    jti: refreshJti,
    iat,
    exp: iat + REFRESH_TOKEN_TTL,
  };
  const refreshToken = await createJWT(refreshPayload, c.env.JWT_SECRET);

  await Promise.all([
    c.env.CACHE.put(`session:${jti}`, JSON.stringify({ userId: user.id, orgId: user.org_id }), { expirationTtl: ACCESS_TOKEN_TTL }),
    c.env.CACHE.put(`session:${refreshJti}`, JSON.stringify({ userId: user.id, orgId: user.org_id, type: 'refresh' }), { expirationTtl: REFRESH_TOKEN_TTL }),
  ]);

  // Revoke old refresh token AFTER new sessions are stored
  await c.env.CACHE.delete(sessionKey);

  return c.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
      user: {
        userId: user.id,
        orgId: user.org_id,
        role: user.role,
        email: user.email,
      },
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/verify-email
// ---------------------------------------------------------------------------
auth.post('/verify-email', async (c) => {
  const body = await c.req.json<{ token: string }>();

  if (!body.token) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Token required' } }, 400);
  }

  // Look up verification token in KV
  const verifyKey = `email_verify:${body.token}`;
  const verifyData = await c.env.CACHE.get(verifyKey);
  if (!verifyData) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired verification token' } }, 401);
  }

  const { userId, orgId } = JSON.parse(verifyData);

  // Update user's email_verified field in D1
  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.updateUser(userId, { email_verified: 1 } as any);

  // Delete the KV token
  await c.env.CACHE.delete(verifyKey);

  // Audit log
  await orgDb.logAudit('email.verify', 'user', userId);

  return c.json({
    success: true,
    data: { message: 'Email verified successfully.' },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password
// ---------------------------------------------------------------------------
auth.post('/forgot-password', async (c) => {
  const body = await c.req.json<{ email: string }>();

  if (!body.email || !validateEmail(body.email)) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Valid email required' } }, 400);
  }

  // Always return success to prevent email enumeration
  const user = await c.env.DB
    .prepare('SELECT id, org_id, name FROM users WHERE email = ?')
    .bind(body.email)
    .first<{ id: string; org_id: string; name: string | null }>();

  if (user) {
    const resetToken = generateJti();
    // Store reset token in KV with 1-hour TTL
    await c.env.CACHE.put(
      `reset:${resetToken}`,
      JSON.stringify({ userId: user.id, orgId: user.org_id, email: body.email }),
      { expirationTtl: 3600 },
    );

    // Enqueue password reset email
    c.executionCtx.waitUntil(
      c.env.EMAIL_QUEUE.send({
        type: 'password_reset',
        to: [body.email],
        resetUrl: `https://app.apura.xyz/reset-password/${resetToken}`,
        userName: user.name ?? body.email,
      })
    );
  }

  return c.json({
    success: true,
    data: { message: 'If an account with that email exists, a reset link has been sent.' },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/reset-password
// ---------------------------------------------------------------------------
auth.post('/reset-password', async (c) => {
  const body = await c.req.json<{ token: string; password: string }>();

  if (!body.token || !body.password) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Token and new password required' } }, 400);
  }

  if (body.password.length < 8) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' } }, 400);
  }

  // Look up reset token
  const resetKey = `reset:${body.token}`;
  const resetData = await c.env.CACHE.get(resetKey);
  if (!resetData) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired reset token' } }, 401);
  }

  let parsed: { userId: string; orgId: string };
  try {
    parsed = JSON.parse(resetData);
  } catch {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired reset token' } }, 401);
  }
  const { userId, orgId } = parsed;

  // Hash new password and update
  const passwordHash = await hashPassword(body.password);
  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.updateUser(userId, { password_hash: passwordHash } as any);

  // Revoke the reset token
  await c.env.CACHE.delete(resetKey);

  // Audit log
  await orgDb.logAudit('password_reset', 'user', userId);

  return c.json({
    success: true,
    data: { message: 'Password reset successfully.' },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/mfa/verify — Complete two-phase MFA login
// ---------------------------------------------------------------------------
auth.post('/mfa/verify', async (c) => {
  const body = await c.req.json<{ mfaToken: string; code: string }>();

  if (!body.mfaToken || !body.code) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'mfaToken and code required' } }, 400);
  }

  // Rate limit: max 5 attempts per challenge token
  const attemptsKey = `mfa_attempts:${body.mfaToken}`;
  const attempts = parseInt(await c.env.CACHE.get(attemptsKey) ?? '0', 10);
  if (attempts >= 5) {
    await c.env.CACHE.delete(`mfa_challenge:${body.mfaToken}`);
    return c.json({ success: false, error: { code: 'MFA_LOCKED', message: 'Too many attempts. Please log in again.' } }, 429);
  }

  // Validate challenge token
  const challengeData = await c.env.CACHE.get(`mfa_challenge:${body.mfaToken}`);
  if (!challengeData) {
    return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'MFA session expired or invalid' } }, 401);
  }

  const { userId, orgId, role } = JSON.parse(challengeData) as { userId: string; orgId: string; role: string };

  // Get user's TOTP secret
  const mfaUser = await c.env.DB
    .prepare('SELECT email, totp_secret FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email: string; totp_secret: string }>();

  if (!mfaUser || !mfaUser.totp_secret) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'MFA configuration error' } }, 500);
  }

  const secret = await decryptSecret(mfaUser.totp_secret, c.env.JWT_SECRET);

  // Try TOTP verification first
  const totp = new OTPAuth.TOTP({
    issuer: 'Apura',
    label: mfaUser.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  let codeValid = totp.validate({ token: body.code, window: 1 }) !== null;

  // If TOTP fails, try backup codes
  if (!codeValid) {
    const { results: codes } = await c.env.DB
      .prepare('SELECT id, code_hash FROM backup_codes WHERE user_id = ? AND used_at IS NULL')
      .bind(userId)
      .all<{ id: string; code_hash: string }>();

    if (codes) {
      for (const row of codes) {
        if (await verifyBackupCode(body.code, row.code_hash)) {
          // Mark backup code as used
          await c.env.DB
            .prepare('UPDATE backup_codes SET used_at = ? WHERE id = ?')
            .bind(new Date().toISOString(), row.id)
            .run();
          codeValid = true;
          break;
        }
      }
    }
  }

  if (!codeValid) {
    // Increment attempt counter
    await c.env.CACHE.put(attemptsKey, String(attempts + 1), { expirationTtl: 300 });
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid verification code' } }, 401);
  }

  // Delete challenge token and attempts (single use)
  await c.env.CACHE.delete(`mfa_challenge:${body.mfaToken}`);
  await c.env.CACHE.delete(attemptsKey);

  // Issue real JWT tokens (same logic as normal login success)
  const jti = generateJti();
  const iat = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: userId,
    org: orgId,
    role: role as JWTPayload['role'],
    jti,
    iat,
    exp: iat + ACCESS_TOKEN_TTL,
  };
  const accessToken = await createJWT(payload, c.env.JWT_SECRET);

  const refreshJti = generateJti();
  const refreshPayload: JWTPayload = {
    sub: userId,
    org: orgId,
    role: role as JWTPayload['role'],
    jti: refreshJti,
    iat,
    exp: iat + REFRESH_TOKEN_TTL,
  };
  const refreshToken = await createJWT(refreshPayload, c.env.JWT_SECRET);

  // Store sessions in KV
  await Promise.all([
    c.env.CACHE.put(`session:${jti}`, JSON.stringify({ userId, orgId }), { expirationTtl: ACCESS_TOKEN_TTL }),
    c.env.CACHE.put(`session:${refreshJti}`, JSON.stringify({ userId, orgId, type: 'refresh' }), { expirationTtl: REFRESH_TOKEN_TTL }),
  ]);

  // Audit log
  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.logAudit('login', 'user', userId, { method: 'mfa' }, c.req.header('CF-Connecting-IP'));

  return c.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
      user: {
        userId,
        orgId,
        role,
        email: mfaUser.email,
      },
    },
  });
});

export default auth;
