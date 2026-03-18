import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, AppVariables } from './types';
import { authMiddleware } from './middleware/auth';
import auth from './routes/auth';
import queries from './routes/queries';
import reports from './routes/reports';
import org from './routes/org';
import schema from './routes/schema';
import dashboards from './routes/dashboards';
import schedules from './routes/schedules';
import webhooks from './routes/webhooks';
import billing from './routes/billing';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Security headers
app.use('*', secureHeaders());

// CORS — strict, only our frontend
app.use(
  '/api/*',
  cors({
    origin: ['https://apura.xyz', 'https://app.apura.xyz'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  }),
);

// Also allow CORS on auth routes (they're public but still cross-origin)
app.use(
  '/auth/*',
  cors({
    origin: ['https://apura.xyz', 'https://app.apura.xyz'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  }),
);

// Body size check (1MB max)
app.use('*', async (c, next) => {
  const contentLength = parseInt(c.req.header('content-length') ?? '0', 10);
  if (contentLength > 1_000_000) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Request body too large' } }, 413);
  }
  return next();
});

// Health check (no auth)
app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

// Rate limiting for auth routes
app.use('/auth/*', async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const minute = Math.floor(Date.now() / 60000);
  const key = `rate:auth:${ip}:${minute}`;
  const current = parseInt(await c.env.CACHE.get(key) ?? '0', 10);
  if (current >= 10) {
    return c.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, 429);
  }
  await c.env.CACHE.put(key, String(current + 1), { expirationTtl: 60 });
  return next();
});

// Webhook CORS (Stripe needs to POST, no auth)
app.use('/webhooks/*', cors({
  origin: '*',
  allowMethods: ['POST'],
  allowHeaders: ['Content-Type', 'Stripe-Signature'],
}));

// Public routes
app.route('/auth', auth);
app.route('/webhooks', webhooks);

// Protected routes (auth required)
app.use('/api/*', authMiddleware);
app.route('/api/queries', queries);
app.route('/api/reports', reports);
app.route('/api/org', org);
app.route('/api/schema', schema);
app.route('/api/dashboards', dashboards);
app.route('/api/schedules', schedules);
app.route('/api/billing', billing);

// 404 handler
app.notFound((c) =>
  c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404),
);

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  );
});

export default app;
