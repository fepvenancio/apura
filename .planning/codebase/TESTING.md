# Testing Patterns

**Analysis Date:** 2026-03-18

## Test Framework

**Runner:**
- Vitest 3.2.4 (only in `@apura/ai-orchestrator`)
- Node.js built-in test runner (`node:test`) used as fallback/complement
- Config: No `vitest.config.ts` found; uses defaults

**Assertion Library:**
- Node.js built-in `node:assert` strict mode (`strict as assert`)
- Assertions made with `assert.equal()`, `assert.ok()`, `assert.deepEqual()`

**Run Commands:**
```bash
npm run test                 # Run tests for all packages (turbo)
npm test                     # From ai-orchestrator: vitest run
vitest run                   # Single run
vitest --watch              # Watch mode (not common in CI)
```

## Test File Organization

**Location:**
- Co-located with source: `src/validation/__tests__/sql-validator.test.ts`
- Pattern: `__tests__/` subdirectory within module directory
- Only one test file found in entire codebase: SQL validator tests

**Naming:**
- `.test.ts` extension (not `.spec.ts`)
- Example: `sql-validator.test.ts` tests `sql-validator.ts`

**Structure:**
```
packages/ai-orchestrator/
├── src/
│   ├── validation/
│   │   ├── sql-validator.ts
│   │   ├── sql-sanitizer.ts
│   │   ├── table-allowlist.ts
│   │   └── __tests__/
│   │       └── sql-validator.test.ts
```

## Test Structure

**Suite Organization:**

The test file uses Node.js `describe()` and `it()` with hierarchical grouping by feature:

```typescript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

// Helper functions at top
function expectValid(sql: string, opts?: SqlValidatorOptions) {
  const result = validateSql(sql, opts);
  assert.equal(result.valid, true, `Expected VALID...`);
  return result;
}

// Test suites grouped by behavior
describe('Valid SELECT queries', () => {
  it('01 — simple SELECT', () => {
    expectValid('SELECT Nome, Email FROM Clientes');
  });

  it('02 — SELECT with WHERE', () => {
    expectValid("SELECT Nome FROM Clientes WHERE Cidade = 'Lisboa'");
  });
});

describe('Dangerous queries — must reject', () => {
  it('30 — INSERT INTO', () => {
    expectRejected("INSERT INTO Clientes (Nome) VALUES ('Hacker')");
  });
});
```

**Patterns:**

1. **Helper Functions:** Custom `expectValid()` and `expectRejected()` wrappers around assertions
2. **Numbered Test Cases:** Tests numbered sequentially (01, 02, etc.) with descriptive names separated by em-dash (—)
3. **Section Comments:** Major groupings marked with ASCII art dividers:
   ```typescript
   // =====================================================================
   // MUST PASS — Valid read-only queries
   // =====================================================================
   ```
4. **No Setup/Teardown:** Tests are pure functions with no shared state
5. **No Async:** All tests are synchronous (no `async/await` or done callbacks)

**Test Case Count:** 115 total test cases covering:
- 29 valid SELECT queries
- 28 dangerous/mutating queries
- 15 SQL injection attempts
- 14 edge cases
- 15 sanitizer tests
- 14 table allowlist tests

## Mocking

**Framework:** No mocking library detected (Jest/Sinon/Vitest mocks not used)

**Patterns:**

Tests use pure functions with no external dependencies to mock:
```typescript
// No setup/teardown, no mocks, just pure function calls
function expectValid(sql: string, opts?: SqlValidatorOptions) {
  const result = validateSql(sql, opts);  // Direct function call
  assert.equal(result.valid, true, ...);
  return result;
}
```

**What to Mock:**
- Generally not mocked in current tests
- API calls would need mocking in integration tests (not yet implemented)
- Database queries would need mocking (when backend tests added)

**What NOT to Mock:**
- SQL validation logic (tested directly as pure functions)
- String sanitization (tested directly)
- Configuration objects (passed as parameters)

## Fixtures and Factories

**Test Data:**

Data is inline in test cases, organized by category:

```typescript
// Valid queries — real Primavera SQL
expectValid(
  `SELECT c.Nome, d.NumDoc FROM Clientes c
   INNER JOIN CabecDoc d ON c.Cliente = d.Entidade`
);

// Dangerous patterns — injection attempts
expectRejected(
  "SELECT * FROM Clientes WHERE Nome = '' OR 1=1 --'"
);

// Edge cases — boundary conditions
expectRejected('   \n\t  ');  // Whitespace only

// With options — parameterized testing
expectValid('SELECT Nome FROM Clientes', {
  allowedTables: ['clientes'],  // Case insensitive
});
```

**Location:**
- Inline within test cases (no separate fixtures file)
- For table allowlist: `TableAllowlist.getDefaultPrimaveraAllowlist()` provides sample data
- No factory functions; direct object creation

## Coverage

**Requirements:** Not enforced (no coverage.config or threshold specified)

**View Coverage:**
```bash
# Manually run vitest with coverage flag (if supported)
vitest run --coverage
```

**Implicit Coverage:**
- SQL validator: 115 test cases cover valid queries, attacks, edge cases, and sanitizer
- Test count suggests comprehensive coverage of security-critical path

## Test Types

**Unit Tests:**
- Scope: Individual functions (`validateSql()`, `sanitizeSql()`, `TableAllowlist.isAllowed()`)
- Approach: Pure function testing with explicit inputs and assertions
- No test helpers or fixtures beyond inline custom wrappers

**Integration Tests:**
- Not yet present in codebase
- When added: Would test QueryOrchestrator with mocked schema loader and API client

**E2E Tests:**
- Not implemented
- Frontend has no test files (Playwright/Cypress not configured)

## Common Patterns

**Assertion Pattern:**

Custom helper functions provide semantic assertions:

```typescript
function expectValid(sql: string, opts?: SqlValidatorOptions) {
  const result = validateSql(sql, opts);
  assert.equal(
    result.valid,
    true,
    `Expected VALID but got rejected: "${result.reason}" for SQL: ${sql.substring(0, 120)}`
  );
  return result;
}
```

- Assert condition
- Provide descriptive message
- Return result for further inspection if needed

**Error Testing:**

```typescript
describe('Dangerous queries — must reject', () => {
  it('30 — INSERT INTO', () => {
    expectRejected("INSERT INTO Clientes (Nome) VALUES ('Hacker')");
  });

  it('60 — OR 1=1 injection', () => {
    expectRejected("SELECT * FROM Clientes WHERE Nome = '' OR 1=1 --'");
  });
});
```

- Test error cases by expecting rejection
- No `expect().toThrow()` pattern; validation returns `{ valid: false, reason }`
- Verification done via result structure, not exception catching

**Parametric Testing:**

```typescript
it('77 — Table IN allowlist (case insensitive)', () => {
  expectValid('SELECT Nome FROM Clientes', {
    allowedTables: ['clientes'],  // lowercase input
  });
});

it('80 — Custom max JOINs option', () => {
  const sql = `SELECT...`;
  expectRejected(sql, { maxJoins: 1 });  // Different option
});
```

- Options passed inline (no `describe.each()`)
- Each test case is explicit and numbered

**Regression Testing:**

Section marked "Security hardening — additional attack vectors" (tests V-01 through V-09):
```typescript
describe('Security hardening — new vulnerability fixes', () => {
  it('V-01 — SELECT * FROM sys.sql_logins is rejected by allowlist', () => {
    const allowlist = TableAllowlist.getDefaultPrimaveraAllowlist();
    expectRejected('SELECT * FROM sql_logins', { allowedTables: allowlist });
  });
});
```

- Tracks security fixes as separate test section
- Uses version codes (V-01, V-02, etc.) for traceability
- Tests fixed vulnerabilities to prevent regression

## Running Tests

**From Repository Root:**
```bash
npm test                    # Runs all packages (via turbo)
```

**From ai-orchestrator Package:**
```bash
cd packages/ai-orchestrator
npm run test               # Runs vitest
npm run typecheck          # Type checking only
```

**Currently:**
- Only `@apura/ai-orchestrator` has tests configured
- Other packages (`api-gateway`, `ws-gateway`, `shared`) have no test files
- Frontend (`frontend/`) has no tests

## Test Metrics

**Current Coverage:**
- Codebase: 1 test file with 115 test cases
- Module: SQL validation (sql-validator, sql-sanitizer, table-allowlist)
- Lines of test code: ~800 lines for one module
- Security focus: >40 tests specifically for injection/attack prevention

**Untested Areas:**
- Frontend components (no test files)
- API gateway routes (no test files)
- WebSocket gateway (no test files)
- Authentication logic (no test files)
- Database migrations (no test files)

## Test Failures and Debugging

**Error Messages:**

Assertions include context for debugging:
```typescript
assert.equal(
  result.valid,
  true,
  `Expected VALID but got rejected: "${result.reason}" for SQL: ${sql.substring(0, 120)}`
);
```

**Debugging Approach:**
- Run with `vitest run` for single pass
- Add `console.log()` in test or function being tested
- Check `result.reason` field for validation failure details

---

*Testing analysis: 2026-03-18*
