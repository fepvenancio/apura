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

// Health check (no auth)
app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

// Public routes
app.route('/auth', auth);

// Protected routes (auth required)
app.use('/api/*', authMiddleware);
app.route('/api/queries', queries);
app.route('/api/reports', reports);
app.route('/api/org', org);
app.route('/api/schema', schema);

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
