-- Apura D1 Schema v1
-- Primavera ERP AI Reporting Platform
-- SQLite / Cloudflare D1

PRAGMA foreign_keys = ON;

-- Migration tracking
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- Organizations (tenants)
-- ============================================================================
CREATE TABLE organizations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'trial' CHECK(plan IN ('trial','starter','professional','business','enterprise')),
  primavera_version TEXT DEFAULT 'V10',
  agent_api_key TEXT NOT NULL UNIQUE,
  agent_api_key_hash TEXT NOT NULL,
  max_users INTEGER NOT NULL DEFAULT 5,
  max_queries_per_month INTEGER NOT NULL DEFAULT 100,
  queries_this_month INTEGER NOT NULL DEFAULT 0,
  queries_month_reset TEXT,
  billing_email TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  country TEXT DEFAULT 'PT',
  timezone TEXT DEFAULT 'Europe/Lisbon',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_org_slug ON organizations(slug);
CREATE INDEX idx_org_agent_key_hash ON organizations(agent_api_key_hash);
CREATE INDEX idx_org_stripe ON organizations(stripe_customer_id);

-- ============================================================================
-- Users
-- ============================================================================
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('owner','admin','analyst','viewer')),
  language TEXT NOT NULL DEFAULT 'pt',
  last_login_at TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- Invitations
-- ============================================================================
CREATE TABLE invitations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('owner','admin','analyst','viewer')),
  invited_by TEXT NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invitations_org_id ON invitations(org_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_invited_by ON invitations(invited_by);

-- ============================================================================
-- Schema Tables (per-org Primavera schema introspection)
-- ============================================================================
CREATE TABLE schema_tables (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  table_name TEXT NOT NULL,
  table_description TEXT,
  table_category TEXT CHECK(table_category IN ('finance','sales','purchasing','inventory','hr','production','system','other')),
  row_count_approx INTEGER,
  synced_at TEXT,
  UNIQUE(org_id, table_name)
);

CREATE INDEX idx_schema_tables_org_id ON schema_tables(org_id);

-- ============================================================================
-- Schema Columns (per-org column metadata)
-- ============================================================================
CREATE TABLE schema_columns (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  table_id TEXT NOT NULL REFERENCES schema_tables(id),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  column_name TEXT NOT NULL,
  data_type TEXT,
  is_nullable INTEGER NOT NULL DEFAULT 1,
  is_primary_key INTEGER NOT NULL DEFAULT 0,
  is_foreign_key INTEGER NOT NULL DEFAULT 0,
  fk_references TEXT,
  column_description TEXT,
  sample_values TEXT,
  UNIQUE(table_id, column_name)
);

CREATE INDEX idx_schema_columns_table_id ON schema_columns(table_id);
CREATE INDEX idx_schema_columns_org_id ON schema_columns(org_id);

-- ============================================================================
-- Master Schema (shared Primavera reference metadata)
-- ============================================================================
CREATE TABLE master_schema (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  primavera_version TEXT NOT NULL DEFAULT 'V10',
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  description_pt TEXT,
  description_en TEXT,
  category TEXT,
  common_joins TEXT,
  UNIQUE(primavera_version, table_name, column_name)
);

CREATE INDEX idx_master_schema_version ON master_schema(primavera_version);
CREATE INDEX idx_master_schema_table ON master_schema(table_name);

-- ============================================================================
-- Queries (NL-to-SQL history)
-- ============================================================================
CREATE TABLE queries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  natural_language TEXT NOT NULL,
  generated_sql TEXT,
  explanation TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','generating','executing','completed','failed','cancelled')),
  error_message TEXT,
  row_count INTEGER,
  execution_time_ms INTEGER,
  ai_model TEXT,
  ai_tokens_used INTEGER,
  result_preview TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_queries_org_id ON queries(org_id);
CREATE INDEX idx_queries_user_id ON queries(user_id);
CREATE INDEX idx_queries_created_at ON queries(created_at);

-- ============================================================================
-- Reports (saved queries with visualization config)
-- ============================================================================
CREATE TABLE reports (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  query_id TEXT REFERENCES queries(id),
  natural_language TEXT,
  sql_query TEXT,
  chart_config TEXT,
  layout_config TEXT,
  is_shared INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_reports_org_id ON reports(org_id);
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_query_id ON reports(query_id);

-- ============================================================================
-- Dashboards
-- ============================================================================
CREATE TABLE dashboards (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  layout TEXT,
  is_shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_dashboards_org_id ON dashboards(org_id);
CREATE INDEX idx_dashboards_user_id ON dashboards(user_id);

-- ============================================================================
-- Dashboard Widgets
-- ============================================================================
CREATE TABLE dashboard_widgets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id),
  report_id TEXT NOT NULL REFERENCES reports(id),
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 6,
  height INTEGER NOT NULL DEFAULT 4,
  config TEXT
);

CREATE INDEX idx_dashboard_widgets_dashboard_id ON dashboard_widgets(dashboard_id);
CREATE INDEX idx_dashboard_widgets_report_id ON dashboard_widgets(report_id);

-- ============================================================================
-- Schedules (automated report delivery)
-- ============================================================================
CREATE TABLE schedules (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  report_id TEXT NOT NULL REFERENCES reports(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  output_format TEXT NOT NULL DEFAULT 'pdf' CHECK(output_format IN ('pdf','csv','xlsx','json')),
  recipients TEXT NOT NULL DEFAULT '[]',
  subject_template TEXT,
  body_template TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_schedules_org_id ON schedules(org_id);
CREATE INDEX idx_schedules_report_id ON schedules(report_id);
CREATE INDEX idx_schedules_created_by ON schedules(created_by);
CREATE INDEX idx_schedules_active_next ON schedules(is_active, next_run_at);

-- ============================================================================
-- Schedule Runs (execution log)
-- ============================================================================
CREATE TABLE schedule_runs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  schedule_id TEXT NOT NULL REFERENCES schedules(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  r2_path TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_schedule_runs_schedule_id ON schedule_runs(schedule_id);

-- ============================================================================
-- Few-Shot Examples (NL-to-SQL training pairs)
-- ============================================================================
CREATE TABLE few_shot_examples (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT,
  primavera_version TEXT NOT NULL DEFAULT 'V10',
  category TEXT,
  natural_language_pt TEXT NOT NULL,
  natural_language_en TEXT,
  sql_query TEXT NOT NULL,
  tables_used TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_few_shot_org_id ON few_shot_examples(org_id);
CREATE INDEX idx_few_shot_version ON few_shot_examples(primavera_version);

-- ============================================================================
-- Audit Log
-- ============================================================================
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_org_id ON audit_log(org_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action_created ON audit_log(action, created_at);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- ============================================================================
-- API Keys (external integrations)
-- ============================================================================
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('owner','admin','analyst','viewer')),
  ip_allowlist TEXT,
  expires_at TEXT,
  last_used_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_api_keys_org_id ON api_keys(org_id);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
