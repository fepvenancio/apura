import type { SchemaCategory } from '@apura/shared';
import { CACHE_TTL_SCHEMA } from '@apura/shared';
import type { FewShotExample } from '../types';
import { validateSql } from '../validation/sql-validator';

/**
 * ExampleSelector — selects the most relevant few-shot examples for a query.
 *
 * Strategy:
 *   1. Load examples from KV cache or D1 few_shot_examples table
 *   2. Filter by category match
 *   3. Score by keyword overlap with the natural language query
 *   4. Return top N (default 5)
 */
export class ExampleSelector {
  constructor(
    private db: D1Database,
    private cache: KVNamespace,
  ) {}

  /**
   * Select the most relevant few-shot examples for a given query.
   */
  async selectExamples(
    naturalLanguage: string,
    categories: SchemaCategory[],
    orgId: string,
    maxExamples: number = 5,
  ): Promise<FewShotExample[]> {
    // 1. Load all examples (from cache or D1)
    const allExamples = await this.loadExamples(orgId);

    if (allExamples.length === 0) {
      return [];
    }

    // 2. Filter by category match
    const categorySet = new Set<string>(categories);
    const categoryMatches = allExamples.filter((ex) =>
      categorySet.has(ex.category),
    );

    // If no category matches, use all examples as candidates
    const candidates = categoryMatches.length > 0 ? categoryMatches : allExamples;

    // 3. Score by keyword overlap
    const inputWords = extractWords(naturalLanguage);
    const scored = candidates.map((example) => {
      const exampleWords = extractWords(
        example.naturalLanguagePt + ' ' + (example.naturalLanguageEn ?? ''),
      );
      const overlap = computeWordOverlap(inputWords, exampleWords);
      // Bonus for exact category match
      const categoryBonus = categorySet.has(example.category) ? 0.5 : 0;
      return { example, score: overlap + categoryBonus };
    });

    // 4. Sort by score descending and take top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxExamples).map((s) => s.example);
  }

  // ─── Private helpers ────────────────────────────────────────────────

  private async loadExamples(orgId: string): Promise<FewShotExample[]> {
    const cacheKey = `examples:${orgId}:all`;

    const cached = await this.cache.get(cacheKey, 'json');
    if (cached) {
      return cached as FewShotExample[];
    }

    // Try org-specific examples
    let result = await this.db
      .prepare(
        `SELECT category, natural_language_pt, natural_language_en, sql_query, tables_used
         FROM few_shot_examples
         WHERE org_id = ?
         ORDER BY category`,
      )
      .bind(orgId)
      .all<{
        category: string;
        natural_language_pt: string;
        natural_language_en: string | null;
        sql_query: string;
        tables_used: string;
      }>();

    // Fall back to master examples
    if (!result.results || result.results.length === 0) {
      result = await this.db
        .prepare(
          `SELECT category, natural_language_pt, natural_language_en, sql_query, tables_used
           FROM few_shot_examples
           WHERE org_id = 'master'
           ORDER BY category`,
        )
        .all<{
          category: string;
          natural_language_pt: string;
          natural_language_en: string | null;
          sql_query: string;
          tables_used: string;
        }>();
    }

    const rawExamples: FewShotExample[] = (result.results ?? []).map((r) => ({
      category: r.category as SchemaCategory,
      naturalLanguagePt: r.natural_language_pt,
      naturalLanguageEn: r.natural_language_en ?? undefined,
      sql: r.sql_query,
      tablesUsed: r.tables_used
        ? r.tables_used.split(',').map((t) => t.trim())
        : [],
    }));

    // Validate each example's SQL before including in prompt (prevent few-shot poisoning)
    const examples = rawExamples.filter(ex => {
      const result = validateSql(ex.sql);
      return result.valid;
    });

    // Cache for 1 hour
    await this.cache.put(cacheKey, JSON.stringify(examples), {
      expirationTtl: CACHE_TTL_SCHEMA,
    });

    return examples;
  }
}

// ─── Utility functions ──────────────────────────────────────────────────

/** Extract lowercase words from text, removing punctuation and short words. */
function extractWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2); // skip very short words

  return new Set(words);
}

/** Compute the number of overlapping words between two sets. */
function computeWordOverlap(a: Set<string>, b: Set<string>): number {
  let overlap = 0;
  for (const word of a) {
    if (b.has(word)) {
      overlap += 1;
    }
  }
  return overlap;
}
