/**
 * SQL Validator — security-critical AST-based SQL validation.
 *
 * This is Barrier 1 of 3 against SQL injection. It validates AI-generated
 * SQL before it is sent to customer databases.
 *
 * Validation layers:
 *   1. Pre-parse fast rejection (length, control chars, comments, semicolons)
 *   2. Regex blocklist (DML, DDL, DCL, dangerous functions)
 *   3. AST parsing via node-sql-parser (authoritative structural validation)
 *   4. Post-parse safety checks (table allowlist, join count, subquery depth)
 */

import pkg from 'node-sql-parser';
const { Parser } = pkg;
type AST = any;

// ─── Public types ────────────────────────────────────────────────────

export interface SqlValidationResult {
  valid: boolean;
  reason?: string;
  tablesReferenced?: string[];
  queryType?: string;
}

export interface SqlValidatorOptions {
  /** If set, only these tables can be queried (case-insensitive). */
  allowedTables?: string[];
  /** Maximum allowed query length. Default 4000. */
  maxQueryLength?: number;
  /** Maximum number of JOINs allowed. Default 8. */
  maxJoins?: number;
  /** Maximum subquery nesting depth. Default 3. */
  maxSubqueryDepth?: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_MAX_QUERY_LENGTH = 4000;
const DEFAULT_MAX_JOINS = 8;
const DEFAULT_MAX_SUBQUERY_DEPTH = 3;

/**
 * Regex blocklist patterns. Each entry is [pattern, label].
 * All patterns use word boundaries and are case-insensitive.
 */
const BLOCKED_KEYWORD_PATTERNS: Array<[RegExp, string]> = [
  // DML (mutating)
  [/\bINSERT\b/i, 'INSERT'],
  [/\bUPDATE\b/i, 'UPDATE'],
  [/\bDELETE\b/i, 'DELETE'],
  [/\bMERGE\b/i, 'MERGE'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  // DDL
  [/\bCREATE\b/i, 'CREATE'],
  [/\bALTER\b/i, 'ALTER'],
  [/\bDROP\b/i, 'DROP'],
  [/\bRENAME\b/i, 'RENAME'],
  // DCL
  [/\bGRANT\b/i, 'GRANT'],
  [/\bREVOKE\b/i, 'REVOKE'],
  [/\bDENY\b/i, 'DENY'],
  // Execution
  [/\bEXEC\b/i, 'EXEC'],
  [/\bEXECUTE\b/i, 'EXECUTE'],
  [/\bsp_executesql\b/i, 'sp_executesql'],
  [/\bxp_cmdshell\b/i, 'xp_cmdshell'],
  [/\bxp_regread\b/i, 'xp_regread'],
  [/\bxp_fileexist\b/i, 'xp_fileexist'],
  [/\bxp_dirtree\b/i, 'xp_dirtree'],
  [/\bxp_regwrite\b/i, 'xp_regwrite'],
  // Dangerous functions
  [/\bOPENROWSET\b/i, 'OPENROWSET'],
  [/\bOPENDATASOURCE\b/i, 'OPENDATASOURCE'],
  [/\bOPENQUERY\b/i, 'OPENQUERY'],
  // System
  [/\bSHUTDOWN\b/i, 'SHUTDOWN'],
  [/\bKILL\b/i, 'KILL'],
  [/\bRECONFIGURE\b/i, 'RECONFIGURE'],
  [/\bDBCC\b/i, 'DBCC'],
  // Backup / Restore
  [/\bBACKUP\b/i, 'BACKUP'],
  [/\bRESTORE\b/i, 'RESTORE'],
  // Variables
  [/\bDECLARE\b/i, 'DECLARE'],
  [/\bSET\s+@/i, 'SET @variable'],
  // Bulk
  [/\bBULK\s+INSERT\b/i, 'BULK INSERT'],
  // Timing / DoS
  [/\bWAITFOR\b/i, 'WAITFOR'],
  // SELECT INTO (creates table)
  [/\bSELECT\b[\s\S]*?\bINTO\b\s+[#@\[\w]/i, 'SELECT INTO'],
  // Text operations
  [/\bWRITETEXT\b/i, 'WRITETEXT'],
  [/\bUPDATETEXT\b/i, 'UPDATETEXT'],
  [/\bREADTEXT\b/i, 'READTEXT'],
];

/** Functions that must never appear in the AST. */
const BLOCKED_FUNCTIONS = new Set([
  'openrowset',
  'openquery',
  'opendatasource',
]);

const BLOCKED_FUNCTION_PREFIXES = ['xp_', 'sp_execute'];

// ─── Main validator ──────────────────────────────────────────────────

export function validateSql(
  sql: string,
  options?: SqlValidatorOptions
): SqlValidationResult {
  const maxQueryLength = options?.maxQueryLength ?? DEFAULT_MAX_QUERY_LENGTH;
  const maxJoins = options?.maxJoins ?? DEFAULT_MAX_JOINS;
  const maxSubqueryDepth = options?.maxSubqueryDepth ?? DEFAULT_MAX_SUBQUERY_DEPTH;

  // ── Layer 1: Pre-parse fast rejection ────────────────────────────

  if (!sql || !sql.trim()) {
    return reject('Query is empty or whitespace-only');
  }

  if (sql.length > maxQueryLength) {
    return reject(`Query exceeds maximum length of ${maxQueryLength} characters (got ${sql.length})`);
  }

  if (sql.includes(';')) {
    return reject('Query contains semicolons — batch queries are not allowed');
  }

  // Null bytes and control characters (allow \t, \n, \r)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(sql)) {
    return reject('Query contains null bytes or control characters');
  }

  if (sql.includes('--')) {
    return reject('Query contains SQL comments (--) which are not allowed');
  }

  if (sql.includes('/*')) {
    return reject('Query contains block comments (/*) which are not allowed');
  }

  // Hex-encoded payloads: 0x followed by hex digits
  if (/0x[0-9a-fA-F]{2,}/i.test(sql)) {
    return reject('Query contains hex-encoded values (0x...) which are not allowed');
  }

  // ── Layer 2: Regex blocklist ─────────────────────────────────────

  for (const [pattern, label] of BLOCKED_KEYWORD_PATTERNS) {
    if (pattern.test(sql)) {
      return reject(`Query contains blocked keyword: ${label}`);
    }
  }

  // Block cross-database access (three-part names: db.schema.table)
  if (/\b\w+\.\w+\.\w+/i.test(sql)) {
    return { valid: false, reason: 'Cross-database access not allowed (three-part names detected)' };
  }

  // Block system reconnaissance functions
  const recon_pattern = /\b(DB_NAME|SUSER_SNAME|SUSER_NAME|IS_SRVROLEMEMBER|IS_MEMBER|SERVERPROPERTY|HOST_NAME|APP_NAME|ORIGINAL_LOGIN|CONNECTIONPROPERTY|HAS_PERMS_BY_NAME|OBJECT_ID|OBJECT_NAME|COL_NAME|SCHEMA_NAME|SCHEMA_ID|DATABASE_PRINCIPAL_ID|USER_NAME|USER_ID)\s*\(/i;
  if (recon_pattern.test(sql)) {
    return { valid: false, reason: 'System reconnaissance functions not allowed' };
  }

  // Block FOR XML / FOR JSON (data exfiltration)
  if (/\bFOR\s+(XML|JSON)\b/i.test(sql)) {
    return { valid: false, reason: 'FOR XML/JSON not allowed' };
  }

  // Block CROSS JOIN (can create cartesian products)
  const crossJoinCount = (sql.match(/\bCROSS\s+JOIN\b/gi) || []).length;
  if (crossJoinCount > 0) {
    return { valid: false, reason: 'CROSS JOIN not allowed (can create excessive result sets)' };
  }

  // ── Layer 3: AST parsing ─────────────────────────────────────────

  const parser = new Parser();
  let ast: AST | AST[];

  try {
    ast = parser.astify(sql, { database: 'TransactSQL' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return reject(`Query failed to parse: ${message}`);
  }

  // Must be a single statement
  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) {
    return reject(`Expected exactly 1 statement, found ${statements.length}`);
  }

  const stmt = statements[0];

  // Must be a SELECT
  if (!stmt.type || stmt.type.toLowerCase() !== 'select') {
    return reject(`Only SELECT statements are allowed, got: ${stmt.type}`);
  }

  // Extract tables
  const tables = extractTables(stmt);
  const tableNames = tables.map((t) => t.table);

  // Count JOINs
  const joinCount = countJoins(stmt);
  if (joinCount > maxJoins) {
    return reject(`Query has ${joinCount} JOINs, maximum allowed is ${maxJoins}`);
  }

  // Check subquery depth
  const depth = measureSubqueryDepth(stmt);
  if (depth > maxSubqueryDepth) {
    return reject(`Query has subquery nesting depth of ${depth}, maximum allowed is ${maxSubqueryDepth}`);
  }

  // Check for blocked functions in AST
  const blockedFunc = findBlockedFunctions(stmt);
  if (blockedFunc) {
    return reject(`Query contains blocked function: ${blockedFunc}`);
  }

  // ── Layer 4: Post-parse safety ───────────────────────────────────

  // Allowlist check
  if (options?.allowedTables && options.allowedTables.length > 0) {
    const allowedLower = new Set(options.allowedTables.map((t) => t.toLowerCase()));
    for (const ref of tables) {
      const tableLower = ref.table.toLowerCase();
      if (!allowedLower.has(tableLower)) {
        return reject(`Table "${ref.table}" is not in the allowed tables list`);
      }
    }
  }

  return {
    valid: true,
    tablesReferenced: [...new Set(tableNames)],
    queryType: 'select',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function reject(reason: string): SqlValidationResult {
  return { valid: false, reason };
}

interface TableRef {
  table: string;
  schema?: string;
}

/**
 * Recursively extract all table references from an AST node.
 */
function extractTables(node: any): TableRef[] {
  const results: TableRef[] = [];
  if (!node || typeof node !== 'object') return results;

  // node-sql-parser puts table refs in `from`, `table`, etc.
  if (Array.isArray(node)) {
    for (const item of node) {
      results.push(...extractTables(item));
    }
    return results;
  }

  // A `from` entry with a `table` field is a table reference
  if (node.table && typeof node.table === 'string') {
    results.push({
      table: node.table,
      schema: node.schema || node.db,
    });
  }

  // Recurse into all object values
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (val && typeof val === 'object') {
      results.push(...extractTables(val));
    }
  }

  return results;
}

/**
 * Count JOIN clauses by walking the AST.
 */
function countJoins(node: any): number {
  let count = 0;
  if (!node || typeof node !== 'object') return count;

  if (Array.isArray(node)) {
    for (const item of node) {
      count += countJoins(item);
    }
    return count;
  }

  // `from` array entries with `join` property indicate a JOIN
  if (node.join && typeof node.join === 'string') {
    count += 1;
  }

  for (const key of Object.keys(node)) {
    const val = node[key];
    if (val && typeof val === 'object') {
      count += countJoins(val);
    }
  }

  return count;
}

/**
 * Measure the maximum subquery nesting depth.
 */
function measureSubqueryDepth(node: any, currentDepth: number = 0): number {
  let maxDepth = currentDepth;
  if (!node || typeof node !== 'object') return maxDepth;

  if (Array.isArray(node)) {
    for (const item of node) {
      maxDepth = Math.max(maxDepth, measureSubqueryDepth(item, currentDepth));
    }
    return maxDepth;
  }

  // A nested SELECT is a subquery
  const isSubquery =
    node.type === 'select' && currentDepth > 0;

  // If this node has its own `from`, `where`, `columns` — it's a select-like structure
  // But we specifically look for `ast` property which wraps subqueries,
  // or nodes with type=select that aren't the root.
  let nextDepth = currentDepth;
  if (node.ast && typeof node.ast === 'object' && node.ast.type === 'select') {
    nextDepth = currentDepth + 1;
    maxDepth = Math.max(maxDepth, nextDepth);
    maxDepth = Math.max(maxDepth, measureSubqueryDepth(node.ast, nextDepth));
  }

  for (const key of Object.keys(node)) {
    if (key === 'ast') continue; // Already handled
    const val = node[key];
    if (val && typeof val === 'object') {
      maxDepth = Math.max(maxDepth, measureSubqueryDepth(val, nextDepth));
    }
  }

  return maxDepth;
}

/**
 * Walk the AST looking for blocked function calls.
 * Returns the name of the first blocked function found, or null.
 */
function findBlockedFunctions(node: any): string | null {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findBlockedFunctions(item);
      if (found) return found;
    }
    return null;
  }

  // Check function nodes
  if (node.type === 'function' || node.type === 'aggr_func') {
    const name = (node.name?.name || node.name || '').toString().toLowerCase();
    if (BLOCKED_FUNCTIONS.has(name)) {
      return name;
    }
    for (const prefix of BLOCKED_FUNCTION_PREFIXES) {
      if (name.startsWith(prefix)) {
        return name;
      }
    }
  }

  for (const key of Object.keys(node)) {
    const val = node[key];
    if (val && typeof val === 'object') {
      const found = findBlockedFunctions(val);
      if (found) return found;
    }
  }

  return null;
}
