---
phase: 09-internationalization
plan: 03
subsystem: i18n
tags: [next-intl, i18n, useTranslations, locale-routing]

requires:
  - phase: 09-internationalization plan 01
    provides: "next-intl config, 521 message keys, [locale] route structure, backend language field"
provides:
  - "All 17 dashboard pages use useTranslations() for all visible text"
  - "All 3 translatable public pages use useTranslations()"
  - "Profile page language selector wired to user.language with locale navigation"
  - "Locale-aware formatting functions (formatDate, formatRelativeDate, formatNumber, formatCurrency)"
  - "522 synced translation keys across pt/en/es"
affects: []

tech-stack:
  added: []
  patterns: [locale-aware formatting via fullLocale parameter, language selector with router.push locale switch]

key-files:
  created: []
  modified:
    - frontend/src/app/[locale]/(dashboard)/home/page.tsx
    - frontend/src/app/[locale]/(dashboard)/query/page.tsx
    - frontend/src/app/[locale]/(dashboard)/history/page.tsx
    - frontend/src/app/[locale]/(dashboard)/reports/page.tsx
    - frontend/src/app/[locale]/(dashboard)/reports/[id]/page.tsx
    - frontend/src/app/[locale]/(dashboard)/reports/[id]/print/page.tsx
    - frontend/src/app/[locale]/(dashboard)/dashboards/page.tsx
    - frontend/src/app/[locale]/(dashboard)/dashboards/[id]/page.tsx
    - frontend/src/app/[locale]/(dashboard)/schema/page.tsx
    - frontend/src/app/[locale]/(dashboard)/schedules/page.tsx
    - frontend/src/app/[locale]/(dashboard)/schedules/new/page.tsx
    - frontend/src/app/[locale]/(dashboard)/settings/page.tsx
    - frontend/src/app/[locale]/(dashboard)/settings/profile/page.tsx
    - frontend/src/app/[locale]/(dashboard)/settings/team/page.tsx
    - frontend/src/app/[locale]/(dashboard)/settings/connector/page.tsx
    - frontend/src/app/[locale]/(dashboard)/settings/billing/page.tsx
    - frontend/src/app/[locale]/(dashboard)/settings/security/page.tsx
    - frontend/src/app/[locale]/(public)/page.tsx
    - frontend/src/app/[locale]/(public)/pricing/page.tsx
    - frontend/src/app/[locale]/(public)/docs/page.tsx
    - frontend/src/lib/utils.ts
    - frontend/messages/pt.json
    - frontend/messages/en.json
    - frontend/messages/es.json

key-decisions:
  - "Added locale parameter to all formatting functions in utils.ts with pt-PT default for backward compatibility"
  - "Profile language selector navigates via router.push to new locale path for immediate re-render"
  - "User language persisted to localStorage alongside API call for immediate client-side availability"

patterns-established:
  - "fullLocale derivation: locale === 'pt' ? 'pt-PT' : locale === 'es' ? 'es-ES' : 'en-US'"
  - "Multiple namespace hooks: const t = useTranslations('primary'); const tc = useTranslations('common');"

requirements-completed: [I18N-02, I18N-04]

duration: 11min
completed: 2026-03-19
---

# Phase 9 Plan 3: Dashboard and Public Page String Extraction Summary

**All 20 page files converted to useTranslations() with 522 synced keys, locale-aware formatting, and functional language selector**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-19T01:30:54Z
- **Completed:** 2026-03-19T01:42:00Z
- **Tasks:** 2
- **Files modified:** 24

## Accomplishments
- Replaced all hardcoded Portuguese strings in 17 dashboard pages with useTranslations() hooks
- Replaced all hardcoded Portuguese strings in 3 public pages (landing, pricing, docs) with useTranslations() hooks
- Wired profile page language selector to user.language with locale-aware navigation
- Added locale parameter to formatDate, formatRelativeDate, formatNumber, formatCurrency for locale-aware formatting
- Locale-prefixed all internal links (router.push, Link href) across all modified files
- Frontend build succeeds with locale-prefixed routes for all 3 locales (pt, en, es)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract strings from all dashboard pages** - `6b8cc31` (feat)
2. **Task 2: Extract strings from public pages and verify full build** - `60daac8` (feat)

## Files Created/Modified
- `frontend/src/app/[locale]/(dashboard)/home/page.tsx` - Dashboard home with useTranslations("dashboard")
- `frontend/src/app/[locale]/(dashboard)/query/page.tsx` - Query page with useTranslations("query")
- `frontend/src/app/[locale]/(dashboard)/history/page.tsx` - History page with useTranslations("history")
- `frontend/src/app/[locale]/(dashboard)/reports/page.tsx` - Reports list with useTranslations("reports")
- `frontend/src/app/[locale]/(dashboard)/reports/[id]/page.tsx` - Report detail with useTranslations("reports")
- `frontend/src/app/[locale]/(dashboard)/reports/[id]/print/page.tsx` - Print report with useTranslations("reports")
- `frontend/src/app/[locale]/(dashboard)/dashboards/page.tsx` - Dashboards list with useTranslations("dashboards")
- `frontend/src/app/[locale]/(dashboard)/dashboards/[id]/page.tsx` - Dashboard detail with useTranslations("dashboards")
- `frontend/src/app/[locale]/(dashboard)/schema/page.tsx` - Schema browser with useTranslations("schema")
- `frontend/src/app/[locale]/(dashboard)/schedules/page.tsx` - Schedules list with useTranslations("schedules")
- `frontend/src/app/[locale]/(dashboard)/schedules/new/page.tsx` - New schedule form with useTranslations("schedules")
- `frontend/src/app/[locale]/(dashboard)/settings/page.tsx` - Org settings with useTranslations("settings")
- `frontend/src/app/[locale]/(dashboard)/settings/profile/page.tsx` - Profile with language selector wired to locale navigation
- `frontend/src/app/[locale]/(dashboard)/settings/team/page.tsx` - Team management with useTranslations("team")
- `frontend/src/app/[locale]/(dashboard)/settings/connector/page.tsx` - Connector page with useTranslations("connector")
- `frontend/src/app/[locale]/(dashboard)/settings/billing/page.tsx` - Billing page with useTranslations("billing")
- `frontend/src/app/[locale]/(dashboard)/settings/security/page.tsx` - Security/MFA with useTranslations("security")
- `frontend/src/app/[locale]/(public)/page.tsx` - Landing page with useTranslations("landing")
- `frontend/src/app/[locale]/(public)/pricing/page.tsx` - Pricing page with useTranslations("pricing")
- `frontend/src/app/[locale]/(public)/docs/page.tsx` - Docs page with useTranslations("docs")
- `frontend/src/lib/utils.ts` - Added locale parameter to all formatting functions
- `frontend/messages/pt.json` - Added dashboards.shared key (522 total keys)
- `frontend/messages/en.json` - Added dashboards.shared key (522 total keys)
- `frontend/messages/es.json` - Added dashboards.shared key (522 total keys)

## Decisions Made
- Added locale parameter with `pt-PT` default to all formatting functions in utils.ts for backward compatibility with callers that don't pass locale
- Profile language selector updates localStorage user object immediately alongside API call, then navigates to new locale path via router.push for immediate re-render
- Used `Intl.RelativeTimeFormat` for locale-aware relative dates (linter-assisted improvement)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added locale parameter to formatting functions**
- **Found during:** Task 1 (dashboard page string extraction)
- **Issue:** formatDate, formatRelativeDate, formatNumber, formatCurrency were hardcoded to pt-PT locale
- **Fix:** Added optional locale parameter with pt-PT default to all four functions
- **Files modified:** frontend/src/lib/utils.ts
- **Verification:** Build passes, all callers work with or without locale parameter
- **Committed in:** 6b8cc31 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added dashboards.shared translation key**
- **Found during:** Task 1 (dashboards page string extraction)
- **Issue:** dashboards namespace lacked "shared" key needed by dashboards list and detail pages
- **Fix:** Added dashboards.shared key to all 3 locale files
- **Files modified:** frontend/messages/pt.json, en.json, es.json
- **Verification:** Key count synced at 522 across all locales
- **Committed in:** 6b8cc31 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both fixes necessary for complete i18n support. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All page string extraction complete across entire app
- 522 translation keys synced across pt/en/es
- Legal pages (terms, privacy, dpa) intentionally excluded per research decision
- Phase 09 internationalization is complete

---
*Phase: 09-internationalization*
*Completed: 2026-03-19*
