import { Context, Next, MiddlewareHandler } from 'hono';
import type { UserRole } from '@apura/shared';
import { CACHE_TTL_SESSION } from '@apura/shared';
import type { Env, AppVariables } from '../types';
import { verifyJWT } from '../utils/jwt';

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * JWT authentication middleware.
 *
 * Extracts and verifies a Bearer token, checks session validity in KV,
 * and attaches user context to the Hono context.
 */
export async function authMiddleware(c: AppContext, next: Next): Promise<Response | void> {
  const authorization = c.req.header('Authorization');
  if (!authorization) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' } }, 401);
  }

  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid authorization format' } }, 401);
  }

  const token = parts[1];

  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);

    // Skip KV session check for very fresh tokens (< 60s old).
    // Cloudflare KV is eventually consistent — reads may miss writes
    // for a few seconds after login. The JWT signature is sufficient
    // proof of authenticity for fresh tokens.
    const tokenAge = Math.floor(Date.now() / 1000) - payload.iat;
    if (tokenAge > 60) {
      const sessionKey = `session:${payload.jti}`;
      const session = await c.env.CACHE.get(sessionKey);
      if (!session) {
        return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session expired or revoked' } }, 401);
      }

      // Reject refresh tokens used as access tokens
      const sessionData = JSON.parse(session);
      if (sessionData.type === 'refresh') {
        return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token type' } }, 401);
      }
    }

    // Attach user context
    c.set('userId', payload.sub);
    c.set('orgId', payload.org);
    c.set('role', payload.role);

    return next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message } }, 401);
  }
}

/**
 * Optional authentication middleware.
 * Attempts to authenticate but does not fail if no token is present.
 */
export async function optionalAuth(c: AppContext, next: Next): Promise<Response | void> {
  const authorization = c.req.header('Authorization');
  if (!authorization) {
    return next();
  }

  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next();
  }

  try {
    const payload = await verifyJWT(parts[1], c.env.JWT_SECRET);

    const sessionKey = `session:${payload.jti}`;
    const session = await c.env.CACHE.get(sessionKey);
    if (session) {
      c.set('userId', payload.sub);
      c.set('orgId', payload.org);
      c.set('role', payload.role);
    }
  } catch {
    // Silently ignore invalid tokens in optional auth
  }

  return next();
}

/**
 * Role-based access control middleware factory.
 * Returns a middleware that checks if the authenticated user has one of the allowed roles.
 */
export function requireRole(...roles: UserRole[]): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return async (c, next) => {
    const role = c.get('role');
    if (!role) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }
    if (!roles.includes(role as UserRole)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
    }
    return next();
  };
}
