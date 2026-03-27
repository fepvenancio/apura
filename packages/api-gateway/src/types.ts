import type { UserRole } from '@apura/shared';

export interface Env {
  // D1
  DB: D1Database;
  // KV
  CACHE: KVNamespace;
  // Service bindings
  WS_GATEWAY: Fetcher;
  // Secrets
  JWT_SECRET: string;
  INTERNAL_SECRET: string;
  CLAUDE_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET: string;
  // Queues
  REPORT_QUEUE: Queue;
  EMAIL_QUEUE: Queue;
  // R2
  REPORTS_BUCKET: R2Bucket;
  // AI model vars
  AI_MODEL_DEFAULT: string;
  AI_MODEL_BUDGET: string;
}

/** User record as stored in D1. */
export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  mfa_enabled?: number;
  totp_secret?: string | null;
  created_at: string;
  updated_at: string;
}

/** Variables set on the Hono context by middleware. */
export interface AppVariables {
  userId: string;
  orgId: string;
  role: UserRole;
}
