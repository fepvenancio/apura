# Phase 3: Billing - Research

**Researched:** 2026-03-18
**Domain:** Stripe subscription billing on Cloudflare Workers (Hono)
**Confidence:** HIGH

## Summary

Phase 3 integrates Stripe for subscription billing into an existing Cloudflare Workers Hono API. The codebase already has significant scaffolding: the `organizations` table has `stripe_customer_id`, `stripe_subscription_id`, `plan`, `max_queries_per_month`, and `queries_this_month` columns. The `STRIPE_WEBHOOK_SECRET` env var is declared in `types.ts`. The `EMAIL_QUEUE` binding is already wired in `wrangler.toml`. A pricing page exists at `/pricing` and a billing settings page exists at `/settings/billing` with placeholder data. The `PLAN_LIMITS` constant maps 5 tiers (trial/starter/professional/business/enterprise) to query/user/feature limits.

The core implementation requires: (1) a Stripe webhook route at `/webhooks/stripe` in api-gateway, (2) API routes for creating Checkout sessions and Customer Portal sessions, (3) a D1 migration adding `subscription_status` and `current_period_end` columns, (4) updating the billing settings page to connect to real Stripe flows, and (5) a payment failure banner component.

**Primary recommendation:** Use Stripe Checkout (hosted) for payment collection and Stripe Customer Portal for self-service billing management. Never handle card data. Process webhooks asynchronously -- verify signature immediately, return 200, then update D1 state via the event payload. Track processed event IDs in a `stripe_events` table for idempotency.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BILL-01 | User can subscribe to a plan via Stripe Checkout hosted page | Stripe Checkout session creation API; existing pricing page at `/pricing` needs CTA wiring; existing billing page at `/settings/billing` needs upgrade buttons |
| BILL-02 | Webhook handler processes 6 critical Stripe events | Hono webhook pattern with `constructEventAsync` + `SubtleCryptoProvider`; idempotency via `stripe_events` table; 6 events documented below |
| BILL-03 | Org plan/limits update immediately when Stripe subscription changes | `OrgDatabase.updateOrg()` already supports updating plan, max_users, max_queries_per_month, stripe_customer_id, stripe_subscription_id; PLAN_LIMITS constant maps tiers to limits |
| BILL-04 | User can manage billing via Stripe Customer Portal | Single API call to create portal session; redirect user to Stripe-hosted page |
| BILL-05 | Failed payment shows banner in UI; account locked only after final retry fails | New `subscription_status` column tracks `past_due` state; frontend banner component reads org status; lock only on `customer.subscription.deleted` |
| BILL-06 | Subscription cancellation preserves access until end of billing period | New `current_period_end` column stores period end; `cancel_at_period_end` flag from Stripe tracked; access checked against period end, not cancellation timestamp |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe | 20.4.1 | Server-side Stripe SDK (Workers) | Native Cloudflare Workers support since v11.10; already declared in project research; handles Checkout, Portal, webhooks |
| @stripe/stripe-js | 8.11.0 | Client-side Checkout redirect | Loads Stripe.js for `redirectToCheckout()`; official client SDK |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | No additional libraries needed | All billing logic uses Stripe SDK + existing Hono/D1 stack |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stripe Checkout (hosted) | Custom payment form | PCI SAQ-D burden; explicitly out of scope per REQUIREMENTS.md |
| Stripe Customer Portal | Custom billing management UI | Unnecessary complexity; Portal handles cards, invoices, cancellation |
| Separate billing-worker | Webhook route in api-gateway | api-gateway already has D1 bindings; separate worker duplicates config |

**Installation:**
```bash
# In packages/api-gateway (server-side SDK)
cd packages/api-gateway && npm install stripe

# In frontend (client-side redirect helper)
cd frontend && npm install @stripe/stripe-js
```

**Version verification:**
- `stripe`: 20.4.1 (verified via `npm view stripe version` on 2026-03-18)
- `@stripe/stripe-js`: 8.11.0 (verified via `npm view @stripe/stripe-js version` on 2026-03-18)

## Architecture Patterns

### Recommended Project Structure
```
packages/api-gateway/src/
  routes/
    billing.ts          # NEW: Checkout session, Portal session, billing info
    webhooks.ts         # NEW: Stripe webhook handler (no auth middleware)
  services/
    stripe.ts           # NEW: Stripe client init, helper functions
    org-db.ts           # EXISTING: updateOrg() already handles plan fields
  types.ts              # EXISTING: Env already has STRIPE_WEBHOOK_SECRET

frontend/src/
  app/(public)/pricing/page.tsx        # EXISTING: needs CTA buttons wired to checkout
  app/(dashboard)/settings/billing/    # EXISTING: needs real data + portal link
  components/billing/
    payment-failed-banner.tsx           # NEW: displayed when org.subscription_status === 'past_due'

migrations/
  0003_billing_columns.sql              # NEW: subscription_status, current_period_end, stripe_events table
```

### Pattern 1: Stripe Webhook Handler (Hono on Workers)
**What:** Webhook route that verifies Stripe signature and processes subscription lifecycle events.
**When to use:** Every Stripe webhook delivery.
**Example:**
```typescript
// Source: https://hono.dev/examples/stripe-webhook + Cloudflare Workers adaptation
import Stripe from 'stripe';
import { Hono } from 'hono';
import type { Env } from '../types';

const webhooks = new Hono<{ Bindings: Env }>();

webhooks.post('/stripe', async (c) => {
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.text('Missing signature', 400);
  }

  const body = await c.req.text(); // Raw body BEFORE any JSON parsing
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET!,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return c.text('Invalid signature', 400);
  }

  // Idempotency check
  const existing = await c.env.DB.prepare(
    'SELECT id FROM stripe_events WHERE event_id = ?'
  ).bind(event.id).first();
  if (existing) {
    return c.json({ received: true }, 200);
  }

  // Process event (switch on event.type)
  // ... then store event ID
  await c.env.DB.prepare(
    'INSERT INTO stripe_events (id, event_id, event_type, processed_at) VALUES (?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), event.id, event.type, new Date().toISOString()).run();

  return c.json({ received: true }, 200);
});
```

### Pattern 2: Stripe Price ID to Plan Mapping
**What:** Map Stripe price IDs to internal `PlanType` values for plan enforcement.
**When to use:** On every subscription change webhook.
**Example:**
```typescript
// Map configured in environment or constants
const STRIPE_PRICE_TO_PLAN: Record<string, PlanType> = {
  'price_starter_monthly': 'starter',
  'price_starter_annual': 'starter',
  'price_professional_monthly': 'professional',
  'price_professional_annual': 'professional',
  'price_business_monthly': 'business',
  'price_business_annual': 'business',
  'price_enterprise_monthly': 'enterprise',
  'price_enterprise_annual': 'enterprise',
};

function getPlanFromPriceId(priceId: string): PlanType {
  return STRIPE_PRICE_TO_PLAN[priceId] ?? 'trial';
}
```

### Pattern 3: Checkout Session Creation
**What:** Create a Stripe Checkout session and return the URL for client redirect.
**When to use:** User clicks "Subscribe" or "Upgrade" on pricing/billing page.
**Example:**
```typescript
// POST /api/billing/checkout
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer: org.stripe_customer_id ?? undefined,
  customer_email: org.stripe_customer_id ? undefined : user.email,
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: 'https://app.apura.xyz/settings/billing?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://app.apura.xyz/settings/billing',
  subscription_data: {
    metadata: { org_id: orgId },
  },
  client_reference_id: orgId,
});
return c.json({ success: true, data: { url: session.url } });
```

### Pattern 4: Webhook Route Registration (No Auth Middleware)
**What:** Register webhook route BEFORE the auth middleware in api-gateway.
**When to use:** Stripe sends unauthenticated POST requests; auth middleware would reject them.
**Example:**
```typescript
// In packages/api-gateway/src/index.ts
// Webhook routes MUST come before auth middleware
app.route('/webhooks', webhooks); // No auth — Stripe signature replaces JWT

// Then protected routes
app.use('/api/*', authMiddleware);
app.route('/api/billing', billing);
```

### Anti-Patterns to Avoid
- **Processing webhook synchronously in the handler:** Verify signature, store event ID, update D1, return 200. Do NOT call external APIs (Stripe retrieve, email send) before returning 200. Use `c.executionCtx.waitUntil()` for non-critical follow-up like audit logging and email notifications.
- **Trusting event payload alone for plan state:** Always map price ID to plan using a constant map. Never trust user-controlled metadata for plan assignment.
- **Creating a separate billing-worker:** The api-gateway already has D1 bindings and the org-db service. Adding `/webhooks/stripe` and `/api/billing/*` routes is the natural fit.
- **Applying auth middleware to webhook route:** Stripe cannot authenticate via JWT. The webhook route uses Stripe signature verification instead. Register it before `app.use('/api/*', authMiddleware)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payment page | Custom card input form | Stripe Checkout (hosted) | PCI compliance; explicitly out of scope in REQUIREMENTS.md |
| Billing management UI | Custom invoices/card management | Stripe Customer Portal | Invoices, card updates, cancellation all handled; one API call |
| Webhook signature verification | Custom HMAC verification | `stripe.webhooks.constructEventAsync()` with `SubtleCryptoProvider` | Handles timing-safe comparison, tolerance window, replay protection |
| Dunning / retry logic | Custom retry scheduler | Stripe Smart Retries (dashboard setting) | Stripe optimizes retry timing; sends `invoice.payment_failed` events |
| Invoice generation | Custom invoice templates | Stripe automatic invoices | Generated automatically for subscriptions |

**Key insight:** Stripe provides hosted UI for both checkout and billing management. The only custom UI needed is: (1) a plan selector that redirects to Checkout, (2) a "Manage Billing" button that redirects to Portal, and (3) a payment failure banner.

## Common Pitfalls

### Pitfall 1: Webhook Signature Verification Fails Silently in Workers
**What goes wrong:** Using `constructEvent` (sync) instead of `constructEventAsync` in Cloudflare Workers. The sync version uses Node.js `crypto` which is unavailable. The error is a cryptic runtime failure.
**Why it happens:** Stripe SDK defaults to sync crypto. Workers V8 isolate does not have Node.js `crypto` module.
**How to avoid:** Always use `constructEventAsync` with `Stripe.createSubtleCryptoProvider()` as the 5th argument. The Hono example on hono.dev omits the crypto provider, which works because Stripe SDK v20+ auto-detects SubtleCrypto in Workers. However, explicitly passing it is safer and more explicit.
**Warning signs:** `SubtleCryptoProvider cannot be used in a synchronous context` error.

### Pitfall 2: Raw Body Consumed Before Signature Verification
**What goes wrong:** Hono middleware or JSON parsing consumes the request body before the webhook handler reads it. The body is a `ReadableStream` that can only be read once.
**Why it happens:** Body-parsing middleware runs before the route handler.
**How to avoid:** Read the raw body with `await c.req.text()` as the FIRST operation in the webhook handler. Do NOT use `c.req.json()` before verification. If other middleware reads the body, the stream is consumed.
**Warning signs:** `Body has already been used` error; all webhook requests fail signature verification.

### Pitfall 3: Webhook Event Ordering and Idempotency
**What goes wrong:** Stripe delivers events out of order and retries on failure. Without idempotency tracking, the same event is processed twice (e.g., double plan upgrade). Without ordering awareness, a `subscription.deleted` event arrives before `subscription.updated`.
**Why it happens:** Stripe's webhook delivery is eventually consistent, not ordered. D1 has no row-level locking.
**How to avoid:** (1) Create a `stripe_events` table to track processed event IDs -- skip duplicates. (2) On subscription events, read the full subscription state from the event object (which includes `status`, `current_period_end`, `items[0].price.id`) rather than assuming sequential state transitions.
**Warning signs:** Duplicate entries in audit log; org plan flip-flops between values.

### Pitfall 4: Billing Page Plans Don't Match Pricing Page Plans
**What goes wrong:** The billing settings page (`/settings/billing`) has hardcoded plans (Starter at 0, Pro at 49, Business at 149) that don't match the pricing page (`/pricing`) plans (Starter at 29, Professional at 79, Business at 199) or the `PLAN_LIMITS` constant (trial/starter/professional/business/enterprise).
**Why it happens:** The billing page was a placeholder built separately from the pricing page.
**How to avoid:** Use a single source of truth for plan definitions. Create a shared constant (or use `PLAN_LIMITS` from `@apura/shared`) that both frontend pages reference. Add pricing data (monthly/annual amounts, Stripe price IDs) to this constant.
**Warning signs:** Users see different prices on different pages; plan names don't match between frontend and backend.

### Pitfall 5: No Stripe Customer Created Before Checkout
**What goes wrong:** `stripe_customer_id` is null for trial orgs. Creating a Checkout session without a customer creates an orphan Stripe customer. If the user visits Checkout twice without completing, multiple Stripe customers are created for the same org.
**Why it happens:** Stripe Checkout creates a customer if none is provided.
**How to avoid:** Lazy-create a Stripe customer on first billing action. In the Checkout session creation route: if `org.stripe_customer_id` is null, create a customer first, store the ID, then pass it to Checkout. Alternatively, use `customer_email` (deduplication by email) and let Checkout create the customer, then save the customer ID from `checkout.session.completed` event.
**Warning signs:** Multiple Stripe customers for the same organization in the Stripe dashboard.

### Pitfall 6: Cancellation Cuts Access Immediately
**What goes wrong:** User cancels subscription, webhook fires `customer.subscription.updated` with `cancel_at_period_end: true`, and the handler sets org plan to `trial` immediately.
**Why it happens:** Confusing `cancel_at_period_end` (scheduled cancellation) with `customer.subscription.deleted` (actual cancellation at period end).
**How to avoid:** On `subscription.updated` with `cancel_at_period_end: true`: set `subscription_status = 'canceling'` but keep current plan active. Only downgrade to `trial` on `customer.subscription.deleted` event. Store `current_period_end` and display "Your plan expires on {date}" in the UI.
**Warning signs:** Users complaining about losing access immediately after clicking cancel.

## Code Examples

Verified patterns from official sources:

### Stripe SDK Initialization for Workers
```typescript
// Source: https://blog.cloudflare.com/announcing-stripe-support-in-workers/
import Stripe from 'stripe';

function getStripe(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
```

### Customer Portal Session Creation
```typescript
// Source: Stripe official docs
const portalSession = await stripe.billingPortal.sessions.create({
  customer: org.stripe_customer_id!,
  return_url: 'https://app.apura.xyz/settings/billing',
});
return c.json({ success: true, data: { url: portalSession.url } });
```

### Webhook Event Processing (Subscription Updated)
```typescript
// Source: https://docs.stripe.com/billing/subscriptions/webhooks
case 'customer.subscription.updated': {
  const subscription = event.data.object as Stripe.Subscription;
  const orgId = subscription.metadata.org_id;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);
  const limits = PLAN_LIMITS[plan];

  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.updateOrg({
    plan,
    stripe_subscription_id: subscription.id,
    max_users: limits.maxUsers,
    max_queries_per_month: limits.maxQueries,
    subscription_status: subscription.cancel_at_period_end ? 'canceling' : subscription.status,
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  });
  break;
}
```

### Checkout.session.completed Handler
```typescript
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session;
  const orgId = session.client_reference_id!;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  // Fetch full subscription to get price/plan details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);
  const limits = PLAN_LIMITS[plan];

  const orgDb = new OrgDatabase(c.env.DB, orgId);
  await orgDb.updateOrg({
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    plan,
    max_users: limits.maxUsers,
    max_queries_per_month: limits.maxQueries,
    subscription_status: 'active',
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  });
  break;
}
```

### D1 Migration: Billing Columns
```sql
-- migrations/0003_billing_columns.sql
ALTER TABLE organizations ADD COLUMN subscription_status TEXT DEFAULT 'trialing';
ALTER TABLE organizations ADD COLUMN current_period_end TEXT;

CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE INDEX idx_stripe_events_event_id ON stripe_events(event_id);
```

### Frontend: Redirect to Checkout
```typescript
// Using @stripe/stripe-js for client-side redirect
import { loadStripe } from '@stripe/stripe-js';

async function handleSubscribe(priceId: string) {
  // Create checkout session via our API
  const { data } = await api.request('POST', '/billing/checkout', { priceId });
  // Redirect to Stripe Checkout
  window.location.href = data.url;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `constructEvent` (sync) | `constructEventAsync` with SubtleCryptoProvider | Stripe SDK v11.10+ (2023) | Required for Workers -- sync crypto unavailable |
| `node_compat` flag required | Native Workers support | Stripe SDK v14+ (2024) | Simpler wrangler config; project already has `nodejs_compat` flag |
| Custom webhook signature check | SDK handles it natively | Always | Never hand-roll HMAC verification |
| Build custom billing UI | Stripe Customer Portal | Stripe 2020+ | Reduces PCI scope; handles cards, invoices, cancellation |

**Deprecated/outdated:**
- `constructEvent` (sync): Still works in Node.js but fails in Workers. Always use async variant.
- Custom card forms: PCI SAQ-D compliance burden. Use Stripe Checkout exclusively.

## Open Questions

1. **Stripe Price IDs**
   - What we know: Plans are defined (starter/professional/business/enterprise) with monthly and annual pricing in EUR
   - What's unclear: Actual Stripe price IDs are not yet created in Stripe dashboard
   - Recommendation: Define price IDs as environment variables (`STRIPE_PRICE_STARTER_MONTHLY`, etc.) so they differ between test and production. The planner should include a task for Stripe dashboard configuration.

2. **STRIPE_SECRET_KEY environment variable**
   - What we know: `STRIPE_WEBHOOK_SECRET` is already in `Env` type; `STRIPE_SECRET_KEY` is not
   - What's unclear: Nothing -- this simply needs to be added
   - Recommendation: Add `STRIPE_SECRET_KEY: string` to the `Env` interface in `types.ts` and configure via `wrangler secret put`

3. **Enterprise plan: sales-led or self-serve?**
   - What we know: Pricing page shows Enterprise at 399/mo; the CTA says "Contactar" (Contact)
   - What's unclear: Whether Enterprise should be available via self-serve Checkout or only via sales
   - Recommendation: Start with self-serve for all plans. Enterprise customers who need custom pricing can contact sales separately. This avoids special-casing the flow.

4. **Overage billing implementation**
   - What we know: `PLAN_LIMITS` defines `overagePerQuery` rates; quota middleware already flags overage with `X-Quota-Overage` header
   - What's unclear: Whether overage should be billed via Stripe usage records in this phase or deferred
   - Recommendation: Defer metered overage billing to a future phase. For now, allow queries beyond the limit (when overagePerQuery > 0) and track usage. Implement Stripe metered billing later. This is consistent with REQUIREMENTS.md which explicitly excludes "Usage-based metered billing" from scope.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via vitest.config.ts in api-gateway) |
| Config file | `packages/api-gateway/vitest.config.ts` |
| Quick run command | `cd packages/api-gateway && npx vitest run --reporter=verbose` |
| Full suite command | `npx turbo test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-01 | Checkout session creation returns URL | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/billing.test.ts -t "checkout"` | No -- Wave 0 |
| BILL-02 | Webhook handler processes 6 event types with idempotency | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/webhooks.test.ts` | No -- Wave 0 |
| BILL-03 | Org plan/limits update on subscription change | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/webhooks.test.ts -t "updates org"` | No -- Wave 0 |
| BILL-04 | Portal session creation returns URL | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/billing.test.ts -t "portal"` | No -- Wave 0 |
| BILL-05 | Failed payment sets subscription_status to past_due | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/webhooks.test.ts -t "payment_failed"` | No -- Wave 0 |
| BILL-06 | Cancellation preserves access until period end | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/webhooks.test.ts -t "cancel"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/api-gateway && npx vitest run --reporter=verbose`
- **Per wave merge:** `npx turbo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api-gateway/src/routes/__tests__/billing.test.ts` -- covers BILL-01, BILL-04
- [ ] `packages/api-gateway/src/routes/__tests__/webhooks.test.ts` -- covers BILL-02, BILL-03, BILL-05, BILL-06
- [ ] Stripe SDK mock helper (mock `Stripe` constructor, `constructEventAsync`, `checkout.sessions.create`, `billingPortal.sessions.create`)

## Existing Codebase Assets (What Already Exists)

Understanding what's already built is critical for planning -- these are NOT new work items.

| Asset | Location | Status | What It Provides |
|-------|----------|--------|-----------------|
| `organizations` table with stripe fields | `migrations/0001_initial_schema.sql` | Complete | `stripe_customer_id`, `stripe_subscription_id`, `plan`, `max_queries_per_month`, `queries_this_month` columns |
| `idx_org_stripe` index | `migrations/0001_initial_schema.sql` | Complete | Index on `stripe_customer_id` for webhook lookups |
| `PLAN_LIMITS` constant | `packages/shared/src/types/organization.ts` | Complete | All 5 tiers with queries, users, connectors, reports, dashboards, schedules, overage, AI model limits |
| `PlanType` type | `packages/shared/src/types/organization.ts` | Complete | `'trial' \| 'starter' \| 'professional' \| 'business' \| 'enterprise'` |
| `OrgDatabase.updateOrg()` | `packages/api-gateway/src/services/org-db.ts` | Complete | Updates any org column including plan, stripe fields, limits (via column allowlist) |
| `OrgDatabase.getOrg()` | `packages/api-gateway/src/services/org-db.ts` | Complete | Returns full org record including stripe fields |
| `STRIPE_WEBHOOK_SECRET` env var | `packages/api-gateway/src/types.ts` | Declared (optional) | Already in `Env` interface |
| `EMAIL_QUEUE` binding | `packages/api-gateway/wrangler.toml` | Configured | Queue producer for sending billing notification emails |
| Pricing page | `frontend/src/app/(public)/pricing/page.tsx` | Complete (static) | Shows 4 plans with EUR prices, monthly/annual toggle, FAQ; CTAs link to `/signup` |
| Billing settings page | `frontend/src/app/(dashboard)/settings/billing/page.tsx` | Placeholder | Shows current plan info + plan comparison; uses `api.getBilling()` which calls `GET /org/billing` |
| `BillingInfo` type | `frontend/src/lib/types.ts` | Complete | `plan`, `queriesUsed`, `queriesLimit`, `membersUsed`, `membersLimit`, `billingEmail`, `currentPeriodEnd` |
| `api.getBilling()` | `frontend/src/lib/api.ts` | Defined | Calls `GET /org/billing` -- route not yet implemented |
| Quota middleware | `packages/api-gateway/src/middleware/quota.ts` | Complete | Already checks plan limits, returns 402 on quota exceeded, flags overage |
| `queries_month_reset` column | `organizations` table | Schema exists | Column exists but no cron job resets it |
| `nodejs_compat` flag | `packages/api-gateway/wrangler.toml` | Configured | Required for Stripe SDK in Workers |

## What Needs to Be Built

| Component | Type | Location | Notes |
|-----------|------|----------|-------|
| D1 migration: `subscription_status`, `current_period_end`, `stripe_events` table | Migration | `migrations/0003_billing_columns.sql` | Add columns to org; create idempotency table |
| Stripe service helper | Backend | `packages/api-gateway/src/services/stripe.ts` | Stripe client init, price-to-plan mapping, helper functions |
| Webhook route | Backend | `packages/api-gateway/src/routes/webhooks.ts` | Signature verification, 6 event handlers, idempotency |
| Billing API routes | Backend | `packages/api-gateway/src/routes/billing.ts` | POST /checkout, POST /portal, GET /billing (info) |
| Register routes in index.ts | Backend | `packages/api-gateway/src/index.ts` | Add webhook route (before auth), billing route (after auth) |
| Update Env type | Backend | `packages/api-gateway/src/types.ts` | Add `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` |
| Update OrgDatabase column allowlist | Backend | `packages/api-gateway/src/services/org-db.ts` | Add `subscription_status`, `current_period_end` to ORG_COLUMNS set |
| Update pricing page CTAs | Frontend | `frontend/src/app/(public)/pricing/page.tsx` | Wire "Comecar gratis" buttons to checkout flow |
| Update billing settings page | Frontend | `frontend/src/app/(dashboard)/settings/billing/page.tsx` | Real plan data from API, upgrade/portal buttons, sync plan definitions |
| Payment failure banner | Frontend | New component | Conditionally show when `subscription_status === 'past_due'` |
| API client methods | Frontend | `frontend/src/lib/api.ts` | Add `createCheckout()`, `createPortalSession()` |
| Vitest tests | Tests | `packages/api-gateway/src/routes/__tests__/` | Webhook + billing route tests with mocked Stripe |

## Sources

### Primary (HIGH confidence)
- [Hono Stripe Webhook Example](https://hono.dev/examples/stripe-webhook) - Official Hono documentation for webhook pattern
- [Cloudflare Blog: Stripe SDK in Workers](https://blog.cloudflare.com/announcing-stripe-support-in-workers/) - Native support announcement and pattern
- [Stripe Subscription Webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) - Official event lifecycle documentation
- [Stripe Customer Portal](https://docs.stripe.com/billing/subscriptions/build-subscriptions) - Portal session creation

### Secondary (MEDIUM confidence)
- [Stripe Webhook in Cloudflare Workers (gebna.gg)](https://gebna.gg/blog/stripe-webhook-cloudflare-workers) - Workers-specific integration guide with SubtleCryptoProvider
- [Stripe Webhook Race Conditions (Stigg)](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks) - Idempotency and ordering patterns
- [stripe-node-cloudflare-worker-template (GitHub)](https://github.com/stripe-samples/stripe-node-cloudflare-worker-template) - Official Stripe sample

### Tertiary (LOW confidence)
- None -- all findings verified against official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Stripe SDK versions verified via npm registry; Workers compatibility confirmed by Cloudflare blog and official Stripe sample
- Architecture: HIGH -- Pattern verified against Hono official docs and existing codebase structure; route placement aligns with api-gateway patterns
- Pitfalls: HIGH -- Multiple verified sources documenting Workers-specific Stripe issues; race condition patterns confirmed by Stripe official docs
- Existing codebase: HIGH -- All assets verified by reading actual source files

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (Stripe SDK stable; no breaking changes expected)
