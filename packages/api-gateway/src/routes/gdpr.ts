import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import { eraseUserData, exportUserData } from '../services/gdpr-service';

const gdpr = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// DELETE /api/gdpr/erasure — Right to erasure (cascade delete all user PII)
gdpr.delete('/erasure', async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');

  await eraseUserData(c.env.DB, c.env.REPORTS_BUCKET, userId, orgId);

  return c.json({
    success: true,
    message: 'Dados eliminados com sucesso',
  });
});

// POST /api/gdpr/export — Request data export
gdpr.post('/export', async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');

  // Get user email and name for the export email
  const user = await c.env.DB.prepare(
    'SELECT email, name FROM users WHERE id = ? AND org_id = ?',
  ).bind(userId, orgId).first<{ email: string; name: string }>();

  if (!user) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
      404,
    );
  }

  await exportUserData(
    c.env.DB,
    c.env.REPORTS_BUCKET,
    c.env.EMAIL_QUEUE,
    userId,
    orgId,
    user.email,
    user.name,
  );

  return c.json({
    success: true,
    message: 'Exportacao em preparacao. Receberá um email com o link de download.',
  });
});

// GET /api/gdpr/export/download — Download exported data from R2
gdpr.get('/export/download', async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');
  const key = c.req.query('key');

  if (!key) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing key parameter' } },
      400,
    );
  }

  // Verify the key belongs to the authenticated user
  const expectedPrefix = `exports/${orgId}/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
      403,
    );
  }

  const object = await c.env.REPORTS_BUCKET.get(key);
  if (!object) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Export not found' } },
      404,
    );
  }

  return new Response(object.body as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="data-export.json"`,
    },
  });
});

export default gdpr;
