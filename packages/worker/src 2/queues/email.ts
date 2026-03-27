/**
 * Email queue handler — processes email-outbound queue messages.
 */

import { sendEmail, type ResendAttachment } from '../services/email-sender';
import {
  scheduledReportHtml,
  passwordResetHtml,
  emailVerificationHtml,
  teamInvitationHtml,
  type EmailMessage,
} from '../templates';
import type { Env } from '../index';

async function processEmail(message: EmailMessage, env: Env): Promise<void> {
  switch (message.type) {
    case 'scheduled_report': {
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

export async function handleEmailBatch(batch: MessageBatch<EmailMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processEmail(msg.body, env);
      msg.ack();
    } catch (err) {
      console.error(`Failed to send email (type=${msg.body.type}):`, err);
      msg.retry();
    }
  }
}
