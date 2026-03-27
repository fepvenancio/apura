import type { TableContext, FewShotExample } from './types';

/**
 * PromptBuilder — constructs the system and user prompts for Claude API calls.
 *
 * This is the core of AI quality. The system prompt contains strict rules for
 * safe, idiomatic T-SQL generation against Primavera ERP databases.
 */

const SYSTEM_PROMPT = `You are an expert SQL Server analyst for Primavera ERP databases. You convert natural language questions into precise T-SQL queries.

CRITICAL RULES:
1. Generate ONLY SELECT statements. NEVER INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or any DDL/DML.
2. Do NOT use table hints like WITH (NOLOCK). Write plain SELECT queries without hints.
3. Always use TOP 1000 unless the query uses aggregation (GROUP BY) — in that case, still use TOP 1000 on the outer query if results could exceed 1000 rows.
4. Use Portuguese column aliases that match the user's question language.
5. Always qualify column names with table aliases when joining multiple tables.
6. Handle NULLs with ISNULL() or COALESCE().
7. For date filtering, use DATEADD(), DATEDIFF(), GETDATE(), YEAR(), MONTH().
8. For sales documents, always JOIN CabecDocStatus and filter WHERE Anulado = 0 (exclude voided).
9. For sales totals, filter TipoDoc IN ('FA', 'VD') unless asked about specific document types.
10. For purchase totals, filter TipoDoc = 'VFA' unless asked about specific types.
11. In accounting, Natureza = 'D' is Debit, 'C' is Credit. Revenue accounts start with '7', expense with '6'.
12. Format currency values with 2 decimal places using CAST(... AS DECIMAL(18,2)).
13. Always ORDER BY the most logical column (dates DESC, totals DESC, names ASC).

RESPONSE FORMAT:
Return ONLY a valid JSON object with exactly these keys:
{"sql": "SELECT ...", "explanation": "Plain language explanation in the same language as the question"}

Do not include markdown, code fences, or any text outside the JSON.`;

/**
 * Build the system prompt for Claude API.
 */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Build the user prompt with schema context, few-shot examples, and the question.
 */
export function buildUserPrompt(
  naturalLanguage: string,
  tables: TableContext[],
  examples: FewShotExample[],
  documentTypes?: Record<string, string>,
): string {
  const parts: string[] = [];

  // Database schema section
  parts.push('DATABASE SCHEMA:');
  for (const table of tables) {
    parts.push(`\nTABLE: ${table.tableName} -- ${table.description}`);
    for (const col of table.columns) {
      parts.push(`  ${col.name} ${col.type} -- ${col.description}`);
    }
    if (table.commonJoins && table.commonJoins.length > 0) {
      parts.push(`  JOINs: ${table.commonJoins.join(', ')}`);
    }
  }

  // Document types section (if provided)
  if (documentTypes && Object.keys(documentTypes).length > 0) {
    parts.push('\nDOCUMENT TYPES:');
    for (const [code, description] of Object.entries(documentTypes)) {
      parts.push(`  ${code}: ${description}`);
    }
  }

  // Few-shot examples section
  if (examples.length > 0) {
    parts.push('\nEXAMPLES:');
    for (const example of examples) {
      parts.push(`Q: ${example.naturalLanguagePt}`);
      parts.push(`SQL: ${example.sql}`);
      parts.push('');
    }
  }

  // The actual question
  parts.push(`QUESTION: ${naturalLanguage}`);

  return parts.join('\n');
}
