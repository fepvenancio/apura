---
phase: 03-billing
plan: 02
subsystem: ui
tags: [stripe, billing, react, nextjs, checkout, portal]

requires:
  - phase: 03-billing
    provides: "Stripe billing API routes (checkout, portal, billing info) and webhook handler"
provides:
  - "Pricing page with auth-aware Stripe Checkout CTAs"
  - "Billing settings page with real plan data, status badges, and Stripe Portal link"
  - "PaymentFailedBanner component for past_due subscription status"
  - "API client methods: createCheckout(), createPortalSession()"
  - "Unified plan definitions across pricing and billing pages"
affects: []

tech-stack:
  added: []
  patterns: [auth-aware-cta, env-var-price-ids, subscription-status-badges]

key-files:
  created:
    - frontend/src/components/billing/payment-failed-banner.tsx
  modified:
    - frontend/src/lib/api.ts
    - frontend/src/lib/types.ts
    - frontend/src/app/(public)/pricing/page.tsx
    - frontend/src/app/(dashboard)/settings/billing/page.tsx

key-decisions:
  - "Price IDs read from NEXT_PUBLIC_STRIPE_PRICE_* env vars; buttons disabled when env var not set"
  - "Updated getBilling() route from /org/billing to /api/billing to match Plan 01 backend"

patterns-established:
  - "Auth-aware CTAs: check localStorage accessToken to branch between checkout and signup flows"
  - "Env-var-based price IDs: monthlyPriceId/annualPriceId fields on plan objects from NEXT_PUBLIC_STRIPE_PRICE_* env vars"

requirements-completed: [BILL-01, BILL-04, BILL-05, BILL-06]

duration: 5min
completed: 2026-03-18
---

# Phase 3 Plan 2: Frontend Billing UI Summary

**Pricing page with Stripe Checkout CTAs, billing settings with subscription status badges and Portal link, and payment failure banner for past_due subscriptions**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T21:46:52Z
- **Completed:** 2026-03-18T21:51:25Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Pricing page CTAs redirect logged-in users to Stripe Checkout using env-var-based price IDs, with loading states and disabled buttons when unconfigured
- Billing settings page shows real plan data with subscription status badges (active/trialing/past_due/canceling/canceled), cancellation expiry message, and monthly/annual toggle
- PaymentFailedBanner component warns users with past_due status and links to Stripe Portal for payment update
- Plan definitions unified across pricing and billing pages (Starter 29, Professional 79, Business 199, Enterprise 399 EUR/mo)
- Both pages made mobile-responsive with grid-cols-1 md:grid-cols-2 lg:grid-cols-4

## Task Commits

Each task was committed atomically:

1. **Task 1: Frontend billing wiring -- API client, types, pricing CTAs, billing page, payment banner** - `e27a088` (feat)
2. **Task 2: Verify billing UI visually** - checkpoint, user approved

## Files Created/Modified
- `frontend/src/components/billing/payment-failed-banner.tsx` - Dismissible amber warning banner for past_due subscriptions with Stripe Portal redirect
- `frontend/src/lib/api.ts` - Added createCheckout(), createPortalSession() methods; updated getBilling() route to /api/billing
- `frontend/src/lib/types.ts` - Added subscriptionStatus field to BillingInfo interface
- `frontend/src/app/(public)/pricing/page.tsx` - Auth-aware CTAs, env-var price IDs, mobile-responsive grid, 14-day trial badge
- `frontend/src/app/(dashboard)/settings/billing/page.tsx` - Correct plan prices, status badges, Portal button, cancellation message, monthly/annual toggle

## Decisions Made
- Price IDs sourced from NEXT_PUBLIC_STRIPE_PRICE_* env vars rather than hardcoded, allowing test/prod Stripe separation
- Updated getBilling() API route from /org/billing to /api/billing to match the new billing routes from Plan 01
- Enterprise plan uses mailto link instead of Checkout flow

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- Frontend billing flow complete and connected to Plan 01 backend routes
- Stripe price env vars must be configured for checkout buttons to work (see Plan 01 USER-SETUP)
- All billing UI pages are mobile-responsive

## Self-Check: PASSED

All files verified present. Commit e27a088 confirmed in git log.

---
*Phase: 03-billing*
*Completed: 2026-03-18*
