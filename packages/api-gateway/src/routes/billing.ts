import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import { getStripe } from '../services/stripe';
import { OrgDatabase } from '../services/org-db';

const billing = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// POST /checkout -- create a Stripe Checkout session
billing.post('/checkout', async (c) => {
  const orgId = c.get('orgId');
  const { priceId } = await c.req.json<{ priceId: string }>();

  if (!priceId) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'priceId is required' } },
      400,
    );
  }

  const orgDb = new OrgDatabase(c.env.DB, orgId);
  const org = await orgDb.getOrg();
  if (!org) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } },
      404,
    );
  }

  const stripe = getStripe(c.env);

  // Lazy-create Stripe customer if needed
  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: org.billing_email,
      metadata: { org_id: orgId },
    });
    customerId = customer.id;
    await orgDb.updateOrg({ stripe_customer_id: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: 'https://app.apura.xyz/settings/billing?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://app.apura.xyz/settings/billing',
    subscription_data: {
      metadata: { org_id: orgId },
    },
    client_reference_id: orgId,
  });

  return c.json({ success: true, data: { url: session.url } });
});

// POST /portal -- create a Stripe Customer Portal session
billing.post('/portal', async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);
  const org = await orgDb.getOrg();

  if (!org) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } },
      404,
    );
  }

  if (!org.stripe_customer_id) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'No billing account found' } },
      400,
    );
  }

  const stripe = getStripe(c.env);
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: 'https://app.apura.xyz/settings/billing',
  });

  return c.json({ success: true, data: { url: portalSession.url } });
});

// GET / -- billing info for the current org
billing.get('/', async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);
  const org = await orgDb.getOrg();

  if (!org) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } },
      404,
    );
  }

  // Count current members
  const memberCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM users WHERE org_id = ?',
  )
    .bind(orgId)
    .first<{ count: number }>();

  return c.json({
    success: true,
    data: {
      plan: org.plan,
      queriesUsed: org.queries_this_month,
      queriesLimit: org.max_queries_per_month,
      membersUsed: memberCount?.count ?? 0,
      membersLimit: org.max_users,
      billingEmail: org.billing_email,
      currentPeriodEnd: org.current_period_end,
      subscriptionStatus: org.subscription_status,
    },
  });
});

export default billing;
