import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import { requireRole } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { CACHE_TTL_SCHEMA } from '@apura/shared';

const schema = new Hono<{ Bindings: Env; Variables: AppVariables }>();

schema.use('*', rateLimitMiddleware);

// ---------------------------------------------------------------------------
// GET /api/schema/tables — List tables with categories
// ---------------------------------------------------------------------------
schema.get('/tables', async (c) => {
  const orgId = c.get('orgId');

  // Check cache first
  const cacheKey = `schema:${orgId}:tables`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    return c.json({ success: true, data: JSON.parse(cached) });
  }

  const { results } = await c.env.DB
    .prepare(
      `SELECT table_name, table_description, table_category, row_count_approx
       FROM schema_tables
       WHERE org_id = ?
       ORDER BY table_category, table_name`,
    )
    .bind(orgId)
    .all<{
      table_name: string;
      table_description: string | null;
      table_category: string | null;
      row_count_approx: number | null;
    }>();

  const tables = results ?? [];

  // Cache the result
  await c.env.CACHE.put(cacheKey, JSON.stringify(tables), { expirationTtl: CACHE_TTL_SCHEMA });

  return c.json({ success: true, data: tables });
});

// ---------------------------------------------------------------------------
// GET /api/schema/tables/:name — Get table detail with columns
// ---------------------------------------------------------------------------
schema.get('/tables/:name', async (c) => {
  const orgId = c.get('orgId');
  const tableName = c.req.param('name');

  // Check cache
  const cacheKey = `schema:${orgId}:table:${tableName}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    return c.json({ success: true, data: JSON.parse(cached) });
  }

  const table = await c.env.DB
    .prepare(
      `SELECT table_name, table_description, table_category, row_count_approx
       FROM schema_tables
       WHERE org_id = ? AND table_name = ?`,
    )
    .bind(orgId, tableName)
    .first<{
      table_name: string;
      table_description: string | null;
      table_category: string | null;
      row_count_approx: number | null;
    }>();

  if (!table) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Table not found' } }, 404);
  }

  const { results: columns } = await c.env.DB
    .prepare(
      `SELECT column_name, data_type, is_primary_key, is_foreign_key, fk_references, column_description
       FROM schema_columns
       WHERE org_id = ? AND table_id = (SELECT id FROM schema_tables WHERE org_id = ? AND table_name = ?)
       ORDER BY column_name`,
    )
    .bind(orgId, orgId, tableName)
    .all<{
      column_name: string;
      data_type: string | null;
      is_primary_key: number;
      is_foreign_key: number;
      fk_references: string | null;
      column_description: string | null;
    }>();

  const result = { ...table, columns: columns ?? [] };

  // Cache
  await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_SCHEMA });

  return c.json({ success: true, data: result });
});

// ---------------------------------------------------------------------------
// GET /api/schema/categories — List categories
// ---------------------------------------------------------------------------
schema.get('/categories', async (c) => {
  const orgId = c.get('orgId');

  const { results } = await c.env.DB
    .prepare(
      `SELECT table_category, COUNT(*) as table_count
       FROM schema_tables
       WHERE org_id = ?
       GROUP BY table_category
       ORDER BY table_category`,
    )
    .bind(orgId)
    .all<{ table_category: string; table_count: number }>();

  return c.json({ success: true, data: results ?? [] });
});

// ---------------------------------------------------------------------------
// POST /api/schema/sync — Trigger re-sync from connector
// ---------------------------------------------------------------------------
schema.post('/sync', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');

  try {
    const response = await c.env.WS_GATEWAY.fetch(
      new Request(`http://internal/schema/sync/${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': c.env.INTERNAL_SECRET ?? '' },
      }),
    );

    if (!response.ok) {
      return c.json({
        success: false,
        error: { code: 'CONNECTOR_OFFLINE', message: 'Connector is not available. Please check that your on-premises agent is running.' },
      }, 503);
    }

    // Invalidate schema cache for this org
    const cacheKey = `schema:${orgId}:tables`;
    await c.env.CACHE.delete(cacheKey);

    return c.json({
      success: true,
      data: { message: 'Schema sync initiated. Tables will be updated shortly.' },
    });
  } catch {
    return c.json({
      success: false,
      error: { code: 'CONNECTOR_OFFLINE', message: 'Failed to reach connector' },
    }, 503);
  }
});

export default schema;
