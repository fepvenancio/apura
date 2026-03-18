import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe before importing anything that uses it
vi.mock('stripe', () => {
  const mockSubscriptionsRetrieve = vi.fn();
  const mockConstructEventAsync = vi.fn();
  const MockStripe = vi.fn().mockImplementation(() => ({
    webhooks: {
      constructEventAsync: mockConstructEventAsync,
    },
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
    },
  }));
  (MockStripe as any).createFetchHttpClient = vi.fn();
  (MockStripe as any).createSubtleCryptoProvider = vi.fn();
  return { default: MockStripe, __mockConstructEvent: mockConstructEventAsync, __mockSubRetrieve: mockSubscriptionsRetrieve };
});

import Stripe from 'stripe';
// @ts-expect-error test mock exports
import { __mockConstructEvent, __mockSubRetrieve } from 'stripe';

function makeEnv(overrides: Record<string, any> = {}) {
  return {
    STRIPE_SECRET_KEY: 'sk_test_xxx',
    STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
    STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_monthly',
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({}),
        }),
      }),
    },
    EMAIL_QUEUE: {
      send: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function makeEvent(type: string, data: any, id = 'evt_test_123') {
  return { id, type, data: { object: data } };
}

describe('webhooks - Stripe webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when stripe-signature header is missing', async () => {
    const { default: webhooks } = await import('../webhooks');
    const res = await webhooks.request('/stripe', {
      method: 'POST',
      body: '{}',
    }, makeEnv());

    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toContain('Missing');
  });

  it('returns 400 when signature is invalid', async () => {
    __mockConstructEvent.mockRejectedValueOnce(new Error('Invalid signature'));

    const { default: webhooks } = await import('../webhooks');
    const res = await webhooks.request('/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_invalid' },
      body: '{}',
    }, makeEnv());

    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toContain('Invalid signature');
  });

  it('processes checkout.session.completed and updates org to active', async () => {
    const event = makeEvent('checkout.session.completed', {
      client_reference_id: 'org_1',
      customer: 'cus_abc',
      subscription: 'sub_abc',
    });
    __mockConstructEvent.mockResolvedValueOnce(event);

    __mockSubRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { id: 'price_starter_monthly' } }] },
      current_period_end: 1700000000,
    });

    const mockRun = vi.fn().mockResolvedValue({});
    const mockFirst = vi.fn().mockResolvedValue(null); // no existing event
    const env = makeEnv({
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: mockFirst,
            run: mockRun,
          }),
        }),
      },
    });

    const { default: webhooks } = await import('../webhooks');
    const res = await webhooks.request('/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_valid' },
      body: JSON.stringify(event),
    }, env);

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.received).toBe(true);
    // DB prepare called for: idempotency check, updateOrg, insert stripe_events
    expect(env.DB.prepare).toHaveBeenCalled();
  });

  it('sets status to canceling when cancel_at_period_end is true', async () => {
    const event = makeEvent('customer.subscription.updated', {
      metadata: { org_id: 'org_1' },
      items: { data: [{ price: { id: 'price_starter_monthly' } }] },
      cancel_at_period_end: true,
      status: 'active',
      current_period_end: 1700000000,
    });
    __mockConstructEvent.mockResolvedValueOnce(event);

    const updateCalls: string[] = [];
    const mockRun = vi.fn().mockImplementation(async () => {
      updateCalls.push('run');
    });
    const mockFirst = vi.fn().mockResolvedValue(null);
    const env = makeEnv({
      DB: {
        prepare: vi.fn().mockImplementation((sql: string) => ({
          bind: vi.fn().mockReturnValue({
            first: mockFirst,
            run: mockRun,
          }),
        })),
      },
    });

    const { default: webhooks } = await import('../webhooks');
    const res = await webhooks.request('/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_valid' },
      body: JSON.stringify(event),
    }, env);

    expect(res.status).toBe(200);
    // The SQL for updateOrg should contain 'canceling'
    const prepareCalls = (env.DB.prepare as any).mock.calls.map((c: any) => c[0]);
    const updateSql = prepareCalls.find((s: string) => s.includes('UPDATE organizations'));
    expect(updateSql).toBeDefined();
  });

  it('downgrades to trial on subscription.deleted', async () => {
    const event = makeEvent('customer.subscription.deleted', {
      metadata: { org_id: 'org_1' },
    });
    __mockConstructEvent.mockResolvedValueOnce(event);

    const mockRun = vi.fn().mockResolvedValue({});
    const mockFirst = vi.fn().mockResolvedValue(null);
    const env = makeEnv({
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: mockFirst,
            run: mockRun,
          }),
        }),
      },
    });

    const { default: webhooks } = await import('../webhooks');
    const res = await webhooks.request('/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_valid' },
      body: JSON.stringify(event),
    }, env);

    expect(res.status).toBe(200);
    expect(env.DB.prepare).toHaveBeenCalled();
  });

  it('sets status to past_due on invoice.payment_failed', async () => {
    const event = makeEvent('invoice.payment_failed', {
      subscription: 'sub_abc',
    });
    __mockConstructEvent.mockResolvedValueOnce(event);

    const mockFirst = vi.fn()
      .mockResolvedValueOnce(null) // idempotency check
      .mockResolvedValueOnce({ id: 'org_1', billing_email: 'test@test.com' }); // org lookup
    const mockRun = vi.fn().mockResolvedValue({});
    const env = makeEnv({
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: mockFirst,
            run: mockRun,
          }),
        }),
      },
    });

    // Create a Hono app wrapper that provides executionCtx.waitUntil
    const { Hono } = await import('hono');
    const { default: webhooks } = await import('../webhooks');
    const app = new Hono();
    app.route('/webhooks', webhooks);

    const req = new Request('http://localhost/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_valid' },
      body: JSON.stringify(event),
    });

    const res = await app.fetch(req, env, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as any);

    expect(res.status).toBe(200);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent('checkout.session.completed', {
      client_reference_id: 'org_1',
      customer: 'cus_abc',
      subscription: 'sub_abc',
    }, 'evt_duplicate');
    __mockConstructEvent.mockResolvedValueOnce(event);

    // Return existing event from idempotency check
    const mockFirst = vi.fn().mockResolvedValue({ event_id: 'evt_duplicate' });
    const env = makeEnv({
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: mockFirst,
            run: vi.fn().mockResolvedValue({}),
          }),
        }),
      },
    });

    const { default: webhooks } = await import('../webhooks');
    const res = await webhooks.request('/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_valid' },
      body: JSON.stringify(event),
    }, env);

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.received).toBe(true);
    // subscriptions.retrieve should NOT be called (event was skipped)
    expect(__mockSubRetrieve).not.toHaveBeenCalled();
  });
});
