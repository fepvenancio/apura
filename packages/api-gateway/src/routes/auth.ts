import { Hono } from 'hono';
import type { JWTPayload, SignupRequest, LoginRequest, RefreshRequest } from '@apura/shared';
import { PLAN_LIMITS, CACHE_TTL_SESSION, validateEmail, validateSlug } from '@apura/shared';
import type { Env, AppVariables } from '../types';
import { createJWT, verifyJWT, generateJti } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import { generateApiKey } from '../utils/api-key';
import { OrgDatabase } from '../services/org-db';

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
  ]);

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
    .first<{ id: string; org_id: string; email: string; name: string; password_hash: string; role: string }>();

  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, 401);
  }

  // Verify password
  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, 401);
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

  // Revoke old refresh token
  await c.env.CACHE.delete(sessionKey);

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
  // TODO: Integrate email service to send reset link
  const user = await c.env.DB
    .prepare('SELECT id, org_id FROM users WHERE email = ?')
    .bind(body.email)
    .first<{ id: string; org_id: string }>();

  if (user) {
    const resetToken = generateJti();
    // Store reset token in KV with 1-hour TTL
    await c.env.CACHE.put(
      `reset:${resetToken}`,
      JSON.stringify({ userId: user.id, orgId: user.org_id, email: body.email }),
      { expirationTtl: 3600 },
    );

    // TODO: Send reset email via Resend
    // console.log(`Password reset requested for ${body.email}`);
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

  const { userId, orgId } = JSON.parse(resetData);

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

export default auth;
