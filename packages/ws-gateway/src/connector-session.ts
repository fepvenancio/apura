import type { Env } from './types';
import type {
  ConnectorMessage,
  ConnectorToCloudMessage,
  CloudToConnectorMessage,
  QueryResultPayload,
  QueryResultStartPayload,
  QueryResultEndPayload,
  HealthPongPayload,
  ErrorPayload,
  SchemaDiscoverResultPayload,
  ColumnInfo,
} from '@apura/shared';
import {
  PROTOCOL_VERSION,
  QUERY_TIMEOUT_DEFAULT,
  MAX_ROWS_DEFAULT,
  CACHE_TTL_CONNECTOR_STATUS,
} from '@apura/shared';
import { validateAgentApiKey } from './auth/agent-auth';

/** Threshold in ms after which a connection is considered stale. */
const HEARTBEAT_STALE_MS = 90_000;

interface PendingQuery {
  resolve: (data: QueryResultPayload) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface StreamingState {
  columns: ColumnInfo[];
  chunks: unknown[];
}

export class ConnectorSession implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private agentSocket: WebSocket | null = null;
  private pendingQueries: Map<string, PendingQuery> = new Map();
  private streamingQueries: Map<string, StreamingState> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Restore the agent socket on wake if one was hibernated
    this.state.getWebSockets('agent').forEach((ws) => {
      this.agentSocket = ws;
    });
  }

  // ---------------------------------------------------------------------------
  // HTTP router (called via DO stub)
  // ---------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/agent/connect':
        return this.handleAgentConnect(request);
      case '/query/execute':
        return this.handleQueryExecute(request);
      case '/status':
        return this.handleStatus();
      case '/schema/sync':
        return this.handleSchemaSync();
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  // ---------------------------------------------------------------------------
  // /agent/connect — WebSocket upgrade for the .NET connector
  // ---------------------------------------------------------------------------

  private async handleAgentConnect(request: Request): Promise<Response> {
    // Must be a WebSocket upgrade request
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Validate the agent API key from the Authorization header
    const authHeader = request.headers.get('Authorization') ?? '';
    const apiKey = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!apiKey) {
      return new Response('Missing Authorization header', { status: 401 });
    }

    const { valid, orgId } = await validateAgentApiKey(apiKey, this.env.DB);
    if (!valid || !orgId) {
      return new Response('Invalid API key', { status: 401 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the server-side socket with hibernation tag
    this.state.acceptWebSocket(server, ['agent']);
    this.agentSocket = server;

    // Extract agent version from header (optional)
    const agentVersion = request.headers.get('X-Agent-Version') ?? 'unknown';

    // Store connection state
    await this.state.storage.put({
      status: 'connected',
      connectedAt: new Date().toISOString(),
      agentVersion,
      orgId,
      lastHeartbeat: new Date().toISOString(),
    });

    // Update KV with connector status (30s TTL for fast polling)
    await this.env.CACHE.put(
      `connector:${orgId}:status`,
      JSON.stringify({
        status: 'connected',
        connectedAt: new Date().toISOString(),
        agentVersion,
      }),
      { expirationTtl: CACHE_TTL_CONNECTOR_STATUS }
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------------------------------------------------------------------------
  // /query/execute — Called by the API gateway via DO stub
  // ---------------------------------------------------------------------------

  private async handleQueryExecute(request: Request): Promise<Response> {
    const body = await request.json<{
      queryId: string;
      sql: string;
      timeoutMs?: number;
    }>();

    const { queryId, sql, timeoutMs } = body;

    // Check if agent socket is connected
    if (!this.agentSocket) {
      return Response.json(
        { error: 'Connector not connected', code: 'CONNECTOR_OFFLINE' },
        { status: 503 }
      );
    }

    const timeoutSeconds = Math.ceil((timeoutMs ?? QUERY_TIMEOUT_DEFAULT * 1000) / 1000);

    // Build the protocol message
    const message: CloudToConnectorMessage = {
      v: PROTOCOL_VERSION as 1,
      id: queryId,
      type: 'query.execute',
      ts: new Date().toISOString(),
      payload: {
        sql,
        timeoutSeconds,
        maxRows: MAX_ROWS_DEFAULT,
      },
    };

    // Create a promise that resolves when the connector responds
    const resultPromise = new Promise<QueryResultPayload>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error('Query execution timed out'));
      }, timeoutMs ?? QUERY_TIMEOUT_DEFAULT * 1000);

      this.pendingQueries.set(queryId, { resolve, reject, timeout });
    });

    // Send the query to the connector via WebSocket
    try {
      this.agentSocket.send(JSON.stringify(message));
    } catch (err) {
      this.pendingQueries.get(queryId)?.timeout &&
        clearTimeout(this.pendingQueries.get(queryId)!.timeout);
      this.pendingQueries.delete(queryId);
      return Response.json(
        { error: 'Failed to send query to connector', code: 'WS_SEND_FAILED' },
        { status: 502 }
      );
    }

    // Wait for the connector's response
    try {
      const result = await resultPromise;
      return Response.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return Response.json(
        { error: message, code: 'QUERY_FAILED' },
        { status: 500 }
      );
    }
  }

  // ---------------------------------------------------------------------------
  // /status — Returns connection status
  // ---------------------------------------------------------------------------

  private async handleStatus(): Promise<Response> {
    const status = (await this.state.storage.get<string>('status')) ?? 'disconnected';
    const lastHeartbeat = await this.state.storage.get<string>('lastHeartbeat');
    const agentVersion = await this.state.storage.get<string>('agentVersion');
    const connectedAt = await this.state.storage.get<string>('connectedAt');

    // Check if connection is stale
    let effectiveStatus = status;
    if (
      status === 'connected' &&
      lastHeartbeat &&
      Date.now() - new Date(lastHeartbeat).getTime() > HEARTBEAT_STALE_MS
    ) {
      effectiveStatus = 'stale';
    }

    return Response.json({
      status: effectiveStatus,
      connectedAt: connectedAt ?? null,
      lastHeartbeat: lastHeartbeat ?? null,
      agentVersion: agentVersion ?? null,
      activeQueries: this.pendingQueries.size,
    });
  }

  // ---------------------------------------------------------------------------
  // /schema/sync — Trigger schema discovery
  // ---------------------------------------------------------------------------

  private async handleSchemaSync(): Promise<Response> {
    if (!this.agentSocket) {
      return Response.json(
        { error: 'Connector not connected', code: 'CONNECTOR_OFFLINE' },
        { status: 503 }
      );
    }

    const messageId = crypto.randomUUID();

    const message: CloudToConnectorMessage = {
      v: PROTOCOL_VERSION as 1,
      id: messageId,
      type: 'schema.discover',
      ts: new Date().toISOString(),
      payload: {},
    };

    // Create promise for schema response
    const schemaPromise = new Promise<SchemaDiscoverResultPayload>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingQueries.delete(messageId);
        reject(new Error('Schema discovery timed out'));
      }, 60_000); // 60s timeout for schema discovery

      this.pendingQueries.set(messageId, {
        resolve: resolve as (data: any) => void,
        reject,
        timeout,
      });
    });

    try {
      this.agentSocket.send(JSON.stringify(message));
    } catch {
      this.pendingQueries.delete(messageId);
      return Response.json(
        { error: 'Failed to send schema request', code: 'WS_SEND_FAILED' },
        { status: 502 }
      );
    }

    try {
      const schemaResult = await schemaPromise;
      const orgId = await this.state.storage.get<string>('orgId');

      // Upsert schema data into D1
      if (orgId && schemaResult.tables) {
        await this.upsertSchema(orgId, schemaResult.tables);
        // Invalidate schema cache
        await this.env.CACHE.delete(`schema:${orgId}:tables`);
        await this.env.CACHE.delete(`schema:${orgId}:columns`);
      }

      return Response.json({
        ok: true,
        tablesDiscovered: schemaResult.tables?.length ?? 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return Response.json(
        { error: message, code: 'SCHEMA_SYNC_FAILED' },
        { status: 500 }
      );
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket event handlers (Cloudflare Hibernatable WebSocket API)
  // ---------------------------------------------------------------------------

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);

    let parsed: ConnectorToCloudMessage;
    try {
      parsed = JSON.parse(raw) as ConnectorToCloudMessage;
    } catch {
      console.error('Failed to parse WebSocket message:', raw.slice(0, 200));
      return;
    }

    switch (parsed.type) {
      case 'query.result':
        this.resolveQuery(parsed.id, parsed.payload);
        break;

      case 'query.result.start':
        this.streamingQueries.set(parsed.id, {
          columns: (parsed.payload as QueryResultStartPayload).columns,
          chunks: [],
        });
        break;

      case 'query.result.end': {
        const stream = this.streamingQueries.get(parsed.id);
        if (stream) {
          const endPayload = parsed.payload as QueryResultEndPayload;
          this.resolveQuery(parsed.id, {
            status: 'ok',
            columns: stream.columns,
            rowCount: endPayload.rowCount,
            executionMs: endPayload.executionMs,
            data: stream.chunks,
          });
          this.streamingQueries.delete(parsed.id);
        }
        break;
      }

      case 'error': {
        const errorPayload = parsed.payload as ErrorPayload;
        const pending = this.pendingQueries.get(parsed.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.reject(
            new Error(`${errorPayload.code}: ${errorPayload.message}`)
          );
          this.pendingQueries.delete(parsed.id);
        }
        break;
      }

      case 'health.pong': {
        const pong = parsed.payload as HealthPongPayload;
        const now = new Date().toISOString();
        await this.state.storage.put({
          lastHeartbeat: now,
          agentVersion: pong.version,
        });
        // Update KV
        const orgId = await this.state.storage.get<string>('orgId');
        if (orgId) {
          await this.env.CACHE.put(
            `connector:${orgId}:status`,
            JSON.stringify({
              status: 'connected',
              lastHeartbeat: now,
              agentVersion: pong.version,
              activeQueries: pong.activeQueries,
              sqlServerConnected: pong.sqlServerConnected,
            }),
            { expirationTtl: CACHE_TTL_CONNECTOR_STATUS }
          );
        }
        break;
      }

      case 'schema.discover.result': {
        // Resolve as a pending "query" (schema sync reuses pendingQueries)
        this.resolveQuery(parsed.id, parsed.payload as any);
        break;
      }

      default:
        console.warn('Unknown message type:', (parsed as ConnectorMessage).type);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    console.log(
      `WebSocket closed: code=${code}, reason=${reason}, clean=${wasClean}`
    );
    await this.handleDisconnect();
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    await this.handleDisconnect();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private resolveQuery(messageId: string, data: any): void {
    const pending = this.pendingQueries.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(data);
      this.pendingQueries.delete(messageId);
    }
  }

  private async handleDisconnect(): Promise<void> {
    this.agentSocket = null;

    // Update storage
    await this.state.storage.put('status', 'disconnected');

    // Update KV
    const orgId = await this.state.storage.get<string>('orgId');
    if (orgId) {
      await this.env.CACHE.put(
        `connector:${orgId}:status`,
        JSON.stringify({ status: 'disconnected' }),
        { expirationTtl: CACHE_TTL_CONNECTOR_STATUS }
      );
    }

    // Reject all pending queries
    for (const [queryId, pending] of this.pendingQueries) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Agent disconnected'));
    }
    this.pendingQueries.clear();
    this.streamingQueries.clear();
  }

  private async upsertSchema(orgId: string, tables: unknown[]): Promise<void> {
    const db = this.env.DB;

    for (const table of tables as Array<{
      tableName: string;
      description?: string;
      descriptionPt?: string;
      category?: string;
      columns?: Array<{
        name: string;
        type: string;
        isPrimaryKey?: boolean;
        isForeignKey?: boolean;
        fkReferences?: string;
        description?: string;
        descriptionPt?: string;
      }>;
      rowCountApprox?: number;
    }>) {
      // Upsert table
      await db
        .prepare(
          `INSERT INTO schema_tables (id, org_id, table_name, description, description_pt, category, row_count_approx, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT (org_id, table_name) DO UPDATE SET
             description = excluded.description,
             description_pt = excluded.description_pt,
             category = excluded.category,
             row_count_approx = excluded.row_count_approx,
             updated_at = datetime('now')`
        )
        .bind(
          crypto.randomUUID(),
          orgId,
          table.tableName,
          table.description ?? '',
          table.descriptionPt ?? '',
          table.category ?? 'geral',
          table.rowCountApprox ?? 0
        )
        .run();

      // Upsert columns
      if (table.columns) {
        for (const col of table.columns) {
          await db
            .prepare(
              `INSERT INTO schema_columns (id, org_id, table_name, column_name, data_type, is_primary_key, is_foreign_key, fk_references, description, description_pt, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT (org_id, table_name, column_name) DO UPDATE SET
                 data_type = excluded.data_type,
                 is_primary_key = excluded.is_primary_key,
                 is_foreign_key = excluded.is_foreign_key,
                 fk_references = excluded.fk_references,
                 description = excluded.description,
                 description_pt = excluded.description_pt,
                 updated_at = datetime('now')`
            )
            .bind(
              crypto.randomUUID(),
              orgId,
              table.tableName,
              col.name,
              col.type,
              col.isPrimaryKey ? 1 : 0,
              col.isForeignKey ? 1 : 0,
              col.fkReferences ?? null,
              col.description ?? null,
              col.descriptionPt ?? null
            )
            .run();
        }
      }
    }
  }
}
