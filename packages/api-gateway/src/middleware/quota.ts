import { Context, Next } from 'hono';
import type { Organization, PlanType } from '@apura/shared';
import { PLAN_LIMITS } from '@apura/shared';
import type { Env, AppVariables } from '../types';
import { OrgDatabase } from '../services/org-db';

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * Query quota enforcement middleware.
 *
 * Uses an atomic UPDATE to increment the query count only if under quota,
 * eliminating the TOCTOU race condition between checking and incrementing.
 * The quota is consumed here; callers should NOT call incrementQueryCount()
 * separately after this middleware runs.
 */
export async function quotaMiddleware(c: AppContext, next: Next): Promise<Response | void> {
  const orgId = c.get('orgId');
  if (!orgId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
  }

  try {
    const org = await c.env.DB.prepare(
      'SELECT plan, queries_this_month, max_queries_per_month FROM organizations WHERE id = ?',
    )
      .bind(orgId)
      .first<Pick<Organization, 'plan' | 'queries_this_month' | 'max_queries_per_month'>>();

    if (!org) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } }, 404);
    }

    const planLimits = PLAN_LIMITS[org.plan as PlanType];
    const orgDb = new OrgDatabase(c.env.DB, orgId);

    // Attempt atomic increment — only succeeds if under quota
    const incremented = await orgDb.incrementQueryCountAtomic();

    if (!incremented) {
      // Quota is at or over limit
      const hasOverage = planLimits.overagePerQuery > 0;

      if (!hasOverage) {
        // Trial or plans without overage — hard block
        return c.json(
          {
            success: false,
            error: {
              code: 'QUOTA_EXCEEDED',
              message: `Monthly query limit of ${org.max_queries_per_month} reached. Please upgrade your plan.`,
            },
            meta: {
              currentUsage: org.queries_this_month,
              limit: org.max_queries_per_month,
              plan: org.plan,
            },
          },
          402,
        );
      }

      // Has overage billing — force-increment and allow but flag
      await orgDb.incrementQueryCount();
      c.header('X-Quota-Overage', 'true');
      c.header('X-Quota-Overage-Rate', String(planLimits.overagePerQuery));
    }

    // Re-read updated count for headers (the count was just incremented)
    const updatedUsage = org.queries_this_month + 1;

    // Add usage headers
    c.header('X-Quota-Used', String(updatedUsage));
    c.header('X-Quota-Limit', String(org.max_queries_per_month));
    c.header('X-Quota-Remaining', String(Math.max(0, org.max_queries_per_month - updatedUsage)));

    // Mark that quota was already consumed so route handlers don't double-count
    c.set('quotaConsumed' as any, true);

    return next();
  } catch (err) {
    console.error('Quota check error:', err);
    // Fail closed on quota check errors — do not allow unverified requests
    return c.json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Unable to verify quota. Please try again later.',
      },
    }, 503);
  }
}
