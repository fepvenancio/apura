# Phase 2: Email Activation - Research

**Researched:** 2026-03-18
**Domain:** Transactional email via Cloudflare Queues + Resend API
**Confidence:** HIGH

## Summary

Phase 2 activates the email-worker to deliver transactional emails for password reset, email verification, and team invitations. The good news: the email-worker is already fully implemented as a queue consumer with all four email types (password_reset, email_verification, team_invitation, scheduled_report), HTML templates, Resend API integration, R2 attachment support, and proper error handling with retry semantics. The wrangler.toml is configured with the `email-outbound` queue consumer binding and R2 bucket.

The work is primarily on the **producer side**: the api-gateway needs an `EMAIL_QUEUE` producer binding added to its `wrangler.toml`, and three endpoints need queue.send() calls added (forgot-password, signup, invite). Additionally, the signup flow does not currently generate or store an email verification token in KV -- that needs to be added. The frontend is missing a `/reset-password/[token]` page and a `/verify-email/[token]` page. The Cloudflare Queue `email-outbound` itself must be created via `wrangler queues create`.

**Primary recommendation:** Add the EMAIL_QUEUE producer binding to api-gateway, wire three existing endpoints to enqueue messages, create the Cloudflare Queue, build two missing frontend pages, and deploy the email-worker. No new libraries needed -- the worker already uses raw fetch() to call Resend API.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAIL-01 | Password reset email sent with valid reset link when user requests password reset | auth.ts forgot-password route already generates token + stores in KV. Needs: queue.send() call + frontend reset-password page |
| MAIL-02 | Email verification sent on signup with verification link | auth.ts signup route exists but does NOT generate verification token. Needs: token generation + KV storage + queue.send() + frontend verify-email page |
| MAIL-03 | Team invitation email sent when org admin invites a user | org.ts invite route already creates invitation + token. Needs: queue.send() call. Frontend accept-invite page already exists |
| MAIL-04 | Email worker connected to api-gateway via Cloudflare Queue binding | api-gateway wrangler.toml needs EMAIL_QUEUE producer binding. email-worker wrangler.toml already has consumer binding. Queue must be created. |
| MAIL-05 | Email templates render correctly with Resend + HTML templates | All 4 templates already implemented in email-worker/src/index.ts with inline CSS + escapeHtml |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Resend API | N/A (raw fetch) | Transactional email delivery | email-worker already uses raw fetch() to `https://api.resend.com/emails`. No SDK needed. |
| Cloudflare Queues | N/A (platform) | Async message passing between api-gateway and email-worker | Already configured in email-worker wrangler.toml as consumer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| resend (npm) | 6.9.4 | Optional SDK wrapper | NOT needed -- email-worker already uses raw fetch(). Do not add. |
| @react-email/components | 1.0.8 | React-based email templates | NOT needed for v1 -- inline HTML templates already work. Consider for future template complexity. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw fetch to Resend | `resend` npm package | SDK adds ~15KB for a single POST call. Raw fetch is already implemented and works. |
| Inline HTML templates | React Email | Better DX for complex templates, but adds build step and dependencies. Current templates are simple enough. |

**Installation:**
```bash
# No new npm packages needed for this phase.
# The email-worker already has all dependencies.
# Only infrastructure setup required:
wrangler queues create email-outbound
```

## Architecture Patterns

### Existing Queue Topology
```
api-gateway --[email-outbound]--> email-worker
               (NEW producer)     (existing consumer)

report-worker --[email-outbound]--> email-worker
                (existing producer)  (existing consumer)
```

### What Already Exists (Do NOT Rebuild)
```
packages/email-worker/
  src/index.ts          # COMPLETE: queue consumer, 4 email types, templates, Resend API
  wrangler.toml         # COMPLETE: queue consumer binding, R2 bucket, FROM_EMAIL var
  package.json          # COMPLETE: dependencies declared

packages/api-gateway/
  src/routes/auth.ts    # PARTIAL: forgot-password generates token, signup does NOT generate verification token
  src/routes/org.ts     # PARTIAL: invite creates invitation row + token, no email sent
  src/types.ts          # Has Env interface but NO EMAIL_QUEUE binding
  wrangler.toml         # MISSING: EMAIL_QUEUE producer binding

frontend/src/app/(auth)/
  forgot-password/page.tsx    # EXISTS: form to enter email
  accept-invite/[token]/page.tsx  # EXISTS: form to accept invitation
  (MISSING: reset-password/[token]/page.tsx)
  (MISSING: verify-email/[token]/page.tsx)
```

### Pattern: Queue Message Enqueuing in api-gateway
**What:** Add queue.send() calls to existing route handlers after existing logic.
**When to use:** Every time an action should trigger an email.
**Example:**
```typescript
// In auth.ts forgot-password handler, after storing token in KV:
await c.env.EMAIL_QUEUE.send({
  type: 'password_reset',
  to: [body.email],
  resetUrl: `https://app.apura.xyz/reset-password/${resetToken}`,
  userName: user.name ?? body.email,
} satisfies PasswordResetMessage);
```

### Pattern: Verification Token Generation
**What:** Generate a random token, store in KV with TTL, enqueue email with link containing token.
**When to use:** Email verification on signup, password reset.
**Example:**
```typescript
// In auth.ts signup handler, after creating user:
const verifyToken = generateJti();
await c.env.CACHE.put(
  `email_verify:${verifyToken}`,
  JSON.stringify({ userId, orgId }),
  { expirationTtl: 24 * 3600 }, // 24 hours
);
await c.env.EMAIL_QUEUE.send({
  type: 'email_verification',
  to: [body.email],
  verifyUrl: `https://app.apura.xyz/verify-email/${verifyToken}`,
  userName: body.name,
});
```

### Anti-Patterns to Avoid
- **Do NOT install `resend` npm package:** The email-worker already uses raw fetch() to the Resend API. Adding the SDK would duplicate functionality.
- **Do NOT create new email templates:** All four template functions (passwordResetHtml, emailVerificationHtml, teamInvitationHtml, scheduledReportHtml) already exist in email-worker/src/index.ts.
- **Do NOT restructure the email-worker:** It is complete and well-designed. Changes should be on the producer side (api-gateway).
- **Do NOT send emails synchronously from api-gateway:** Always enqueue via EMAIL_QUEUE. The queue provides retry semantics and decouples the response from email delivery.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email delivery | Custom SMTP client | Resend API (already implemented) | Deliverability, spam filtering, bounce handling |
| Async messaging | HTTP callbacks between workers | Cloudflare Queues (already configured) | Built-in retry, dead-letter, batching |
| HTML email templates | React Email build pipeline | Inline HTML functions (already exist) | Templates are simple; no build step needed |
| Token generation | Custom crypto | `generateJti()` utility (already exists) | Uses crypto.randomUUID(), sufficient entropy |

## Common Pitfalls

### Pitfall 1: Missing EMAIL_QUEUE Type in Env Interface
**What goes wrong:** TypeScript compilation fails because `c.env.EMAIL_QUEUE` is not declared.
**Why it happens:** The Env interface in `packages/api-gateway/src/types.ts` does not include `EMAIL_QUEUE: Queue`.
**How to avoid:** Add `EMAIL_QUEUE: Queue` to the Env interface in types.ts before adding queue.send() calls.
**Warning signs:** TypeScript errors on `c.env.EMAIL_QUEUE`.

### Pitfall 2: Forgetting to Create the Cloudflare Queue
**What goes wrong:** Deployment succeeds but queue messages are silently dropped or worker fails to bind.
**Why it happens:** The queue `email-outbound` must exist in the Cloudflare account before workers can bind to it.
**How to avoid:** Run `wrangler queues create email-outbound` before deploying either worker.
**Warning signs:** Wrangler deploy errors mentioning queue binding failure.

### Pitfall 3: Not Setting RESEND_API_KEY Secret
**What goes wrong:** Email-worker deploys but all emails fail with 401 from Resend API.
**Why it happens:** RESEND_API_KEY is a secret, not a var -- it must be set via `wrangler secret put`.
**How to avoid:** Set the secret: `wrangler secret put RESEND_API_KEY --name apura-email-worker`
**Warning signs:** Resend API error (401) in worker logs.

### Pitfall 4: Signup Handler Not Generating Verification Token
**What goes wrong:** Email verification emails cannot be sent because no token exists.
**Why it happens:** The current signup handler creates the user but does NOT generate or store a verification token in KV. The verify-email endpoint already handles token consumption but nothing produces the token.
**How to avoid:** Add verification token generation to the signup handler, store in KV with `email_verify:` prefix, and enqueue the email.
**Warning signs:** No token in KV after signup.

### Pitfall 5: Frontend Reset Password Page Missing
**What goes wrong:** User clicks reset link in email but gets 404.
**Why it happens:** The forgot-password page exists but no `/reset-password/[token]` page exists to handle the link.
**How to avoid:** Create `frontend/src/app/(auth)/reset-password/[token]/page.tsx` that reads the token from the URL and calls `POST /auth/reset-password`.
**Warning signs:** 404 in browser when clicking reset link.

### Pitfall 6: Invitation Email Needs User and Org Names
**What goes wrong:** Invitation email template expects `inviterName` and `orgName` but the invite endpoint does not query these.
**Why it happens:** The current invite handler has the userId and orgId but does not look up the user's name or org name for the email message.
**How to avoid:** Query user name and org name before enqueuing the email, or pass them from existing data in the handler.
**Warning signs:** Email shows "undefined" for inviter name or org name.

### Pitfall 7: FROM_EMAIL Format for Resend
**What goes wrong:** Emails rejected or marked as spam.
**Why it happens:** Resend requires a verified domain. The FROM_EMAIL is set to `Apura <reports@apura.xyz>` in wrangler.toml vars.
**How to avoid:** Ensure `apura.xyz` domain is verified in Resend dashboard with proper SPF/DKIM/DMARC records before deploying.
**Warning signs:** Resend API returns 403 or emails land in spam.

## Code Examples

### Wrangler Queue Producer Binding (add to api-gateway/wrangler.toml)
```toml
# Source: Cloudflare Queues documentation
[[queues.producers]]
binding = "EMAIL_QUEUE"
queue = "email-outbound"
```

### Env Interface Update (api-gateway/src/types.ts)
```typescript
export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  AI_ORCHESTRATOR: Fetcher;
  WS_GATEWAY: Fetcher;
  JWT_SECRET: string;
  INTERNAL_SECRET: string;
  REPORT_QUEUE: Queue;
  EMAIL_QUEUE: Queue;  // NEW: for transactional email
  STRIPE_WEBHOOK_SECRET?: string;
}
```

### Password Reset Email Enqueuing (auth.ts forgot-password)
```typescript
// After storing reset token in KV (line ~385):
const user_data = await c.env.DB
  .prepare('SELECT name FROM users WHERE id = ?')
  .bind(user.id)
  .first<{ name: string }>();

await c.env.EMAIL_QUEUE.send({
  type: 'password_reset',
  to: [body.email],
  resetUrl: `https://app.apura.xyz/reset-password/${resetToken}`,
  userName: user_data?.name ?? body.email,
});
```

### Email Verification on Signup (auth.ts signup)
```typescript
// After creating user (after DB batch), before returning response:
const verifyToken = generateJti();
await c.env.CACHE.put(
  `email_verify:${verifyToken}`,
  JSON.stringify({ userId, orgId }),
  { expirationTtl: 24 * 3600 },
);

c.executionCtx.waitUntil(
  c.env.EMAIL_QUEUE.send({
    type: 'email_verification',
    to: [body.email],
    verifyUrl: `https://app.apura.xyz/verify-email/${verifyToken}`,
    userName: body.name,
  })
);
```

### Team Invitation Email (org.ts invite)
```typescript
// After inserting invitation row (line ~297):
const inviter = await c.env.DB
  .prepare('SELECT name FROM users WHERE id = ?')
  .bind(userId)
  .first<{ name: string }>();

const org = await c.env.DB
  .prepare('SELECT name FROM organizations WHERE id = ?')
  .bind(orgId)
  .first<{ name: string }>();

c.executionCtx.waitUntil(
  c.env.EMAIL_QUEUE.send({
    type: 'team_invitation',
    to: [body.email],
    inviterName: inviter?.name ?? 'A team member',
    orgName: org?.name ?? 'your organization',
    inviteUrl: `https://app.apura.xyz/accept-invite/${token}`,
    role,
  })
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Resend npm SDK | Raw fetch to Resend API | Already in codebase | No SDK dependency needed; email-worker uses fetch directly |
| Synchronous email in request handler | Queue-based async delivery | Already designed | Better UX (fast response), built-in retries |
| React Email templates | Inline HTML template functions | Already in codebase | Simpler, no build step, sufficient for 4 template types |

## Open Questions

1. **Resend Domain Verification**
   - What we know: FROM_EMAIL is `Apura <reports@apura.xyz>`. Resend requires domain verification.
   - What's unclear: Whether `apura.xyz` is already verified in Resend with SPF/DKIM/DMARC records.
   - Recommendation: Verify domain in Resend dashboard before deploying. Use `wrangler secret put RESEND_API_KEY` to set the API key.

2. **Email-outbound Queue Existence**
   - What we know: Both email-worker and report-worker reference the `email-outbound` queue.
   - What's unclear: Whether the queue has been created in the Cloudflare account.
   - Recommendation: Run `wrangler queues create email-outbound` as a setup step. Idempotent if it already exists.

3. **APP_URL Configuration**
   - What we know: Email links point to `https://app.apura.xyz/...`. This is hardcoded in the examples above.
   - What's unclear: Whether this should be configurable per environment (staging vs production).
   - Recommendation: Add `APP_URL` as a var in api-gateway wrangler.toml (default: `https://app.apura.xyz`). Use it when constructing email links.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `packages/api-gateway/vitest.config.ts` |
| Quick run command | `cd packages/api-gateway && npx vitest run` |
| Full suite command | `npm run test` (turbo test across all packages) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAIL-01 | forgot-password enqueues password_reset message to EMAIL_QUEUE | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/auth-email.test.ts -x` | No -- Wave 0 |
| MAIL-02 | signup enqueues email_verification message + stores token in KV | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/auth-email.test.ts -x` | No -- Wave 0 |
| MAIL-03 | invite enqueues team_invitation message with correct fields | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/org-email.test.ts -x` | No -- Wave 0 |
| MAIL-04 | EMAIL_QUEUE binding exists in api-gateway Env and wrangler.toml | unit | `cd packages/api-gateway && npx vitest run src/routes/__tests__/auth-email.test.ts -x` | No -- Wave 0 |
| MAIL-05 | email-worker processEmail renders correct HTML for each type | unit | `cd packages/email-worker && npx vitest run src/__tests__/email-templates.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/api-gateway && npx vitest run`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api-gateway/vitest.config.ts` -- exists but may need mock setup for Queue/KV
- [ ] `packages/api-gateway/src/routes/__tests__/auth-email.test.ts` -- covers MAIL-01, MAIL-02, MAIL-04
- [ ] `packages/api-gateway/src/routes/__tests__/org-email.test.ts` -- covers MAIL-03
- [ ] `packages/email-worker/vitest.config.ts` -- does not exist, needs creation
- [ ] `packages/email-worker/src/__tests__/email-templates.test.ts` -- covers MAIL-05
- [ ] Test mocks for `Queue.send()`, `KVNamespace`, and `fetch` (Resend API) -- shared fixtures

## Sources

### Primary (HIGH confidence)
- **email-worker/src/index.ts** (codebase) -- Complete implementation with all 4 email types, templates, Resend API integration
- **email-worker/wrangler.toml** (codebase) -- Queue consumer binding, R2 bucket, FROM_EMAIL configured
- **api-gateway/src/routes/auth.ts** (codebase) -- Existing forgot-password (token generation, TODO for email) and verify-email (token consumption) routes
- **api-gateway/src/routes/org.ts** (codebase) -- Existing invite route with TODO for email
- **api-gateway/wrangler.toml** (codebase) -- Current bindings (MISSING EMAIL_QUEUE producer)
- **api-gateway/src/types.ts** (codebase) -- Current Env interface (MISSING EMAIL_QUEUE)
- **Resend npm registry** -- Version 6.9.4 confirmed (not needed since raw fetch used)
- **Cloudflare Queues documentation** -- Producer/consumer binding configuration

### Secondary (MEDIUM confidence)
- **Cloudflare Resend tutorial** -- https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- email-worker already implemented, no new libraries
- Architecture: HIGH -- queue topology already designed, just needs producer binding
- Pitfalls: HIGH -- identified from direct codebase analysis of missing pieces

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- no fast-moving dependencies)
