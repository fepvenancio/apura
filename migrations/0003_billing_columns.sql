-- Billing columns for subscription lifecycle tracking
ALTER TABLE organizations ADD COLUMN subscription_status TEXT DEFAULT 'trialing';
ALTER TABLE organizations ADD COLUMN current_period_end TEXT;

-- Stripe webhook idempotency table
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE INDEX idx_stripe_events_event_id ON stripe_events(event_id);
