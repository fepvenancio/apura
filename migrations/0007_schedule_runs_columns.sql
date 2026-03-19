-- Migration 0007: Add missing columns to schedule_runs table
-- Required for cron-worker to INSERT org_id and report-worker to SET output_url

ALTER TABLE schedule_runs ADD COLUMN org_id TEXT;
ALTER TABLE schedule_runs ADD COLUMN output_url TEXT;

CREATE INDEX idx_schedule_runs_org_id ON schedule_runs(org_id);
