import type { ColumnInfo } from './query';

/** Connection state of an on-premises connector agent. */
export type ConnectorStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// ---------------------------------------------------------------------------
// Protocol envelope
// ---------------------------------------------------------------------------

/** Top-level WebSocket message envelope (protocol v1). */
export interface ConnectorMessage {
  /** Protocol version. */
  v: 1;
  /** Unique message ID (UUID). */
  id: string;
  /** Message type (discriminator). */
  type: string;
  /** ISO-8601 timestamp. */
  ts: string;
  /** Type-specific payload. */
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Cloud -> Connector message types
// ---------------------------------------------------------------------------

/** Message types the cloud can send to a connector. */
export type CloudToConnectorType =
  | 'query.execute'
  | 'health.ping'
  | 'query.cancel'
  | 'schema.discover'
  | 'key.rotate';

/** Payload for `query.execute` messages. */
export interface QueryExecutePayload {
  /** The SQL statement to execute. */
  sql: string;
  /** Maximum execution time in seconds. */
  timeoutSeconds: number;
  /** Maximum rows to return. */
  maxRows: number;
}

/** Payload for `query.cancel` messages. */
export interface QueryCancelPayload {
  /** ID of the query to cancel. */
  queryId: string;
}

/** Payload for `key.rotate` messages. */
export interface KeyRotatePayload {
  /** The new API key the connector should use. */
  newKey: string;
}

/** Discriminated union of all cloud-to-connector messages. */
export type CloudToConnectorMessage =
  | { v: 1; id: string; type: 'query.execute'; ts: string; payload: QueryExecutePayload }
  | { v: 1; id: string; type: 'health.ping'; ts: string; payload: Record<string, never> }
  | { v: 1; id: string; type: 'query.cancel'; ts: string; payload: QueryCancelPayload }
  | { v: 1; id: string; type: 'schema.discover'; ts: string; payload: Record<string, never> }
  | { v: 1; id: string; type: 'key.rotate'; ts: string; payload: KeyRotatePayload };

// ---------------------------------------------------------------------------
// Connector -> Cloud message types
// ---------------------------------------------------------------------------

/** Message types a connector can send to the cloud. */
export type ConnectorToCloudType =
  | 'query.result'
  | 'query.result.start'
  | 'query.result.end'
  | 'error'
  | 'health.pong'
  | 'schema.discover.result';

/** Payload for `query.result` messages. */
export interface QueryResultPayload {
  status: 'ok';
  columns: ColumnInfo[];
  rowCount: number;
  executionMs: number;
  data: unknown;
}

/** Payload for `query.result.start` messages (streaming). */
export interface QueryResultStartPayload {
  columns: ColumnInfo[];
}

/** Payload for `query.result.end` messages (streaming). */
export interface QueryResultEndPayload {
  rowCount: number;
  executionMs: number;
}

/** Payload for `health.pong` messages. */
export interface HealthPongPayload {
  /** Connector uptime in seconds. */
  uptimeSeconds: number;
  /** Whether the SQL Server connection is healthy. */
  sqlServerConnected: boolean;
  /** Number of queries currently executing. */
  activeQueries: number;
  /** Connector process memory usage in MB. */
  memoryMb: number;
  /** Connector software version. */
  version: string;
}

/** Payload for `error` messages. */
export interface ErrorPayload {
  /** Machine-readable error code. */
  code: string;
  /** Human-readable error message. */
  message: string;
}

/** Payload for `schema.discover.result` messages. */
export interface SchemaDiscoverResultPayload {
  tables: unknown[];
}

/** Discriminated union of all connector-to-cloud messages. */
export type ConnectorToCloudMessage =
  | { v: 1; id: string; type: 'query.result'; ts: string; payload: QueryResultPayload }
  | { v: 1; id: string; type: 'query.result.start'; ts: string; payload: QueryResultStartPayload }
  | { v: 1; id: string; type: 'query.result.end'; ts: string; payload: QueryResultEndPayload }
  | { v: 1; id: string; type: 'error'; ts: string; payload: ErrorPayload }
  | { v: 1; id: string; type: 'health.pong'; ts: string; payload: HealthPongPayload }
  | { v: 1; id: string; type: 'schema.discover.result'; ts: string; payload: SchemaDiscoverResultPayload };
