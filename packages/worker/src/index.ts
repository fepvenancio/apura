/**
 * Apura Worker — unified queue consumer for report generation + email delivery.
 *
 * Consumes:
 *   - report-generation queue → generates CSV/HTML reports, stores in R2
 *   - email-outbound queue    → sends transactional emails via Resend
 */

import { handleReportBatch } from './queues/report';
import { handleEmailBatch } from './queues/email';

export interface Env {
  // D1
  DB: D1Database;
  // R2
  REPORTS_BUCKET: R2Bucket;
  // Queues
  EMAIL_QUEUE: Queue;
  // Services
  WS_GATEWAY: Fetcher;
  // Secrets
  RESEND_API_KEY: string;
  INTERNAL_SECRET: string;
  // Vars
  FROM_EMAIL: string;
  FROM_NAME: string;
}

export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    if (batch.queue === 'report-generation') {
      await handleReportBatch(batch as MessageBatch<any>, env);
    } else if (batch.queue === 'email-outbound') {
      await handleEmailBatch(batch as MessageBatch<any>, env);
    } else {
      console.error(`Unknown queue: ${batch.queue}`);
    }
  },

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'apura-worker', timestamp: new Date().toISOString() });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
