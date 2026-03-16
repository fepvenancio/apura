import type { SchemaCategory } from '@apura/shared';

export interface Env {
  CLAUDE_API_KEY: string;
  AI_MODEL_DEFAULT: string;
  AI_MODEL_BUDGET: string;
  CACHE: KVNamespace;
  DB: D1Database;
}

export interface GenerateSqlRequest {
  naturalLanguage: string;
  orgId: string;
  schemaContext?: SchemaContext;
  model?: 'haiku' | 'sonnet';
}

export interface GenerateSqlResponse {
  sql: string;
  explanation: string;
  tablesUsed: string[];
  model: string;
  tokensUsed: { input: number; output: number };
}

export interface SchemaContext {
  tables: TableContext[];
  fewShotExamples: FewShotExample[];
}

export interface TableContext {
  tableName: string;
  description: string;
  columns: { name: string; type: string; description: string }[];
  commonJoins?: string[];
}

export interface FewShotExample {
  category: SchemaCategory;
  naturalLanguagePt: string;
  naturalLanguageEn?: string;
  sql: string;
  tablesUsed: string[];
}
