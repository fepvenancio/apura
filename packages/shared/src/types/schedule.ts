/** Supported output formats for scheduled report delivery. */
export type OutputFormat = 'pdf' | 'csv' | 'xlsx';

/** Schedule record as stored in D1. */
export interface Schedule {
  id: string;
  org_id: string;
  user_id: string;
  report_id: string;
  name: string;
  cron_expression: string;
  output_format: OutputFormat;
  recipients: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Individual schedule execution record as stored in D1. */
export interface ScheduleRun {
  id: string;
  schedule_id: string;
  org_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  output_url: string | null;
  error_message: string | null;
  created_at: string;
}
