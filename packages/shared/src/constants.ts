// ---------------------------------------------------------------------------
// SQL & query limits
// ---------------------------------------------------------------------------

/** Maximum allowed length of a generated SQL query (characters). */
export const MAX_QUERY_LENGTH = 4000;

/** Maximum allowed length of a natural-language input (characters). */
export const MAX_NATURAL_LANGUAGE_LENGTH = 1000;

/** Default maximum rows returned by a query. */
export const MAX_ROWS_DEFAULT = 1000;

/** Absolute upper limit on rows a query can return. */
export const MAX_ROWS_LIMIT = 10000;

/** Default query execution timeout in seconds. */
export const QUERY_TIMEOUT_DEFAULT = 30;

/** Maximum query execution timeout in seconds. */
export const QUERY_TIMEOUT_MAX = 120;

// ---------------------------------------------------------------------------
// Cache TTLs (seconds)
// ---------------------------------------------------------------------------

/** Cache TTL for query results (15 minutes). */
export const CACHE_TTL_QUERY_RESULT = 900;

/** Cache TTL for schema metadata (1 hour). */
export const CACHE_TTL_SCHEMA = 3600;

/** Cache TTL for user sessions (24 hours). */
export const CACHE_TTL_SESSION = 86400;

/** Cache TTL for connector status checks (30 seconds). */
export const CACHE_TTL_CONNECTOR_STATUS = 30;

// ---------------------------------------------------------------------------
// WebSocket configuration
// ---------------------------------------------------------------------------

/** Interval between WebSocket heartbeat pings (milliseconds). */
export const WS_HEARTBEAT_INTERVAL = 30000;

/** Initial delay before first reconnection attempt (milliseconds). */
export const WS_RECONNECT_INITIAL_DELAY = 1000;

/** Maximum delay between reconnection attempts (milliseconds). */
export const WS_RECONNECT_MAX_DELAY = 120000;

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

/** Current connector protocol version. */
export const PROTOCOL_VERSION = 1;
