-- MFA support: TOTP columns on users, org-level MFA requirement, backup codes table
ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE organizations ADD COLUMN mfa_required INTEGER NOT NULL DEFAULT 0;

CREATE TABLE backup_codes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_backup_codes_user_id ON backup_codes(user_id);
