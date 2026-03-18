-- GDPR consent logging table
-- Note: user_id intentionally has NO FK to users(id) so consent records survive user deletion (compliance evidence)
CREATE TABLE consent_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_consent_log_user_id ON consent_log(user_id);
CREATE INDEX idx_consent_log_org_id ON consent_log(org_id);
