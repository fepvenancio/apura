# Coding Conventions

**Analysis Date:** 2026-03-18

## Naming Patterns

**Files:**
- Page components: kebab-case inside route groups, e.g. `login/page.tsx`, `home/page.tsx`
- Component files: kebab-case, e.g. `result-table.tsx`, `query-input.tsx`
- Store files: kebab-case with `-store` suffix, e.g. `auth-store.ts`, `query-store.ts`
- Service/utility files: kebab-case, e.g. `sql-sanitizer.ts`, `jwt.ts`
- Type definition files: `types.ts` (index file for all interfaces)

**Functions:**
- camelCase for all functions: `validateSql()`, `handleSubmit()`, `expectValid()`
- Verb-first naming for actions: `login()`, `logout()`, `sanitizeNaturalLanguage()`
- Prefix with `use` for React hooks: `useAuthStore()`, `useState()`
- Helper functions in tests prefixed descriptively: `expectValid()`, `expectRejected()`

**Variables:**
- camelCase for local variables: `email`, `password`, `sanitized`
- camelCase for state setters: `setError`, `setLoading`
- UPPER_SNAKE_CASE for constants: `MAX_NATURAL_LANGUAGE_LENGTH`, `CACHE_TTL_SESSION`, `MAX_CONTEXT_TABLES`
- Short prefixes for related constants (e.g., all SQLValidator constants grouped)

**Types:**
- PascalCase for interfaces: `AuthStore`, `AuthUser`, `QueryResult`, `AppVariables`
- PascalCase for type aliases: `ButtonVariant`, `ButtonSize`
- Record types explicitly typed: `Record<ButtonVariant, string>` instead of object literals
- Suffix with `Props` for component props interfaces: `ButtonProps`

**Enums and Unions:**
- Type union literals for variants: `"primary" | "secondary" | "ghost" | "danger"`
- Single quotes for string literals in types (matches codebase)

## Code Style

**Formatting:**
- No explicit formatter detected (no `.prettierrc` found at root)
- Uses ESLint (Next.js core-web-vitals config)
- Indentation: 2 spaces (observed in all source files)
- Line length: reasonable wrapping observed (no hard limit enforced)

**Linting:**
- ESLint with `next/core-web-vitals` and `next/typescript` in frontend
  - Config: `frontend/eslint.config.mjs`
- API gateway has no explicit linting configured
- Focus on type safety with strict TypeScript

**TypeScript Configuration:**
- Target: ES2022
- Strict mode enabled (`"strict": true`)
- Isolated modules (`"isolatedModules": true`)
- Module resolution: bundler

## Import Organization

**Order:**
1. External packages (React, Next.js, third-party)
2. Internal absolute imports (using `@/` alias in frontend)
3. Relative imports from parent/sibling modules (`..")

**Path Aliases:**
- Frontend: `@/` maps to `src/` (used in all frontend imports)
- Backend: No path aliases, uses relative imports
- Shared package: Imported as `@apura/shared`

**Example - Frontend (from `/frontend/src/app/(auth)/login/page.tsx`):**
```typescript
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
```

**Example - Backend (from `/packages/api-gateway/src/index.ts`):**
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, AppVariables } from './types';
import { authMiddleware } from './middleware/auth';
```

## Error Handling

**Patterns:**
- Try-catch blocks with specific error handling
- Type guards with `instanceof Error` checks
- Custom error classes (e.g., `ApiError` extends `Error`)
- Errors logged with `console.error()` including context

**Error Propagation:**
- Backend (Hono): Return structured error responses with `{ success: false, error: { code, message } }`
- Frontend: Catch errors and set to state (e.g., `setError()`)
- Validation errors: Include detailed reason in response

**Example from `/packages/api-gateway/src/utils/jwt.ts`:**
```typescript
try {
  // verification logic
} catch (err) {
  const message = err instanceof Error ? err.message : 'Invalid token';
  return c.json({ success: false, error: { code: 'UNAUTHORIZED', message } }, 401);
}
```

**Example from `/frontend/src/app/(auth)/login/page.tsx`:**
```typescript
try {
  await login(email, password);
  router.push("/home");
} catch (err) {
  setError(
    err instanceof Error
      ? err.message
      : "Email ou palavra-passe incorretos."
  );
}
```

## Logging

**Framework:** `console.error()` only (no structured logging framework detected)

**Patterns:**
- Log errors with context: `console.error('Query execution error:', err)`
- Include descriptive labels: `console.error('Unhandled error:', err)`
- No info/debug logging in committed code (only errors logged)
- Middleware errors caught and logged before returning response

**Location:** Used in middleware error paths and critical error handlers

## Comments

**When to Comment:**
- JSDoc/TSDoc for public functions and complex business logic
- Inline comments for non-obvious algorithm choices or security decisions
- Section dividers for test groupings (observed in test files): `// ─── Helpers ─────...`
- Comment out incomplete features (e.g., email integration): `// TODO: Integrate email service`

**JSDoc Pattern (from `/packages/api-gateway/src/middleware/auth.ts`):**
```typescript
/**
 * JWT authentication middleware.
 *
 * Extracts and verifies a Bearer token, checks session validity in KV,
 * and attaches user context to the Hono context.
 */
export async function authMiddleware(c: AppContext, next: Next): Promise<Response | void> {
```

**TODO Comments:**
- Marked with `// TODO:` prefix for incomplete features
- Example: `// TODO: Integrate email service to send reset link` in auth routes

## Function Design

**Size:** Functions kept focused and readable
- Most utility functions 5-50 lines
- Complex orchestrators (e.g., `QueryOrchestrator`) broken into steps with clear comments
- React components generally under 100 lines when possible

**Parameters:**
- Use object destructuring for multiple related parameters
- Type all parameters explicitly (TypeScript strict mode)
- Optional parameters marked with `?`

**Return Values:**
- Async functions return typed Promises
- Hono handlers return `Promise<Response | void>`
- React hooks return typed values
- Status objects include success flag and error details: `{ valid: boolean, reason?: string }`

**Example from `/packages/ai-orchestrator/src/validation/sql-validator.ts`:**
```typescript
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  queryType?: string;
  tablesReferenced?: string[];
}

export function validateSql(sql: string, opts?: SqlValidatorOptions): ValidationResult {
  // returns typed object
}
```

## Module Design

**Exports:**
- Named exports preferred over default exports (except for pages and stores)
- Class exports for orchestrators and service classes
- Type exports explicitly marked with `export type`

**Barrel Files:**
- Each feature directory contains an index (implicit re-exports via subdirectory structure)
- Example: `@/components/ui/` contains individual component files
- Stores: Direct import from `@/stores/auth-store.ts` (no barrel)

**Class-Based Services:**
- Used for stateful operations: `QueryOrchestrator`, `ClaudeClient`, `SchemaLoader`
- Constructor injection of dependencies (env, cache, etc.)
- Methods generally focused on single responsibility

## TypeScript Specifics

**Type Definitions:**
- All store interfaces define state shape and methods
- Request/response types explicitly defined (never inferred)
- Middleware types clearly specify context generics

**Generic Usage:**
- Pagination: `PaginatedResponse<T>`
- API responses: Generic handler for different response types
- Record types: `Record<Key, Value>` for variant/style maps

**Examples:**
```typescript
// From store — clear interface with all methods
interface AuthStore {
  user: AuthUser | null;
  org: Organization | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// From UI component — variant maps using Record
const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white...",
  secondary: "bg-card border...",
};
```

## Frontend Specific Patterns

**React Components:**
- Function components with explicit return types
- `"use client"` directive at top of interactive components
- Props destructured with `interface ComponentNameProps extends HTMLAttributes<T>`
- Use `forwardRef` for components that need refs

**State Management:**
- Zustand stores (`create<StoreType>()`) for global state
- Local state with `useState` for component-level state
- No Redux or Context API in use

**Styling:**
- Tailwind CSS class names composed with `clsx()` or `cn()` utility
- Inline variant objects for component themes
- No CSS modules or styled-components

## Backend Specific Patterns

**Hono Framework:**
- Middleware functions return `Promise<Response | void>`
- Context destructuring: `c.json()`, `c.req.header()`, `c.set()`
- Route handlers organized by feature in separate files: `/routes/auth.ts`, `/routes/queries.ts`

**Middleware Chain:**
- CORS before auth
- Security headers applied first
- Body size check before processing
- Rate limiting per feature/route

---

*Convention analysis: 2026-03-18*
