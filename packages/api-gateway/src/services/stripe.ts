import Stripe from 'stripe';
import type { PlanType } from '@apura/shared';
import type { Env } from '../types';

export function getStripe(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * Build a map from Stripe price IDs (env vars) to internal plan types.
 * Price IDs differ between test/prod so they are configured as env vars.
 */
export function buildPriceMap(env: Env): Record<string, PlanType> {
  const map: Record<string, PlanType> = {};
  const prices: Array<[string | undefined, PlanType]> = [
    [(env as any).STRIPE_PRICE_STARTER_MONTHLY, 'starter'],
    [(env as any).STRIPE_PRICE_STARTER_ANNUAL, 'starter'],
    [(env as any).STRIPE_PRICE_PROFESSIONAL_MONTHLY, 'professional'],
    [(env as any).STRIPE_PRICE_PROFESSIONAL_ANNUAL, 'professional'],
    [(env as any).STRIPE_PRICE_BUSINESS_MONTHLY, 'business'],
    [(env as any).STRIPE_PRICE_BUSINESS_ANNUAL, 'business'],
    [(env as any).STRIPE_PRICE_ENTERPRISE_MONTHLY, 'enterprise'],
    [(env as any).STRIPE_PRICE_ENTERPRISE_ANNUAL, 'enterprise'],
  ];
  for (const [priceId, plan] of prices) {
    if (priceId) map[priceId] = plan;
  }
  return map;
}

export function getPlanFromPriceId(priceMap: Record<string, PlanType>, priceId: string): PlanType {
  return priceMap[priceId] ?? 'trial';
}
