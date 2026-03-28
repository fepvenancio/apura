import { createClerkClient, verifyToken } from '@clerk/backend'
import { Context, Next } from 'hono'

export interface AuthContext {
  userId: string
  orgId: string | undefined
  orgRole: string | undefined
  orgSlug: string | undefined
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext
    clerkUserId: string
    orgId: string | undefined
    orgRole: string | undefined
  }
}

export function requireAuth() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized', message: 'Missing Bearer token' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')

    try {
      const payload = await verifyToken(token, {
        secretKey: c.env.CLERK_SECRET_KEY,
      })

      const auth: AuthContext = {
        userId: payload.sub,
        orgId: payload.org_id as string | undefined,
        orgRole: payload.org_role as string | undefined,
        orgSlug: payload.org_slug as string | undefined,
      }

      c.set('auth', auth)
      c.set('clerkUserId', payload.sub)
      c.set('orgId', auth.orgId)
      c.set('orgRole', auth.orgRole)

      await next()
    } catch (err) {
      console.error('Auth verification failed:', err)
      return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401)
    }
  }
}

const ROLE_HIERARCHY: Record<string, number> = {
  'org:owner': 4,
  'org:admin': 3,
  'org:analyst': 2,
  'org:viewer': 1,
}

export function requireRole(minimumRole: 'owner' | 'admin' | 'analyst' | 'viewer') {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const orgRole = auth.orgRole
    if (!orgRole) {
      return c.json({ error: 'Forbidden', message: 'No organization role found' }, 403)
    }

    const roleKey = orgRole.startsWith('org:') ? orgRole : `org:${orgRole}`
    const userLevel = ROLE_HIERARCHY[roleKey] ?? 0
    const requiredLevel = ROLE_HIERARCHY[`org:${minimumRole}`] ?? 0

    if (userLevel < requiredLevel) {
      return c.json({ error: 'Forbidden', message: `Requires ${minimumRole} role or higher` }, 403)
    }

    await next()
  }
}

export function getClerkClient(env: { CLERK_SECRET_KEY: string }) {
  return createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
}
