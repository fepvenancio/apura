import { Hono } from 'hono';
import type { Env } from './types';
import { ConnectorSession } from './connector-session';
import { validateAgentApiKey } from './auth/agent-auth';

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Agent WebSocket connection endpoint
// ---------------------------------------------------------------------------
app.get('/agent/connect', async (c) => {
  // Extract API key from Authorization header
  const authHeader = c.req.header('Authorization') ?? '';
  const apiKey = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!apiKey) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  // Validate the agent API key against D1
  const { valid, orgId } = await validateAgentApiKey(apiKey, c.env.DB);
  if (!valid || !orgId) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  // Get DO stub using orgId as the DO name (deterministic ID)
  const id = c.env.CONNECTOR.idFromName(orgId);
  const stub = c.env.CONNECTOR.get(id);

  // Forward the WebSocket upgrade request to the DO
  const url = new URL(c.req.url);
  url.pathname = '/agent/connect';
  const request = new Request(url.toString(), c.req.raw);
  return stub.fetch(request);
});

// ---------------------------------------------------------------------------
// Internal: execute query (called by api-gateway via service binding)
// ---------------------------------------------------------------------------
app.post('/query/execute', async (c) => {
  const body = await c.req.json<{
    orgId: string;
    queryId: string;
    sql: string;
    timeoutMs?: number;
  }>();

  const { orgId, queryId, sql, timeoutMs } = body;

  if (!orgId || !queryId || !sql) {
    return c.json({ error: 'Missing required fields: orgId, queryId, sql' }, 400);
  }

  const id = c.env.CONNECTOR.idFromName(orgId);
  const stub = c.env.CONNECTOR.get(id);

  return stub.fetch(
    new Request('http://internal/query/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryId, sql, timeoutMs }),
    })
  );
});

// ---------------------------------------------------------------------------
// Internal: get connector status
// ---------------------------------------------------------------------------
app.get('/connector/status/:orgId', async (c) => {
  const orgId = c.req.param('orgId');

  const id = c.env.CONNECTOR.idFromName(orgId);
  const stub = c.env.CONNECTOR.get(id);

  return stub.fetch(new Request('http://internal/status'));
});

// ---------------------------------------------------------------------------
// Internal: trigger schema sync
// ---------------------------------------------------------------------------
app.post('/schema/sync/:orgId', async (c) => {
  const orgId = c.req.param('orgId');

  const id = c.env.CONNECTOR.idFromName(orgId);
  const stub = c.env.CONNECTOR.get(id);

  return stub.fetch(
    new Request('http://internal/schema/sync', { method: 'POST' })
  );
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (c) => {
  return c.json({ ok: true, service: 'ws-gateway' });
});

export default app;
export { ConnectorSession };
