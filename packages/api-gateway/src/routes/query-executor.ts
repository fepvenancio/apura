import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';

const queryExecutor = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

queryExecutor.use('*', async (c, next) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!secret || !(await timingSafeCompare(secret, c.env.INTERNAL_SECRET))) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, 401);
  }
  return next();
});

queryExecutor.post('/execute', async (c) => {
  const body = await c.req.json<{ orgId: string; queryId: string; sql: string; timeoutMs?: number }>();
  if (!body.orgId || !body.queryId || !body.sql) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing orgId, queryId, or sql' } }, 400);
  }
  const resp = await c.env.WS_GATEWAY.fetch('https://ws-gateway/query/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': c.env.INTERNAL_SECRET },
    body: JSON.stringify(body),
  });
  const result = await resp.json();
  return c.json(result, resp.status as 200);
});

queryExecutor.get('/status/:orgId', async (c) => {
  const orgId = c.req.param('orgId');
  const resp = await c.env.WS_GATEWAY.fetch(`https://ws-gateway/connector/status/${orgId}`, {
    headers: { 'X-Internal-Secret': c.env.INTERNAL_SECRET },
  });
  const result = await resp.json();
  return c.json(result, resp.status as 200);
});

export default queryExecutor;
