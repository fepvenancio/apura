import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock state for TOTP validate
let totpValidateResult: number | null = 0;

// Mock otpauth
vi.mock('otpauth', () => ({
  Secret: class {
    base32 = 'JBSWY3DPEHPK3PXP';
    constructor(_opts?: any) {}
    static fromBase32(_s: string) { return new this(); }
  },
  TOTP: class {
    constructor(_opts: any) {}
    toString() { return 'otpauth://totp/Apura:test@test.com?secret=JBSWY3DPEHPK3PXP&issuer=Apura'; }
    validate(_opts: any) { return totpValidateResult; }
  },
}));

// Mock qrcode
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockQR'),
  },
}));

// Mock crypto utilities
vi.mock('../../utils/crypto', () => ({
  encryptSecret: vi.fn().mockResolvedValue('encrypted-secret'),
  decryptSecret: vi.fn().mockResolvedValue('JBSWY3DPEHPK3PXP'),
  generateBackupCodes: vi.fn().mockReturnValue([
    'ABCD-EFGH', 'JKLM-NPQR', 'STUV-WXYZ', 'ABCD-2345',
    'EFGH-6789', 'JKLM-ABCD', 'NPQR-EFGH', 'STUV-JKLM',
    'WXYZ-NPQR', 'ABCD-STUV',
  ]),
  hashBackupCode: vi.fn().mockResolvedValue('salt:hash'),
  verifyBackupCode: vi.fn().mockResolvedValue(false),
}));

// Mock password utility
vi.mock('../../utils/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('$scrypt$hash'),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

// Mock JWT utilities
vi.mock('../../utils/jwt', () => ({
  createJWT: vi.fn().mockResolvedValue('mock-jwt-token'),
  verifyJWT: vi.fn().mockResolvedValue({ sub: 'user_1', org: 'org_1', role: 'owner', jti: 'jti_1' }),
  generateJti: vi.fn().mockReturnValue('mock-jti-token'),
}));

// Mock API key utility
vi.mock('../../utils/api-key', () => ({
  generateApiKey: vi.fn().mockResolvedValue({ key: 'ak_test', prefix: 'ak_test', hash: 'hash' }),
}));

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
        run: overrides.run
          ? vi.fn().mockImplementation(() => overrides.run(sql))
          : defaultRun,
        all: overrides.all
          ? vi.fn().mockImplementation(() => overrides.all(sql))
          : defaultAll,
      }),
    })),
    batch: vi.fn().mockResolvedValue([]),
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
    JWT_SECRET: 'test-jwt-secret-long-enough-for-hkdf',
    INTERNAL_SECRET: 'test-internal',
    REPORT_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
    EMAIL_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
    REPORTS_BUCKET: { list: vi.fn(), put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    STRIPE_SECRET_KEY: 'sk_test_xxx',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_xxx',
    STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
  };
}

async function createMfaTestApp() {
  const { Hono } = await import('hono');
  const { default: mfaRoutes } = await import('../mfa');

  const app = new Hono();
  app.use('/*', async (c, next) => {
    c.set('userId' as any, 'user_1');
    c.set('orgId' as any, 'org_1');
    c.set('role' as any, 'owner');
    await next();
  });
  app.route('/', mfaRoutes);
  return app;
}

async function createAuthTestApp() {
  const { Hono } = await import('hono');
  const { default: authRoutes } = await import('../auth');

  const app = new Hono();
  app.route('/auth', authRoutes);
  return app;
}

describe('MFA routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    totpValidateResult = 0; // default: valid TOTP
  });

  // =========================================================================
  // MFA-01: Setup
  // =========================================================================
  describe('POST /setup', () => {
    it('returns qrCodeDataUrl and secret for user with mfa_enabled=0', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('mfa_enabled')) {
            return Promise.resolve({ email: 'test@test.com', mfa_enabled: 0 });
          }
          return Promise.resolve(null);
        },
      });

      const app = await createMfaTestApp();
      const res = await app.request('/setup', { method: 'POST' }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.qrCodeDataUrl).toBe('data:image/png;base64,mockQR');
      expect(json.data.secret).toBe('JBSWY3DPEHPK3PXP');

      expect(env.CACHE.put).toHaveBeenCalledWith(
        'mfa_setup:user_1',
        expect.any(String),
        { expirationTtl: 600 },
      );
    });

    it('returns 400 when MFA is already enabled', async () => {
      const env = createMockEnv({
        first: () => Promise.resolve({ email: 'test@test.com', mfa_enabled: 1 }),
      });

      const app = await createMfaTestApp();
      const res = await app.request('/setup', { method: 'POST' }, env);

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('MFA_ALREADY_ENABLED');
    });
  });

  // =========================================================================
  // MFA-01: Confirm
  // =========================================================================
  describe('POST /confirm', () => {
    it('enables MFA and returns 10 backup codes with valid code', async () => {
      totpValidateResult = 0; // valid

      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('email')) {
            return Promise.resolve({ email: 'test@test.com' });
          }
          return Promise.resolve(null);
        },
      });
      env.CACHE.get.mockResolvedValue(JSON.stringify({ secret: 'JBSWY3DPEHPK3PXP' }));

      const app = await createMfaTestApp();
      const res = await app.request('/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '123456' }),
      }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.backupCodes).toHaveLength(10);
      expect(env.DB.batch).toHaveBeenCalledTimes(1);
      expect(env.CACHE.delete).toHaveBeenCalledWith('mfa_setup:user_1');
    });

    it('returns 400 with invalid TOTP code', async () => {
      totpValidateResult = null; // invalid

      const env = createMockEnv({
        first: () => Promise.resolve({ email: 'test@test.com' }),
      });
      env.CACHE.get.mockResolvedValue(JSON.stringify({ secret: 'JBSWY3DPEHPK3PXP' }));

      const app = await createMfaTestApp();
      const res = await app.request('/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '000000' }),
      }, env);

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('INVALID_CODE');
    });

    it('returns 400 when no pending setup exists', async () => {
      const env = createMockEnv();
      env.CACHE.get.mockResolvedValue(null);

      const app = await createMfaTestApp();
      const res = await app.request('/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '123456' }),
      }, env);

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('NO_SETUP');
    });
  });

  // =========================================================================
  // MFA-02: Login returns mfaRequired
  // =========================================================================
  describe('POST /auth/login with MFA', () => {
    it('returns mfaRequired:true when user has mfa_enabled=1', async () => {
      const env = createMockEnv({
        first: () => Promise.resolve({
          id: 'user_1', org_id: 'org_1', email: 'test@test.com', name: 'Test',
          password_hash: '$scrypt$hash',
          role: 'owner', mfa_enabled: 1,
        }),
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
      }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.mfaRequired).toBe(true);
      expect(json.data.mfaToken).toBeDefined();
      expect(json.data.accessToken).toBeUndefined();
    });

    it('returns normal tokens when user has mfa_enabled=0', async () => {
      const env = createMockEnv({
        first: () => Promise.resolve({
          id: 'user_1', org_id: 'org_1', email: 'test@test.com', name: 'Test',
          password_hash: '$scrypt$hash',
          role: 'owner', mfa_enabled: 0,
        }),
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
      }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.accessToken).toBeDefined();
      expect(json.data.refreshToken).toBeDefined();
      expect(json.data.mfaRequired).toBeUndefined();
    });
  });

  // =========================================================================
  // MFA-02: Verify
  // =========================================================================
  describe('POST /auth/mfa/verify', () => {
    it('returns access + refresh tokens with valid TOTP', async () => {
      totpValidateResult = 0; // valid

      const env = createMockEnv({
        first: () => Promise.resolve({
          email: 'test@test.com',
          totp_secret: 'encrypted-totp',
        }),
      });
      env.CACHE.get.mockImplementation(async (key: string) => {
        if (key === 'mfa_attempts:mock-jti-token') return null;
        if (key === 'mfa_challenge:mock-jti-token') {
          return JSON.stringify({ userId: 'user_1', orgId: 'org_1', role: 'owner' });
        }
        return null;
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'mock-jti-token', code: '123456' }),
      }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.accessToken).toBeDefined();
      expect(json.data.refreshToken).toBeDefined();
      expect(json.data.expiresIn).toBe(3600);
      expect(json.data.user.userId).toBe('user_1');
    });

    it('returns 401 with invalid code and increments attempts', async () => {
      totpValidateResult = null; // invalid TOTP

      const env = createMockEnv({
        first: () => Promise.resolve({
          email: 'test@test.com',
          totp_secret: 'encrypted-totp',
        }),
        all: () => Promise.resolve({ results: [] }),
      });
      env.CACHE.get.mockImplementation(async (key: string) => {
        if (key.startsWith('mfa_attempts:')) return '2';
        if (key.startsWith('mfa_challenge:')) {
          return JSON.stringify({ userId: 'user_1', orgId: 'org_1', role: 'owner' });
        }
        return null;
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'mfa-token-123', code: '000000' }),
      }, env);

      expect(res.status).toBe(401);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('INVALID_CODE');

      expect(env.CACHE.put).toHaveBeenCalledWith(
        'mfa_attempts:mfa-token-123',
        '3',
        { expirationTtl: 300 },
      );
    });

    it('returns 429 after 5 failed attempts', async () => {
      const env = createMockEnv();
      env.CACHE.get.mockImplementation(async (key: string) => {
        if (key.startsWith('mfa_attempts:')) return '5';
        if (key.startsWith('mfa_challenge:')) {
          return JSON.stringify({ userId: 'user_1', orgId: 'org_1', role: 'owner' });
        }
        return null;
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'mfa-token-123', code: '000000' }),
      }, env);

      expect(res.status).toBe(429);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('MFA_LOCKED');
      expect(env.CACHE.delete).toHaveBeenCalledWith('mfa_challenge:mfa-token-123');
    });

    it('returns 401 with expired/missing mfaToken', async () => {
      const env = createMockEnv();
      env.CACHE.get.mockResolvedValue(null);

      const app = await createAuthTestApp();
      const res = await app.request('/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'expired-token', code: '123456' }),
      }, env);

      expect(res.status).toBe(401);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('INVALID_TOKEN');
    });
  });

  // =========================================================================
  // MFA-04: Org enforcement
  // =========================================================================
  describe('Org MFA enforcement', () => {
    it('returns mfaSetupRequired when org.mfa_required=1 and user.mfa_enabled=0', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('FROM users')) {
            return Promise.resolve({
              id: 'user_1', org_id: 'org_1', email: 'test@test.com', name: 'Test',
              password_hash: '$scrypt$hash',
              role: 'owner', mfa_enabled: 0,
            });
          }
          if (sql.includes('mfa_required')) {
            return Promise.resolve({ mfa_required: 1 });
          }
          return Promise.resolve(null);
        },
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
      }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.mfaSetupRequired).toBe(true);
      expect(json.data.accessToken).toBeDefined();
      expect(json.data.expiresIn).toBe(300);
    });

    it('returns mfaRequired when org.mfa_required=1 and user.mfa_enabled=1', async () => {
      const env = createMockEnv({
        first: () => Promise.resolve({
          id: 'user_1', org_id: 'org_1', email: 'test@test.com', name: 'Test',
          password_hash: '$scrypt$hash',
          role: 'owner', mfa_enabled: 1,
        }),
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
      }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.mfaRequired).toBe(true);
      expect(json.data.mfaToken).toBeDefined();
      expect(json.data.mfaSetupRequired).toBeUndefined();
    });

    it('returns normal tokens when org.mfa_required=0 and user.mfa_enabled=0', async () => {
      const env = createMockEnv({
        first: (sql: string) => {
          if (sql.includes('FROM users')) {
            return Promise.resolve({
              id: 'user_1', org_id: 'org_1', email: 'test@test.com', name: 'Test',
              password_hash: '$scrypt$hash',
              role: 'owner', mfa_enabled: 0,
            });
          }
          if (sql.includes('mfa_required')) {
            return Promise.resolve({ mfa_required: 0 });
          }
          return Promise.resolve(null);
        },
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
      }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.accessToken).toBeDefined();
      expect(json.data.mfaSetupRequired).toBeUndefined();
      expect(json.data.mfaRequired).toBeUndefined();
    });

    it('GET /api/org/users returns mfa_enabled field for each member', async () => {
      const env = createMockEnv({
        all: () => Promise.resolve({
          results: [
            { id: 'user_1', org_id: 'org_1', email: 'a@test.com', name: 'A', role: 'owner', mfa_enabled: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
            { id: 'user_2', org_id: 'org_1', email: 'b@test.com', name: 'B', role: 'admin', mfa_enabled: 0, created_at: '2024-01-01', updated_at: '2024-01-01' },
          ],
        }),
      });

      const { Hono } = await import('hono');
      const { default: orgRoutes } = await import('../org');

      const app = new Hono();
      app.use('/*', async (c, next) => {
        c.set('userId' as any, 'user_1');
        c.set('orgId' as any, 'org_1');
        c.set('role' as any, 'owner');
        await next();
      });
      app.route('/', orgRoutes);

      const res = await app.request('/users', { method: 'GET' }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(2);
      expect(json.data.items[0].mfa_enabled).toBe(1);
      expect(json.data.items[1].mfa_enabled).toBe(0);
    });
  });

  // =========================================================================
  // MFA-03: Backup codes
  // =========================================================================
  describe('Backup code verification', () => {
    it('accepts valid backup code and marks it used', async () => {
      totpValidateResult = null; // TOTP fails

      const { verifyBackupCode } = await import('../../utils/crypto');
      vi.mocked(verifyBackupCode)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const env = createMockEnv({
        first: () => Promise.resolve({
          email: 'test@test.com',
          totp_secret: 'encrypted-totp',
        }),
        all: () => Promise.resolve({
          results: [
            { id: 'bc_1', code_hash: 'salt1:hash1' },
            { id: 'bc_2', code_hash: 'salt2:hash2' },
          ],
        }),
        run: () => Promise.resolve({}),
      });
      env.CACHE.get.mockImplementation(async (key: string) => {
        if (key.startsWith('mfa_attempts:')) return null;
        if (key.startsWith('mfa_challenge:')) {
          return JSON.stringify({ userId: 'user_1', orgId: 'org_1', role: 'owner' });
        }
        return null;
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'mfa-token-123', code: 'ABCD-EFGH' }),
      }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.accessToken).toBeDefined();
    });

    it('rejects when no unused backup codes match', async () => {
      totpValidateResult = null; // TOTP fails

      const { verifyBackupCode } = await import('../../utils/crypto');
      vi.mocked(verifyBackupCode).mockResolvedValue(false);

      const env = createMockEnv({
        first: () => Promise.resolve({
          email: 'test@test.com',
          totp_secret: 'encrypted-totp',
        }),
        all: () => Promise.resolve({ results: [] }),
      });
      env.CACHE.get.mockImplementation(async (key: string) => {
        if (key.startsWith('mfa_attempts:')) return '0';
        if (key.startsWith('mfa_challenge:')) {
          return JSON.stringify({ userId: 'user_1', orgId: 'org_1', role: 'owner' });
        }
        return null;
      });

      const app = await createAuthTestApp();
      const res = await app.request('/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'mfa-token-123', code: 'USED-CODE' }),
      }, env);

      expect(res.status).toBe(401);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('INVALID_CODE');
    });
  });

  // =========================================================================
  // MFA-05: Admin reset
  // =========================================================================
  describe('DELETE /reset/:userId', () => {
    it('clears MFA for admin role', async () => {
      const env = createMockEnv({
        first: () => Promise.resolve({ id: 'user_2' }),
      });

      const app = await createMfaTestApp();
      const res = await app.request('/reset/user_2', { method: 'DELETE' }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(env.DB.batch).toHaveBeenCalledTimes(1);
    });

    it('returns 403 for viewer role', async () => {
      const env = createMockEnv();

      const { Hono } = await import('hono');
      const { default: mfaRoutes } = await import('../mfa');

      const app = new Hono();
      app.use('/*', async (c, next) => {
        c.set('userId' as any, 'user_1');
        c.set('orgId' as any, 'org_1');
        c.set('role' as any, 'viewer');
        await next();
      });
      app.route('/', mfaRoutes);

      const res = await app.request('/reset/user_2', { method: 'DELETE' }, env);

      expect(res.status).toBe(403);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('returns 400 for self-reset attempt', async () => {
      const env = createMockEnv();

      const app = await createMfaTestApp();
      const res = await app.request('/reset/user_1', { method: 'DELETE' }, env);

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('SELF_RESET');
    });

    it('returns 404 when target user not in same org', async () => {
      const env = createMockEnv({
        first: () => Promise.resolve(null),
      });

      const app = await createMfaTestApp();
      const res = await app.request('/reset/user_999', { method: 'DELETE' }, env);

      expect(res.status).toBe(404);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // POST /disable
  // =========================================================================
  describe('POST /disable', () => {
    it('disables MFA with valid TOTP code', async () => {
      totpValidateResult = 0; // valid

      const env = createMockEnv({
        first: () => Promise.resolve({
          email: 'test@test.com',
          mfa_enabled: 1,
          totp_secret: 'encrypted-secret',
        }),
      });

      const app = await createMfaTestApp();
      const res = await app.request('/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '123456' }),
      }, env);

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(env.DB.batch).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when MFA not enabled', async () => {
      const env = createMockEnv({
        first: () => Promise.resolve({
          email: 'test@test.com',
          mfa_enabled: 0,
          totp_secret: null,
        }),
      });

      const app = await createMfaTestApp();
      const res = await app.request('/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '123456' }),
      }, env);

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('MFA_NOT_ENABLED');
    });
  });
});
