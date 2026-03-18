-- Certificate-to-organization mapping for mTLS connector authentication
CREATE TABLE connector_certificates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  cert_serial TEXT NOT NULL UNIQUE,
  cert_fingerprint_sha256 TEXT NOT NULL,
  cert_subject_dn TEXT,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_connector_certs_org ON connector_certificates(org_id);
CREATE INDEX idx_connector_certs_serial ON connector_certificates(cert_serial);
