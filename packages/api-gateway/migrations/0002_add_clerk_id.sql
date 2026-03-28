-- Migration: Add Clerk ID support
-- Local:      wrangler d1 execute <DB_NAME> --file=migrations/0002_add_clerk_id.sql
-- Production: wrangler d1 execute <DB_NAME> --file=migrations/0002_add_clerk_id.sql --remote

ALTER TABLE users ADD COLUMN clerk_id TEXT;
ALTER TABLE users ADD COLUMN deleted_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id) WHERE clerk_id IS NOT NULL;

ALTER TABLE organizations ADD COLUMN clerk_org_id TEXT;
ALTER TABLE organizations ADD COLUMN deleted_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_clerk_org_id ON organizations(clerk_org_id) WHERE clerk_org_id IS NOT NULL;
