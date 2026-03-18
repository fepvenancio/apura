/** Supported output formats for scheduled report delivery. */
export type OutputFormat = 'pdf' | 'csv' | 'xlsx' | 'json';

/** Schedule record as stored in D1. */
export interface Schedule {
  id: string;
  org_id: string;
  report_id: string;
  created_by: string;
  cron_expression: string;
  timezone: string;
  output_format: OutputFormat;
  recipients: string;
  subject_template: string | null;
  body_template: string | null;
  is_active: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

/** Individual schedule execution record as stored in D1. */
export interface ScheduleRun {
  id: string;
  schedule_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  r2_path: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}
