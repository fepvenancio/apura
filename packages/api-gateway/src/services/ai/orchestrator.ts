import type { Env } from '../../types';
import type { GenerateSqlRequest, GenerateSqlResponse } from './types';
import { sanitizeNaturalLanguage, MAX_NATURAL_LANGUAGE_LENGTH } from '@apura/shared';
import { SchemaLoader } from './schema-loader';
import { ExampleSelector } from './example-selector';
import { classifyQuery } from './query-classifier';
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder';
import { ClaudeClient } from './claude-client';
import { validateSql } from './validation/sql-validator';
import { sanitizeSql } from './validation/sql-sanitizer';
import { TableAllowlist } from './validation/table-allowlist';

/** Maximum number of schema tables to include in prompt context. */
const MAX_CONTEXT_TABLES = 20;

/** Maximum number of few-shot examples to include in prompt. */
const MAX_EXAMPLES = 5;

/** Cache TTL for query results (15 minutes). */
const QUERY_CACHE_TTL = 900;

/**
 * QueryOrchestrator — the main orchestration pipeline.
 *
 * Flow:
 *   1. Sanitize input
 *   2. Check KV cache for identical query
 *   3. Classify query into schema categories
 *   4. Load relevant schema tables
 *   5. Select few-shot examples
 *   6. Build prompt
 *   7. Call Claude API
 *   8. Sanitize SQL response
 *   9. Validate SQL (AST parser)
 *  10. If validation fails, retry with error feedback
 *  11. Cache and return result
 */
export class QueryOrchestrator {
  private schemaLoader: SchemaLoader;
  private exampleSelector: ExampleSelector;
  private claudeClient: ClaudeClient;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.schemaLoader = new SchemaLoader(env.DB, env.CACHE);
    this.exampleSelector = new ExampleSelector(env.DB, env.CACHE);
    this.claudeClient = new ClaudeClient(env.CLAUDE_API_KEY);
  }

  async processQuery(request: GenerateSqlRequest): Promise<GenerateSqlResponse> {
    // 1. Sanitize input
    const sanitized = sanitizeNaturalLanguage(request.naturalLanguage);
    if (!sanitized || sanitized.length === 0) {
      throw new OrchestratorError('Query is empty after sanitization', 400);
    }
    if (sanitized.length > MAX_NATURAL_LANGUAGE_LENGTH) {
      throw new OrchestratorError(
        `Query exceeds maximum length of ${MAX_NATURAL_LANGUAGE_LENGTH} characters`,
        400,
      );
    }

    // 2. Check KV cache for identical query
    const cacheKey = `query:${request.orgId}:${await hashString(sanitized)}`;
    const cached = await this.env.CACHE.get(cacheKey, 'json');
    if (cached) {
      return cached as GenerateSqlResponse;
    }

    // 3. Classify query into categories
    const categories = classifyQuery(sanitized);

    // 4. Load relevant schema tables (max 15-20 tables)
    let tables = (
      await Promise.all(
        categories.map((cat) =>
          this.schemaLoader.getTablesForCategory(request.orgId, cat),
        ),
      )
    ).flat();

    // Deduplicate by table name
    const seen = new Set<string>();
    tables = tables.filter((t) => {
      if (seen.has(t.tableName)) return false;
      seen.add(t.tableName);
      return true;
    });

    // Limit context size
    if (tables.length > MAX_CONTEXT_TABLES) {
      tables = tables.slice(0, MAX_CONTEXT_TABLES);
    }

    // 5. Select few-shot examples
    const examples = await this.exampleSelector.selectExamples(
      sanitized,
      categories,
      request.orgId,
      MAX_EXAMPLES,
    );

    // 6. Build prompt
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(sanitized, tables, examples);

    // 7. Resolve model
    const modelKey =
      request.model === 'haiku' ? 'AI_MODEL_BUDGET' : 'AI_MODEL_DEFAULT';
    const model = this.env[modelKey];

    // 8. Call Claude API
    const aiResult = await this.claudeClient.generateSql(
      systemPrompt,
      userPrompt,
      model,
    );

    // 9. Sanitize SQL response
    let sql = sanitizeSql(aiResult.sql);

    // 10. Validate SQL (AST parser)
    const allowlist = TableAllowlist.getDefaultPrimaveraAllowlist();
    let validation = validateSql(sql, { allowedTables: allowlist });

    // 11. If validation fails, retry once with error feedback
    if (!validation.valid) {
      // Don't include raw validation errors in retry prompt (could contain injected content)
      const safeReason = 'The generated SQL was invalid. Please try a different approach.';
      const retryUserPrompt =
        userPrompt +
        `\n\nIMPORTANT: ${safeReason} ` +
        `Please fix the query and return valid JSON with "sql" and "explanation" keys.`;

      const retryResult = await this.claudeClient.generateSql(
        systemPrompt,
        retryUserPrompt,
        model,
      );

      sql = sanitizeSql(retryResult.sql);
      validation = validateSql(sql, { allowedTables: allowlist });

      if (!validation.valid) {
        throw new OrchestratorError(
          `Generated SQL failed validation after retry: ${validation.reason}`,
          422,
        );
      }

      // Use retry token counts
      aiResult.tokensUsed.input += retryResult.tokensUsed.input;
      aiResult.tokensUsed.output += retryResult.tokensUsed.output;
      aiResult.explanation = retryResult.explanation;
    }

    // 12. Build response
    const response: GenerateSqlResponse = {
      sql,
      explanation: aiResult.explanation,
      tablesUsed: validation.tablesReferenced ?? [],
      model,
      tokensUsed: aiResult.tokensUsed,
    };

    // 13. Cache the result
    await this.env.CACHE.put(cacheKey, JSON.stringify(response), {
      expirationTtl: QUERY_CACHE_TTL,
    });

    return response;
  }
}

/**
 * SHA-256 based hash for cache keys — collision-resistant replacement for djb2.
 */
async function hashString(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Custom error class with HTTP status code for the orchestrator.
 */
export class OrchestratorError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'OrchestratorError';
  }
}
