---
phase: 03-billing
plan: 01
subsystem: payments
tags: [stripe, webhooks, billing, subscriptions, d1]

requires:
  - phase: 01-bug-fixes-and-cicd
    provides: "Stable API gateway with auth middleware and OrgDatabase"
provides:
  - "Stripe webhook handler for 6 subscription lifecycle events"
  - "Billing API routes: checkout, portal, billing info"
  - "D1 migration for subscription_status, current_period_end, stripe_events"
  - "Stripe service helper with price-to-plan mapping"
affects: [03-billing-plan-02, frontend-billing-settings]

tech-stack:
  added: [stripe]
  patterns: [webhook-signature-verification, idempotent-event-processing, lazy-customer-creation]

key-files:
  created:
    - migrations/0003_billing_columns.sql
    - packages/api-gateway/src/services/stripe.ts
    - packages/api-gateway/src/routes/webhooks.ts
    - packages/api-gateway/src/routes/billing.ts
    - packages/api-gateway/src/routes/__tests__/webhooks.test.ts
    - packages/api-gateway/src/routes/__tests__/billing.test.ts
  modified:
    - packages/api-gateway/src/types.ts
    - packages/shared/src/types/organization.ts
    - packages/api-gateway/src/services/org-db.ts
    - packages/api-gateway/src/index.ts

key-decisions:
  - "Used (subscription as any).current_period_end to handle Stripe SDK type discrepancies in Workers"
  - "Webhook route registered before auth middleware for unauthenticated Stripe callbacks"
  - "Lazy Stripe customer creation during checkout to avoid premature customer records"

patterns-established:
  - "Webhook idempotency: stripe_events table prevents duplicate processing"
  - "Price-to-plan mapping via env vars for test/prod Stripe price ID separation"
  - "waitUntil for fire-and-forget email queue sends on payment failure"

requirements-completed: [BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06]

duration: 4min
completed: 2026-03-18
---

# Phase 3 Plan 1: Billing Infrastructure Summary

**Stripe subscription billing backend with webhook handler for 6 event types, checkout/portal session creation, and D1 migration for subscription tracking**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T21:40:44Z
- **Completed:** 2026-03-18T21:44:48Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- D1 migration adding subscription_status, current_period_end columns and stripe_events idempotency table
- Stripe webhook handler verifying signatures with SubtleCryptoProvider and processing 6 event types
- Billing API routes for Checkout session creation (with lazy Stripe customer), Portal session, and billing info
- Full test coverage for webhook events and billing endpoints (25 tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Billing infrastructure -- migration, types, Stripe service, OrgDatabase updates** - `6dcc56f` (feat)
2. **Task 2: Webhook handler, billing API routes, and route registration** - `eb94ed6` (feat)

## Files Created/Modified
- `migrations/0003_billing_columns.sql` - D1 migration for subscription_status, current_period_end, stripe_events table
- `packages/api-gateway/src/services/stripe.ts` - Stripe client init, price-to-plan mapping
- `packages/api-gateway/src/routes/webhooks.ts` - Stripe webhook handler with 6 event types
- `packages/api-gateway/src/routes/billing.ts` - Checkout, Portal, billing info endpoints
- `packages/api-gateway/src/routes/__tests__/webhooks.test.ts` - Webhook handler tests
- `packages/api-gateway/src/routes/__tests__/billing.test.ts` - Billing route tests
- `packages/api-gateway/src/types.ts` - Added STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY to Env
- `packages/shared/src/types/organization.ts` - Added subscription_status, current_period_end to Organization
- `packages/api-gateway/src/services/org-db.ts` - Updated column allowlist and SELECT for new fields
- `packages/api-gateway/src/index.ts` - Registered webhook and billing routes
- `packages/api-gateway/package.json` - Added stripe dependency

## Decisions Made
- Used `(subscription as any).current_period_end` cast to handle Stripe SDK type discrepancies with Workers runtime
- Webhook route registered before auth middleware so Stripe can POST without authentication
- Lazy Stripe customer creation during checkout avoids premature customer records for orgs that never subscribe

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Stripe SDK type incompatibilities**
- **Found during:** Task 2 (webhook handler)
- **Issue:** Stripe SDK types for `Invoice.subscription` and `Subscription.current_period_end` not directly accessible in newer SDK versions
- **Fix:** Used `(obj as any).property` casts for properties that exist at runtime but are typed differently
- **Files modified:** packages/api-gateway/src/routes/webhooks.ts
- **Verification:** TypeScript compiles clean, all tests pass
- **Committed in:** eb94ed6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type cast needed for Stripe SDK compatibility. No scope creep.

## Issues Encountered
- Test for `invoice.payment_failed` initially failed because `waitUntil` was not available in test context. Fixed by wrapping test in full Hono app with mock `executionCtx`.

## User Setup Required

**External services require manual configuration.** The plan's `user_setup` section documents:
- Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PUBLISHABLE_KEY env vars
- Create 8 Stripe Price objects (starter/professional/business/enterprise x monthly/annual) with EUR currency
- Create webhook endpoint at https://api.apura.xyz/webhooks/stripe
- Enable Customer Portal in Stripe Dashboard
- Set STRIPE_PRICE_* env vars for each price ID

## Next Phase Readiness
- Backend billing infrastructure complete, ready for frontend billing UI wiring in Plan 02
- All 6 webhook event types handled with idempotency
- Checkout and Portal session creation endpoints available at /api/billing/*

---
*Phase: 03-billing*
*Completed: 2026-03-18*
