---
phase: 09-internationalization
plan: 02
subsystem: i18n
tags: [next-intl, useTranslations, useLocale, Intl.RelativeTimeFormat]

requires:
  - phase: 09-internationalization-01
    provides: next-intl configured with 3 locales, 521 translation keys in JSON message files, [locale] route structure
provides:
  - "All 7 auth pages using useTranslations() for all visible text"
  - "Sidebar and topbar navigation labels translated via nav/auth namespaces"
  - "4 query components using useTranslations() for all visible text"
  - "formatRelativeDate using Intl.RelativeTimeFormat instead of hardcoded strings"
  - "All internal links in modified files locale-prefixed"
affects: [09-internationalization]

tech-stack:
  added: []
  patterns: [useTranslations per-component, useLocale for route prefixing, Intl.RelativeTimeFormat for locale-aware relative dates]

key-files:
  created: []
  modified:
    - frontend/src/app/[locale]/(auth)/login/page.tsx
    - frontend/src/app/[locale]/(auth)/login/mfa/page.tsx
    - frontend/src/app/[locale]/(auth)/signup/page.tsx
    - frontend/src/app/[locale]/(auth)/forgot-password/page.tsx
    - frontend/src/app/[locale]/(auth)/reset-password/[token]/page.tsx
    - frontend/src/app/[locale]/(auth)/verify-email/[token]/page.tsx
    - frontend/src/app/[locale]/(auth)/accept-invite/[token]/page.tsx
    - frontend/src/components/layout/sidebar.tsx
    - frontend/src/components/layout/topbar.tsx
    - frontend/src/components/billing/payment-failed-banner.tsx
    - frontend/src/lib/utils.ts
    - frontend/src/components/query/query-input.tsx
    - frontend/src/components/query/result-panel.tsx
    - frontend/src/components/query/result-chart.tsx
    - frontend/src/components/query/result-table.tsx

key-decisions:
  - "Sidebar nav items use data-driven keys array mapping path to translation key for cleaner code"
  - "Topbar uses auth namespace for logout/profile/settings menu items to match existing message file structure"
  - "Result-table passes fullLocale (pt-PT/es-ES/en-US) to formatNumber/formatCurrency for correct number formatting"

patterns-established:
  - "useLocale() + template literal for locale-prefixed routes: router.push(`/${locale}/path`)"
  - "mapLocale helper to convert short locale (pt) to full locale (pt-PT) for Intl APIs"

requirements-completed: [I18N-03, I18N-04]

duration: 6min
completed: 2026-03-19
---

# Phase 9 Plan 2: Auth Pages and Component String Extraction Summary

**Replaced hardcoded Portuguese strings in 15 files with useTranslations() hooks and Intl.RelativeTimeFormat for locale-aware relative dates**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-19T01:30:46Z
- **Completed:** 2026-03-19T01:36:47Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- All 7 auth pages (login, MFA, signup, forgot-password, reset-password, verify-email, accept-invite) now use useTranslations("auth") for all visible text
- Sidebar and topbar navigation labels translated via nav/auth namespaces with locale-prefixed href values
- 4 query components (query-input, result-panel, result-chart, result-table) use useTranslations("query") for all labels, placeholders, and UI text
- formatRelativeDate replaced from hardcoded Portuguese/English/Spanish strings to Intl.RelativeTimeFormat for automatic locale handling
- Payment-failed-banner uses billing namespace translations
- All router.push() and Link href values in modified files include locale prefix

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract strings from auth pages and layout components** - `36eac56` (feat)
2. **Task 2: Replace utils.ts formatting and extract query component strings** - `61b7004` (feat)

## Files Created/Modified
- `frontend/src/app/[locale]/(auth)/login/page.tsx` - Login page with auth namespace translations
- `frontend/src/app/[locale]/(auth)/login/mfa/page.tsx` - MFA verification with auth namespace
- `frontend/src/app/[locale]/(auth)/signup/page.tsx` - Signup with auth namespace, slug interpolation
- `frontend/src/app/[locale]/(auth)/forgot-password/page.tsx` - Password recovery translated
- `frontend/src/app/[locale]/(auth)/reset-password/[token]/page.tsx` - Password reset translated
- `frontend/src/app/[locale]/(auth)/verify-email/[token]/page.tsx` - Email verification translated
- `frontend/src/app/[locale]/(auth)/accept-invite/[token]/page.tsx` - Invite acceptance translated
- `frontend/src/components/layout/sidebar.tsx` - Nav labels via t("key"), locale-prefixed hrefs
- `frontend/src/components/layout/topbar.tsx` - Menu items via t("key"), locale-prefixed routes
- `frontend/src/components/billing/payment-failed-banner.tsx` - Billing namespace translations
- `frontend/src/lib/utils.ts` - formatRelativeDate now uses Intl.RelativeTimeFormat
- `frontend/src/components/query/query-input.tsx` - Query namespace for placeholder, suggestions, button
- `frontend/src/components/query/result-panel.tsx` - Query namespace for tabs, actions, row counts
- `frontend/src/components/query/result-chart.tsx` - Query namespace for chart type labels, empty state
- `frontend/src/components/query/result-table.tsx` - Query/common namespaces, locale-aware formatting

## Decisions Made
- Sidebar refactored from hardcoded navItems/settingsItems arrays with label strings to data-driven navKeys/settingsKeys arrays mapping path to translation key -- cleaner and more maintainable
- Topbar uses auth namespace for logout/profile/settings menu items since those keys already existed there in the message files
- Result-table introduces mapLocale helper function to convert short locale codes (pt, es, en) to full locale codes (pt-PT, es-ES, en-US) for Intl APIs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 03 can now extract remaining strings from dashboard pages, settings pages, and public pages
- Dashboard pages still have some formatDate callers without locale parameter (team, connector, billing) -- Plan 03 scope

---
*Phase: 09-internationalization*
*Completed: 2026-03-19*
