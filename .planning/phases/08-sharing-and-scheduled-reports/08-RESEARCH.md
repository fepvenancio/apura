# Phase 8: Sharing and Scheduled Reports - Research

**Researched:** 2026-03-19
**Domain:** Report sharing, scheduled report generation, queue-driven async pipeline (Cloudflare Workers + Queues + R2)
**Confidence:** HIGH

## Summary

Phase 8 activates the sharing and scheduled reports features. The backend infrastructure is largely **already built** -- schedules routes (CRUD + manual trigger), cron-worker (schedule polling + queue publishing), report-worker (query execution + CSV/HTML generation + R2 storage + email queue publishing), and email-worker (attachment delivery via Resend) all exist as implemented code. The primary work is: (1) fixing data model/message contract mismatches between workers, (2) adding the missing `REPORT_QUEUE` producer binding to api-gateway's wrangler.toml, (3) implementing the `is_shared` toggle and shared report visibility on the frontend, (4) building the schedule management and run history UI, and (5) adding a schedule runs API endpoint.

The sharing feature (SHARE-01, SHARE-02) is straightforward -- the `is_shared` column exists in the `reports` table, the update route already accepts `isPublic` (needs renaming to `isShared`), and `listReports()` already returns all org reports. The frontend just needs a toggle and a "shared with me" view.

**Primary recommendation:** Treat this as an integration/activation phase, not a greenfield build. Fix the identified contract mismatches between workers first, then wire up the frontend.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHARE-01 | User can share a report with other authenticated org members via `is_shared` flag | `is_shared` column exists in reports table; update route already handles `isPublic`; needs renaming to `isShared` and frontend toggle |
| SHARE-02 | Shared reports visible to all org members on reports page | `listReports()` already returns all org reports; frontend needs filtering UI (My Reports vs Shared) |
| SCHED-01 | User can create a schedule for recurring report generation (daily/weekly/monthly) | Full CRUD routes exist in `schedules.ts`; `createSchedule` in `OrgDatabase` works; frontend needs schedule creation form |
| SCHED-02 | Cron worker triggers report generation on schedule | Cron-worker fully implemented; polls D1 for due schedules, publishes to REPORT_QUEUE; needs message contract fix |
| SCHED-03 | User can view schedule run history and status | `schedule_runs` table exists; no API endpoint for listing runs yet; needs route + frontend |
| SCHED-04 | Generated reports stored in R2 and delivered via email | Report-worker stores in R2 (`reports/{orgId}/{reportId}/{runId}.{ext}`); email-worker delivers with attachment; pipeline fully coded |
| EXPORT-03 | Scheduled reports generate CSV and deliver via email | Report-worker `generateCsv()` implemented; email-worker `scheduled_report` type handles CSV attachment from R2 |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Hono | (existing) | HTTP routing in api-gateway | In use |
| Cloudflare Queues | N/A | Async message passing between workers | Configured in wrangler.toml |
| Cloudflare R2 | N/A | Report file storage | Binding exists in report-worker and api-gateway |
| Cloudflare D1 | N/A | Schedules, schedule_runs, reports tables | Schema deployed |
| Resend | N/A | Email delivery with attachments | Email-worker uses Resend API |
| Lucide React | (existing) | Icons for schedule/sharing UI | In use in frontend |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | (existing) | Test framework for api-gateway and frontend | Already installed; use for new route tests |

No new packages need to be installed. Everything required is already in the project.

## Architecture Patterns

### Queue Topology (Already Designed)

```
api-gateway ──[REPORT_QUEUE: report-generation]──> report-worker ──[EMAIL_QUEUE: email-outbound]──> email-worker
cron-worker ──[REPORT_QUEUE: report-generation]──> report-worker
api-gateway ──[EMAIL_QUEUE: email-outbound]──> email-worker (direct, for non-report emails)
```

### Recommended Project Structure (New Files)

```
packages/api-gateway/src/routes/
  schedules.ts          # EXISTS - CRUD + trigger (needs run history endpoint)
  reports.ts            # EXISTS - needs isShared toggle support

frontend/src/app/(dashboard)/reports/
  page.tsx              # EXISTS - needs shared reports tab/filter
  [id]/page.tsx         # EXISTS
  [id]/print/page.tsx   # EXISTS

frontend/src/app/(dashboard)/schedules/
  page.tsx              # NEW - schedule list with run history
  new/page.tsx          # NEW - schedule creation form

frontend/src/components/schedules/
  schedule-form.tsx     # NEW - cron expression builder
  run-history.tsx       # NEW - schedule run status list
```

### Pattern 1: Shared Report Visibility
**What:** Reports with `is_shared = 1` visible to all org members, not just the creator.
**When:** Any org member views the reports page.
**How:** `listReports()` already returns ALL org reports (no user_id filter). The frontend needs to distinguish "My Reports" vs "Shared with me" by comparing `report.user_id` with the authenticated user's ID.

### Pattern 2: Cron-to-Queue-to-Worker Pipeline
**What:** Cron-worker polls D1 for due schedules, publishes messages to `report-generation` queue, report-worker consumes and executes.
**When:** Every minute via cron trigger.
**Why:** Decouples scheduling logic from report generation; provides retry semantics via Queue; isolates failures.

### Anti-Patterns to Avoid
- **Do NOT build a custom cron parser.** The existing `computeNextRun()` in cron-worker handles standard patterns. For Phase 8, stick to preset frequencies (daily/weekly/monthly) mapped to known cron expressions rather than exposing raw cron to users.
- **Do NOT add report-generation queue CONSUMER to api-gateway.** Keep report generation in the dedicated report-worker. Api-gateway is the producer only.
- **Do NOT store report output inline in D1.** R2 is the correct storage for generated files. D1 stores only the R2 object key reference.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron expression parsing | Custom parser beyond existing | Preset cron strings for daily/weekly/monthly | `computeNextRun()` already handles common patterns; raw cron UI is complex and error-prone |
| Email with attachments | Custom SMTP | Resend API (email-worker) | Already implemented with base64 attachment support |
| File storage for reports | D1 BLOB or inline storage | R2 object storage | Already configured; R2 handles large files, lifecycle policies |
| CSV generation | Custom CSV library | Existing `generateCsv()` in report-worker | Already handles escaping, quoting, headers |

## Common Pitfalls

### Pitfall 1: Message Contract Mismatch Between Workers
**What goes wrong:** The cron-worker sends `runId` in the queue message, but the report-worker expects `scheduleRunId`. The cron-worker also sends `sqlQuery` but report-worker reads `report.generated_sql` from D1 using a JOIN on `saved_queries` that may not match the actual `queries` table.
**Why it happens:** Workers were stubbed independently without integration testing.
**How to avoid:** Align the message contract. Either rename `runId` to `scheduleRunId` in cron-worker, or rename `scheduleRunId` to `runId` in report-worker. Verify the report-worker's SQL JOIN matches the actual schema.
**Warning signs:** Queue messages consumed but report-worker fails silently.

### Pitfall 2: Missing `org_id` Column in `schedule_runs`
**What goes wrong:** The cron-worker INSERTs `org_id` into `schedule_runs`, but the D1 schema defines `schedule_runs` WITHOUT an `org_id` column. The INSERT will fail.
**Why it happens:** Schema was written before cron-worker logic was finalized.
**How to avoid:** Either add `org_id` to `schedule_runs` via migration, or remove it from the cron-worker INSERT. Adding it is better for query performance (list runs by org).
**Warning signs:** Cron-worker errors logged for every schedule trigger.

### Pitfall 3: Report-Worker JOIN on Wrong Table
**What goes wrong:** Report-worker JOINs `reports r JOIN saved_queries q ON r.query_id = q.id`, but there is no `saved_queries` table in the schema -- the table is called `queries`.
**Why it happens:** Naming inconsistency between design and implementation.
**How to avoid:** Fix the JOIN to use `queries` table: `JOIN queries q ON r.query_id = q.id`.
**Warning signs:** "Report not found" errors even when report exists.

### Pitfall 4: Missing REPORT_QUEUE Producer in api-gateway wrangler.toml
**What goes wrong:** The api-gateway types declare `REPORT_QUEUE: Queue` and `schedules.ts` uses `c.env.REPORT_QUEUE.send()`, but `wrangler.toml` does NOT have a `[[queues.producers]]` entry for `report-generation`.
**Why it happens:** The REPORT_QUEUE binding was added to types but not to wrangler.toml.
**How to avoid:** Add `[[queues.producers]]` binding for `REPORT_QUEUE` pointing to `report-generation` queue in api-gateway's wrangler.toml.
**Warning signs:** Runtime error: "REPORT_QUEUE is not defined" when manually triggering a schedule.

### Pitfall 5: `is_shared` vs `is_public` Column Confusion
**What goes wrong:** The D1 schema uses `is_shared` but the `createReport` route uses `isPublic` / `is_public`. These are semantically different (public = anyone, shared = org members only).
**Why it happens:** Naming evolved during development.
**How to avoid:** Standardize on `is_shared` everywhere. The report update route already has `is_shared` in `REPORT_COLUMNS` allowlist. Update `createReport` to use `is_shared` instead of `is_public`.
**Warning signs:** Sharing toggle appears to work but column mismatch means reports aren't actually shared.

### Pitfall 6: `next_run_at` Not Set on Schedule Creation
**What goes wrong:** When creating a schedule, the `createSchedule()` method doesn't set `next_run_at`. The cron-worker queries `WHERE next_run_at <= ?`, so new schedules with NULL `next_run_at` never get picked up.
**Why it happens:** The `createSchedule` route doesn't compute the initial `next_run_at`.
**How to avoid:** Compute and set `next_run_at` during schedule creation using the same `computeNextRun()` logic (or inline it in the API route).
**Warning signs:** Schedules created but never triggered.

## Code Examples

### Fix 1: Add REPORT_QUEUE to api-gateway wrangler.toml
```toml
# Add to packages/api-gateway/wrangler.toml
[[queues.producers]]
binding = "REPORT_QUEUE"
queue = "report-generation"
```

### Fix 2: Migration for schedule_runs.org_id
```sql
-- migrations/0007_schedule_runs_org_id.sql
ALTER TABLE schedule_runs ADD COLUMN org_id TEXT;
ALTER TABLE schedule_runs ADD COLUMN output_url TEXT;
CREATE INDEX idx_schedule_runs_org_id ON schedule_runs(org_id);
```
Note: `output_url` is also referenced in report-worker but missing from schema.

### Fix 3: Align Report-Worker SQL JOIN
```typescript
// In report-worker processReport(), change:
// FROM: `SELECT r.name, q.generated_sql FROM reports r JOIN saved_queries q ON r.query_id = q.id`
// TO:
const report = await env.DB.prepare(
  `SELECT r.name, q.generated_sql FROM reports r JOIN queries q ON r.query_id = q.id WHERE r.id = ? AND r.org_id = ?`
).bind(reportId, orgId).first();
```

### Fix 4: Cron-Worker Message Contract Alignment
```typescript
// In cron-worker, change message to match report-worker's ReportMessage:
await env.REPORT_QUEUE.send({
  scheduleRunId: runId,        // was: runId
  scheduleId: schedule.id,
  orgId: schedule.org_id,
  reportId: schedule.report_id,
  reportName: report.name,
  outputFormat: schedule.output_format,
  recipients,
  userId: schedule.created_by,  // missing from cron-worker
  // Remove: sqlQuery, subjectTemplate, bodyTemplate, triggeredAt
  // (report-worker fetches SQL from D1, not from message)
});
```

### Example: Shared Reports Filter (Frontend)
```typescript
// In reports/page.tsx
const userId = useAuthStore((s) => s.user?.id);
const [tab, setTab] = useState<'mine' | 'shared'>('mine');

const filtered = reports.filter((r) =>
  tab === 'mine' ? r.userId === userId : r.isShared && r.userId !== userId
);
```

### Example: Schedule Creation with next_run_at
```typescript
// In schedules.ts POST handler, after creating schedule:
const nextRun = computeNextRun(body.cronExpression, new Date());
await orgDb.updateSchedule(id, { next_run_at: nextRun.toISOString() });
```

### Example: Schedule Runs API Endpoint
```typescript
// New route: GET /api/schedules/:id/runs
schedules.get('/:id/runs', async (c) => {
  const orgId = c.get('orgId');
  const scheduleId = c.req.param('id');

  const { results } = await c.env.DB
    .prepare(
      `SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT 50`
    )
    .bind(scheduleId)
    .all();

  return c.json({ success: true, data: { items: results ?? [], total: results?.length ?? 0 } });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline `is_public` naming | `is_shared` (org-scoped sharing) | Schema design | Must align route code with schema column name |
| Raw cron expression input | Preset frequency options (daily/weekly/monthly) | UX best practice | Simpler UI, fewer validation issues |

**Important naming note:** The schema uses `is_shared`, the route code uses `is_public`/`isPublic`. These MUST be aligned to `is_shared` throughout.

## Open Questions

1. **Cron expression vs preset frequencies**
   - What we know: `computeNextRun()` handles standard 5-field cron; schedules table stores `cron_expression`
   - What's unclear: Should users enter raw cron expressions or pick from presets (daily at X, weekly on Y, monthly on Z)?
   - Recommendation: Use presets in the UI that generate cron expressions. Store the cron expression in D1. This keeps the backend flexible while making the UI user-friendly.

2. **Report-worker `sql_query` column on reports table**
   - What we know: The reports table has `sql_query` column but the cron-worker reads `report.sql_query` while the report-worker JOINs on `queries` table to get `generated_sql`
   - What's unclear: Whether reports always have a `query_id` reference, or sometimes store SQL directly in `sql_query`
   - Recommendation: Support both paths -- if `report.query_id` exists, JOIN to get SQL; otherwise fall back to `report.sql_query`.

3. **R2 presigned URLs for report downloads**
   - What we know: Report files stored in R2 at `reports/{orgId}/{reportId}/{runId}.{ext}`
   - What's unclear: How should users download historical report files from run history?
   - Recommendation: Add a `GET /api/schedules/:scheduleId/runs/:runId/download` endpoint that reads from R2 and streams the file. No presigned URLs needed since all access is authenticated.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (installed) |
| Config file | packages/api-gateway/vitest.config.ts, frontend/vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm run test` (root turbo) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHARE-01 | PUT /api/reports/:id with isShared toggle | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/reports.test.ts -x` | No - Wave 0 |
| SHARE-02 | GET /api/reports returns shared reports for org members | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/reports.test.ts -x` | No - Wave 0 |
| SCHED-01 | POST /api/schedules creates schedule with next_run_at | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/schedules.test.ts -x` | No - Wave 0 |
| SCHED-02 | Cron worker finds due schedules and publishes to queue | unit | `cd packages/cron-worker && npx vitest run -x` | No - Wave 0 |
| SCHED-03 | GET /api/schedules/:id/runs returns run history | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/schedules.test.ts -x` | No - Wave 0 |
| SCHED-04 | Report-worker processes message, stores in R2, publishes email | unit | `cd packages/report-worker && npx vitest run -x` | No - Wave 0 |
| EXPORT-03 | Report-worker generates CSV output for scheduled reports | unit | `cd packages/report-worker && npx vitest run -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (in relevant package)
- **Per wave merge:** `npm run test` (root)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api-gateway/src/routes/__tests__/reports.test.ts` -- covers SHARE-01, SHARE-02
- [ ] `packages/api-gateway/src/routes/__tests__/schedules.test.ts` -- covers SCHED-01, SCHED-03
- [ ] Test infrastructure for cron-worker and report-worker (vitest config, mock bindings)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/cron-worker/src/index.ts` -- full cron-worker implementation
- Codebase analysis: `packages/report-worker/src/index.ts` -- full report-worker implementation
- Codebase analysis: `packages/email-worker/src/index.ts` -- email delivery with attachments
- Codebase analysis: `packages/api-gateway/src/routes/schedules.ts` -- full CRUD + trigger routes
- Codebase analysis: `packages/api-gateway/src/routes/reports.ts` -- report CRUD routes
- Codebase analysis: `migrations/0001_initial_schema.sql` -- D1 schema with schedules, schedule_runs, reports tables
- Codebase analysis: All wrangler.toml files -- queue bindings and service bindings

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` -- queue topology design
- `.planning/research/FEATURES.md` -- feature complexity estimates

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new dependencies
- Architecture: HIGH - queue topology and worker code already exist, verified against wrangler.toml bindings
- Pitfalls: HIGH - identified 6 concrete bugs/mismatches through direct code analysis
- Frontend: MEDIUM - existing reports page is simple; schedule UI needs design decisions

**Critical bugs found during research:**
1. `schedule_runs` table missing `org_id` and `output_url` columns (cron-worker and report-worker both reference them)
2. Report-worker JOINs on nonexistent `saved_queries` table (should be `queries`)
3. Message contract mismatch: cron-worker sends `runId`, report-worker expects `scheduleRunId`
4. Missing `REPORT_QUEUE` producer binding in api-gateway wrangler.toml (types declare it, wrangler.toml doesn't)
5. `is_public` vs `is_shared` naming inconsistency between route code and D1 schema
6. `next_run_at` not set during schedule creation (schedules never get picked up by cron)

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain, no external dependency changes expected)
