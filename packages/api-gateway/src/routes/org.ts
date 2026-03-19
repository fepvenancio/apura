import { Hono } from 'hono';
import type { UserRole } from '@apura/shared';
import { validateEmail } from '@apura/shared';
import type { Env, AppVariables } from '../types';
import { requireRole } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { OrgDatabase } from '../services/org-db';
import { hashPassword } from '../utils/password';
import { generateJti } from '../utils/jwt';
import { generateApiKey } from '../utils/api-key';

const org = new Hono<{ Bindings: Env; Variables: AppVariables }>();

org.use('*', rateLimitMiddleware);

// ---------------------------------------------------------------------------
// GET /api/org — Get organization details
// ---------------------------------------------------------------------------
org.get('/', async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const organization = await orgDb.getOrg();
  if (!organization) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } }, 404);
  }

  // Strip sensitive fields
  const { agent_api_key, agent_api_key_hash, ...safe } = organization;

  return c.json({ success: true, data: safe });
});

// ---------------------------------------------------------------------------
// PUT /api/org — Update organization
// ---------------------------------------------------------------------------
org.put('/', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const body = await c.req.json<{
    name?: string;
    billing_email?: string;
    timezone?: string;
    country?: string;
    mfa_required?: number;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.billing_email !== undefined) updates.billing_email = body.billing_email;
  if (body.timezone !== undefined) updates.timezone = body.timezone;
  if (body.country !== undefined) updates.country = body.country;
  if (body.mfa_required !== undefined) updates.mfa_required = body.mfa_required;

  if (Object.keys(updates).length === 0) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No updates provided' } }, 400);
  }

  await orgDb.updateOrg(updates as any);
  await orgDb.logAudit('org.update', 'organization', orgId, updates, c.req.header('CF-Connecting-IP'));

  const updated = await orgDb.getOrg();
  const { agent_api_key, ...safe } = updated!;

  return c.json({ success: true, data: safe });
});

// ---------------------------------------------------------------------------
// GET /api/org/usage — Query usage statistics
// ---------------------------------------------------------------------------
org.get('/usage', async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const organization = await orgDb.getOrg();
  if (!organization) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } }, 404);
  }

  // Get query stats for the current month
  const stats = await c.env.DB
    .prepare(
      `SELECT
         COUNT(*) as total_queries,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_queries,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed_queries,
         AVG(CASE WHEN execution_time_ms IS NOT NULL THEN execution_time_ms END) as avg_execution_ms
       FROM queries
       WHERE org_id = ? AND created_at >= date('now', 'start of month')`,
    )
    .bind(orgId)
    .first<{
      total_queries: number;
      successful_queries: number;
      failed_queries: number;
      avg_execution_ms: number | null;
    }>();

  return c.json({
    success: true,
    data: {
      plan: organization.plan,
      queriesUsed: organization.queries_this_month,
      queriesLimit: organization.max_queries_per_month,
      queriesRemaining: Math.max(0, organization.max_queries_per_month - organization.queries_this_month),
      stats: {
        totalQueries: stats?.total_queries ?? 0,
        successfulQueries: stats?.successful_queries ?? 0,
        failedQueries: stats?.failed_queries ?? 0,
        avgExecutionMs: stats?.avg_execution_ms ? Math.round(stats.avg_execution_ms) : null,
      },
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/org/connector-status — Agent connection status via DO
// ---------------------------------------------------------------------------
org.get('/connector-status', async (c) => {
  const orgId = c.get('orgId');
  // Get the API key prefix to show on the connector page
  const keyRow = await c.env.DB
    .prepare('SELECT agent_api_key FROM organizations WHERE id = ?')
    .bind(orgId)
    .first<{ agent_api_key: string | null }>();
  const agentApiKey = keyRow?.agent_api_key ?? null;

  try {
    const response = await c.env.WS_GATEWAY.fetch(
      new Request(`http://internal/connector/status/${orgId}`, {
        method: 'GET',
        headers: { 'X-Internal-Secret': c.env.INTERNAL_SECRET ?? '' },
      }),
    );

    if (!response.ok) {
      return c.json({
        success: true,
        data: { status: 'disconnected', lastSeen: null, agentApiKey },
      });
    }

    const status = await response.json<{
      status: string;
      lastSeen: string | null;
      uptimeSeconds?: number;
      version?: string;
    }>();

    return c.json({ success: true, data: { ...status, agentApiKey } });
  } catch {
    return c.json({
      success: true,
      data: { status: 'disconnected', lastSeen: null, agentApiKey },
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/org/regenerate-api-key — Generate a new agent API key
// ---------------------------------------------------------------------------
org.post('/regenerate-api-key', requireRole('owner'), async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const apiKey = await generateApiKey();

  await c.env.DB
    .prepare('UPDATE organizations SET agent_api_key = ?, agent_api_key_hash = ?, updated_at = ? WHERE id = ?')
    .bind(apiKey.prefix, apiKey.hash, new Date().toISOString(), orgId)
    .run();

  await orgDb.logAudit('api_key.regenerate', 'organization', orgId, undefined, c.req.header('CF-Connecting-IP'));

  return c.json({
    success: true,
    data: {
      agentApiKey: apiKey.key,
      agentApiKeyPrefix: apiKey.prefix,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/org/users — List team members
// ---------------------------------------------------------------------------
org.get('/users', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const users = await orgDb.listUsers();

  // Strip password hashes from response
  const safeUsers = users.map(({ password_hash, ...rest }) => rest);

  return c.json({ success: true, data: { items: safeUsers, total: safeUsers.length } });
});

// ---------------------------------------------------------------------------
// PUT /api/org/users/:id — Update user role
// ---------------------------------------------------------------------------
org.put('/users/:id', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');
  const currentUserId = c.get('userId');
  const targetUserId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const body = await c.req.json<{ role: UserRole; name?: string }>();

  if (!body.role || !['owner', 'admin', 'analyst', 'viewer'].includes(body.role)) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid role' } }, 400);
  }

  // Prevent self-demotion
  if (targetUserId === currentUserId && body.role !== c.get('role')) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot change your own role' } }, 403);
  }

  const targetUser = await orgDb.getUser(targetUserId);
  if (!targetUser) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  // Only owners can promote to owner or demote other owners
  if ((body.role === 'owner' || targetUser.role === 'owner') && c.get('role') !== 'owner') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only owners can manage owner roles' } }, 403);
  }

  const updates: Record<string, unknown> = { role: body.role };
  if (body.name !== undefined) updates.name = body.name;

  await orgDb.updateUser(targetUserId, updates as any);
  await orgDb.logAudit('user.update', 'user', targetUserId, updates, c.req.header('CF-Connecting-IP'));

  const updated = await orgDb.getUser(targetUserId);
  if (updated) {
    const { password_hash, ...safe } = updated;
    return c.json({ success: true, data: safe });
  }

  return c.json({ success: true, data: null });
});

// ---------------------------------------------------------------------------
// DELETE /api/org/users/:id — Remove user
// ---------------------------------------------------------------------------
org.delete('/users/:id', requireRole('owner'), async (c) => {
  const orgId = c.get('orgId');
  const currentUserId = c.get('userId');
  const targetUserId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  if (targetUserId === currentUserId) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot remove yourself' } }, 403);
  }

  const targetUser = await orgDb.getUser(targetUserId);
  if (!targetUser) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  await orgDb.deleteUser(targetUserId);
  await orgDb.logAudit('user.delete', 'user', targetUserId, { email: targetUser.email }, c.req.header('CF-Connecting-IP'));

  return c.json({ success: true, data: { deleted: true } });
});

// ---------------------------------------------------------------------------
// POST /api/org/invitations — Create invitation
// ---------------------------------------------------------------------------
org.post('/invitations', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');
  const userId = c.get('userId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const body = await c.req.json<{ email: string; role?: UserRole }>();

  if (!body.email || !validateEmail(body.email)) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Valid email required' } }, 400);
  }

  const role = body.role ?? 'viewer';
  if (!['owner', 'admin', 'analyst', 'viewer'].includes(role)) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid role' } }, 400);
  }

  // Only owners can invite as owner
  if (role === 'owner' && c.get('role') !== 'owner') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only owners can invite as owner' } }, 403);
  }

  // Check if user already exists in this org
  const existingUser = await orgDb.getUserByEmail(body.email);
  if (existingUser) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'User already belongs to this organization' } }, 409);
  }

  // Check for existing pending invitation
  const existingInvite = await c.env.DB
    .prepare('SELECT id FROM invitations WHERE org_id = ? AND email = ? AND accepted_at IS NULL AND expires_at > datetime(\'now\')')
    .bind(orgId, body.email)
    .first();

  if (existingInvite) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A pending invitation already exists for this email' } }, 409);
  }

  // Check org user limit
  const org_data = await orgDb.getOrg();
  if (!org_data) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } }, 404);
  }

  const users = await orgDb.listUsers();
  if (users.length >= org_data.max_users) {
    return c.json({ success: false, error: { code: 'LIMIT_EXCEEDED', message: 'Organization user limit reached' } }, 403);
  }

  const invitationId = crypto.randomUUID();
  const token = generateJti();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(); // 7 days

  await c.env.DB
    .prepare(
      `INSERT INTO invitations (id, org_id, email, role, invited_by, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(invitationId, orgId, body.email, role, userId, token, expiresAt, now)
    .run();

  await orgDb.logAudit('invitation.create', 'invitation', invitationId, { email: body.email, role }, c.req.header('CF-Connecting-IP'));

  // Fetch inviter and org names for the invitation email
  const inviter = await c.env.DB
    .prepare('SELECT name FROM users WHERE id = ?')
    .bind(userId)
    .first<{ name: string | null }>();
  const orgData = await c.env.DB
    .prepare('SELECT name FROM organizations WHERE id = ?')
    .bind(orgId)
    .first<{ name: string }>();

  c.executionCtx.waitUntil(
    c.env.EMAIL_QUEUE.send({
      type: 'team_invitation',
      to: [body.email],
      inviterName: inviter?.name ?? 'A team member',
      orgName: orgData?.name ?? 'your organization',
      inviteUrl: `https://app.apura.xyz/accept-invite/${token}`,
      role,
    })
  );

  return c.json({
    success: true,
    data: {
      id: invitationId,
      email: body.email,
      role,
      token,
      expiresAt,
    },
  }, 201);
});

// ---------------------------------------------------------------------------
// GET /api/org/invitations — List pending invitations
// ---------------------------------------------------------------------------
org.get('/invitations', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');

  const { results } = await c.env.DB
    .prepare('SELECT id, email, role, invited_by, token, expires_at, accepted_at, created_at FROM invitations WHERE org_id = ? ORDER BY created_at DESC')
    .bind(orgId)
    .all<{ id: string; email: string; role: string; invited_by: string; token: string; expires_at: string; accepted_at: string | null; created_at: string }>();

  return c.json({ success: true, data: { items: results ?? [], total: results?.length ?? 0 } });
});

// ---------------------------------------------------------------------------
// POST /api/org/invitations/:token/accept — Accept invitation
// ---------------------------------------------------------------------------
org.post('/invitations/:token/accept', async (c) => {
  const token = c.req.param('token');

  const body = await c.req.json<{ name: string; password: string }>();

  if (!body.name || body.name.length < 1 || body.name.length > 100) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required (max 100 chars)' } }, 400);
  }

  if (!body.password || body.password.length < 8) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' } }, 400);
  }

  // Look up invitation by token
  const invitation = await c.env.DB
    .prepare('SELECT * FROM invitations WHERE token = ? AND accepted_at IS NULL AND expires_at > datetime(\'now\')')
    .bind(token)
    .first<{ id: string; org_id: string; email: string; role: string; invited_by: string; token: string; expires_at: string }>();

  if (!invitation) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid or expired invitation' } }, 404);
  }

  // Check if email is already registered
  const existingUser = await c.env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(invitation.email)
    .first();

  if (existingUser) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email already registered' } }, 409);
  }

  // Create user and mark invitation as accepted
  const passwordHash = await hashPassword(body.password);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, org_id, email, name, password_hash, role, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(userId, invitation.org_id, invitation.email, body.name, passwordHash, invitation.role, 1, now, now),
    c.env.DB.prepare(
      'UPDATE invitations SET accepted_at = ? WHERE id = ?',
    ).bind(now, invitation.id),
  ]);

  const orgDb = new OrgDatabase(c.env.DB, invitation.org_id);
  await orgDb.logAudit('invitation.accept', 'invitation', invitation.id, { userId, email: invitation.email }, undefined);

  return c.json({
    success: true,
    data: {
      userId,
      email: invitation.email,
      role: invitation.role,
      orgId: invitation.org_id,
    },
  }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /api/org/invitations/:id — Revoke invitation
// ---------------------------------------------------------------------------
org.delete('/invitations/:id', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');
  const invitationId = c.req.param('id');

  const invitation = await c.env.DB
    .prepare('SELECT id FROM invitations WHERE id = ? AND org_id = ? AND accepted_at IS NULL')
    .bind(invitationId, orgId)
    .first();

  if (!invitation) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Invitation not found' } }, 404);
  }

  await c.env.DB
    .prepare('DELETE FROM invitations WHERE id = ? AND org_id = ?')
    .bind(invitationId, orgId)
    .run();

  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.logAudit('invitation.delete', 'invitation', invitationId, undefined, c.req.header('CF-Connecting-IP'));

  return c.json({ success: true, data: { deleted: true } });
});

export default org;
