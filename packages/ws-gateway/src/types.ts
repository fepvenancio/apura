export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  CONNECTOR: DurableObjectNamespace;
  INTERNAL_SECRET: string;
}
