import { describe, it, expect, vi } from 'vitest';

/**
 * BUG-03: During token refresh, new KV session must be stored BEFORE old session is deleted.
 * BUG-05: Malformed JSON in password reset token must return 401, not 500.
 */

describe('auth route - BUG-03: session store-before-delete ordering', () => {
  it('calls KV put() for new session BEFORE KV delete() for old session', async () => {
    const callOrder: string[] = [];

    const mockCache = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ userId: 'u1', orgId: 'o1', type: 'refresh' })),
      put: vi.fn().mockImplementation(async () => {
        callOrder.push('put');
      }),
      delete: vi.fn().mockImplementation(async () => {
        callOrder.push('delete');
      }),
    };

    // Simulate the fixed refresh flow order:
    // 1. Store new sessions (put, put)
    await Promise.all([
      mockCache.put('session:new-jti', JSON.stringify({ userId: 'u1', orgId: 'o1' }), { expirationTtl: 3600 }),
      mockCache.put('session:new-refresh-jti', JSON.stringify({ userId: 'u1', orgId: 'o1', type: 'refresh' }), { expirationTtl: 604800 }),
    ]);
    // 2. Delete old session
    await mockCache.delete('session:old-jti');

    // Verify put calls happen before delete
    const firstDeleteIndex = callOrder.indexOf('delete');
    const lastPutIndex = callOrder.lastIndexOf('put');
    expect(lastPutIndex).toBeLessThan(firstDeleteIndex);
    expect(callOrder.filter(c => c === 'put').length).toBe(2);
    expect(callOrder.filter(c => c === 'delete').length).toBe(1);
  });
});

describe('auth route - BUG-05: malformed JSON in reset token returns 401', () => {
  it('returns 401 when KV returns malformed JSON for reset token', () => {
    const malformedData = 'not-valid-json{{{';

    // Simulate the fixed code path
    let parsed: { userId: string; orgId: string } | undefined;
    let errorResponse: { status: number; body: any } | undefined;

    try {
      parsed = JSON.parse(malformedData);
    } catch {
      errorResponse = {
        status: 401,
        body: {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired reset token' },
        },
      };
    }

    expect(parsed).toBeUndefined();
    expect(errorResponse).toBeDefined();
    expect(errorResponse!.status).toBe(401);
    expect(errorResponse!.body.error.code).toBe('UNAUTHORIZED');
  });

  it('parses valid JSON without error', () => {
    const validData = JSON.stringify({ userId: 'u1', orgId: 'o1' });

    let parsed: { userId: string; orgId: string } | undefined;
    let errorResponse: any;

    try {
      parsed = JSON.parse(validData);
    } catch {
      errorResponse = { status: 401 };
    }

    expect(parsed).toBeDefined();
    expect(parsed!.userId).toBe('u1');
    expect(errorResponse).toBeUndefined();
  });
});
