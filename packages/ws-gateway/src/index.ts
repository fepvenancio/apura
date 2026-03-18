import type { Env, TlsClientAuth } from './types';
import { ConnectorSession } from './connector-session';
import { validateAgentApiKey } from './auth/agent-auth';
import { lookupOrgByCertSerial } from './auth/cert-auth';

/**
 * Timing-safe string comparison to prevent timing attacks on secret values.
 * Uses crypto.subtle.timingSafeEqual which is available in Workers runtime and Node.js 20+.
 */
async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ ok: true });
    }

    // Agent WebSocket connection — handle OUTSIDE Hono for proper upgrade
    // Dual-auth: try mTLS certificate first, fall back to API key
    if (url.pathname === '/agent/connect') {
      let orgId: string | undefined;

      // Try mTLS certificate authentication first (preferred)
      const cf = (request as any).cf as { tlsClientAuth?: TlsClientAuth } | undefined;
      if (cf?.tlsClientAuth?.certPresented === '1') {
        // Certificate was presented — verify it was validated by Cloudflare
        if (cf.tlsClientAuth.certVerified !== 'SUCCESS') {
          return Response.json({ error: 'Invalid client certificate' }, { status: 403 });
        }
        // Map certificate serial to org_id (excludes revoked certs)
        const certOrgId = await lookupOrgByCertSerial(cf.tlsClientAuth.certSerial, env.DB);
        if (certOrgId) {
          orgId = certOrgId;
        }
      }

      // Fall back to API key auth if no cert or cert not in DB
      if (!orgId) {
        const authHeader = request.headers.get('Authorization') ?? '';
        const apiKey = authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : authHeader;

        if (!apiKey) {
          return Response.json({ error: 'Authentication required' }, { status: 401 });
        }

        const { valid, orgId: keyOrgId } = await validateAgentApiKey(apiKey, env.DB);
        if (!valid || !keyOrgId) {
          return Response.json({ error: 'Invalid API key' }, { status: 401 });
        }
        orgId = keyOrgId;
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

    // Authenticate internal endpoints with timing-safe comparison
    const internalSecret = request.headers.get('X-Internal-Secret');
    if (!internalSecret || !(await timingSafeCompare(internalSecret, env.INTERNAL_SECRET))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
};

export { ConnectorSession };
