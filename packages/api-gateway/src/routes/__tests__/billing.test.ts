import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe before importing
vi.mock('stripe', () => {
  const mockCheckoutCreate = vi.fn();
  const mockPortalCreate = vi.fn();
  const mockCustomersCreate = vi.fn();
  const MockStripe = vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCheckoutCreate } },
    billingPortal: { sessions: { create: mockPortalCreate } },
    customers: { create: mockCustomersCreate },
  }));
  (MockStripe as any).createFetchHttpClient = vi.fn();
  return {
    default: MockStripe,
    __mockCheckoutCreate: mockCheckoutCreate,
    __mockPortalCreate: mockPortalCreate,
    __mockCustomersCreate: mockCustomersCreate,
  };
});

// @ts-expect-error test mock exports
import { __mockCheckoutCreate, __mockPortalCreate, __mockCustomersCreate } from 'stripe';

function makeOrg(overrides: Record<string, any> = {}) {
  return {
    id: 'org_1',
    name: 'Test Org',
    slug: 'test-org',
    plan: 'trial',
    billing_email: 'billing@test.com',
    stripe_customer_id: 'cus_existing',
    stripe_subscription_id: null,
    max_users: 2,
    max_queries_per_month: 100,
    queries_this_month: 42,
    subscription_status: 'trialing',
    current_period_end: null,
    ...overrides,
  };
}

function makeEnv(org: any = makeOrg(), memberCount = 3) {
  const firstResults: any[] = [org]; // getOrg result
  let callIdx = 0;
  return {
    STRIPE_SECRET_KEY: 'sk_test_xxx',
    STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
    DB: {
      prepare: vi.fn().mockImplementation((sql: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (sql.includes('COUNT(*)')) return { count: memberCount };
            if (sql.includes('SELECT') && sql.includes('organizations')) return org;
            return null;
          }),
          run: vi.fn().mockResolvedValue({}),
        }),
      })),
    },
  };
}

// Create a minimal Hono app that mimics auth context
async function createTestApp() {
  const { Hono } = await import('hono');
  const { default: billing } = await import('../billing');

  const app = new Hono();
  // Simulate authMiddleware setting variables
  app.use('/*', async (c, next) => {
    c.set('orgId' as any, 'org_1');
    c.set('userId' as any, 'user_1');
    c.set('role' as any, 'owner');
    await next();
  });
  app.route('/', billing);
  return app;
}

describe('billing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /checkout creates session and returns URL', async () => {
    __mockCheckoutCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/session_123' });

    const app = await createTestApp();
    const res = await app.request('/', {
      method: 'POST',
    }, makeEnv());

    // This hits /checkout - need correct path
    // Actually our billing router mounts at root, so /checkout
    const res2 = await app.request('/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_starter_monthly' }),
    }, makeEnv());

    expect(res2.status).toBe(200);
    const json = await res2.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.url).toBe('https://checkout.stripe.com/session_123');
  });

  it('POST /checkout creates Stripe customer if org has none', async () => {
    __mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_new' });
    __mockCheckoutCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/new' });

    const orgWithoutCustomer = makeOrg({ stripe_customer_id: null });
    const app = await createTestApp();
    const res = await app.request('/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_starter_monthly' }),
    }, makeEnv(orgWithoutCustomer));

    expect(res.status).toBe(200);
    expect(__mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'billing@test.com',
        metadata: { org_id: 'org_1' },
      }),
    );
  });

  it('POST /portal returns portal URL', async () => {
    __mockPortalCreate.mockResolvedValueOnce({ url: 'https://billing.stripe.com/portal_123' });

    const app = await createTestApp();
    const res = await app.request('/portal', {
      method: 'POST',
    }, makeEnv());

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.url).toBe('https://billing.stripe.com/portal_123');
  });

  it('POST /portal returns 400 if no stripe_customer_id', async () => {
    const orgWithoutCustomer = makeOrg({ stripe_customer_id: null });
    const app = await createTestApp();
    const res = await app.request('/portal', {
      method: 'POST',
    }, makeEnv(orgWithoutCustomer));

    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('No billing account');
  });

  it('GET / returns billing info with correct fields', async () => {
    const app = await createTestApp();
    const res = await app.request('/', {
      method: 'GET',
    }, makeEnv());

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.plan).toBe('trial');
    expect(json.data.queriesUsed).toBe(42);
    expect(json.data.queriesLimit).toBe(100);
    expect(json.data.membersUsed).toBe(3);
    expect(json.data.membersLimit).toBe(2);
    expect(json.data.billingEmail).toBe('billing@test.com');
    expect(json.data.subscriptionStatus).toBe('trialing');
  });
});
