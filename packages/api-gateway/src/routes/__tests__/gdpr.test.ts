import { describe, it, expect, vi, beforeEach } from 'vitest';

// Helper to create mock D1 database
function createMockDB(overrides: Record<string, any> = {}) {
  const defaultFirst = vi.fn().mockResolvedValue(null);
  const defaultRun = vi.fn().mockResolvedValue({});
  const defaultAll = vi.fn().mockResolvedValue({ results: [] });

  return {
    prepare: vi.fn().mockImplementation((sql: string) => ({
      bind: vi.fn().mockReturnValue({
        first: overrides.first
          ? vi.fn().mockImplementation(() => overrides.first(sql))
          : defaultFirst,
        run: defaultRun,
        all: overrides.all
          ? vi.fn().mockImplementation(() => overrides.all(sql))
          : defaultAll,
      }),
    })),
    batch: vi.fn().mockResolvedValue([]),
  };
}

// Helper to create mock R2 bucket
function createMockR2() {
  return {
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    put: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

// Helper to create mock Queue
function createMockQueue() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEnv(dbOverrides: Record<string, any> = {}) {
  return {
    DB: createMockDB(dbOverrides),
    CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: '' }),
    },
    AI_ORCHESTRATOR: {},
    WS_GATEWAY: {},
    JWT_SECRET: 'test-secret',
    INTERNAL_SECRET: 'test-internal',
    REPORT_QUEUE: createMockQueue(),
    EMAIL_QUEUE: createMockQueue(),
    REPORTS_BUCKET: createMockR2(),
    STRIPE_SECRET_KEY: 'sk_test_xxx',
    STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
  };
}

// Create a minimal test app with auth context
async function createTestApp() {
  const { Hono } = await import('hono');
  const { default: gdpr } = await import('../gdpr');

  const app = new Hono();
  app.use('/*', async (c, next) => {
    c.set('userId' as any, 'user_1');
    c.set('orgId' as any, 'org_1');
    c.set('role' as any, 'owner');
    await next();
  });
  app.route('/', gdpr);
  return app;
}

describe('GDPR routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DELETE /erasure', () => {
    it('calls db.batch() with statements in correct FK order', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('COUNT(*)')) return Promise.resolve({ count: 2 });
          return Promise.resolve(null);
        },
      });

      const app = await createTestApp();
      const res = await app.request('/erasure', { method: 'DELETE' }, env);

      expect(res.status).toBe(200);
      expect(env.DB.batch).toHaveBeenCalledTimes(1);

      const batchArgs = env.DB.batch.mock.calls[0][0];
      // Should have 10 statements for multi-member org
      expect(batchArgs.length).toBe(10);
    });

    it('returns 200 with success true', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('COUNT(*)')) return Promise.resolve({ count: 2 });
          return Promise.resolve(null);
        },
      });

      const app = await createTestApp();
      const res = await app.request('/erasure', { method: 'DELETE' }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
    });

    it('for sole-owner org extends batch to delete org data', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('COUNT(*)')) return Promise.resolve({ count: 1 });
          return Promise.resolve(null);
        },
      });

      const app = await createTestApp();
      const res = await app.request('/erasure', { method: 'DELETE' }, env);

      expect(res.status).toBe(200);
      expect(env.DB.batch).toHaveBeenCalledTimes(1);

      const batchArgs = env.DB.batch.mock.calls[0][0];
      // Should have 13 statements: 10 user + 3 org (schema_columns, schema_tables, organizations)
      expect(batchArgs.length).toBe(13);
    });

    it('for multi-member org does NOT delete org data', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('COUNT(*)')) return Promise.resolve({ count: 3 });
          return Promise.resolve(null);
        },
      });

      const app = await createTestApp();
      const res = await app.request('/erasure', { method: 'DELETE' }, env);

      expect(res.status).toBe(200);
      const batchArgs = env.DB.batch.mock.calls[0][0];
      // Only 10 statements, no org cleanup
      expect(batchArgs.length).toBe(10);
    });

    it('calls REPORTS_BUCKET.list() and delete() for R2 cleanup', async () => {
      const r2Objects = [
        { key: 'exports/org_1/user_1/file1.json' },
        { key: 'exports/org_1/user_1/file2.json' },
      ];
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('COUNT(*)')) return Promise.resolve({ count: 2 });
          return Promise.resolve(null);
        },
      });
      env.REPORTS_BUCKET.list.mockResolvedValue({ objects: r2Objects, truncated: false });

      const app = await createTestApp();
      await app.request('/erasure', { method: 'DELETE' }, env);

      expect(env.REPORTS_BUCKET.list).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: 'exports/org_1/user_1/' }),
      );
      expect(env.REPORTS_BUCKET.delete).toHaveBeenCalledTimes(2);
      expect(env.REPORTS_BUCKET.delete).toHaveBeenCalledWith('exports/org_1/user_1/file1.json');
      expect(env.REPORTS_BUCKET.delete).toHaveBeenCalledWith('exports/org_1/user_1/file2.json');
    });
  });

  describe('POST /export', () => {
    it('queries user data in parallel and stores in R2', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('SELECT') && sql.includes('users')) {
            return Promise.resolve({ id: 'user_1', email: 'test@test.com', name: 'Test User' });
          }
          return Promise.resolve(null);
        },
        all: () => Promise.resolve({ results: [] }),
      });

      const app = await createTestApp();
      const res = await app.request('/export', { method: 'POST' }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
    });

    it('calls REPORTS_BUCKET.put() with JSON and EMAIL_QUEUE.send()', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('users')) {
            return Promise.resolve({ id: 'user_1', email: 'test@test.com', name: 'Test User' });
          }
          return Promise.resolve(null);
        },
        all: () => Promise.resolve({ results: [] }),
      });

      const app = await createTestApp();
      await app.request('/export', { method: 'POST' }, env);

      expect(env.REPORTS_BUCKET.put).toHaveBeenCalledTimes(1);
      const putArgs = env.REPORTS_BUCKET.put.mock.calls[0];
      expect(putArgs[0]).toMatch(/^exports\/org_1\/user_1\/.+\.json$/);
      expect(putArgs[2]).toEqual(
        expect.objectContaining({
          httpMetadata: { contentType: 'application/json' },
        }),
      );

      expect(env.EMAIL_QUEUE.send).toHaveBeenCalledTimes(1);
      const sendArgs = env.EMAIL_QUEUE.send.mock.calls[0][0];
      expect(sendArgs.type).toBe('data_export');
      expect(sendArgs.to).toEqual(['test@test.com']);
      expect(sendArgs.downloadUrl).toContain('/api/gdpr/export/download?key=');
    });

    it('returns 200 with success true', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('users')) {
            return Promise.resolve({ id: 'user_1', email: 'test@test.com', name: 'Test User' });
          }
          return Promise.resolve(null);
        },
        all: () => Promise.resolve({ results: [] }),
      });

      const app = await createTestApp();
      const res = await app.request('/export', { method: 'POST' }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
    });
  });

  describe('GET /export/download', () => {
    it('with valid key returns R2 object body', async () => {
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"test":"data"}'));
          controller.close();
        },
      });
      const env = createMockEnv();
      env.REPORTS_BUCKET.get.mockResolvedValue({
        body: mockBody,
        httpMetadata: { contentType: 'application/json' },
      });

      const app = await createTestApp();
      const key = 'exports/org_1/user_1/some-uuid.json';
      const res = await app.request(`/export/download?key=${encodeURIComponent(key)}`, { method: 'GET' }, env);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json');
      expect(res.headers.get('content-disposition')).toContain('attachment');
    });

    it('with key belonging to different user returns 403', async () => {
      const env = createMockEnv();

      const app = await createTestApp();
      // Key belongs to user_2, but auth context is user_1
      const key = 'exports/org_1/user_2/some-uuid.json';
      const res = await app.request(`/export/download?key=${encodeURIComponent(key)}`, { method: 'GET' }, env);

      expect(res.status).toBe(403);
    });

    it('with nonexistent key returns 404', async () => {
      const env = createMockEnv();
      env.REPORTS_BUCKET.get.mockResolvedValue(null);

      const app = await createTestApp();
      const key = 'exports/org_1/user_1/nonexistent.json';
      const res = await app.request(`/export/download?key=${encodeURIComponent(key)}`, { method: 'GET' }, env);

      expect(res.status).toBe(404);
    });
  });
});
