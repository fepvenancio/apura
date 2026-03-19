import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import { requireRole } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { OrgDatabase } from '../services/org-db';
import { validateEmail } from '@apura/shared';

// ---------------------------------------------------------------------------
// Simple cron next-run calculator
// ---------------------------------------------------------------------------

function computeNextRun(cron: string, from: Date): Date {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) {
    return new Date(from.getTime() + 3600_000); // fallback: 1 hour
  }

  const [minute, hour, dayOfMonth] = parts;

  // Every minute: * * * * *
  if (minute === '*' && hour === '*') {
    return new Date(from.getTime() + 60_000);
  }

  // Every N minutes: */N * * * *
  if (minute.startsWith('*/') && hour === '*') {
    const interval = parseInt(minute.slice(2), 10) || 1;
    return new Date(from.getTime() + interval * 60_000);
  }

  // Specific minute every hour: N * * * *
  if (/^\d+$/.test(minute) && hour === '*') {
    const next = new Date(from);
    next.setMinutes(parseInt(minute, 10), 0, 0);
    if (next <= from) next.setHours(next.getHours() + 1);
    return next;
  }

  // Specific hour and minute: N N * * *
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === '*') {
    const next = new Date(from);
    next.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  // Specific day of month: N N N * *
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dayOfMonth)) {
    const next = new Date(from);
    next.setDate(parseInt(dayOfMonth, 10));
    next.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
    if (next <= from) next.setMonth(next.getMonth() + 1);
    return next;
  }

  // Fallback: 1 hour
  return new Date(from.getTime() + 3600_000);
}

const schedules = new Hono<{ Bindings: Env; Variables: AppVariables }>();

schedules.use('*', rateLimitMiddleware);

// ---------------------------------------------------------------------------
// POST /api/schedules — Create schedule
// ---------------------------------------------------------------------------
schedules.post('/', requireRole('owner', 'admin', 'analyst'), async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const body = await c.req.json<{
    reportId: string;
    cronExpression: string;
    timezone?: string;
    outputFormat?: string;
    recipients: string[];
    subjectTemplate?: string;
    bodyTemplate?: string;
  }>();

  if (!body.reportId || !body.cronExpression || !body.recipients?.length) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reportId, cronExpression, and recipients are required' } }, 400);
  }

  // Validate recipients are valid emails
  for (const email of body.recipients) {
    if (!validateEmail(email)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid recipient email: ${email}` } }, 400);
    }
  }

  // Verify report exists
  const report = await orgDb.getReport(body.reportId);
  if (!report) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } }, 404);
  }

  // Validate cron expression (basic check: 5 space-separated fields)
  const cronParts = body.cronExpression.trim().split(/\s+/);
  if (cronParts.length < 5) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid cron expression (need 5 fields: min hour dom mon dow)' } }, 400);
  }

  const id = await orgDb.createSchedule({
    report_id: body.reportId,
    created_by: userId,
    cron_expression: body.cronExpression.trim(),
    timezone: body.timezone ?? 'Europe/Lisbon',
    output_format: (body.outputFormat ?? 'csv') as 'pdf' | 'csv' | 'xlsx' | 'json',
    recipients: JSON.stringify(body.recipients),
    subject_template: body.subjectTemplate ?? null,
    body_template: body.bodyTemplate ?? null,
    is_active: 1,
  });

  // Compute and set next_run_at
  const nextRunAt = computeNextRun(body.cronExpression.trim(), new Date());
  await orgDb.updateSchedule(id, { next_run_at: nextRunAt.toISOString() } as any);

  await orgDb.logAudit('schedule.create', 'schedule', id, { reportId: body.reportId }, c.req.header('CF-Connecting-IP'));

  const schedule = await orgDb.getSchedule(id);
  return c.json({ success: true, data: schedule }, 201);
});

// ---------------------------------------------------------------------------
// GET /api/schedules — List schedules
// ---------------------------------------------------------------------------
schedules.get('/', async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const items = await orgDb.listSchedules();
  return c.json({ success: true, data: { items, total: items.length } });
});

// ---------------------------------------------------------------------------
// GET /api/schedules/:id — Get schedule detail
// ---------------------------------------------------------------------------
schedules.get('/:id', async (c) => {
  const orgId = c.get('orgId');
  const scheduleId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const schedule = await orgDb.getSchedule(scheduleId);
  if (!schedule) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } }, 404);
  }

  return c.json({ success: true, data: schedule });
});

// ---------------------------------------------------------------------------
// PUT|PATCH /api/schedules/:id — Update schedule
// ---------------------------------------------------------------------------
schedules.on(['PUT', 'PATCH'], '/:id', requireRole('owner', 'admin', 'analyst'), async (c) => {
  const orgId = c.get('orgId');
  const scheduleId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const existing = await orgDb.getSchedule(scheduleId);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } }, 404);
  }

  const body = await c.req.json<{
    cronExpression?: string;
    timezone?: string;
    outputFormat?: string;
    recipients?: string[];
    subjectTemplate?: string;
    bodyTemplate?: string;
    isActive?: boolean;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.cronExpression !== undefined) updates.cron_expression = body.cronExpression;
  if (body.timezone !== undefined) updates.timezone = body.timezone;
  if (body.outputFormat !== undefined) updates.output_format = body.outputFormat;
  if (body.recipients !== undefined) updates.recipients = JSON.stringify(body.recipients);
  if (body.subjectTemplate !== undefined) updates.subject_template = body.subjectTemplate;
  if (body.bodyTemplate !== undefined) updates.body_template = body.bodyTemplate;
  if (body.isActive !== undefined) updates.is_active = body.isActive ? 1 : 0;

  await orgDb.updateSchedule(scheduleId, updates);
  await orgDb.logAudit('schedule.update', 'schedule', scheduleId, updates, c.req.header('CF-Connecting-IP'));

  const updated = await orgDb.getSchedule(scheduleId);
  return c.json({ success: true, data: updated });
});

// ---------------------------------------------------------------------------
// DELETE /api/schedules/:id — Delete schedule
// ---------------------------------------------------------------------------
schedules.delete('/:id', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');
  const scheduleId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const existing = await orgDb.getSchedule(scheduleId);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } }, 404);
  }

  await orgDb.deleteSchedule(scheduleId);
  await orgDb.logAudit('schedule.delete', 'schedule', scheduleId, {}, c.req.header('CF-Connecting-IP'));

  return c.json({ success: true, data: { deleted: true } });
});

// ---------------------------------------------------------------------------
// POST /api/schedules/:id/trigger — Manual trigger
// ---------------------------------------------------------------------------
schedules.post('/:id/trigger', requireRole('owner', 'admin', 'analyst'), async (c) => {
  const orgId = c.get('orgId');
  const scheduleId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const schedule = await orgDb.getSchedule(scheduleId);
  if (!schedule) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } }, 404);
  }

  const report = await orgDb.getReport(schedule.report_id);
  if (!report) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Associated report not found' } }, 404);
  }

  let recipients: string[] = [];
  try {
    recipients = JSON.parse(schedule.recipients);
  } catch {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid recipients data' } }, 400);
  }

  const userId = c.get('userId');
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Publish to report-generation queue (matches ReportMessage interface)
  await c.env.REPORT_QUEUE.send({
    scheduleRunId: runId,
    scheduleId: schedule.id,
    orgId,
    reportId: schedule.report_id,
    userId,
    reportName: report.name,
    outputFormat: schedule.output_format,
    recipients,
  });

  // Log the run
  await c.env.DB
    .prepare(
      `INSERT INTO schedule_runs (id, schedule_id, org_id, status, started_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(runId, scheduleId, orgId, 'queued', now)
    .run();

  await orgDb.logAudit('schedule.trigger', 'schedule', scheduleId, { manual: true }, c.req.header('CF-Connecting-IP'));

  return c.json({ success: true, data: { runId, status: 'queued' } });
});

// ---------------------------------------------------------------------------
// GET /api/schedules/:id/runs — List schedule run history
// ---------------------------------------------------------------------------
schedules.get('/:id/runs', async (c) => {
  const orgId = c.get('orgId');
  const scheduleId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  // Verify schedule exists and belongs to org
  const schedule = await orgDb.getSchedule(scheduleId);
  if (!schedule) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } }, 404);
  }

  const { results } = await c.env.DB
    .prepare(
      `SELECT id, schedule_id, status, output_url, error_message, started_at, completed_at
       FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT 50`
    )
    .bind(scheduleId)
    .all();

  return c.json({ success: true, data: { items: results ?? [], total: results?.length ?? 0 } });
});

// ---------------------------------------------------------------------------
// GET /api/schedules/:scheduleId/runs/:runId/download — Download run output
// ---------------------------------------------------------------------------
schedules.get('/:scheduleId/runs/:runId/download', async (c) => {
  const orgId = c.get('orgId');
  const scheduleId = c.req.param('scheduleId');
  const runId = c.req.param('runId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  // Verify schedule exists and belongs to org
  const schedule = await orgDb.getSchedule(scheduleId);
  if (!schedule) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } }, 404);
  }

  const run = await c.env.DB
    .prepare('SELECT * FROM schedule_runs WHERE id = ? AND schedule_id = ?')
    .bind(runId, scheduleId)
    .first<{ output_url: string; status: string }>();

  if (!run || !run.output_url) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run output not found' } }, 404);
  }

  const object = await c.env.REPORTS_BUCKET.get(run.output_url);
  if (!object) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found in storage' } }, 404);
  }

  const ext = run.output_url.split('.').pop() || 'csv';
  const contentType = ext === 'csv' ? 'text/csv' : 'text/html';
  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="report-${runId}.${ext}"`,
    },
  });
});

export default schedules;
