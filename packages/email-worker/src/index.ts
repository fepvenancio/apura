/**
 * Email Worker — sends transactional emails via the Resend API.
 *
 * Consumes messages from the `email-outbound` queue and dispatches
 * emails using Resend (https://resend.com).
 *
 * Supported email types:
 *   - scheduled_report  — scheduled report delivery with attachment
 *   - password_reset    — password reset link
 *   - email_verification — email verification link
 *   - team_invitation   — team/org invitation link
 */

// ---------------------------------------------------------------------------
// Types & Templates (imported from templates.ts)
// ---------------------------------------------------------------------------

import {
  passwordResetHtml,
  emailVerificationHtml,
  teamInvitationHtml,
  scheduledReportHtml,
  escapeHtml,
  type PasswordResetMessage,
  type EmailVerificationMessage,
  type TeamInvitationMessage,
  type ScheduledReportMessage,
} from './templates';

interface Env {
  RESEND_API_KEY: string;
  REPORTS_BUCKET: R2Bucket;
  FROM_EMAIL: string;
  FROM_NAME: string;
}

type EmailMessage =
  | ScheduledReportMessage
  | PasswordResetMessage
  | EmailVerificationMessage
  | TeamInvitationMessage;

interface ResendAttachment {
  filename: string;
  content: string; // base64
  content_type: string;
}

// ---------------------------------------------------------------------------
// Resend API helper
// ---------------------------------------------------------------------------

async function sendEmail(
  env: Env,
  to: string[],
  subject: string,
  html: string,
  attachments?: ResendAttachment[],
): Promise<void> {
  const payload: Record<string, unknown> = {
    from: env.FROM_EMAIL,
    to,
    subject,
    html,
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Resend API error (${resp.status}): ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Message processor
// ---------------------------------------------------------------------------

async function processEmail(message: EmailMessage, env: Env): Promise<void> {
  switch (message.type) {
    case 'scheduled_report': {
      // Fetch report attachment from R2
      const attachments: ResendAttachment[] = [];
      if (message.reportObjectKey) {
        const object = await env.REPORTS_BUCKET.get(message.reportObjectKey);
        if (object) {
          const buffer = await object.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          const ext = message.format || 'csv';
          const contentType = ext === 'csv' ? 'text/csv' : 'text/html';
          attachments.push({
            filename: `${message.reportName.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`,
            content: base64,
            content_type: contentType,
          });
        }
      }
      await sendEmail(env, message.to, message.subject, scheduledReportHtml(message), attachments);
      break;
    }

    case 'password_reset': {
      await sendEmail(env, message.to, 'Reset your Apura password', passwordResetHtml(message));
      break;
    }

    case 'email_verification': {
      await sendEmail(env, message.to, 'Verify your Apura email', emailVerificationHtml(message));
      break;
    }

    case 'team_invitation': {
      await sendEmail(
        env,
        message.to,
        `You've been invited to ${message.orgName} on Apura`,
        teamInvitationHtml(message),
      );
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Worker export
// ---------------------------------------------------------------------------

export default {
  // Queue consumer
  async queue(batch: MessageBatch<EmailMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await processEmail(msg.body, env);
        msg.ack();
      } catch (err) {
        console.error(`Failed to send email (type=${msg.body.type}):`, err);
        msg.retry();
      }
    }
  },

  // Health check fetch handler
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'email-worker', timestamp: new Date().toISOString() });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
