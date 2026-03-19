---
phase: 08-sharing-and-scheduled-reports
verified: 2026-03-19T00:00:00Z
status: gaps_found
score: 10/12 must-haves verified
re_verification: false
gaps:
  - truth: "User can toggle is_shared on a report from the reports page"
    status: failed
    reason: "Frontend api.updateReport calls PATCH /reports/:id but backend registers only PUT /reports/:id (Hono .put). PATCH requests return 404/405 in production, making the share toggle silently fail."
    artifacts:
      - path: "frontend/src/lib/api.ts"
        issue: "Line 447: uses PATCH method for updateReport"
      - path: "packages/api-gateway/src/routes/reports.ts"
        issue: "Line 88: route registered with .put() — no .patch() handler exists"
    missing:
      - "Either change reports.ts to also register .patch('/:id', ...) or change api.ts updateReport to use PUT"
  - truth: "User can toggle schedule enabled/disabled from the schedules page"
    status: failed
    reason: "Frontend api.updateSchedule calls PATCH /schedules/:id but backend registers only PUT /schedules/:id (Hono .put). The enable/disable toggle on the schedules page silently fails."
    artifacts:
      - path: "frontend/src/lib/api.ts"
        issue: "Line 332: uses PATCH method for updateSchedule"
      - path: "packages/api-gateway/src/routes/schedules.ts"
        issue: "Line 157: route registered with .put() — no .patch() handler exists"
    missing:
      - "Either change schedules.ts to also register .patch('/:id', ...) or change api.ts updateSchedule to use PUT"
---

# Phase 8: Sharing and Scheduled Reports — Verification Report

**Phase Goal:** Users can share reports within their org and set up automated recurring report generation
**Verified:** 2026-03-19
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | schedule_runs table has org_id and output_url columns | VERIFIED | `migrations/0007_schedule_runs_columns.sql` lines 4-5 contain both ALTER TABLE statements |
| 2 | Report-worker JOINs on queries table (not saved_queries) | VERIFIED | `packages/report-worker/src/index.ts` line 172: `JOIN queries q ON r.query_id = q.id` |
| 3 | Cron-worker message contract matches ReportMessage interface | VERIFIED | `packages/cron-worker/src/index.ts` lines 159-168 send `scheduleRunId`, `userId: schedule.created_by`, and all required fields |
| 4 | api-gateway wrangler.toml has REPORT_QUEUE producer binding | VERIFIED | `packages/api-gateway/wrangler.toml` lines 31-33: `binding = "REPORT_QUEUE"`, `queue = "report-generation"` |
| 5 | createReport uses is_shared column (not is_public) | VERIFIED | `packages/api-gateway/src/services/org-db.ts` line 161, 173; `packages/api-gateway/src/routes/reports.ts` line 47 |
| 6 | Schedule creation computes and sets next_run_at | VERIFIED | `packages/api-gateway/src/routes/schedules.ts` lines 118-119: `computeNextRun` called and result applied via `updateSchedule` |
| 7 | GET /api/schedules/:id/runs returns run history | VERIFIED | `packages/api-gateway/src/routes/schedules.ts` lines 270-290: full implementation with org ownership check |
| 8 | PUT /api/reports/:id accepts isShared toggle | VERIFIED | `packages/api-gateway/src/routes/reports.ts` lines 103, 111: `isShared` in body type, mapped to `is_shared` column |
| 9 | User can toggle is_shared on a report from the reports page | FAILED | `api.updateReport` sends `PATCH /reports/:id` but backend only has `PUT /reports/:id` — HTTP method mismatch |
| 10 | Reports page shows My Reports and Shared tabs | VERIFIED | `frontend/src/app/(dashboard)/reports/page.tsx` lines 14-64: `Tab` type, two tab buttons, filter logic |
| 11 | Shared tab shows reports from other org members where is_shared=true | VERIFIED | Line 59: `reports.filter((r) => r.isShared && r.userId !== userId)` |
| 12 | User can create a new schedule with frequency presets | VERIFIED | `frontend/src/app/(dashboard)/schedules/new/page.tsx`: daily/weekly/monthly presets, `buildCron()` function, `api.createSchedule` call |
| 13 | Schedules page lists all schedules with status and next run | VERIFIED | `frontend/src/app/(dashboard)/schedules/page.tsx`: fetches `api.getSchedules()`, renders status badge, next/last run dates |
| 14 | User can view run history for a schedule | VERIFIED | Lines 89-106, 261-338: `toggleHistory` fetches `api.getScheduleRuns`, renders expandable table |
| 15 | User can toggle schedule enabled/disabled | FAILED | `api.updateSchedule` sends `PATCH /schedules/:id` but backend only has `PUT /schedules/:id` — HTTP method mismatch |

**Score:** 10/12 truths verified (2 failed due to PATCH vs PUT HTTP method mismatch)

---

## Required Artifacts

### Plan 08-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `migrations/0007_schedule_runs_columns.sql` | D1 migration adding org_id and output_url | VERIFIED | Both ALTER TABLE statements present; index added |
| `packages/api-gateway/wrangler.toml` | REPORT_QUEUE producer binding | VERIFIED | Lines 31-33 add REPORT_QUEUE binding to report-generation queue; REPORTS_BUCKET R2 binding also present |
| `packages/api-gateway/src/routes/schedules.ts` | Schedule runs list endpoint and next_run_at on create | VERIFIED | GET `/:id/runs` at line 270; `computeNextRun` + `updateSchedule` at lines 118-119 |
| `packages/report-worker/src/index.ts` | Fixed JOIN and message contract | VERIFIED | Line 172: `JOIN queries q`; `scheduleRunId` consumed correctly from ReportMessage |

### Plan 08-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/app/(dashboard)/reports/page.tsx` | Reports page with sharing toggle and shared/mine tabs | VERIFIED (logic) | Contains `isShared` toggle, tab filtering; wiring fails at HTTP layer |
| `frontend/src/app/(dashboard)/schedules/page.tsx` | Schedule list with run history expansion | VERIFIED | `getSchedules`, `getScheduleRuns`, expandable run history, status badges |
| `frontend/src/app/(dashboard)/schedules/new/page.tsx` | Schedule creation form with frequency presets | VERIFIED | `cronExpression` built from presets, `createSchedule` called, redirect on success |
| `frontend/src/lib/types.ts` | Updated Report type with isShared, ScheduleRun type | VERIFIED | Lines 74-75: `isShared`, `userId` on Report; lines 132-140: `ScheduleRun` interface |
| `frontend/src/lib/api.ts` | API methods for schedule runs and report sharing | PARTIAL | `getScheduleRuns` (line 343), `downloadScheduleRun` (line 347) present; `updateReport` and `updateSchedule` use wrong HTTP method (PATCH vs PUT) |

---

## Key Link Verification

### Plan 08-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/cron-worker/src/index.ts` | `packages/report-worker/src/index.ts` | REPORT_QUEUE message with `scheduleRunId` | VERIFIED | Both workers use the same field names; cron sends `scheduleRunId: runId`, `userId: schedule.created_by` |
| `packages/api-gateway/src/routes/schedules.ts` | `packages/api-gateway/wrangler.toml` | REPORT_QUEUE binding | VERIFIED | Line 242 calls `c.env.REPORT_QUEUE.send()`; binding exists in wrangler.toml |
| `packages/api-gateway/src/services/org-db.ts` | schema | `is_shared` column | VERIFIED | `REPORT_COLUMNS` set includes `is_shared`; `createReport` inserts `is_shared` correctly |

### Plan 08-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/src/app/(dashboard)/reports/page.tsx` | `/api/reports` | `api.updateReport` with `isShared` | NOT_WIRED | Component calls `api.updateReport(id, { isShared })` which uses `PATCH`; backend only accepts `PUT` |
| `frontend/src/app/(dashboard)/schedules/page.tsx` | `/api/schedules/:id/runs` | `api.getScheduleRuns` | VERIFIED | Line 98: `api.getScheduleRuns(scheduleId)` calls `GET /schedules/${scheduleId}/runs` |
| `frontend/src/app/(dashboard)/schedules/new/page.tsx` | `/api/schedules` | `api.createSchedule` | VERIFIED | Line 110: `api.createSchedule({ reportId, cronExpression, timezone, outputFormat, recipients })` |
| `frontend/src/app/(dashboard)/schedules/page.tsx` | `/api/schedules/:id` | `api.updateSchedule` with `enabled` | NOT_WIRED | Line 57: `api.updateSchedule(id, { enabled })` uses `PATCH`; backend only accepts `PUT` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SHARE-01 | 08-01, 08-02 | User can share a report with other authenticated org members via `is_shared` flag | PARTIAL | Backend `PUT /reports/:id` with `isShared` works; frontend share toggle broken by PATCH/PUT mismatch |
| SHARE-02 | 08-02 | Shared reports visible to all org members on reports page | VERIFIED | "Partilhados comigo" tab filters `r.isShared && r.userId !== userId`; data is fetched and filtered |
| SCHED-01 | 08-01, 08-02 | User can create a schedule for recurring report generation (daily/weekly/monthly) | PARTIAL | Schedule creation works end-to-end; schedule enable/disable toggle broken by PATCH/PUT mismatch |
| SCHED-02 | 08-01 | Cron worker triggers report generation on schedule | VERIFIED | `cron-worker` queries `schedules WHERE is_active=1 AND next_run_at <= ?`, sends proper `ReportMessage` to REPORT_QUEUE |
| SCHED-03 | 08-01, 08-02 | User can view schedule run history and status | VERIFIED | GET `/:id/runs` backend endpoint + schedules page expandable run history |
| SCHED-04 | 08-01 | Generated reports stored in R2 and delivered via email | VERIFIED | `report-worker` stores to REPORTS_BUCKET, publishes to EMAIL_QUEUE; download endpoint streams from R2 |
| EXPORT-03 | 08-01 | Scheduled reports generate CSV and deliver via email | VERIFIED | `report-worker` generates CSV via `generateCsv()`, stores in R2, sends to email-worker queue |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/app/(dashboard)/reports/page.tsx` | 35-37 | `catch { // Ignore }` on delete | Warning | User gets no feedback if delete fails |
| `frontend/src/app/(dashboard)/reports/page.tsx` | 48-50 | `catch { // Ignore }` on share toggle | Warning | User gets no feedback if share toggle fails (and it will fail due to PATCH/PUT mismatch) |
| `frontend/src/app/(dashboard)/schedules/page.tsx` | 63-65 | `catch { // Ignore }` on toggle enable | Warning | User gets no feedback if enable toggle fails (and it will fail due to PATCH/PUT mismatch) |
| `frontend/src/app/(dashboard)/schedules/page.tsx` | 84-86 | `catch { // Ignore }` on trigger | Warning | User gets no feedback if manual trigger fails |
| `frontend/src/app/(dashboard)/schedules/new/page.tsx` | 115 | `recipients: recipients.length > 0 ? recipients : undefined` | Warning | Passes `undefined` recipients to backend which requires non-empty `recipients` array; create will return 400 |

---

## Human Verification Required

### 1. Report sharing visible cross-user

**Test:** Log in as User A, create a report, share it. Log in as User B in same org. Check "Partilhados comigo" tab.
**Expected:** Shared report appears in User B's shared tab.
**Why human:** Requires two authenticated sessions and live backend.

### 2. Cron worker fires on schedule

**Test:** Create a schedule, wait for `next_run_at` to elapse, check schedule_runs table.
**Expected:** A row appears with status `queued` or `completed`.
**Why human:** Requires a live Cloudflare Workers cron trigger and D1 database.

### 3. Report CSV delivered by email

**Test:** Trigger a schedule manually, observe email at recipient address.
**Expected:** Email received containing report name; CSV attachment or download link.
**Why human:** Requires live email-worker + Resend integration.

### 4. Mobile layout at 375px

**Test:** Open `/reports`, `/schedules`, `/schedules/new` at 375px viewport.
**Expected:** Tabs full-width, cards single-column, form fields full-width, action buttons wrap gracefully.
**Why human:** Visual appearance requires browser rendering.

---

## Gaps Summary

Two functional gaps share a single root cause: **HTTP method mismatch between the frontend API client and backend route handlers**.

The backend registers update routes with Hono's `.put()` method (`PUT /reports/:id` and `PUT /schedules/:id`), but the frontend `ApiClient` sends both as `PATCH` requests. Hono does not silently map one to the other — a `PATCH` request to a `PUT`-only route returns a 404.

**Consequences in production:**
- The share toggle button on the reports page (`handleToggleShare`) calls `api.updateReport(id, { isShared })`, which sends `PATCH /reports/abc123`. The backend returns 404. The error is swallowed by `catch { // Ignore }`, so the user sees no change and no error message.
- The enable/disable toggle on the schedules page (`handleToggle`) calls `api.updateSchedule(id, { enabled })`, which sends `PATCH /schedules/abc123`. Same silent failure.

**Fix (two options):**
1. **Backend fix (preferred — matches REST convention for partial updates):** Add `.patch()` handlers alongside existing `.put()` handlers in `reports.ts` and `schedules.ts`, or replace `.put()` with `.on(['PUT', 'PATCH'], ...)`.
2. **Frontend fix:** Change `updateReport` and `updateSchedule` in `api.ts` to use `"PUT"` instead of `"PATCH"`.

Additionally, a minor issue exists in `schedules/new/page.tsx`: recipients are passed as `undefined` when none are added, but the backend validation requires at least one recipient. Users must add at least one email to create a schedule — this is likely intended behavior but the form gives no hint that recipients are required (the field is not marked with `*`).

---

_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
