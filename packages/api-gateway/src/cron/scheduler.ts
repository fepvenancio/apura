import type { Env } from '../types';

/**
 * Cron Worker — checks for due scheduled reports and enqueues them.
 *
 * Triggered every minute via Cloudflare cron trigger.
 * Queries D1 for active schedules where next_run_at <= now,
 * publishes to the report-generation queue, and advances next_run_at.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleRow {
  id: string;
  org_id: string;
  report_id: string;
  created_by: string;
  cron_expression: string;
  timezone: string;
  output_format: string;
  recipients: string;
  subject_template: string | null;
  body_template: string | null;
}

interface ReportRow {
  id: string;
  name: string;
  sql_query: string;
}

// ---------------------------------------------------------------------------
// Simple cron next-run calculator
// ---------------------------------------------------------------------------

/**
 * Advances next_run_at by parsing the cron expression.
 * Supports standard 5-field cron: minute hour day month weekday.
 * For simplicity, advances by the minimum interval implied by the cron.
 */
function computeNextRun(cronExpression: string, fromDate: Date): Date {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 5) {
    // Default: 1 hour from now
    return new Date(fromDate.getTime() + 3600_000);
  }

  const [minute, hour, dayOfMonth, , ] = parts;

  // Every minute: * * * * *
  if (minute === '*' && hour === '*') {
    return new Date(fromDate.getTime() + 60_000);
  }

  // Every N minutes: */N * * * *
  if (minute.startsWith('*/') && hour === '*') {
    const interval = parseInt(minute.slice(2), 10) || 1;
    return new Date(fromDate.getTime() + interval * 60_000);
  }

  // Specific minute every hour: N * * * *
  if (/^\d+$/.test(minute) && hour === '*') {
    const next = new Date(fromDate);
    next.setMinutes(parseInt(minute, 10), 0, 0);
    if (next <= fromDate) next.setHours(next.getHours() + 1);
    return next;
  }

  // Specific hour and minute: N N * * *
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === '*') {
    const next = new Date(fromDate);
    next.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
    if (next <= fromDate) next.setDate(next.getDate() + 1);
    return next;
  }

  // Specific day of month: N N N * *
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dayOfMonth)) {
    const next = new Date(fromDate);
    next.setDate(parseInt(dayOfMonth, 10));
    next.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
    if (next <= fromDate) next.setMonth(next.getMonth() + 1);
    return next;
  }

  // Fallback: 1 hour
  return new Date(fromDate.getTime() + 3600_000);
}

// ---------------------------------------------------------------------------
// Data retention cleanup
// ---------------------------------------------------------------------------

export async function runRetentionCleanup(db: D1Database): Promise<void> {
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 3600_000).toISOString();
  const twentyFourMonthsAgo = new Date(Date.now() - 2 * 365 * 24 * 3600_000).toISOString();

  await db.batch([
    db.prepare('DELETE FROM queries WHERE created_at < ? AND status IN (?, ?)').bind(twelveMonthsAgo, 'completed', 'failed'),
    db.prepare('UPDATE audit_log SET user_id = NULL, ip_address = NULL, user_agent = NULL, details = NULL WHERE created_at < ?').bind(twentyFourMonthsAgo),
  ]);
}

// ---------------------------------------------------------------------------
// Scheduled handler
// ---------------------------------------------------------------------------

export async function cronHandler(
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const now = new Date().toISOString();

  // Find all active schedules that are due
  const dueSchedules = await env.DB
    .prepare(
      `SELECT s.id, s.org_id, s.report_id, s.created_by, s.cron_expression, s.timezone,
              s.output_format, s.recipients, s.subject_template, s.body_template
       FROM schedules s
       WHERE s.is_active = 1 AND s.next_run_at <= ?
       LIMIT 50`
    )
    .bind(now)
    .all<ScheduleRow>();

  if (!dueSchedules.results || dueSchedules.results.length === 0) {
    // Still run retention cleanup even when no schedules are due
    await runRetentionCleanup(env.DB);
    return;
  }

  for (const schedule of dueSchedules.results) {
    try {
      // Fetch the report details
      const report = await env.DB
        .prepare('SELECT id, name, sql_query FROM reports WHERE id = ? AND org_id = ?')
        .bind(schedule.report_id, schedule.org_id)
        .first<ReportRow>();

      if (!report) {
        console.warn(`Schedule ${schedule.id}: report ${schedule.report_id} not found, skipping`);
        continue;
      }

      // Parse recipients
      let recipients: string[] = [];
      try {
        recipients = JSON.parse(schedule.recipients);
      } catch {
        console.warn(`Schedule ${schedule.id}: invalid recipients JSON`);
        continue;
      }

      // Publish to report-generation queue (matches ReportMessage interface)
      const runId = crypto.randomUUID();
      await env.REPORT_QUEUE.send({
        scheduleRunId: runId,
        scheduleId: schedule.id,
        orgId: schedule.org_id,
        reportId: schedule.report_id,
        userId: schedule.created_by,
        reportName: report.name,
        outputFormat: schedule.output_format,
        recipients,
      });

      // Compute next run and update schedule
      const nextRun = computeNextRun(schedule.cron_expression, new Date());
      await env.DB.batch([
        // Update next_run_at and last_run_at
        env.DB
          .prepare('UPDATE schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?')
          .bind(now, nextRun.toISOString(), schedule.id),
        // Insert run record
        env.DB
          .prepare(
            `INSERT INTO schedule_runs (id, schedule_id, org_id, status, started_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(runId, schedule.id, schedule.org_id, 'queued', now),
      ]);
    } catch (err) {
      console.error(`Failed to process schedule ${schedule.id}:`, err);
    }
  }

  // Run data retention cleanup after schedule processing
  await runRetentionCleanup(env.DB);
}
