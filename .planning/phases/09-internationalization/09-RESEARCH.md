# Phase 9: Internationalization (PT/ES/EN) - Research

**Researched:** 2026-03-19
**Domain:** next-intl i18n for statically-exported Next.js 15 App Router
**Confidence:** HIGH

## Summary

The Apura frontend has approximately 238 hardcoded Portuguese strings across 35 `.tsx` files (34 pages + 13 components). All user-facing text is currently in Portuguese, including navigation labels, form labels, error messages, success messages, status indicators, marketing copy, and legal pages. The `utils.ts` file hardcodes `pt-PT` locale for date, number, and currency formatting in 4 functions.

The recommended approach uses next-intl 4.8.3 in "without middleware" mode since the frontend deploys as a static export to Cloudflare Pages. This requires a `[locale]` URL segment, `generateStaticParams()` returning `['pt', 'es', 'en']`, and `setRequestLocale()` in every layout and page. Since ALL pages are currently `"use client"` components, translation will primarily use the `useTranslations()` client hook via `NextIntlClientProvider` rather than server-side APIs.

**Primary recommendation:** Use next-intl with client-side locale detection (user preference from auth store, fallback to `navigator.language`). No URL-based locale routing for authenticated pages -- locale is a user preference, not a URL concern. Use `[locale]` segments only for public/marketing pages that need SEO in multiple languages.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| I18N-01 | UI supports PT, ES, and EN languages via next-intl | next-intl 4.8.3 verified; static export "without middleware" mode documented; all 35 files with hardcoded strings identified |
| I18N-02 | User can select preferred language in settings (stored in users.language) | Profile page already has language selector with pt/en/es options; `ProfileUpdate.language` type exists; `api.updateProfile()` method exists |
| I18N-03 | Date and number formatting follows locale conventions | `utils.ts` has 4 functions hardcoded to `pt-PT`; next-intl `useFormatter()` replaces them with locale-aware formatting |
| I18N-04 | All hardcoded UI strings extracted to locale JSON files | 238 hardcoded PT strings across 35 files catalogued; requires 3 JSON message files (pt.json, es.json, en.json) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-intl | 4.8.3 | i18n for Next.js App Router | De facto standard for App Router i18n; supports static export; TypeScript-first with key autocomplete |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | next-intl covers translation, formatting, and message loading |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-intl | react-intl (FormatJS) | Lower-level, more boilerplate, no Next.js-specific features like static export support |
| next-intl | next-i18next | Designed for Pages Router, not App Router |
| next-intl | Custom solution | Unnecessary when next-intl handles all requirements out of the box |

**Installation:**
```bash
cd frontend && npm install next-intl
```

**Version verification:** next-intl 4.8.3 confirmed current via npm registry on 2026-03-19.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── i18n/
│   ├── routing.ts          # defineRouting({ locales, defaultLocale })
│   └── request.ts          # getRequestConfig — loads messages per locale
├── messages/
│   ├── pt.json             # Portuguese translations (primary)
│   ├── en.json             # English translations
│   └── es.json             # Spanish translations
├── app/
│   ├── [locale]/           # NEW: locale segment wrapping all routes
│   │   ├── layout.tsx      # Root layout with NextIntlClientProvider
│   │   ├── (public)/       # Public pages (landing, pricing, terms, etc.)
│   │   ├── (auth)/         # Auth pages (login, signup, etc.)
│   │   └── (dashboard)/    # Dashboard pages (home, query, reports, etc.)
│   └── layout.tsx          # Minimal root layout (html/body only)
├── components/             # Components use useTranslations() hook
├── stores/                 # Auth store provides user.language
└── lib/
    └── utils.ts            # formatDate/Number/Currency updated to accept locale
```

### Pattern 1: Locale-Aware Architecture Decision

**What:** User-preference locale (not URL-based) for authenticated pages, URL-based for public pages.

**Rationale:** The app has two distinct zones:
1. **Public pages** (landing, pricing, terms, privacy, docs, DPA) -- need SEO in each language, so URL-based locale (`/pt/pricing`, `/en/pricing`) makes sense.
2. **Authenticated pages** (dashboard, query, reports, settings) -- locale is a user preference stored in `users.language`. URL locale is redundant and creates friction (user bookmarks `/pt/home` then switches to English, bookmark breaks).

**Implementation:** Despite the architectural distinction, next-intl requires the `[locale]` segment in the route tree for all pages. The locale will be resolved from:
1. Authenticated user: `users.language` field from auth store
2. Unauthenticated user: `navigator.language` or localStorage preference
3. Fallback: `pt` (Portuguese as default)

**When to use:** Always -- this is the core routing pattern.

### Pattern 2: Client-Side Translation with useTranslations

**What:** Since ALL pages use `"use client"`, translations use the `useTranslations()` hook wrapped in `NextIntlClientProvider`.

**Example:**
```typescript
// frontend/src/app/[locale]/(dashboard)/home/page.tsx
"use client";

import { useTranslations } from "next-intl";

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  return (
    <div>
      <p>{t("queries")}</p>        // "Consultas" / "Queries" / "Consultas"
      <p>{t("connector")}</p>      // "Conector" / "Connector" / "Conector"
      <p>{t("plan")}</p>           // "Plano" / "Plan" / "Plan"
      <p>{t("quickQuery")}</p>     // "Consulta rapida" / "Quick query"
      <p>{t("recentQueries")}</p>  // "Consultas recentes" / "Recent queries"
    </div>
  );
}
```

### Pattern 3: Locale-Aware Formatting with useFormatter

**What:** Replace hardcoded `pt-PT` Intl calls in utils.ts with next-intl's `useFormatter()` hook.

**Example:**
```typescript
// In a component:
import { useFormatter } from "next-intl";

function DateDisplay({ date }: { date: string }) {
  const format = useFormatter();
  return <span>{format.dateTime(new Date(date), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}</span>;
}

// Relative dates:
function RelativeDate({ date }: { date: string }) {
  const format = useFormatter();
  return <span>{format.relativeTime(new Date(date))}</span>;
}
```

### Pattern 4: Message File Organization

**What:** Organize translations by UI area using nested keys for manageable files.

**Example:**
```json
// messages/pt.json
{
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "loading": "A carregar...",
    "error": "Erro",
    "success": "Sucesso",
    "viewAll": "Ver tudo",
    "add": "Adicionar",
    "delete": "Eliminar",
    "confirm": "Confirmar"
  },
  "nav": {
    "dashboard": "Dashboard",
    "queries": "Consultas",
    "history": "Historico",
    "reports": "Relatorios",
    "dashboards": "Dashboards",
    "schema": "Esquema",
    "schedules": "Agendamentos",
    "settings": "Definicoes",
    "team": "Equipa",
    "connector": "Conector",
    "billing": "Faturacao",
    "profile": "Perfil"
  },
  "auth": {
    "login": "Entrar",
    "signup": "Criar conta",
    "logout": "Sair",
    "email": "Email",
    "password": "Palavra-passe",
    "forgotPassword": "Esqueceu a palavra-passe?",
    "signInTitle": "Inicie sessao na sua conta",
    "noAccount": "Nao tem conta?",
    "createAccount": "Criar conta"
  },
  "dashboard": { ... },
  "settings": { ... },
  "schedules": { ... },
  "landing": { ... }
}
```

### Anti-Patterns to Avoid
- **Translating legal pages:** Terms, Privacy, DPA pages contain legal text that must be professionally translated. Do NOT machine-translate legal content. For v1, keep legal pages in Portuguese only, or create separate static pages per locale.
- **URL-based locale for authenticated routes:** Do not force `/pt/home`, `/en/home` for logged-in users. The locale is a user preference, not a URL concern. However, the `[locale]` segment is technically required by next-intl -- use client-side redirect to resolve this.
- **Splitting message files too granularly:** One file per locale is simpler than per-page files. The total string count (~238) fits comfortably in a single JSON per locale.
- **Translating dynamic user content:** Query results, report names, AI-generated explanations should NOT be translated. Only UI chrome is translated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Translation key resolution | Custom key-value lookup | `useTranslations()` | Handles nested keys, interpolation, plurals, TypeScript checking |
| Date/number formatting | Locale-switching Intl wrappers | `useFormatter()` | Automatic locale detection, consistent with translation locale |
| Locale detection | Custom navigator.language parser | next-intl routing + client redirect | Edge cases with locale variants (pt-BR vs pt-PT, es-419 vs es-ES) |
| Missing key handling | console.warn wrapper | next-intl's built-in missing key handler | Configurable via `onError` in request config |

**Key insight:** The i18n problem space has well-known edge cases (pluralization rules, gender agreement in PT/ES, date format ambiguity) that next-intl handles. Rolling custom solutions invariably misses these.

## Common Pitfalls

### Pitfall 1: Static Export Middleware Conflict
**What goes wrong:** Adding next-intl middleware.ts for locale detection/redirect. Middleware does NOT run on static exports.
**Why it happens:** next-intl docs default to middleware-based setup. Static export is a special case.
**How to avoid:** Use "without middleware" mode. Client-side redirect based on user preference or navigator.language.
**Warning signs:** Works in `next dev` but breaks in production build.

### Pitfall 2: Forgetting setRequestLocale in Layouts/Pages
**What goes wrong:** Next.js opts into dynamic rendering, breaking static export.
**Why it happens:** next-intl requires `setRequestLocale(locale)` in EVERY layout and page for static rendering.
**How to avoid:** Add `setRequestLocale(locale)` as the first line in every layout component. Since all pages are `"use client"`, they don't need it -- only layouts that use server-side next-intl APIs.
**Warning signs:** Build errors about dynamic server usage.

### Pitfall 3: Hardcoded Locale in utils.ts
**What goes wrong:** `formatDate()`, `formatNumber()`, `formatCurrency()`, `formatRelativeDate()` all hardcode `pt-PT`. After adding i18n, these still output Portuguese formatting for all users.
**Why it happens:** These utility functions are called outside of React component context where `useFormatter()` is not available.
**How to avoid:** Replace all 4 functions with next-intl's `useFormatter()` hook inside components. For non-component contexts, pass locale as a parameter.
**Warning signs:** Numbers show `1.234,56` (PT format) for English users expecting `1,234.56`.

### Pitfall 4: Not Including Language in Auth Response
**What goes wrong:** After login, the app doesn't know the user's language preference until a separate API call.
**Why it happens:** `AuthUser` type doesn't include `language` field. The `users.language` column exists in DB but isn't returned in login/me responses.
**How to avoid:** Add `language` to `AuthUser` type. Return it from login/refresh endpoints. Store in localStorage alongside user data.
**Warning signs:** Locale flickers from default to user preference after login.

### Pitfall 5: Missing Portuguese Strings After Extraction
**What goes wrong:** Some Portuguese strings are subtle -- error messages in catch blocks, status text in ternaries, placeholder text, aria-labels, document titles.
**Why it happens:** Mechanical string extraction misses strings that aren't obvious JSX text content.
**How to avoid:** Systematic extraction: search for quoted Portuguese text patterns, template literals with Portuguese words, and conditional expressions with Portuguese text.
**Warning signs:** Mixed language UI (some elements in Portuguese, labels in English).

### Pitfall 6: Legal Pages Translation Liability
**What goes wrong:** Terms of Service, Privacy Policy, DPA translated by developers instead of legal professionals.
**Why it happens:** They look like "just more strings to translate."
**How to avoid:** Keep legal pages in Portuguese for v1. Mark them as out-of-scope for this phase. Legal translation is a business decision, not a dev task.
**Warning signs:** Legally inaccurate translations.

## Code Examples

### next-intl Configuration Files

```typescript
// frontend/src/i18n/routing.ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pt", "es", "en"],
  defaultLocale: "pt",
});
```

```typescript
// frontend/src/i18n/request.ts
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

### Root Layout with NextIntlClientProvider

```typescript
// frontend/src/app/[locale]/layout.tsx
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
```

### next.config.ts Update

```typescript
// frontend/next.config.ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default withNextIntl(nextConfig);
```

### Client Component Translation

```typescript
// Example: sidebar.tsx with translations
"use client";

import { useTranslations } from "next-intl";

export function Sidebar() {
  const t = useTranslations("nav");

  const navItems = [
    { href: "/home", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/query", label: t("queries"), icon: Search },
    { href: "/history", label: t("history"), icon: History },
    // ...
  ];
  // ...
}
```

### Locale-Aware Formatting

```typescript
// Replace hardcoded utils.ts functions
"use client";

import { useFormatter } from "next-intl";

export function FormattedDate({ value }: { value: string | Date }) {
  const format = useFormatter();
  return <>{format.dateTime(new Date(value), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}</>;
}

export function FormattedNumber({ value }: { value: number }) {
  const format = useFormatter();
  return <>{format.number(value)}</>;
}

export function FormattedCurrency({ value }: { value: number }) {
  const format = useFormatter();
  return <>{format.number(value, { style: "currency", currency: "EUR" })}</>;
}
```

## Scope Inventory: Files Requiring Modification

### Pages (34 files)

**Public pages (6 files) -- marketing/legal content:**
- `(public)/page.tsx` -- Landing page (heavy: hero, features, CTA, demo -- ~11 PT strings)
- `(public)/pricing/page.tsx` -- Pricing page (~40 PT strings -- heaviest file)
- `(public)/terms/page.tsx` -- Terms of Service (legal -- defer translation)
- `(public)/privacy/page.tsx` -- Privacy Policy (legal -- defer translation)
- `(public)/dpa/page.tsx` -- DPA (legal -- defer translation)
- `(public)/docs/page.tsx` -- Documentation

**Auth pages (6 files):**
- `(auth)/login/page.tsx` -- Login form (~3 strings)
- `(auth)/login/mfa/page.tsx` -- MFA verification (~3 strings)
- `(auth)/signup/page.tsx` -- Signup form (~10 strings)
- `(auth)/forgot-password/page.tsx` -- Forgot password (~2 strings)
- `(auth)/reset-password/[token]/page.tsx` -- Reset password (~7 strings)
- `(auth)/verify-email/[token]/page.tsx` -- Email verification (~1 string)
- `(auth)/accept-invite/[token]/page.tsx` -- Accept invite (~9 strings)

**Dashboard pages (16 files):**
- `(dashboard)/home/page.tsx` -- Dashboard (~3 strings)
- `(dashboard)/query/page.tsx` -- Query page (~1 string)
- `(dashboard)/history/page.tsx` -- History (~2 strings)
- `(dashboard)/reports/page.tsx` -- Reports list (~5 strings)
- `(dashboard)/reports/[id]/page.tsx` -- Report detail (~4 strings)
- `(dashboard)/reports/[id]/print/page.tsx` -- Print report (~2 strings)
- `(dashboard)/dashboards/page.tsx` -- Dashboards list (~5 strings)
- `(dashboard)/dashboards/[id]/page.tsx` -- Dashboard detail (~2 strings)
- `(dashboard)/schema/page.tsx` -- Schema browser (~8 strings)
- `(dashboard)/schedules/page.tsx` -- Schedules list (~11 strings)
- `(dashboard)/schedules/new/page.tsx` -- New schedule form (~19 strings)
- `(dashboard)/settings/page.tsx` -- Org settings (~20 strings)
- `(dashboard)/settings/profile/page.tsx` -- Profile settings (~13 strings)
- `(dashboard)/settings/team/page.tsx` -- Team management (~6 strings)
- `(dashboard)/settings/connector/page.tsx` -- Connector settings (~3 strings)
- `(dashboard)/settings/billing/page.tsx` -- Billing (~7 strings)
- `(dashboard)/settings/security/page.tsx` -- Security/MFA (~8 strings)

**Layouts (4 files):**
- `layout.tsx` -- Root layout (metadata title/description)
- `(public)/layout.tsx`
- `(auth)/layout.tsx`
- `(dashboard)/layout.tsx`

### Components (7 files with translatable text)
- `layout/sidebar.tsx` -- Navigation labels, settings section header (~13 strings)
- `layout/topbar.tsx` -- User menu items (~1 string)
- `query/query-input.tsx` -- Placeholder, button text (~6 strings)
- `query/result-panel.tsx` -- Result labels (~4 strings)
- `query/result-chart.tsx` -- Chart labels (~4 strings)
- `query/result-table.tsx` -- Table headers
- `billing/payment-failed-banner.tsx` -- Warning text (~2 strings)

### Utility files (1 file)
- `lib/utils.ts` -- 4 functions with hardcoded `pt-PT` locale

### Total effort estimate
- ~238 unique translatable strings
- 3 locale JSON files to create (pt.json, es.json, en.json)
- Portuguese file is a 1:1 extraction of existing strings
- English and Spanish files require manual translation
- 4 formatting functions to refactor

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| next-intl middleware for locale routing | "Without middleware" mode for static export | next-intl 3.x+ | Required for `output: 'export'` builds |
| `unstable_setRequestLocale()` | `setRequestLocale()` (stable) | next-intl 4.0 | API stabilized, same behavior |
| Separate i18n config file | `createNextIntlPlugin()` in next.config.ts | next-intl 4.0 | Simplified config |
| Pages Router i18n config | App Router `[locale]` segment | Next.js 13+ | No built-in i18n config for App Router |

**Deprecated/outdated:**
- `next.config.js` `i18n` field: Only works with Pages Router, not App Router
- `unstable_setRequestLocale()`: Renamed to `setRequestLocale()` in next-intl 4.0
- next-i18next: Designed for Pages Router, not recommended for App Router projects

## Open Questions

1. **Legal page translations**
   - What we know: Terms, Privacy, DPA pages have legal text in Portuguese
   - What's unclear: Whether these should be translated in this phase
   - Recommendation: Exclude from this phase. Legal translation requires professional translators and legal review. Keep in PT only for v1, add i18n wrapper so they CAN be translated later.

2. **API error message translation**
   - What we know: API returns error messages in English (from Hono workers). Pitfall 9 in PITFALLS.md warns about this.
   - What's unclear: Whether API errors should be translated server-side or mapped client-side
   - Recommendation: Map known error codes to translated strings client-side. API returns error codes, frontend maps to translated messages. This keeps backend language-agnostic.

3. **Email template translations**
   - What we know: Email templates are in Portuguese (password reset, verification, etc.)
   - What's unclear: Whether email language should follow user's language preference
   - Recommendation: Out of scope for this phase. Email templates are in a separate worker package. Add `Accept-Language` header support to API in a future phase.

4. **Static export with `output: 'export'`**
   - What we know: CI deploys from `out/` directory to Cloudflare Pages, suggesting static export is intended
   - What's unclear: `output: 'export'` is NOT currently in next.config.ts. It may be missing or handled elsewhere.
   - Recommendation: Add `output: 'export'` to next.config.ts alongside the next-intl plugin setup. Verify the build produces correct `out/` structure with locale-prefixed routes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already installed in frontend) |
| Config file | No vitest.config.ts found -- needs creation in Wave 0 |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| I18N-01 | All 3 locales load messages without errors | unit | `cd frontend && npx vitest run src/i18n/__tests__/messages.test.ts -x` | No -- Wave 0 |
| I18N-01 | Translation keys consistent across all locale files | unit | `cd frontend && npx vitest run src/i18n/__tests__/messages.test.ts -x` | No -- Wave 0 |
| I18N-02 | Language selector updates user preference | manual-only | Manual -- requires auth flow | N/A |
| I18N-03 | Date/number formatting respects locale | unit | `cd frontend && npx vitest run src/lib/__tests__/formatting.test.ts -x` | No -- Wave 0 |
| I18N-04 | All PT strings extracted (no hardcoded PT in components) | unit | `cd frontend && npx vitest run src/i18n/__tests__/completeness.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run && npm run build`
- **Phase gate:** Full test suite green + successful static build before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/vitest.config.ts` -- vitest configuration for frontend
- [ ] `frontend/src/i18n/__tests__/messages.test.ts` -- covers I18N-01, I18N-04 (key consistency, all locales load)
- [ ] `frontend/src/lib/__tests__/formatting.test.ts` -- covers I18N-03 (locale-aware formatting)

## Sources

### Primary (HIGH confidence)
- [next-intl official docs - routing setup](https://next-intl.dev/docs/routing/setup) -- static export configuration, `setRequestLocale`, `generateStaticParams`
- [next-intl official docs - request configuration](https://next-intl.dev/docs/usage/configuration) -- `getRequestConfig`, message loading
- npm registry: next-intl 4.8.3 verified current (2026-03-19)
- Direct codebase analysis: 35 files, 238 hardcoded PT strings catalogued

### Secondary (MEDIUM confidence)
- [next-intl GitHub Discussion #975](https://github.com/amannn/next-intl/discussions/975) -- without middleware usage pattern
- [next-intl GitHub Discussion #2132](https://github.com/amannn/next-intl/discussions/2132) -- static export with locale prefixes
- [next-intl GitHub Issue #334](https://github.com/amannn/next-intl/issues/334) -- static export support history

### Tertiary (LOW confidence)
- None -- all findings verified against official docs or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- next-intl is the clear standard, version verified
- Architecture: HIGH -- all pages are client components, pattern is well-documented
- Pitfalls: HIGH -- static export middleware conflict verified in official docs and project research
- Scope inventory: HIGH -- direct codebase grep, every file inspected

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain, next-intl API unlikely to change)
