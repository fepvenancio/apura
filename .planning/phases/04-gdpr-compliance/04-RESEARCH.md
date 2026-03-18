# Phase 4: GDPR Compliance - Research

**Researched:** 2026-03-18
**Domain:** GDPR data rights (erasure, export, consent), data retention, legal pages on Cloudflare Workers + D1
**Confidence:** HIGH

## Summary

Phase 4 implements six GDPR requirements: right-to-erasure cascade deletion, data export with email delivery, consent logging, DPA page, data retention cleanup, and privacy policy updates. The most complex requirement is the erasure endpoint (GDPR-01), which must cascade-delete across 14 D1 tables plus KV sessions and R2 report files -- all without `ON DELETE CASCADE` in the current schema.

The codebase is well-positioned for this work. The api-gateway already has all required bindings (D1, KV, EMAIL_QUEUE), the email-worker can deliver data export download links, and the cron-worker stub is ready for retention cleanup. The key challenge is the deletion ordering: D1 enforces foreign keys (`PRAGMA foreign_keys = ON`) but no table has CASCADE configured. Either a migration adds CASCADE to user-scoped FKs, or the erasure service must delete in exact reverse-dependency order using `db.batch()`.

**Primary recommendation:** Add a D1 migration for `ON DELETE CASCADE` on user-scoped FKs, create a `consent_log` table, implement erasure and export as authenticated API routes in api-gateway, and extend the cron-worker with a retention cleanup handler.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GDPR-01 | Right-to-erasure endpoint cascade-deletes all user PII across all tables and KV/R2 | FK dependency map, deletion order, db.batch() atomicity pattern, KV session cleanup, R2 list-and-delete |
| GDPR-02 | Data export endpoint generates JSON of all user PII, stores in R2, emails download link | PII table map, R2 presigned URL pattern, email-worker integration via EMAIL_QUEUE |
| GDPR-03 | Consent logging tracks terms/privacy acceptance with version, IP, and timestamp | New consent_log table schema, signup flow integration |
| GDPR-04 | DPA page hosted on site | Static Next.js page pattern (matches existing privacy/terms pages) |
| GDPR-05 | Data retention policy enforced via cron-worker cleanup (queries 12mo, audit 24mo) | Cron-worker stub analysis, scheduled handler pattern, batch delete with date filters |
| GDPR-06 | Privacy policy updated to list sub-processors | Existing privacy page content, required sub-processor list |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. All GDPR functionality uses existing bindings and APIs.

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Cloudflare D1 | current | Database for all PII, consent logs, retention | Already in use; `db.batch()` provides atomic multi-table operations |
| Cloudflare KV | current | Session storage cleanup during erasure | Already bound as `CACHE` in api-gateway |
| Cloudflare R2 | current | Store data export JSON files, list/delete report files | Already bound as `REPORTS_BUCKET` in email-worker and report-worker |
| Cloudflare Queues | current | Trigger email delivery for export download links | `EMAIL_QUEUE` already bound in api-gateway |
| Hono | 4.x | Route handlers for /api/gdpr/* endpoints | Already in use for all api-gateway routes |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `crypto.randomUUID()` | Generate unique IDs for consent records and export files | Standard Web Crypto API, available in Workers |
| R2 presigned URLs | Provide time-limited download links for data exports | Use `createSignedUrl()` or generate HMAC-signed redirect URLs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| R2 presigned URL for export download | Direct R2 fetch via API route | Presigned URL avoids proxying large files through Worker; use API route if R2 presigned URLs are not available and proxy through Worker instead |
| Migration adding ON DELETE CASCADE | Manual ordered deletion in erasure service | CASCADE simplifies code but requires careful migration; manual deletion is safer if migration concerns exist |

## Architecture Patterns

### Recommended Project Structure

```
packages/api-gateway/src/
  routes/
    gdpr.ts              # New: /api/gdpr/erasure, /api/gdpr/export, /api/gdpr/consent
  services/
    gdpr-service.ts      # New: erasure logic, export assembly, consent recording

packages/cron-worker/src/
  index.ts               # Extended: add retention cleanup to scheduled handler

frontend/src/app/
  (public)/dpa/page.tsx              # New: DPA page
  (public)/privacy/page.tsx          # Updated: add sub-processors
  (dashboard)/settings/page.tsx      # Updated: add "Delete Account" and "Export Data" buttons

migrations/
  0004_gdpr_consent_cascade.sql      # New: consent_log table + ALTER FK CASCADE
```

### Pattern 1: Atomic Cascade Deletion via db.batch()

**What:** Execute all delete statements in a single `db.batch()` call for atomicity.
**When to use:** GDPR erasure (GDPR-01).
**Why:** D1 batch operations execute as a single transaction. If any statement fails, the entire batch rolls back. This prevents partial erasure.

```typescript
// Erasure service — delete in FK dependency order (children first)
async function eraseUserData(db: D1Database, userId: string, orgId: string): Promise<void> {
  // Batch 1: All child tables referencing user data
  await db.batch([
    db.prepare('DELETE FROM dashboard_widgets WHERE dashboard_id IN (SELECT id FROM dashboards WHERE user_id = ? AND org_id = ?)').bind(userId, orgId),
    db.prepare('DELETE FROM dashboards WHERE user_id = ? AND org_id = ?').bind(userId, orgId),
    db.prepare('DELETE FROM schedule_runs WHERE schedule_id IN (SELECT id FROM schedules WHERE created_by = ? AND org_id = ?)').bind(userId, orgId),
    db.prepare('DELETE FROM schedules WHERE created_by = ? AND org_id = ?').bind(userId, orgId),
    db.prepare('DELETE FROM reports WHERE user_id = ? AND org_id = ?').bind(userId, orgId),
    db.prepare('DELETE FROM queries WHERE user_id = ? AND org_id = ?').bind(userId, orgId),
    db.prepare('DELETE FROM api_keys WHERE user_id = ? AND org_id = ?').bind(userId, orgId),
    db.prepare('DELETE FROM invitations WHERE invited_by = ?').bind(userId),
    // Anonymize audit_log — do NOT delete (compliance evidence)
    db.prepare("UPDATE audit_log SET user_id = NULL, ip_address = NULL, user_agent = NULL, details = NULL WHERE user_id = ? AND org_id = ?").bind(userId, orgId),
    // Delete user last
    db.prepare('DELETE FROM users WHERE id = ? AND org_id = ?').bind(userId, orgId),
  ]);
}
```

**Critical note:** D1 batch has a limit of 100 statements per batch. The erasure requires ~10 statements, well within limits.

### Pattern 2: Data Export Assembly

**What:** Query all tables containing user PII, assemble into a JSON object, store in R2, email a download link.
**When to use:** GDPR data export (GDPR-02).

```typescript
async function exportUserData(db: D1Database, userId: string, orgId: string): Promise<object> {
  const [user, queries, reports, auditLog] = await Promise.all([
    db.prepare('SELECT id, email, name, role, language, created_at FROM users WHERE id = ? AND org_id = ?').bind(userId, orgId).first(),
    db.prepare('SELECT id, natural_language, generated_sql, status, created_at FROM queries WHERE user_id = ? AND org_id = ?').bind(userId, orgId).all(),
    db.prepare('SELECT id, name, description, natural_language, sql_query, created_at FROM reports WHERE user_id = ? AND org_id = ?').bind(userId, orgId).all(),
    db.prepare('SELECT id, action, resource_type, ip_address, created_at FROM audit_log WHERE user_id = ? AND org_id = ?').bind(userId, orgId).all(),
  ]);

  return {
    exportDate: new Date().toISOString(),
    user,
    queries: queries.results,
    reports: reports.results,
    auditLog: auditLog.results,
  };
}
```

### Pattern 3: Consent Logging on Signup

**What:** Record terms/privacy acceptance during signup with version, IP, and timestamp.
**When to use:** GDPR consent tracking (GDPR-03).

```typescript
// In signup route, after user creation:
await db.prepare(
  `INSERT INTO consent_log (id, user_id, org_id, consent_type, policy_version, ip_address, user_agent, accepted_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).bind(
  crypto.randomUUID(), userId, orgId,
  'terms_and_privacy', 'v1.0',
  c.req.header('CF-Connecting-IP'),
  c.req.header('User-Agent'),
  new Date().toISOString()
).run();
```

### Pattern 4: Cron-Based Retention Cleanup

**What:** Extend the cron-worker scheduled handler to delete stale queries and anonymize old audit logs.
**When to use:** GDPR data retention (GDPR-05).

```typescript
// In cron-worker scheduled handler, after processing due schedules:
const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 3600_000).toISOString();
const twentyFourMonthsAgo = new Date(Date.now() - 2 * 365 * 24 * 3600_000).toISOString();

await env.DB.batch([
  // Delete queries older than 12 months
  env.DB.prepare('DELETE FROM queries WHERE created_at < ? AND status IN (?, ?)').bind(twelveMonthsAgo, 'completed', 'failed'),
  // Anonymize audit logs older than 24 months
  env.DB.prepare("UPDATE audit_log SET user_id = NULL, ip_address = NULL, user_agent = NULL, details = NULL WHERE created_at < ?").bind(twentyFourMonthsAgo),
]);
```

### Anti-Patterns to Avoid

- **Deleting audit_log entries during erasure:** Audit logs serve as compliance evidence. Anonymize them (null out PII) but keep the action records. Deleting audit trails destroys the evidence that you performed the erasure.
- **Running erasure statements individually (not batched):** Individual `db.prepare().run()` calls are NOT atomic. If the Worker times out mid-deletion, you have partial erasure -- a compliance nightmare. Always use `db.batch()`.
- **Storing data export files indefinitely in R2:** Export files contain PII. Set a lifecycle rule or TTL. Delete exports from R2 after 7 days. The download link should have a corresponding expiry.
- **Skipping KV session cleanup during erasure:** A deleted user whose KV sessions remain could theoretically still have valid JWTs. Delete all `session:*` entries for the user's JTIs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FK dependency ordering | Custom graph traversal of schema | Hardcoded deletion order based on known schema | Schema is stable; graph traversal is over-engineering for 14 tables |
| R2 file download auth | Custom signed URL implementation | R2 presigned URLs via Worker proxy route with auth check | Workers can proxy R2 reads behind JWT auth |
| Consent banner/cookie consent | Custom cookie consent UI | Third-party (Cookiebot/OneTrust) per REQUIREMENTS Out-of-Scope | Explicitly out of scope in requirements |
| Email delivery | Custom SMTP integration | Existing email-worker + EMAIL_QUEUE | Already implemented and deployed |

## Common Pitfalls

### Pitfall 1: Foreign Key Constraint Violations During Erasure

**What goes wrong:** D1 enforces `PRAGMA foreign_keys = ON`. Deleting a user before deleting their queries/reports/dashboards fails with a constraint violation.
**Why it happens:** The schema has `REFERENCES` constraints but NO `ON DELETE CASCADE`. All FKs default to `ON DELETE NO ACTION` (the SQLite default).
**How to avoid:** Either (a) add a migration with `ON DELETE CASCADE` for user-scoped FKs, or (b) delete in exact reverse-dependency order in the batch. Option (b) is safer because it does not require an ALTER TABLE migration that must be carefully tested.
**Warning signs:** "FOREIGN KEY constraint failed" errors during deletion.

**Complete FK dependency tree (from schema analysis):**
```
organizations
  +-- users (org_id -> organizations.id)
  |     +-- queries (user_id -> users.id)
  |     |     +-- reports (query_id -> queries.id)  [also has user_id -> users.id]
  |     |           +-- dashboard_widgets (report_id -> reports.id)
  |     |           +-- schedules (report_id -> reports.id)  [also has created_by -> users.id]
  |     |                 +-- schedule_runs (schedule_id -> schedules.id)
  |     +-- dashboards (user_id -> users.id)
  |     |     +-- dashboard_widgets (dashboard_id -> dashboards.id)
  |     +-- api_keys (user_id -> users.id)
  |     +-- invitations (invited_by -> users.id)
  +-- schema_tables (org_id -> organizations.id)
  |     +-- schema_columns (table_id -> schema_tables.id)
  +-- few_shot_examples (org_id nullable, no FK constraint)
  +-- audit_log (org_id NOT NULL, but no FK constraint -- plain TEXT)
```

**Required deletion order (children first):**
1. dashboard_widgets (refs dashboards.id AND reports.id)
2. schedule_runs (refs schedules.id)
3. schedules (refs reports.id AND users.id)
4. dashboards (refs users.id)
5. reports (refs queries.id AND users.id)
6. queries (refs users.id)
7. api_keys (refs users.id)
8. invitations (refs users.id via invited_by)
9. audit_log (anonymize, not delete)
10. users (refs organizations.id)

**Important observations from schema:**
- `audit_log.org_id` is NOT a FK (plain TEXT NOT NULL, no REFERENCES clause) -- so no constraint violation risk
- `audit_log.user_id` is also plain TEXT (nullable, no REFERENCES) -- can be nulled without FK issues
- `few_shot_examples.org_id` is nullable and has no FK constraint
- `schema_columns` has FK to `schema_tables(id)`, not directly to users
- `schedule_runs` has no `org_id` FK constraint -- only `schedule_id -> schedules(id)`

### Pitfall 2: KV Session Cleanup is Non-Trivial

**What goes wrong:** After deleting a user from D1, their KV sessions (`session:{jti}`) remain active. The JWT is still valid until expiry. KV has no prefix-scan API for listing all sessions of a specific user.
**Why it happens:** Sessions are keyed by JTI (random UUID), not by user ID. There is no reverse index from user_id to JTIs.
**How to avoid:** Two options:
1. **Recommended:** On erasure, the user's JWT is no longer valid because the auth middleware does a D1 lookup (`SELECT * FROM users WHERE id = ?`). If the user does not exist, the middleware rejects the request. So KV cleanup is nice-to-have for hygiene but not a security gap.
2. **Belt-and-suspenders:** Track active JTIs per user in D1 (a small `user_sessions` table) so they can be explicitly deleted from KV during erasure.
**Warning signs:** None from a security perspective (auth middleware protects), but orphaned KV keys waste storage.

### Pitfall 3: R2 File Cleanup Requires Listing by Prefix

**What goes wrong:** R2 report files need to be deleted during erasure but there is no direct "delete by prefix" API.
**Why it happens:** R2 stores objects with keys like `reports/{orgId}/{filename}`. Deletion requires listing objects by prefix, then deleting each.
**How to avoid:** Use `REPORTS_BUCKET.list({ prefix: 'reports/{orgId}/' })` to enumerate objects, then `REPORTS_BUCKET.delete(key)` for each. The api-gateway does NOT currently have an R2 binding -- it needs one added to its wrangler.toml, OR the erasure endpoint can skip R2 cleanup and rely on R2 lifecycle rules.
**Warning signs:** api-gateway wrangler.toml has no `[[r2_buckets]]` binding.

### Pitfall 4: User vs Org Erasure Scope

**What goes wrong:** Confusing "delete my account" (single user) with "delete the entire organization" (all users and data). For a single-user org (owner), these are the same. For multi-user orgs, the owner requesting erasure should only delete THEIR data, not the entire org's data.
**Why it happens:** Requirements say "cascade-deletes all user PII across all tables." This is per-user, not per-org.
**How to avoid:** Scope all erasure queries by BOTH `user_id` and `org_id`. If the requesting user is the sole owner, consider: (a) require them to transfer ownership first, or (b) delete the entire org if they are the only member.

### Pitfall 5: Data Export Size Limits in Workers

**What goes wrong:** A user with thousands of queries generates a multi-MB JSON export. Workers have 128MB memory limit. If the export is assembled entirely in memory and then written to R2, large exports could OOM.
**Why it happens:** `db.all()` loads all rows into memory at once.
**How to avoid:** Paginate queries (e.g., 1000 rows at a time). For v1 this is unlikely to be an issue (typical user has <1000 queries), but add a row limit per table (e.g., 10,000) as a safety valve.

## Code Examples

### GDPR Route Registration

```typescript
// packages/api-gateway/src/routes/gdpr.ts
import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';

const gdpr = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// POST /api/gdpr/export - Request data export
gdpr.post('/export', async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');
  // ... assemble export, store in R2, enqueue email
});

// DELETE /api/gdpr/erasure - Request account deletion
gdpr.delete('/erasure', async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');
  // ... verify password, cascade delete, cleanup KV/R2
});

// GET /api/gdpr/consent - Get consent history
gdpr.get('/consent', async (c) => {
  const userId = c.get('userId');
  // ... return consent_log entries
});

export default gdpr;
```

Register in `packages/api-gateway/src/index.ts`:
```typescript
import gdpr from './routes/gdpr';
// ... after authMiddleware
app.route('/api/gdpr', gdpr);
```

### consent_log Table Schema

```sql
-- Migration 0004
CREATE TABLE consent_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  consent_type TEXT NOT NULL,       -- 'terms_and_privacy', 'dpa', etc.
  policy_version TEXT NOT NULL,     -- 'v1.0', 'v1.1', etc.
  ip_address TEXT,
  user_agent TEXT,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_consent_log_user_id ON consent_log(user_id);
CREATE INDEX idx_consent_log_org_id ON consent_log(org_id);
```

Note: `consent_log.user_id` should NOT have a FK to `users(id)` so consent records survive user deletion (compliance evidence).

### R2 Data Export Storage and Download

```typescript
// Store export in R2
const exportKey = `exports/${orgId}/${userId}/${crypto.randomUUID()}.json`;
const exportData = JSON.stringify(assembledData, null, 2);
await env.REPORTS_BUCKET.put(exportKey, exportData, {
  httpMetadata: { contentType: 'application/json' },
  customMetadata: { expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() },
});

// Email download link (route-based, not presigned)
const downloadUrl = `https://api.apura.xyz/api/gdpr/export/download?key=${encodeURIComponent(exportKey)}`;
await env.EMAIL_QUEUE.send({
  type: 'data_export',
  to: [userEmail],
  downloadUrl,
  userName: userName,
});
```

### DPA Page (Static)

```tsx
// frontend/src/app/(public)/dpa/page.tsx
export default function DpaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-xl font-bold text-foreground mb-6">
        Acordo de Processamento de Dados (DPA)
      </h1>
      <div className="prose prose-invert prose-sm text-muted space-y-4 text-[13px] leading-relaxed">
        {/* DPA content following existing privacy/terms page pattern */}
      </div>
    </main>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual FK cascade in app code | `ON DELETE CASCADE` in schema + db.batch() | N/A (design choice) | CASCADE simplifies but ALTER TABLE in SQLite requires table recreation; manual batch is safer |
| Separate GDPR microservice | Inline in api-gateway | Project convention | api-gateway has all bindings; separate worker adds unnecessary complexity |
| GDPR as optional "nice-to-have" | Mandatory for EU SaaS (EDPB coordinated enforcement 2025-2026) | 2024-2025 | Portugal is primary market; non-compliance risks significant fines |

## Open Questions

1. **R2 Binding for api-gateway**
   - What we know: api-gateway wrangler.toml has NO R2 binding. report-worker and email-worker have `REPORTS_BUCKET`.
   - What's unclear: Should we add R2 to api-gateway for erasure/export, or delegate R2 cleanup to cron-worker?
   - Recommendation: Add `REPORTS_BUCKET` R2 binding to api-gateway wrangler.toml. The erasure endpoint needs to list and delete R2 objects directly. Export endpoint needs to store JSON in R2.

2. **Export Download Auth**
   - What we know: Presigned R2 URLs require Workers to generate signed URLs. Alternatively, an authenticated API route can proxy the R2 read.
   - What's unclear: Whether to use a signed URL or an authenticated proxy route.
   - Recommendation: Use an authenticated proxy route (`GET /api/gdpr/export/download?key=...`). The user must be authenticated, and the route verifies the key belongs to their user before streaming from R2. Simpler and more secure than managing signed URLs.

3. **Org Owner Deletion**
   - What we know: When the sole owner deletes their account, the org becomes orphaned.
   - What's unclear: Business rule -- should we delete the entire org, or require ownership transfer first?
   - Recommendation: If the user is the only member of the org, delete the entire org and all its data. If there are other members, require ownership transfer first before allowing erasure.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (via packages/api-gateway/vitest.config.ts) |
| Config file | `packages/api-gateway/vitest.config.ts` |
| Quick run command | `cd packages/api-gateway && npx vitest run --reporter=verbose` |
| Full suite command | `npm run test` (turbo test across all packages) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GDPR-01 | Erasure cascade-deletes all user PII across tables, KV, R2 | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/gdpr.test.ts -t "erasure" -x` | No - Wave 0 |
| GDPR-02 | Export assembles JSON of all user PII, stores in R2, emails link | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/gdpr.test.ts -t "export" -x` | No - Wave 0 |
| GDPR-03 | Consent logged on signup with version, IP, timestamp | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/gdpr.test.ts -t "consent" -x` | No - Wave 0 |
| GDPR-04 | DPA page renders | smoke | Manual browser check | N/A - static page |
| GDPR-05 | Retention cleanup deletes old queries, anonymizes old audit logs | unit | `cd packages/cron-worker && npx vitest run -x` | No - Wave 0 |
| GDPR-06 | Privacy policy lists sub-processors | smoke | Manual browser check | N/A - static page update |

### Sampling Rate

- **Per task commit:** `cd packages/api-gateway && npx vitest run --reporter=verbose`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/api-gateway/src/routes/__tests__/gdpr.test.ts` -- covers GDPR-01, GDPR-02, GDPR-03
- [ ] `packages/cron-worker/vitest.config.ts` -- Vitest config for cron-worker (does not exist yet)
- [ ] `packages/cron-worker/src/__tests__/retention.test.ts` -- covers GDPR-05

## Sources

### Primary (HIGH confidence)

- D1 schema: `migrations/0001_initial_schema.sql` -- all FK constraints verified, NO `ON DELETE CASCADE` anywhere
- D1 billing migration: `migrations/0003_billing_columns.sql` -- adds `subscription_status`, `current_period_end`
- API gateway types: `packages/api-gateway/src/types.ts` -- confirms Env bindings (D1, KV, EMAIL_QUEUE, no R2)
- API gateway wrangler: `packages/api-gateway/wrangler.toml` -- confirms no R2 binding
- Report-worker wrangler: `packages/report-worker/wrangler.toml` -- confirms R2 binding `REPORTS_BUCKET`
- Email-worker wrangler: `packages/email-worker/wrangler.toml` -- confirms R2 binding and queue consumer
- Cron-worker source: `packages/cron-worker/src/index.ts` -- fully analyzed; handles scheduled reports only, no retention logic yet
- OrgDatabase service: `packages/api-gateway/src/services/org-db.ts` -- existing pattern for all DB operations
- Privacy page: `frontend/src/app/(public)/privacy/page.tsx` -- current content does not list sub-processors

### Secondary (MEDIUM confidence)

- Cloudflare D1 docs: foreign keys enforced via PRAGMA, batch operations are atomic
- GDPR Article 17 (Right to Erasure): 30-day response deadline
- EDPB coordinated enforcement action on right to erasure (2025-2026)

### Tertiary (LOW confidence)

- D1 batch size limit: documented as 100 statements per batch (verify against current D1 docs before implementation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed; all existing bindings verified
- Architecture: HIGH - schema fully analyzed, FK tree mapped, deletion order determined
- Pitfalls: HIGH - FK constraint behavior verified directly from migration SQL; KV session pattern verified from auth.ts source
- Validation: MEDIUM - Vitest exists for api-gateway but cron-worker lacks test config

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain; schema changes would invalidate FK analysis)
