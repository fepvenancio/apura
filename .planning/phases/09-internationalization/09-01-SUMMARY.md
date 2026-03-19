---
phase: 09-internationalization
plan: 01
subsystem: i18n
tags: [next-intl, i18n, localization, react, hono]

requires: []
provides:
  - next-intl configured with 3 locales (pt, es, en)
  - 521 translation keys across 21 namespaces in JSON message files
  - "[locale] route segment with NextIntlClientProvider wrapping all pages"
  - "Backend auth endpoints returning user.language field"
  - "PATCH /auth/profile and POST /auth/change-password endpoints"
affects: [09-internationalization]

tech-stack:
  added: [next-intl]
  patterns: [locale-segmented routing, JSON message namespaces]

key-files:
  created:
    - frontend/src/i18n/routing.ts
    - frontend/src/i18n/request.ts
    - frontend/messages/pt.json
    - frontend/messages/en.json
    - frontend/messages/es.json
    - frontend/src/app/[locale]/layout.tsx
    - frontend/src/app/page.tsx
  modified:
    - frontend/next.config.ts
    - frontend/src/app/layout.tsx
    - frontend/src/lib/types.ts
    - frontend/src/lib/api.ts
    - packages/api-gateway/src/routes/auth.ts

key-decisions:
  - "Removed output: export from next.config.ts -- dynamic route segments ([token], [id]) are incompatible with static export"
  - "521 translation keys across 21 namespaces covering all pages and components"
  - "Backend returns language field on all auth responses (login, signup, refresh, MFA verify)"

patterns-established:
  - "i18n namespace pattern: one namespace per page/feature domain (auth, query, reports, etc.)"
  - "Locale layout provides NextIntlClientProvider; root layout is minimal html/body wrapper"

requirements-completed: [I18N-01, I18N-02]

duration: 11min
completed: 2026-03-19
---

# Phase 9 Plan 1: i18n Foundation Summary

**next-intl configured with pt/es/en locales, 521 translation keys in 21 namespaces, [locale] route structure, and backend language field wiring**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-19T01:16:23Z
- **Completed:** 2026-03-19T01:28:10Z
- **Tasks:** 2
- **Files modified:** 41

## Accomplishments
- Installed next-intl and configured createNextIntlPlugin in next.config.ts
- Created 3 locale message files (pt.json, en.json, es.json) with 521 matching keys across 21 namespaces
- Restructured entire app directory under [locale] segment with NextIntlClientProvider
- Added language field to AuthUser type and all backend auth responses
- Added PATCH /auth/profile and POST /auth/change-password backend endpoints
- Build succeeds with locale-prefixed routes for all 3 locales

## Task Commits

Each task was committed atomically:

1. **Task 1: Install next-intl and create i18n configuration with complete message files** - `3efff45` (feat)
2. **Task 2: Restructure app directory under [locale] segment and wire backend language field** - `5940ba8` (feat)

## Files Created/Modified
- `frontend/src/i18n/routing.ts` - Locale routing config (pt, es, en with pt default)
- `frontend/src/i18n/request.ts` - Request config for next-intl message loading
- `frontend/messages/pt.json` - Portuguese translations (521 keys, 21 namespaces)
- `frontend/messages/en.json` - English translations (521 keys, 21 namespaces)
- `frontend/messages/es.json` - Spanish translations (521 keys, 21 namespaces)
- `frontend/src/app/[locale]/layout.tsx` - Locale layout with NextIntlClientProvider and generateStaticParams
- `frontend/src/app/page.tsx` - Root redirect to /pt
- `frontend/src/app/layout.tsx` - Simplified root layout (removed metadata and lang attr)
- `frontend/next.config.ts` - Added createNextIntlPlugin
- `frontend/src/lib/types.ts` - Added language field to AuthUser
- `frontend/src/lib/api.ts` - Added language to RawAuthResponse and normalizeAuthResponse
- `packages/api-gateway/src/routes/auth.ts` - Language in all auth responses, PATCH /profile, POST /change-password

## Decisions Made
- Removed `output: "export"` from next.config.ts because dynamic route segments ([token], [id]) are incompatible with Next.js static export -- these pages are client-rendered and need server-side routing
- Created 21 namespaces (common, nav, auth, dashboard, query, history, reports, dashboards, schema, schedules, settings, profile, team, connector, billing, security, landing, pricing, docs, metadata, format) covering all strings from every page and component
- Backend PATCH /auth/profile validates language against allowed values (pt, en, es)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed missing language field in api.ts RawAuthResponse type**
- **Found during:** Task 2 (build verification)
- **Issue:** Build failed because AuthUser now requires language but RawAuthResponse type did not include it
- **Fix:** Added language to RawAuthResponse interface and normalizeAuthResponse
- **Files modified:** frontend/src/lib/api.ts
- **Verification:** Build passes
- **Committed in:** 5940ba8 (Task 2 commit)

**2. [Rule 3 - Blocking] Removed output: export from next.config.ts**
- **Found during:** Task 2 (build verification)
- **Issue:** `output: "export"` causes build failure because dynamic route segments ([token], [id]) require generateStaticParams with all possible values, which is impossible for runtime tokens
- **Fix:** Removed `output: "export"` -- the original config did not have it, and the build works without it
- **Files modified:** frontend/next.config.ts
- **Verification:** Build passes with locale-prefixed routes
- **Committed in:** 5940ba8 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for build to succeed. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- i18n foundation complete -- Plans 02 and 03 can now replace hardcoded strings with useTranslations() hooks
- All 521 message keys are ready for consumption by page components
- Backend language field is wired end-to-end

---
*Phase: 09-internationalization*
*Completed: 2026-03-19*
