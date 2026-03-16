/**
 * SQL Sanitizer — cleans up AI-generated SQL before validation.
 *
 * This is a PRE-validation step. It does NOT make unsafe SQL safe;
 * it strips common AI output artifacts so the validator sees clean SQL.
 */

/**
 * Sanitize raw AI-generated SQL output before sending it to the validator.
 *
 * Handles common AI artifacts:
 * - Markdown code fences
 * - Trailing semicolons
 * - SQL comments
 * - Excessive whitespace
 * - JSON-wrapped output
 */
export function sanitizeSql(rawSql: string): string {
  if (!rawSql || typeof rawSql !== 'string') {
    return '';
  }

  let sql = rawSql;

  // 1. If the SQL starts with a JSON object, try to extract the sql field
  sql = extractFromJson(sql);

  // 2. Remove markdown code fences (```sql ... ``` or ``` ... ```)
  sql = removeCodeFences(sql);

  // 3. Remove SQL single-line comments (-- ...)
  sql = removeSingleLineComments(sql);

  // 4. Remove SQL block comments (/* ... */)
  sql = removeBlockComments(sql);

  // 5. Trim whitespace
  sql = sql.trim();

  // 6. Remove trailing semicolons (possibly multiple)
  sql = sql.replace(/;+\s*$/, '');

  // 7. Normalize whitespace (collapse multiple spaces/newlines into single space)
  sql = sql.replace(/\s+/g, ' ');

  // 8. Final trim
  sql = sql.trim();

  return sql;
}

function extractFromJson(sql: string): string {
  const trimmed = sql.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        // Try common field names the AI might use
        const sqlValue = parsed.sql || parsed.query || parsed.SQL || parsed.Query;
        if (typeof sqlValue === 'string') {
          return sqlValue;
        }
      }
    } catch {
      // Not valid JSON — continue with original string
    }
  }
  return sql;
}

function removeCodeFences(sql: string): string {
  // Match ```sql\n...\n``` or ```\n...\n```
  const fencePattern = /^```(?:sql|SQL|t-sql|tsql|mssql)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = sql.trim().match(fencePattern);
  if (match) {
    return match[1];
  }
  return sql;
}

function removeSingleLineComments(sql: string): string {
  // Remove -- comments, but be careful with strings
  // Simple approach: remove from -- to end of line, but not inside string literals
  // For safety, we just strip all -- comments since the validator will reject them anyway
  return sql.replace(/--[^\n]*/g, '');
}

function removeBlockComments(sql: string): string {
  // Remove /* ... */ comments (non-nested)
  return sql.replace(/\/\*[\s\S]*?\*\//g, '');
}
