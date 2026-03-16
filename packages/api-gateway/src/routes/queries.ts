import { Hono } from 'hono';
import {
  sanitizeNaturalLanguage,
  MAX_NATURAL_LANGUAGE_LENGTH,
  MAX_ROWS_DEFAULT,
  MAX_ROWS_LIMIT,
  QUERY_TIMEOUT_DEFAULT,
  QUERY_TIMEOUT_MAX,
} from '@apura/shared';
import type { QueryRequest } from '@apura/shared';
import type { Env, AppVariables } from '../types';
import { requireRole } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { quotaMiddleware } from '../middleware/quota';
import { OrgDatabase } from '../services/org-db';

const queries = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Apply rate limiting and quota to query execution
queries.use('*', rateLimitMiddleware);

// ---------------------------------------------------------------------------
// POST /api/queries — Execute natural language query
// ---------------------------------------------------------------------------
queries.post('/', requireRole('owner', 'admin', 'analyst'), quotaMiddleware, async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const body = await c.req.json<QueryRequest>();

  // Validate and sanitize input
  if (!body.naturalLanguage || typeof body.naturalLanguage !== 'string') {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'naturalLanguage is required' } }, 400);
  }

  const sanitized = sanitizeNaturalLanguage(body.naturalLanguage);
  if (sanitized.length === 0) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Query cannot be empty after sanitization' } }, 400);
  }

  if (sanitized.length > MAX_NATURAL_LANGUAGE_LENGTH) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Query exceeds maximum length of ${MAX_NATURAL_LANGUAGE_LENGTH} characters` } }, 400);
  }

  const maxRows = Math.min(body.options?.maxRows ?? MAX_ROWS_DEFAULT, MAX_ROWS_LIMIT);
  const timeoutSeconds = Math.min(body.options?.timeoutSeconds ?? QUERY_TIMEOUT_DEFAULT, QUERY_TIMEOUT_MAX);

  // 1. Create query record in D1 (status: pending)
  const queryId = await orgDb.createQuery({
    user_id: userId,
    natural_language: sanitized,
    status: 'pending',
  });

  try {
    // 2. Call AI orchestrator via service binding
    await orgDb.updateQuery(queryId, { status: 'generating' });

    const aiResponse = await c.env.AI_ORCHESTRATOR.fetch(
      new Request('https://ai-orchestrator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          queryId,
          naturalLanguage: sanitized,
          maxRows,
          timeoutSeconds,
        }),
      }),
    );

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      await orgDb.updateQuery(queryId, { status: 'error', error_message: `AI generation failed: ${errorBody}` });
      return c.json({ success: false, error: { code: 'AI_ERROR', message: 'Failed to generate SQL query' } }, 502);
    }

    const aiResult = await aiResponse.json<{ sql: string; explanation: string }>();

    // Validate that AI generated a SELECT query
    const sqlUpper = aiResult.sql.trim().toUpperCase();
    if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
      await orgDb.updateQuery(queryId, { status: 'error', error_message: 'AI generated non-SELECT query' });
      return c.json({ success: false, error: { code: 'QUERY_VALIDATION_FAILED', message: 'Generated query is not a SELECT statement' } }, 400);
    }

    // 3. Update query with generated SQL (status: validating)
    await orgDb.updateQuery(queryId, {
      generated_sql: aiResult.sql,
      explanation: aiResult.explanation,
      status: 'validating',
    });

    // 4. Send SQL to connector via WS gateway service binding

    // 5. Execute (status: executing)
    await orgDb.updateQuery(queryId, { status: 'executing' });

    const connectorResponse = await c.env.WS_GATEWAY.fetch(
      new Request('http://internal/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': c.env.INTERNAL_SECRET ?? '' },
        body: JSON.stringify({
          orgId,
          queryId,
          sql: aiResult.sql,
          maxRows,
          timeoutMs: timeoutSeconds * 1000,
        }),
      }),
    );

    if (!connectorResponse.ok) {
      const errorBody = await connectorResponse.text();
      const isOffline = connectorResponse.status === 503;
      await orgDb.updateQuery(queryId, {
        status: 'error',
        error_message: isOffline ? 'Connector is offline' : `Execution failed: ${errorBody}`,
      });
      return c.json({
        success: false,
        error: {
          code: isOffline ? 'CONNECTOR_OFFLINE' : 'SQL_ERROR',
          message: isOffline ? 'Database connector is offline. Please check that your on-premises agent is running.' : 'Query execution failed',
        },
      }, isOffline ? 503 : 500);
    }

    const result = await connectorResponse.json<{
      columns: { name: string; type: string }[];
      rows: unknown[][];
      rowCount: number;
      executionMs: number;
    }>();

    // 6. Update query record (status: completed)
    await orgDb.updateQuery(queryId, {
      status: 'completed',
      row_count: result.rowCount,
      execution_time_ms: result.executionMs,
    });

    // 7. Increment org query counter
    await orgDb.incrementQueryCount();

    // 8. Audit log
    await orgDb.logAudit(
      'query.execute',
      'query',
      queryId,
      { rowCount: result.rowCount, executionMs: result.executionMs },
      c.req.header('CF-Connecting-IP'),
    );

    // 9. Return results
    return c.json({
      success: true,
      data: {
        queryId,
        sql: aiResult.sql,
        explanation: aiResult.explanation,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        executionTimeMs: result.executionMs,
        status: 'completed',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await orgDb.updateQuery(queryId, { status: 'error', error_message: message });
    console.error('Query execution error:', err);

    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred while processing your query' },
    }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/queries — List query history (paginated)
// ---------------------------------------------------------------------------
queries.get('/', async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const page = parseInt(c.req.query('page') ?? '1', 10);
  const pageSize = Math.min(parseInt(c.req.query('pageSize') ?? '20', 10), 100);

  const { items, total } = await orgDb.listQueries(page, pageSize);

  return c.json({
    success: true,
    data: { items, total, page, pageSize },
  });
});

// ---------------------------------------------------------------------------
// GET /api/queries/:id — Get query detail
// ---------------------------------------------------------------------------
queries.get('/:id', async (c) => {
  const orgId = c.get('orgId');
  const queryId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const query = await orgDb.getQuery(queryId);
  if (!query) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Query not found' } }, 404);
  }

  return c.json({ success: true, data: query });
});

// ---------------------------------------------------------------------------
// POST /api/queries/:id/rerun — Re-execute a previous query
// ---------------------------------------------------------------------------
queries.post('/:id/rerun', requireRole('owner', 'admin', 'analyst'), quotaMiddleware, async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');
  const queryId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const originalQuery = await orgDb.getQuery(queryId);
  if (!originalQuery) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Query not found' } }, 404);
  }

  if (!originalQuery.generated_sql) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Original query has no SQL to re-execute' } }, 400);
  }

  // Create a new query record for the re-run
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
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': c.env.INTERNAL_SECRET ?? '' },
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
      return c.json({ success: false, error: { code: 'SQL_ERROR', message: 'Re-execution failed' } }, 500);
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

    return c.json({
      success: true,
      data: {
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
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Re-execution failed' } }, 500);
  }
});

export default queries;
