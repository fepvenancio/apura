import { Hono } from 'hono';

/**
 * Query Executor — thin service-binding wrapper.
 *
 * Receives query execution requests (typically via service binding from
 * api-gateway or ai-orchestrator), forwards them to the ws-gateway Durable
 * Object which holds the live WebSocket connection to the on-prem connector
 * agent, and returns the results.
 */

interface Env {
  WS_GATEWAY: Fetcher;
  INTERNAL_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'query-executor', timestamp: new Date().toISOString() }),
);

// ---------------------------------------------------------------------------
// Auth middleware — only accept internal calls
// ---------------------------------------------------------------------------
app.use('*', async (c, next) => {
  if (c.req.path === '/health') return next();
  const secret = c.req.header('X-Internal-Secret');
  if (secret !== c.env.INTERNAL_SECRET) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, 401);
  }
  return next();
});

// ---------------------------------------------------------------------------
// POST /execute — forward query to ws-gateway
// ---------------------------------------------------------------------------
app.post('/execute', async (c) => {
  const body = await c.req.json<{
    orgId: string;
    queryId: string;
    sql: string;
    timeoutMs?: number;
  }>();

  if (!body.orgId || !body.queryId || !body.sql) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing orgId, queryId, or sql' } },
      400,
    );
  }

  const resp = await c.env.WS_GATEWAY.fetch('https://ws-gateway/query/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': c.env.INTERNAL_SECRET,
    },
    body: JSON.stringify({
      orgId: body.orgId,
      queryId: body.queryId,
      sql: body.sql,
      timeoutMs: body.timeoutMs,
    }),
  });

  const result = await resp.json();
  return c.json(result, resp.status as 200);
});

// ---------------------------------------------------------------------------
// GET /status/:orgId — connector status pass-through
// ---------------------------------------------------------------------------
app.get('/status/:orgId', async (c) => {
  const orgId = c.req.param('orgId');

  const resp = await c.env.WS_GATEWAY.fetch(`https://ws-gateway/connector/status/${orgId}`, {
    headers: { 'X-Internal-Secret': c.env.INTERNAL_SECRET },
  });

  const result = await resp.json();
  return c.json(result, resp.status as 200);
});

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------
app.notFound((c) =>
  c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404),
);

app.onError((err, c) => {
  console.error('query-executor error:', err);
  return c.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  );
});

export default app;
