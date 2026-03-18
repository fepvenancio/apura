import { describe, it, expect, vi } from 'vitest';
import { quotaMiddleware } from '../quota';

function createMockContext(overrides: {
  orgId?: string;
  dbThrows?: boolean;
  dbResult?: any;
} = {}) {
  const { orgId = 'org-1', dbThrows = false, dbResult = null } = overrides;

  const jsonFn = vi.fn((body: any, status?: number) => {
    return new Response(JSON.stringify(body), { status: status ?? 200 });
  });

  const headerFn = vi.fn();

  const prepareChain = {
    bind: vi.fn().mockReturnThis(),
    first: dbThrows
      ? vi.fn().mockRejectedValue(new Error('DB connection failed'))
      : vi.fn().mockResolvedValue(dbResult),
  };

  const c = {
    get: vi.fn((key: string) => {
      if (key === 'orgId') return orgId;
      return undefined;
    }),
    json: jsonFn,
    header: headerFn,
    env: {
      DB: {
        prepare: vi.fn().mockReturnValue(prepareChain),
      },
    },
  } as any;

  return { c, jsonFn, headerFn };
}

describe('quotaMiddleware - BUG-01: fail closed on DB error', () => {
  it('returns 503 when database query throws an error', async () => {
    const { c, jsonFn } = createMockContext({ dbThrows: true });
    const next = vi.fn();

    const result = await quotaMiddleware(c, next);

    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'SERVICE_UNAVAILABLE',
        }),
      }),
      503,
    );
  });

  it('does NOT call next() when database query throws', async () => {
    const { c } = createMockContext({ dbThrows: true });
    const next = vi.fn();

    await quotaMiddleware(c, next);

    expect(next).not.toHaveBeenCalled();
  });
});
