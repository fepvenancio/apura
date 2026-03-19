import type { SchemaContext, TableContext, FewShotExample } from '../types';
import type { SchemaCategory } from '@apura/shared';
import { CACHE_TTL_SCHEMA } from '@apura/shared';

/**
 * SchemaLoader — loads and caches Primavera ERP schema context per org.
 *
 * Strategy:
 *   1. Check KV cache for the org's schema context
 *   2. On cache miss, load from D1 schema_tables + schema_columns
 *   3. If the org has no custom schema, fall back to master_schema from D1
 *   4. Cache the result in KV for 1 hour
 */
export class SchemaLoader {
  constructor(
    private db: D1Database,
    private cache: KVNamespace,
  ) {}

  /**
   * Get the full schema context for an organization.
   */
  async getSchemaContext(orgId: string): Promise<SchemaContext> {
    const cacheKey = `schema:${orgId}:context`;

    // 1. Check KV cache
    const cached = await this.cache.get(cacheKey, 'json');
    if (cached) {
      return cached as SchemaContext;
    }

    // 2. Load tables from D1
    const tables = await this.loadTablesFromD1(orgId);

    // 3. Load few-shot examples
    const fewShotExamples = await this.loadExamplesFromD1(orgId);

    const context: SchemaContext = { tables, fewShotExamples };

    // 4. Cache result for 1 hour
    await this.cache.put(cacheKey, JSON.stringify(context), {
      expirationTtl: CACHE_TTL_SCHEMA,
    });

    return context;
  }

  /**
   * Get tables filtered by a specific category.
   */
  async getTablesForCategory(
    orgId: string,
    category: string,
  ): Promise<TableContext[]> {
    const cacheKey = `schema:${orgId}:category:${category}`;

    const cached = await this.cache.get(cacheKey, 'json');
    if (cached) {
      return cached as TableContext[];
    }

    // Load tables for the given category from D1
    const tables = await this.loadTablesByCategoryFromD1(orgId, category);

    await this.cache.put(cacheKey, JSON.stringify(tables), {
      expirationTtl: CACHE_TTL_SCHEMA,
    });

    return tables;
  }

  /**
   * Get all schema categories available for an org.
   */
  async getAllCategories(orgId: string): Promise<string[]> {
    const cacheKey = `schema:${orgId}:categories`;

    const cached = await this.cache.get(cacheKey, 'json');
    if (cached) {
      return cached as string[];
    }

    // Try org-specific categories first
    let result = await this.db
      .prepare(
        `SELECT DISTINCT table_category FROM schema_tables WHERE org_id = ? ORDER BY table_category`,
      )
      .bind(orgId)
      .all<{ table_category: string }>();

    // Fall back to master schema if org has no custom schema
    if (!result.results || result.results.length === 0) {
      result = await this.db
        .prepare(
          `SELECT DISTINCT table_category FROM schema_tables WHERE org_id = 'master' ORDER BY table_category`,
        )
        .all<{ table_category: string }>();
    }

    const categories = (result.results ?? []).map((r) => r.table_category);

    await this.cache.put(cacheKey, JSON.stringify(categories), {
      expirationTtl: CACHE_TTL_SCHEMA,
    });

    return categories;
  }

  // ─── Private helpers ────────────────────────────────────────────────

  private async loadTablesFromD1(orgId: string): Promise<TableContext[]> {
    // Try org-specific schema first
    let tables = await this.queryTablesWithColumns(orgId);

    // Fall back to master schema if no org-specific tables found
    if (tables.length === 0) {
      tables = await this.queryTablesWithColumns('master');
    }

    return tables;
  }

  private async loadTablesByCategoryFromD1(
    orgId: string,
    category: string,
  ): Promise<TableContext[]> {
    let tables = await this.queryTablesWithColumns(orgId, category);

    if (tables.length === 0) {
      tables = await this.queryTablesWithColumns('master', category);
    }

    return tables;
  }

  private async queryTablesWithColumns(
    orgId: string,
    category?: string,
  ): Promise<TableContext[]> {
    // Load table metadata
    let tableQuery = `SELECT id, table_name, table_description, table_category FROM schema_tables WHERE org_id = ?`;
    const binds: unknown[] = [orgId];

    if (category) {
      tableQuery += ` AND table_category = ?`;
      binds.push(category);
    }

    tableQuery += ` ORDER BY table_name`;

    const stmt = this.db.prepare(tableQuery);
    const tableResult = await stmt.bind(...binds).all<{
      id: string;
      table_name: string;
      table_description: string | null;
      table_category: string | null;
    }>();

    if (!tableResult.results || tableResult.results.length === 0) {
      return [];
    }

    // Load columns for all tables in a single query
    const tableIds = tableResult.results.map((t) => t.id);
    const placeholders = tableIds.map(() => '?').join(',');

    const colResult = await this.db
      .prepare(
        `SELECT table_id, column_name, data_type, column_description
         FROM schema_columns
         WHERE table_id IN (${placeholders})
         ORDER BY table_id, column_name`,
      )
      .bind(...tableIds)
      .all<{
        table_id: string;
        column_name: string;
        data_type: string | null;
        column_description: string | null;
      }>();

    // Group columns by table_id
    const columnsByTable = new Map<
      string,
      { name: string; type: string; description: string }[]
    >();
    for (const col of colResult.results ?? []) {
      if (!columnsByTable.has(col.table_id)) {
        columnsByTable.set(col.table_id, []);
      }
      columnsByTable.get(col.table_id)!.push({
        name: col.column_name,
        type: col.data_type ?? 'unknown',
        description: col.column_description ?? '',
      });
    }

    // Assemble TableContext objects
    return tableResult.results.map((t) => ({
      tableName: t.table_name,
      description: t.table_description ?? '',
      columns: columnsByTable.get(t.id) ?? [],
    }));
  }

  private async loadExamplesFromD1(
    orgId: string,
  ): Promise<FewShotExample[]> {
    // Try org-specific examples first
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

    return (result.results ?? []).map((r) => ({
      category: r.category as SchemaCategory,
      naturalLanguagePt: r.natural_language_pt,
      naturalLanguageEn: r.natural_language_en ?? undefined,
      sql: r.sql_query,
      tablesUsed: r.tables_used ? r.tables_used.split(',').map((t) => t.trim()) : [],
    }));
  }
}
