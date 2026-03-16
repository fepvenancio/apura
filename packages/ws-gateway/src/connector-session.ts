import type { Env } from './types';

const CACHE_TTL_CONNECTOR_STATUS = 30;

interface PendingQuery {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class ConnectorSession implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private agentSocket: WebSocket | null = null;
  private pendingQueries: Map<string, PendingQuery> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Restore agent socket on wake
    const sockets = this.state.getWebSockets('agent');
    if (sockets.length > 0) {
      this.agentSocket = sockets[0];
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/agent/connect':
          return this.handleAgentConnect(request);
        case '/query/execute':
          return this.handleQueryExecute(request);
        case '/status':
          return this.handleStatus();
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (err: any) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  private handleAgentConnect(request: Request): Response {
    const orgId = request.headers.get('X-Org-Id') ?? 'unknown';
    const version = request.headers.get('X-Connector-Version') ?? 'unknown';

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Close existing connection if any
    if (this.agentSocket) {
      try { this.agentSocket.close(1000, 'Replaced by new connection'); } catch {}
    }

    // Accept with hibernation tag
    this.state.acceptWebSocket(server, ['agent']);
    this.agentSocket = server;

    // Store state async (don't block the response)
    this.state.storage.put('status', 'connected');
    this.state.storage.put('orgId', orgId);
    this.state.storage.put('connectedAt', new Date().toISOString());
    this.state.storage.put('agentVersion', version);

    // Update KV
    this.env.CACHE.put(
      `connector:${orgId}:status`,
      JSON.stringify({ status: 'connected', agentVersion: version }),
      { expirationTtl: CACHE_TTL_CONNECTOR_STATUS }
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleQueryExecute(request: Request): Promise<Response> {
    if (!this.agentSocket || this.agentSocket.readyState !== WebSocket.READY_STATE_OPEN) {
      return Response.json({ error: 'Agent not connected' }, { status: 503 });
    }

    const { queryId, sql, timeoutMs } = await request.json<{
      queryId: string;
      sql: string;
      timeoutMs?: number;
    }>();

    // Basic safety check — only SELECT/WITH allowed
    const sqlUpper = sql.trim().toUpperCase();
    if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
      return Response.json({ error: 'Only SELECT queries allowed' }, { status: 400 });
    }
    if (sql.includes(';')) {
      return Response.json({ error: 'Batch queries not allowed' }, { status: 400 });
    }

    // Limit concurrent pending queries
    if (this.pendingQueries.size >= 50) {
      return Response.json({ error: 'Too many pending queries' }, { status: 429 });
    }

    const timeout = timeoutMs ?? 30000;

    return new Promise<Response>((resolveResponse) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        resolveResponse(Response.json({ error: 'Query timeout' }, { status: 504 }));
      }, timeout);

      this.pendingQueries.set(queryId, {
        resolve: (data: any) => {
          clearTimeout(timer);
          resolveResponse(Response.json(data));
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          resolveResponse(Response.json({ error: err.message }, { status: 422 }));
        },
        timeout: timer,
      });

      // Send query to the connector
      this.agentSocket!.send(JSON.stringify({
        v: 1,
        id: queryId,
        type: 'query.execute',
        ts: new Date().toISOString(),
        payload: { sql, timeout_seconds: Math.ceil(timeout / 1000), max_rows: 10000 },
      }));
    });
  }

  private async handleStatus(): Promise<Response> {
    const status = await this.state.storage.get('status') ?? 'disconnected';
    const connectedAt = await this.state.storage.get('connectedAt');
    const agentVersion = await this.state.storage.get('agentVersion');

    return Response.json({
      status,
      connectedAt,
      agentVersion,
      activeQueries: this.pendingQueries.size,
    });
  }

  // Hibernatable WebSocket handlers
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    try {
      const msg = JSON.parse(message) as { id: string; type: string; payload: any };

      switch (msg.type) {
        case 'query.result': {
          const pending = this.pendingQueries.get(msg.id);
          if (pending) {
            this.pendingQueries.delete(msg.id);
            pending.resolve(msg.payload);
          }
          break;
        }
        case 'error': {
          const pending = this.pendingQueries.get(msg.id);
          if (pending) {
            this.pendingQueries.delete(msg.id);
            pending.reject(new Error(msg.payload?.message ?? 'Unknown error'));
          }
          break;
        }
        case 'health.pong': {
          await this.state.storage.put('lastHeartbeat', new Date().toISOString());
          const orgId = await this.state.storage.get('orgId') ?? '';
          if (orgId) {
            await this.env.CACHE.put(
              `connector:${orgId}:status`,
              JSON.stringify({ status: 'connected', lastHeartbeat: new Date().toISOString() }),
              { expirationTtl: CACHE_TTL_CONNECTOR_STATUS }
            );
          }
          break;
        }
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.agentSocket = null;
    await this.state.storage.put('status', 'disconnected');

    const orgId = await this.state.storage.get('orgId') ?? '';
    if (orgId) {
      await this.env.CACHE.put(
        `connector:${orgId as string}:status`,
        JSON.stringify({ status: 'disconnected' }),
        { expirationTtl: CACHE_TTL_CONNECTOR_STATUS }
      );
    }

    // Reject all pending queries
    for (const [id, pending] of this.pendingQueries) {
      pending.reject(new Error('Agent disconnected'));
    }
    this.pendingQueries.clear();
  }

  async webSocketError(ws: WebSocket, error: Event): Promise<void> {
    console.error('WebSocket error:', error);
    this.agentSocket = null;
    await this.state.storage.put('status', 'error');

    // Reject all pending queries
    for (const [id, pending] of this.pendingQueries) {
      pending.reject(new Error('Agent connection error'));
    }
    this.pendingQueries.clear();
  }
}
