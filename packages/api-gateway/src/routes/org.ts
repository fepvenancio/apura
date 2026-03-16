import { Hono } from 'hono';
import type { UserRole } from '@apura/shared';
import type { Env, AppVariables } from '../types';
import { requireRole } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { OrgDatabase } from '../services/org-db';

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
  }>();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.billing_email !== undefined) updates.billing_email = body.billing_email;
  if (body.timezone !== undefined) updates.timezone = body.timezone;
  if (body.country !== undefined) updates.country = body.country;

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
        data: { status: 'disconnected', lastSeen: null },
      });
    }

    const status = await response.json<{
      status: string;
      lastSeen: string | null;
      uptimeSeconds?: number;
      version?: string;
    }>();

    return c.json({ success: true, data: status });
  } catch {
    return c.json({
      success: true,
      data: { status: 'disconnected', lastSeen: null },
    });
  }
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

export default org;
