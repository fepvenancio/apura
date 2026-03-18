import type { UserRole } from '@apura/shared';

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  AI_ORCHESTRATOR: Fetcher;
  WS_GATEWAY: Fetcher;
  JWT_SECRET: string;
  INTERNAL_SECRET: string;
  REPORT_QUEUE: Queue;
  EMAIL_QUEUE: Queue;
  REPORTS_BUCKET: R2Bucket;
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET: string;
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
