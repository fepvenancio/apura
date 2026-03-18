import { Context, Next } from 'hono';
import type { Organization, PlanType } from '@apura/shared';
import { PLAN_LIMITS } from '@apura/shared';
import type { Env, AppVariables } from '../types';

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * Query quota enforcement middleware.
 *
 * Reads the organization's current query count from D1 and compares
 * against the plan limit. Blocks requests if the quota is exceeded
 * and no overage billing is configured.
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
    const isAtLimit = org.queries_this_month >= org.max_queries_per_month;

    if (isAtLimit) {
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

      // Has overage billing — allow but flag
      c.header('X-Quota-Overage', 'true');
      c.header('X-Quota-Overage-Rate', String(planLimits.overagePerQuery));
    }

    // Add usage headers
    c.header('X-Quota-Used', String(org.queries_this_month));
    c.header('X-Quota-Limit', String(org.max_queries_per_month));
    c.header('X-Quota-Remaining', String(Math.max(0, org.max_queries_per_month - org.queries_this_month)));

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
