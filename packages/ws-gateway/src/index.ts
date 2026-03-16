import type { Env } from './types';
import { ConnectorSession } from './connector-session';
import { validateAgentApiKey } from './auth/agent-auth';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'ws-gateway' });
    }

    // Agent WebSocket connection — handle OUTSIDE Hono for proper upgrade
    if (url.pathname === '/agent/connect') {
      const authHeader = request.headers.get('Authorization') ?? '';
      const apiKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;

      if (!apiKey) {
        return Response.json({ error: 'Missing Authorization header' }, { status: 401 });
      }

      const { valid, orgId } = await validateAgentApiKey(apiKey, env.DB);
      if (!valid || !orgId) {
        return Response.json({ error: 'Invalid API key' }, { status: 401 });
      }

      // Get DO stub and forward the WebSocket upgrade request
      const id = env.CONNECTOR.idFromName(orgId);
      const stub = env.CONNECTOR.get(id);

      // Forward to DO with orgId header — use simple GET with Upgrade header
      return stub.fetch('http://do/agent/connect', {
        headers: {
          'Upgrade': 'websocket',
          'X-Org-Id': orgId,
          'X-Connector-Version': request.headers.get('X-Connector-Version') ?? 'unknown',
        },
      });
    }

    // Internal: execute query (called by api-gateway via service binding)
    if (url.pathname === '/query/execute' && request.method === 'POST') {
      const body = await request.json<{
        orgId: string;
        queryId: string;
        sql: string;
        timeoutMs?: number;
      }>();

      if (!body.orgId || !body.queryId || !body.sql) {
        return Response.json({ error: 'Missing required fields' }, { status: 400 });
      }

      const id = env.CONNECTOR.idFromName(body.orgId);
      const stub = env.CONNECTOR.get(id);

      return stub.fetch(new Request('http://internal/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryId: body.queryId,
          sql: body.sql,
          timeoutMs: body.timeoutMs,
        }),
      }));
    }

    // Internal: connector status
    const statusMatch = url.pathname.match(/^\/connector\/status\/(.+)$/);
    if (statusMatch && request.method === 'GET') {
      const orgId = statusMatch[1];
      const id = env.CONNECTOR.idFromName(orgId);
      const stub = env.CONNECTOR.get(id);
      return stub.fetch(new Request('http://internal/status'));
    }

    // Internal: schema sync
    const syncMatch = url.pathname.match(/^\/schema\/sync\/(.+)$/);
    if (syncMatch && request.method === 'POST') {
      const orgId = syncMatch[1];
      const id = env.CONNECTOR.idFromName(orgId);
      const stub = env.CONNECTOR.get(id);
      return stub.fetch(new Request('http://internal/schema/sync', { method: 'POST' }));
    }

    return new Response('Not found', { status: 404 });
    } catch (err: any) {
      return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
    }
  },
};

export { ConnectorSession };
