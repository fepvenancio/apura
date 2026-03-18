/** Lifecycle status of a natural-language query. */
export type QueryStatus =
  | 'pending'
  | 'generating'
  | 'validating'
  | 'executing'
  | 'completed'
  | 'error'
  | 'cancelled';

/** POST /queries request body. */
export interface QueryRequest {
  /** The user's question in natural language. */
  naturalLanguage: string;
  /** Optional execution hints. */
  options?: {
    /** Maximum rows to return (capped by server). */
    maxRows?: number;
    /** Query timeout in seconds (capped by server). */
    timeoutSeconds?: number;
  };
}

/** Metadata about a single result column. */
export interface ColumnInfo {
  /** Column name as returned by SQL Server. */
  name: string;
  /** SQL data type (e.g. "nvarchar", "int", "datetime"). */
  type: string;
  /** Optional human-readable description. */
  description?: string;
}

/** Full result of a completed query. */
export interface QueryResult {
  queryId: string;
  sql: string;
  explanation: string;
  columns: ColumnInfo[];
  rows: unknown[][];
  rowCount: number;
  executionTimeMs: number;
  status: QueryStatus;
  error?: string;
}

/** Saved query record as stored in D1. */
export interface SavedQuery {
  id: string;
  org_id: string;
  user_id: string;
  natural_language: string;
  generated_sql: string;
  explanation: string;
  status: QueryStatus;
  row_count: number | null;
  execution_time_ms: number | null;
  error_message: string | null;
  /** JSON-serialized result preview (columns + rows). */
  result_preview: string | null;
  cached: boolean;
  created_at: string;
  updated_at: string;
}
