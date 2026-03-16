import { Context, Next } from 'hono';
import type { Env, AppVariables } from '../types';

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/** Rate limits per endpoint category. */
const RATE_LIMITS: Record<string, number> = {
  query: 60,    // 60 requests/minute for query endpoints
  default: 300, // 300 requests/minute for general endpoints
};

/**
 * Determine the rate limit category for a request path.
 */
function getRateLimitCategory(path: string): string {
  if (path.includes('/queries')) return 'query';
  return 'default';
}

/**
 * Rate limiting middleware using Cloudflare KV.
 *
 * Uses a sliding window approximation with 60-second TTL counters.
 * Key format: rate:{orgId}:{category}:{minute}
 */
export async function rateLimitMiddleware(c: AppContext, next: Next): Promise<Response | void> {
  const orgId = c.get('orgId');
  if (!orgId) {
    // No org context means no rate limiting (e.g., public endpoints)
    return next();
  }

  const category = getRateLimitCategory(c.req.path);
  const limit = RATE_LIMITS[category] ?? RATE_LIMITS.default;
  const minute = Math.floor(Date.now() / 60000);
  const userId = c.get('userId') ?? '';
  const key = `rate:${orgId}:${userId}:${category}:${minute}`;

  try {
    const currentStr = await c.env.CACHE.get(key);
    const current = currentStr ? parseInt(currentStr, 10) : 0;

    if (current >= limit) {
      const retryAfter = 60 - (Math.floor(Date.now() / 1000) % 60);
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Rate limit exceeded. Maximum ${limit} requests per minute.`,
          },
        },
        429,
        {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String((minute + 1) * 60),
        },
      );
    }

    // Note: KV does not support atomic increment. Under high concurrency,
    // rate limits may allow slightly more requests than the configured limit.
    // This is acceptable for our use case; Cloudflare's edge rate limiting
    // provides the primary defense.

    // Increment counter with 60-second TTL
    await c.env.CACHE.put(key, String(current + 1), { expirationTtl: 60 });

    // Add rate limit headers to response
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(limit - current - 1));
    c.header('X-RateLimit-Reset', String((minute + 1) * 60));
  } catch (err) {
    // Don't block requests if rate limiting fails
    console.error('Rate limit error:', err);
  }

  return next();
}
