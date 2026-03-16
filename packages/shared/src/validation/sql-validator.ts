/** Result of a SQL validation check. */
export interface SqlValidationResult {
  /** Whether the SQL passed all validation rules. */
  valid: boolean;
  /** Human-readable reason if validation failed. */
  reason?: string;
}

/**
 * Dangerous SQL keywords that must never appear in user-generated queries.
 * Matched with word boundaries to avoid false positives on column/table names.
 */
const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'MERGE',
  'RENAME',
  'EXEC',
  'EXECUTE',
  'GRANT',
  'REVOKE',
  'DENY',
  'SHUTDOWN',
  'KILL',
  'RECONFIGURE',
  'BACKUP',
  'RESTORE',
  'OPENROWSET',
  'OPENDATASOURCE',
  'OPENQUERY',
  'BULK',
  'WAITFOR',
  'DBCC',
  'WRITETEXT',
  'UPDATETEXT',
  'READTEXT',
];

/**
 * Prefixes that indicate dangerous stored procedure calls.
 * Matched as prefixes (e.g. xp_cmdshell, sp_executesql).
 */
const FORBIDDEN_PREFIXES = ['xp_', 'sp_executesql'];

/**
 * Strip string literals from SQL so keyword checks don't match quoted text.
 * Handles both single-quoted ('...') and double-quoted ("...") strings.
 */
function stripStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
}

/**
 * Lightweight first-pass SQL validation.
 *
 * This function performs string-based checks to block obviously dangerous SQL
 * before it reaches the connector. A full AST-based parser (node-sql-parser)
 * is used in the AI orchestrator as a second pass.
 *
 * @param sql - The SQL string to validate.
 * @returns Validation result with an optional reason on failure.
 */
export function validateSqlBasic(sql: string): SqlValidationResult {
  // Rule: reject empty input
  if (!sql || sql.trim().length === 0) {
    return { valid: false, reason: 'SQL query is empty.' };
  }

  // Rule: reject overly long queries
  if (sql.length > 4000) {
    return { valid: false, reason: 'SQL query exceeds maximum length of 4000 characters.' };
  }

  // Rule: reject batch queries (semicolons)
  if (sql.includes(';')) {
    return { valid: false, reason: 'Batch queries are not allowed (semicolons detected).' };
  }

  const trimmed = sql.trim();

  // Rule: must start with SELECT or WITH
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    return { valid: false, reason: 'Query must start with SELECT or WITH.' };
  }

  // Strip string literals so we don't match keywords inside quoted values
  const stripped = stripStringLiterals(trimmed);

  // Rule: reject forbidden keywords (word boundary match)
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(stripped)) {
      return { valid: false, reason: `Forbidden keyword detected: ${keyword}.` };
    }
  }

  // Rule: reject forbidden prefixes (xp_, sp_executesql)
  for (const prefix of FORBIDDEN_PREFIXES) {
    const regex = new RegExp(`\\b${prefix.replace('_', '_')}`, 'i');
    if (regex.test(stripped)) {
      return { valid: false, reason: `Forbidden expression detected: ${prefix}.` };
    }
  }

  // Rule: reject SELECT ... INTO (table creation via SELECT)
  // Match INTO that follows SELECT (not as part of INSERT INTO) and is followed
  // by an identifier (optional schema prefix), indicating a SELECT INTO pattern.
  if (/\bSELECT\b[\s\S]*?\bINTO\b\s+[#@\w\[\]]/i.test(stripped)) {
    return { valid: false, reason: 'SELECT INTO is not allowed.' };
  }

  // Rule: reject DECLARE statements
  if (/\bDECLARE\b/i.test(stripped)) {
    return { valid: false, reason: 'DECLARE statements are not allowed.' };
  }

  // Rule: reject SET @variable assignments
  if (/\bSET\s+@/i.test(stripped)) {
    return { valid: false, reason: 'SET @variable assignments are not allowed.' };
  }

  return { valid: true };
}
