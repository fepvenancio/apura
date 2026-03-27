/**
 * Report queue handler — processes report-generation queue messages.
 */

import { generateCsv, generateHtmlReport, executeQuery } from '../services/report-generator';
import type { Env } from '../index';

interface ReportMessage {
  scheduleId: string;
  scheduleRunId: string;
  reportId: string;
  orgId: string;
  userId: string;
  outputFormat: 'pdf' | 'csv';
  recipients: string[];
  reportName: string;
}

async function processReport(message: ReportMessage, env: Env): Promise<void> {
  const { scheduleRunId, reportId, orgId, outputFormat, recipients, reportName } = message;

  // Mark run as in-progress
  await env.DB.prepare(
    `UPDATE schedule_runs SET status = 'running', started_at = datetime('now') WHERE id = ?`,
  )
    .bind(scheduleRunId)
    .run();

  // Fetch the report's underlying query SQL
  const report = await env.DB.prepare(
    `SELECT r.name, q.generated_sql FROM reports r JOIN queries q ON r.query_id = q.id WHERE r.id = ? AND r.org_id = ?`,
  )
    .bind(reportId, orgId)
    .first<{ name: string; generated_sql: string }>();

  if (!report) {
    throw new Error(`Report ${reportId} not found for org ${orgId}`);
  }

  // Execute the query via ws-gateway
  const { columns, rows } = await executeQuery(env.WS_GATEWAY, env.INTERNAL_SECRET, orgId, report.generated_sql);

  // Generate output
  const generatedAt = new Date().toISOString();
  let fileContent: string;
  let contentType: string;
  let fileExtension: string;

  if (outputFormat === 'csv') {
    fileContent = generateCsv(columns, rows);
    contentType = 'text/csv';
    fileExtension = 'csv';
  } else {
    fileContent = generateHtmlReport(reportName, columns, rows, generatedAt);
    contentType = 'text/html';
    fileExtension = 'html';
  }

  // Store in R2
  const objectKey = `reports/${orgId}/${reportId}/${scheduleRunId}.${fileExtension}`;
  await env.REPORTS_BUCKET.put(objectKey, fileContent, {
    httpMetadata: { contentType },
    customMetadata: {
      reportId,
      orgId,
      generatedAt,
      rowCount: String(rows.length),
    },
  });

  // Update schedule run with output URL
  await env.DB.prepare(
    `UPDATE schedule_runs SET status = 'completed', output_url = ?, completed_at = datetime('now') WHERE id = ?`,
  )
    .bind(objectKey, scheduleRunId)
    .run();

  // Publish to email queue
  if (recipients.length > 0) {
    await env.EMAIL_QUEUE.send({
      type: 'scheduled_report',
      to: recipients,
      subject: `Scheduled Report: ${reportName}`,
      reportName,
      reportObjectKey: objectKey,
      generatedAt,
      rowCount: rows.length,
      format: fileExtension,
    });
  }
}

export async function handleReportBatch(batch: MessageBatch<ReportMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processReport(msg.body, env);
      msg.ack();
    } catch (err) {
      console.error(`Failed to process report ${msg.body.reportId}:`, err);

      // Update schedule_runs with error
      await env.DB.prepare(
        `UPDATE schedule_runs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`,
      )
        .bind(err instanceof Error ? err.message : 'Unknown error', msg.body.scheduleRunId)
        .run();

      msg.retry();
    }
  }
}
