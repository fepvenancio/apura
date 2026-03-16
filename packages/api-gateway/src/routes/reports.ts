import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import { requireRole } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { quotaMiddleware } from '../middleware/quota';
import { OrgDatabase } from '../services/org-db';
import { MAX_ROWS_DEFAULT, QUERY_TIMEOUT_DEFAULT } from '@apura/shared';

const reports = new Hono<{ Bindings: Env; Variables: AppVariables }>();

reports.use('*', rateLimitMiddleware);

// ---------------------------------------------------------------------------
// POST /api/reports — Save query as report
// ---------------------------------------------------------------------------
reports.post('/', requireRole('owner', 'admin', 'analyst'), async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const body = await c.req.json<{
    name: string;
    description?: string;
    queryId: string;
    chartConfig?: unknown;
    layoutConfig?: unknown;
    isPublic?: boolean;
  }>();

  if (!body.name || !body.queryId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name and queryId are required' } }, 400);
  }

  // Verify the query exists and belongs to this org
  const query = await orgDb.getQuery(body.queryId);
  if (!query) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Query not found' } }, 404);
  }

  const reportId = await orgDb.createReport({
    user_id: userId,
    name: body.name,
    description: body.description ?? null,
    query_id: body.queryId,
    chart_config: body.chartConfig ? JSON.stringify(body.chartConfig) : null,
    layout_config: body.layoutConfig ? JSON.stringify(body.layoutConfig) : null,
    is_public: body.isPublic ?? false,
  });

  await orgDb.logAudit('report.create', 'report', reportId, { name: body.name }, c.req.header('CF-Connecting-IP'));

  const report = await orgDb.getReport(reportId);

  return c.json({ success: true, data: report }, 201);
});

// ---------------------------------------------------------------------------
// GET /api/reports — List reports
// ---------------------------------------------------------------------------
reports.get('/', async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const items = await orgDb.listReports();

  return c.json({ success: true, data: { items, total: items.length } });
});

// ---------------------------------------------------------------------------
// GET /api/reports/:id — Get report detail
// ---------------------------------------------------------------------------
reports.get('/:id', async (c) => {
  const orgId = c.get('orgId');
  const reportId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const report = await orgDb.getReport(reportId);
  if (!report) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } }, 404);
  }

  return c.json({ success: true, data: report });
});

// ---------------------------------------------------------------------------
// PUT /api/reports/:id — Update report
// ---------------------------------------------------------------------------
reports.put('/:id', requireRole('owner', 'admin', 'analyst'), async (c) => {
  const orgId = c.get('orgId');
  const reportId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const existing = await orgDb.getReport(reportId);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } }, 404);
  }

  const body = await c.req.json<{
    name?: string;
    description?: string;
    chartConfig?: unknown;
    layoutConfig?: unknown;
    isPublic?: boolean;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.chartConfig !== undefined) updates.chart_config = JSON.stringify(body.chartConfig);
  if (body.layoutConfig !== undefined) updates.layout_config = JSON.stringify(body.layoutConfig);
  if (body.isPublic !== undefined) updates.is_public = body.isPublic ? 1 : 0;

  await orgDb.updateReport(reportId, updates as any);
  await orgDb.logAudit('report.update', 'report', reportId, updates, c.req.header('CF-Connecting-IP'));

  const updated = await orgDb.getReport(reportId);
  return c.json({ success: true, data: updated });
});

// ---------------------------------------------------------------------------
// DELETE /api/reports/:id — Delete report
// ---------------------------------------------------------------------------
reports.delete('/:id', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');
  const reportId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const existing = await orgDb.getReport(reportId);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } }, 404);
  }

  await orgDb.deleteReport(reportId);
  await orgDb.logAudit('report.delete', 'report', reportId, { name: existing.name }, c.req.header('CF-Connecting-IP'));

  return c.json({ success: true, data: { deleted: true } });
});

// ---------------------------------------------------------------------------
// POST /api/reports/:id/run — Execute report query now
// ---------------------------------------------------------------------------
reports.post('/:id/run', requireRole('owner', 'admin', 'analyst'), quotaMiddleware, async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');
  const reportId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const report = await orgDb.getReport(reportId);
  if (!report) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } }, 404);
  }

  // Get the associated query to re-run its SQL
  const originalQuery = await orgDb.getQuery(report.query_id);
  if (!originalQuery || !originalQuery.generated_sql) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Report has no associated query with SQL' } }, 400);
  }

  // Create a new query record for this execution
  const newQueryId = await orgDb.createQuery({
    user_id: userId,
    natural_language: originalQuery.natural_language,
    generated_sql: originalQuery.generated_sql,
    explanation: originalQuery.explanation,
    status: 'executing',
  });

  try {
    const connectorResponse = await c.env.WS_GATEWAY.fetch(
      new Request('http://internal/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          queryId: newQueryId,
          sql: originalQuery.generated_sql,
          timeoutMs: QUERY_TIMEOUT_DEFAULT * 1000,
        }),
      }),
    );

    if (!connectorResponse.ok) {
      const errorBody = await connectorResponse.text();
      await orgDb.updateQuery(newQueryId, { status: 'error', error_message: errorBody });
      return c.json({ success: false, error: { code: 'SQL_ERROR', message: 'Report execution failed' } }, 500);
    }

    const result = await connectorResponse.json<{
      columns: { name: string; type: string }[];
      rows: unknown[][];
      rowCount: number;
      executionMs: number;
    }>();

    await orgDb.updateQuery(newQueryId, {
      status: 'completed',
      row_count: result.rowCount,
      execution_time_ms: result.executionMs,
    });

    await orgDb.incrementQueryCount();

    await orgDb.logAudit('report.run', 'report', reportId, { queryId: newQueryId }, c.req.header('CF-Connecting-IP'));

    return c.json({
      success: true,
      data: {
        reportId,
        queryId: newQueryId,
        sql: originalQuery.generated_sql,
        explanation: originalQuery.explanation,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        executionTimeMs: result.executionMs,
        status: 'completed',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await orgDb.updateQuery(newQueryId, { status: 'error', error_message: message });
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Report execution failed' } }, 500);
  }
});

export default reports;
