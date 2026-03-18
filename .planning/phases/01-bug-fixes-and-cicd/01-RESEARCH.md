# Phase 1: Bug Fixes and CI/CD - Research

**Researched:** 2026-03-18
**Domain:** Security bug fixes, GitHub Actions CI/CD, Cloudflare Workers deployment
**Confidence:** HIGH

## Summary

Phase 1 addresses 5 known bugs (all in `packages/api-gateway/src/`) and establishes a CI/CD pipeline. The bugs are straightforward fixes in existing TypeScript code -- no new libraries needed. The CI/CD work builds on existing GitHub Actions workflows that already exist but are incomplete: `ci.yml` runs tests but lacks lint/typecheck, and `deploy.yml` deploys workers but lacks D1 migrations and frontend preview deployments.

The existing codebase already has partial CI/CD (`ci.yml` and `deploy.yml` in `.github/workflows/`), Vitest configured in ai-orchestrator, and Turbo-based monorepo scripts for build/lint/typecheck/test. The bug fixes are all isolated to two files in api-gateway (`quota.ts`, `queries.ts`, `auth.ts`), making them low-risk changes with clear fix patterns documented in CONCERNS.md.

**Primary recommendation:** Fix all 5 bugs first (small, isolated changes), then enhance the existing CI/CD workflows to add missing lint/typecheck steps, D1 migration automation, and Cloudflare Pages preview deployments for PRs.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUG-01 | Quota middleware fails closed on DB error | Change catch block in `quota.ts:68-71` from `next()` to return 503. Code reviewed, fix is 3 lines. |
| BUG-02 | AI orchestrator error messages sanitized before returning to users | Line 76 in `queries.ts` stores raw error in DB but already returns generic message to user on line 77. The DB-stored `error_message` at line 76 leaks raw `errorBody` -- sanitize before storing. |
| BUG-03 | KV session race condition fixed -- new session stored before old deleted | In `auth.ts:268-308`, line 269 deletes old session before lines 305-307 store new ones. Reorder: store new first, then delete old. |
| BUG-04 | Internal secret header validated with constant-time comparison | In `queries.ts:104`, header is sent but ws-gateway must validate value. Use `crypto.subtle.timingSafeEqual()` available in Workers runtime. |
| BUG-05 | JSON parse errors in reset token handled gracefully | In `auth.ts:418`, wrap `JSON.parse(resetData)` in try-catch, return 401 on failure. |
| CICD-01 | GitHub Actions pipeline runs lint, typecheck, and tests on every push/PR | Existing `ci.yml` runs tests and typecheck for shared only. Add `npm run lint`, `npm run typecheck` via Turbo. |
| CICD-02 | Automated deployment to Cloudflare Workers on merge to main | Existing `deploy.yml` already deploys 3 workers on push to main. Needs D1 migration step added. |
| CICD-03 | Frontend preview deployments on PRs via Cloudflare Pages | Not in current workflows. Add Cloudflare Pages preview deploy step triggered on PR events. |
| CICD-04 | D1 migrations run automatically during deployment | `deploy/migrate.sh` exists. Add as pre-deployment step in `deploy.yml`. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.6.0 | Worker HTTP framework | Already used in all 3 workers |
| vitest | ^3.2.4 | Test runner | Already configured in ai-orchestrator |
| wrangler | ^3.114.17 | CF Workers CLI | Already used for dev/deploy |
| turbo | ^2.4.0 | Monorepo task runner | Already configured |

### Supporting (For CI/CD)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| actions/checkout | v4 | Git checkout in GHA | Already in workflows |
| actions/setup-node | v4 | Node.js setup in GHA | Already in workflows |
| cloudflare/wrangler-action | v3 | Official CF deploy action | Alternative to `npx wrangler deploy`, but current `npx` approach works fine |

### No New Dependencies Needed

The bug fixes require zero new packages. All fixes use existing APIs:
- `crypto.subtle.timingSafeEqual()` -- built into Workers runtime (via `nodejs_compat` flag already set)
- `JSON.parse` try-catch -- native JS
- KV `put`/`delete` reordering -- existing API

## Architecture Patterns

### Bug Fix File Map

```
packages/api-gateway/src/
  middleware/
    quota.ts           # BUG-01: lines 68-71, change catch to return 503
  routes/
    queries.ts         # BUG-02: line 76, sanitize error before DB storage
                       # BUG-04: line 104, validate secret header value
    auth.ts            # BUG-03: lines 268-269 vs 305-307, reorder KV ops
                       # BUG-05: line 418, wrap JSON.parse in try-catch
```

### CI/CD File Map

```
.github/workflows/
  ci.yml              # EXISTS: Enhance with lint, full typecheck
  deploy.yml          # EXISTS: Add D1 migration step, frontend preview
```

### Pattern 1: Fail-Closed Error Handling (BUG-01)

**What:** When a security-critical check (quota, auth) encounters an error, deny the request rather than allowing it through.
**When to use:** Any middleware that gates access based on business rules.
**Example:**
```typescript
// BEFORE (fails open -- BAD)
catch (err) {
  console.error('Quota check error:', err);
  return next(); // allows request through!
}

// AFTER (fails closed -- GOOD)
catch (err) {
  console.error('Quota check error:', err);
  return c.json({
    success: false,
    error: { code: 'SERVICE_UNAVAILABLE', message: 'Unable to verify quota. Please try again.' }
  }, 503);
}
```

### Pattern 2: Constant-Time Secret Comparison (BUG-04)

**What:** Compare secret values using timing-safe comparison to prevent timing attacks.
**When to use:** Any authentication check comparing secrets, tokens, or API keys.
**Example:**
```typescript
// Workers runtime provides crypto.subtle.timingSafeEqual via nodejs_compat
function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

// Usage in ws-gateway or wherever the header is validated
const headerValue = req.headers.get('X-Internal-Secret') ?? '';
const expected = env.INTERNAL_SECRET ?? '';
if (!headerValue || !timingSafeCompare(headerValue, expected)) {
  return new Response('Unauthorized', { status: 401 });
}
```

**Note:** `crypto.subtle.timingSafeEqual()` is available in Cloudflare Workers with `nodejs_compat` compatibility flag, which is already enabled in `wrangler.toml` (`compatibility_flags = ["nodejs_compat"]`).

### Pattern 3: KV Operation Ordering for Atomicity (BUG-03)

**What:** When rotating credentials/sessions in KV, store new value before deleting old to prevent data loss on partial failure.
**When to use:** Any token rotation, session refresh, key rotation.
**Example:**
```typescript
// BEFORE (race condition -- BAD)
await c.env.CACHE.delete(sessionKey);  // Delete old first
// ... if failure here, user loses session
await Promise.all([
  c.env.CACHE.put(`session:${jti}`, ...),
  c.env.CACHE.put(`session:${refreshJti}`, ...),
]);

// AFTER (safe ordering -- GOOD)
await Promise.all([
  c.env.CACHE.put(`session:${jti}`, ...),
  c.env.CACHE.put(`session:${refreshJti}`, ...),
]);
await c.env.CACHE.delete(sessionKey);  // Delete old AFTER new is stored
```

### Pattern 4: GitHub Actions Workflow Structure

**What:** CI runs lint+typecheck+test on every push/PR; deploy runs on main push only after CI passes.
**Example structure for enhanced ci.yml:**
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
```

### Anti-Patterns to Avoid

- **Failing open on security checks:** Never call `next()` in a catch block of auth/quota middleware. Always deny.
- **String equality for secrets:** Never use `===` for secret comparison. Always use timing-safe comparison.
- **Delete-then-create for sessions:** Always create new session before deleting old one.
- **Installing per-workspace in CI:** Use `npm ci` at root level for monorepo -- workspaces are resolved automatically via npm workspaces.
- **Skipping `npm ci` in CI:** Use `npm ci` (not `npm install`) in CI for deterministic installs from lockfile.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timing-safe comparison | Custom byte-by-byte loop | `crypto.subtle.timingSafeEqual()` | Built into Workers runtime, audited implementation |
| CI/CD pipeline | Shell script runner | GitHub Actions | Industry standard, free for public repos, integrated with GitHub |
| D1 migrations in CI | Custom migration logic | Existing `deploy/migrate.sh` | Already written and tested, uses wrangler CLI |
| Frontend preview deploys | Custom preview hosting | `wrangler pages deploy` with `--branch` | Native CF Pages feature, automatic preview URLs |

## Common Pitfalls

### Pitfall 1: BUG-02 Confusion -- Error Already Sanitized for Users
**What goes wrong:** Developer sees line 76 stores raw error and thinks the user-facing response leaks it. Actually, line 77 returns a generic message. The real issue is the raw error stored in DB at line 76 (which could leak if query details are ever exposed via API).
**Why it happens:** The error body from AI orchestrator is concatenated into `error_message` field stored in D1.
**How to avoid:** Sanitize the error_message stored in DB: `error_message: 'AI generation failed'` (no raw body). Log the raw error via console.error for debugging.
**Warning signs:** Check if any API endpoint returns the `error_message` field from queries table to users.

### Pitfall 2: BUG-04 Location Ambiguity
**What goes wrong:** `queries.ts:104` sends the `X-Internal-Secret` header, but the *validation* must happen in `ws-gateway` where the request is received.
**Why it happens:** The bug description says "presence-only check" -- need to find where ws-gateway reads this header.
**How to avoid:** Search ws-gateway code for `X-Internal-Secret` to find where validation occurs. Fix the validation there, not in queries.ts.
**Warning signs:** If you only fix queries.ts, the vulnerability remains in ws-gateway.

### Pitfall 3: CI Workflow Installing Dependencies Per-Workspace
**What goes wrong:** Current `ci.yml` and `deploy.yml` install dependencies workspace by workspace (`npm install` in each directory). This is slow and may miss cross-workspace dependencies.
**Why it happens:** Original setup was manual.
**How to avoid:** Use `npm ci` at the repo root. npm workspaces automatically resolves all workspace dependencies from the root lockfile.
**Warning signs:** CI taking >3 minutes for install steps.

### Pitfall 4: Deploy Order for Service Bindings
**What goes wrong:** If workers are deployed in wrong order and a service binding target doesn't exist yet, deploy fails.
**Why it happens:** Workers reference each other via service bindings (api-gateway -> ai-orchestrator, api-gateway -> ws-gateway).
**How to avoid:** Deploy in dependency order: shared first (if built), then ai-orchestrator and ws-gateway, then api-gateway last. Current deploy.yml uses `max-parallel: 1` with correct order (ai -> ws -> api).
**Warning signs:** "Service not found" errors during deployment.

### Pitfall 5: D1 Migrations with Wrangler in CI
**What goes wrong:** `wrangler d1 execute` requires `CLOUDFLARE_API_TOKEN` and correct database name for the environment.
**Why it happens:** Migration script uses `apura-${ENV}` database name convention.
**How to avoid:** Pass correct environment to `deploy/migrate.sh` and ensure CF API token has D1 write permissions.
**Warning signs:** "Database not found" or permission errors in CI.

### Pitfall 6: Cloudflare Pages Preview Deploys Need Project Setup
**What goes wrong:** `wrangler pages deploy` fails if the Pages project hasn't been created in Cloudflare dashboard first.
**Why it happens:** Unlike Workers, Pages projects must exist before first deploy.
**How to avoid:** Ensure `apura-web` Pages project exists in Cloudflare dashboard. The deploy.yml already references it.
**Warning signs:** "Project not found" error on first CI deploy.

## Code Examples

### BUG-01 Fix: Quota Middleware Fail-Closed

```typescript
// packages/api-gateway/src/middleware/quota.ts, lines 68-72
// Source: Direct code review
catch (err) {
  console.error('Quota check error:', err);
  return c.json({
    success: false,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Unable to verify quota. Please try again later.',
    },
  }, 503);
}
```

### BUG-02 Fix: Sanitize Error Before DB Storage

```typescript
// packages/api-gateway/src/routes/queries.ts, line 76
// Source: Direct code review

// BEFORE:
await orgDb.updateQuery(queryId, { status: 'error', error_message: `AI generation failed: ${errorBody}` });

// AFTER:
console.error('AI generation error for query', queryId, ':', errorBody);
await orgDb.updateQuery(queryId, { status: 'error', error_message: 'AI generation failed' });
```

### BUG-03 Fix: Session Race Condition

```typescript
// packages/api-gateway/src/routes/auth.ts, lines 268-308
// Source: Direct code review

// Move line 269 (delete) AFTER lines 305-307 (put)
// BEFORE: delete at 269, then put at 305-307
// AFTER:
// 1. Issue new tokens (lines 281-303)
// 2. Store new sessions in KV
await Promise.all([
  c.env.CACHE.put(`session:${jti}`, JSON.stringify({ userId: user.id, orgId: user.org_id }), { expirationTtl: ACCESS_TOKEN_TTL }),
  c.env.CACHE.put(`session:${refreshJti}`, JSON.stringify({ userId: user.id, orgId: user.org_id, type: 'refresh' }), { expirationTtl: REFRESH_TOKEN_TTL }),
]);
// 3. THEN delete old session
await c.env.CACHE.delete(sessionKey);
```

### BUG-05 Fix: JSON Parse Error Handling

```typescript
// packages/api-gateway/src/routes/auth.ts, line 418
// Source: Direct code review

let parsed: { userId: string; orgId: string };
try {
  parsed = JSON.parse(resetData);
} catch {
  return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired reset token' } }, 401);
}
const { userId, orgId } = parsed;
```

### CICD-04: D1 Migration Step in deploy.yml

```yaml
# Add before deploy-workers job
migrate:
  name: Run D1 Migrations
  needs: test
  runs-on: ubuntu-latest
  if: github.event_name == 'push'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
    - run: npm ci
    - name: Run migrations
      run: bash deploy/migrate.sh production
      env:
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### CICD-03: Frontend Preview Deploy

```yaml
# In ci.yml or as separate preview.yml
preview:
  name: Preview Deploy
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
    - run: npm ci
    - name: Build frontend
      working-directory: frontend
      run: npm run build
    - name: Deploy preview
      working-directory: frontend
      run: npx wrangler pages deploy out --project-name apura-web --branch "${{ github.head_ref }}" --commit-dirty=true
      env:
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-workspace `npm install` in CI | `npm ci` at root for workspaces | npm 7+ (2021) | Faster, deterministic CI installs |
| Manual `wrangler deploy` | GitHub Actions with `wrangler deploy` | Existing in deploy.yml | Already adopted |
| `npx tsx --test` for Vitest tests | `vitest run` (standard CLI) | Vitest 1.0+ | Current ci.yml uses tsx instead of vitest; should switch |

**Current ci.yml issue:** The SQL validator tests are run via `npx tsx --test` instead of `vitest run`. This works but bypasses Vitest's reporter and configuration. The ai-orchestrator `package.json` already has `"test": "vitest run"` -- CI should use `npm run test` or `npx vitest run`.

## Open Questions

1. **Where does ws-gateway validate X-Internal-Secret?**
   - What we know: `queries.ts:104` sends the header. ws-gateway receives it.
   - What's unclear: Exact file/line in ws-gateway where validation occurs. Need to grep for `X-Internal-Secret` in ws-gateway source.
   - Recommendation: During implementation, search ws-gateway code for the header check and fix there.

2. **Does the D1 database name in production match `apura-main` or `apura-production`?**
   - What we know: `wrangler.toml` references `apura-main` as the database name. Migration script uses `apura-${ENV}` pattern.
   - What's unclear: Whether production uses `apura-main` or `apura-production`.
   - Recommendation: Check Cloudflare dashboard or use `apura-main` directly in the migration CI step (matching wrangler.toml).

3. **Are Cloudflare secrets (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) already configured in GitHub?**
   - What we know: `deploy.yml` references them as `secrets.*`.
   - What's unclear: Whether they're actually set in the repository settings.
   - Recommendation: Verify during implementation. If not set, add them before CI/CD changes will work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `packages/ai-orchestrator/vitest.config.ts` or inline (needs verification) |
| Quick run command | `cd packages/ai-orchestrator && npx vitest run` |
| Full suite command | `npm run test` (at root, via Turbo) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-01 | Quota middleware returns 503 on DB error | unit | `cd packages/api-gateway && npx vitest run src/middleware/__tests__/quota.test.ts` | No - Wave 0 |
| BUG-02 | Error message sanitized before DB storage | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/queries.test.ts` | No - Wave 0 |
| BUG-03 | New session stored before old deleted | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/auth.test.ts` | No - Wave 0 |
| BUG-04 | Secret header value compared timing-safe | unit | Verify in ws-gateway tests | No - Wave 0 |
| BUG-05 | Malformed JSON returns 401 not 500 | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/auth.test.ts` | No - Wave 0 |
| CICD-01 | CI runs lint+typecheck+test on push/PR | manual-only | Trigger CI by pushing to branch | N/A |
| CICD-02 | Auto-deploy workers on main merge | manual-only | Merge PR and verify deployment | N/A |
| CICD-03 | PR generates frontend preview URL | manual-only | Open PR and check for preview comment | N/A |
| CICD-04 | D1 migrations run during deploy | manual-only | Verify migration step in deploy logs | N/A |

### Sampling Rate
- **Per task commit:** `npm run test` (Turbo will run all workspace test scripts)
- **Per wave merge:** `npm run test && npm run typecheck && npm run lint`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add Vitest as devDependency to `packages/api-gateway/package.json`
- [ ] Add `"test": "vitest run"` script to `packages/api-gateway/package.json`
- [ ] Create `packages/api-gateway/vitest.config.ts` with Workers-compatible settings
- [ ] Create test files for bug fix verification (quota.test.ts, auth.test.ts, queries.test.ts)
- [ ] Verify Vitest config exists in ai-orchestrator (may be inline in package.json)

**Note:** api-gateway currently has NO test infrastructure. Vitest must be added as a devDependency and configured before any tests can run. The bug fixes themselves are small (3-10 lines each), but testing requires Hono + D1 mocking setup.

## Sources

### Primary (HIGH confidence)
- Direct code review of `packages/api-gateway/src/middleware/quota.ts` -- verified bug location and fix pattern
- Direct code review of `packages/api-gateway/src/routes/queries.ts` -- verified BUG-02 and BUG-04 locations
- Direct code review of `packages/api-gateway/src/routes/auth.ts` -- verified BUG-03 race condition and BUG-05 missing try-catch
- Direct code review of `.github/workflows/ci.yml` and `deploy.yml` -- verified existing CI/CD state
- Direct code review of `deploy/migrate.sh` -- verified migration script exists and is functional
- `wrangler.toml` -- verified `nodejs_compat` flag enables `crypto.subtle.timingSafeEqual()`

### Secondary (MEDIUM confidence)
- `.planning/codebase/CONCERNS.md` -- bug descriptions and fix approaches (authored during codebase analysis)
- Cloudflare Workers documentation -- `crypto.subtle.timingSafeEqual()` availability with `nodejs_compat`

### Tertiary (LOW confidence)
- D1 database naming convention (`apura-main` vs `apura-production`) -- needs verification against CF dashboard

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, all fixes use existing APIs
- Architecture: HIGH -- all bug locations verified via direct code review
- Pitfalls: HIGH -- pitfalls identified from actual code review, not speculation
- CI/CD: MEDIUM -- existing workflows reviewed, but GH secrets and CF Pages project status unknown

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain, no fast-moving dependencies)
