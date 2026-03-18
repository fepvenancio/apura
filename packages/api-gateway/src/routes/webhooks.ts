import { Hono } from 'hono';
import Stripe from 'stripe';
import type { Env, AppVariables } from '../types';
import { getStripe, buildPriceMap, getPlanFromPriceId } from '../services/stripe';
import { OrgDatabase } from '../services/org-db';
import { PLAN_LIMITS } from '@apura/shared';
import type { PlanType } from '@apura/shared';

const webhooks = new Hono<{ Bindings: Env; Variables: AppVariables }>();

webhooks.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing stripe-signature header' }, 400);
  }

  const body = await c.req.text();
  const stripe = getStripe(c.env);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  // Idempotency check
  const existing = await c.env.DB.prepare(
    'SELECT event_id FROM stripe_events WHERE event_id = ?',
  )
    .bind(event.id)
    .first<{ event_id: string }>();

  if (existing) {
    return c.json({ received: true });
  }

  const priceMap = buildPriceMap(c.env);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.client_reference_id;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      if (!orgId || !subscriptionId) break;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId) as unknown as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;
      if (!priceId) break;

      const plan = getPlanFromPriceId(priceMap, priceId);
      const limits = PLAN_LIMITS[plan];
      const rawEnd = (subscription as any).current_period_end;
      const periodEnd = rawEnd
        ? new Date(rawEnd * 1000).toISOString()
        : null;

      const orgDb = new OrgDatabase(c.env.DB, orgId);
      await orgDb.updateOrg({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        plan,
        max_users: limits.maxUsers,
        max_queries_per_month: limits.maxQueries,
        subscription_status: 'active',
        current_period_end: periodEnd,
      } as any);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.org_id;
      if (!orgId) break;

      const priceId = subscription.items.data[0]?.price.id;
      if (!priceId) break;

      const plan = getPlanFromPriceId(priceMap, priceId);
      const limits = PLAN_LIMITS[plan];
      const status = subscription.cancel_at_period_end ? 'canceling' : subscription.status;
      const rawEnd = (subscription as any).current_period_end;
      const periodEnd = rawEnd
        ? new Date(rawEnd * 1000).toISOString()
        : null;

      const orgDb = new OrgDatabase(c.env.DB, orgId);
      await orgDb.updateOrg({
        plan,
        max_users: limits.maxUsers,
        max_queries_per_month: limits.maxQueries,
        subscription_status: status,
        current_period_end: periodEnd,
      } as any);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.org_id;
      if (!orgId) break;

      const trialLimits = PLAN_LIMITS.trial;
      const orgDb = new OrgDatabase(c.env.DB, orgId);
      await orgDb.updateOrg({
        plan: 'trial' as PlanType,
        max_users: trialLimits.maxUsers,
        max_queries_per_month: trialLimits.maxQueries,
        subscription_status: 'canceled',
        stripe_subscription_id: null,
      } as any);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as any).subscription as string;
      if (!subscriptionId) break;

      const org = await c.env.DB.prepare(
        'SELECT id FROM organizations WHERE stripe_subscription_id = ?',
      )
        .bind(subscriptionId)
        .first<{ id: string }>();

      if (!org) break;

      const orgDb = new OrgDatabase(c.env.DB, org.id);
      await orgDb.updateOrg({ subscription_status: 'active' } as any);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as any).subscription as string;
      if (!subscriptionId) break;

      const org = await c.env.DB.prepare(
        'SELECT id, billing_email FROM organizations WHERE stripe_subscription_id = ?',
      )
        .bind(subscriptionId)
        .first<{ id: string; billing_email: string }>();

      if (!org) break;

      const orgDb = new OrgDatabase(c.env.DB, org.id);
      await orgDb.updateOrg({ subscription_status: 'past_due' } as any);

      // Fire-and-forget payment failure notification
      if (org.billing_email) {
        c.executionCtx.waitUntil(
          c.env.EMAIL_QUEUE.send({
            type: 'payment_failed',
            to: [org.billing_email],
          }),
        );
      }
      break;
    }

    case 'invoice.payment_action_required': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as any).subscription as string;
      if (!subscriptionId) break;

      const org = await c.env.DB.prepare(
        'SELECT id FROM organizations WHERE stripe_subscription_id = ?',
      )
        .bind(subscriptionId)
        .first<{ id: string }>();

      if (!org) break;

      const orgDb = new OrgDatabase(c.env.DB, org.id);
      await orgDb.updateOrg({ subscription_status: 'past_due' } as any);
      break;
    }
  }

  // Record processed event for idempotency
  await c.env.DB.prepare(
    'INSERT INTO stripe_events (id, event_id, event_type, processed_at) VALUES (?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), event.id, event.type, new Date().toISOString())
    .run();

  return c.json({ received: true });
});

export default webhooks;
