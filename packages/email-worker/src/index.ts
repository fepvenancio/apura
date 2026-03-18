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
// Types
// ---------------------------------------------------------------------------

interface Env {
  RESEND_API_KEY: string;
  REPORTS_BUCKET: R2Bucket;
  FROM_EMAIL: string;
  FROM_NAME: string;
}

interface ScheduledReportMessage {
  type: 'scheduled_report';
  to: string[];
  subject: string;
  reportName: string;
  reportObjectKey: string;
  generatedAt: string;
  rowCount: number;
  format: string;
}

interface PasswordResetMessage {
  type: 'password_reset';
  to: string[];
  resetUrl: string;
  userName: string;
}

interface EmailVerificationMessage {
  type: 'email_verification';
  to: string[];
  verifyUrl: string;
  userName: string;
}

interface TeamInvitationMessage {
  type: 'team_invitation';
  to: string[];
  inviterName: string;
  orgName: string;
  inviteUrl: string;
  role: string;
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
// Email templates
// ---------------------------------------------------------------------------

function scheduledReportHtml(msg: ScheduledReportMessage): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#1a1a2e;">Scheduled Report Ready</h2>
  <p>Your scheduled report <strong>${escapeHtml(msg.reportName)}</strong> has been generated.</p>
  <ul>
    <li><strong>Rows:</strong> ${msg.rowCount}</li>
    <li><strong>Format:</strong> ${msg.format.toUpperCase()}</li>
    <li><strong>Generated:</strong> ${msg.generatedAt}</li>
  </ul>
  <p>The report is attached to this email.</p>
  <p style="color:#999;font-size:12px;margin-top:40px;">Sent by Apura &mdash; Primavera P6 Analytics</p>
</div>`;
}

function passwordResetHtml(msg: PasswordResetMessage): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#1a1a2e;">Reset Your Password</h2>
  <p>Hi ${escapeHtml(msg.userName)},</p>
  <p>We received a request to reset your Apura password. Click the button below to set a new password:</p>
  <p style="text-align:center;margin:30px 0;">
    <a href="${escapeHtml(msg.resetUrl)}" style="background:#4f46e5;color:#fff;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:bold;">Reset Password</a>
  </p>
  <p>If you didn't request this, you can safely ignore this email. The link expires in 1 hour.</p>
  <p style="color:#999;font-size:12px;margin-top:40px;">Sent by Apura &mdash; Primavera P6 Analytics</p>
</div>`;
}

function emailVerificationHtml(msg: EmailVerificationMessage): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#1a1a2e;">Verify Your Email</h2>
  <p>Hi ${escapeHtml(msg.userName)},</p>
  <p>Welcome to Apura! Please verify your email address by clicking the button below:</p>
  <p style="text-align:center;margin:30px 0;">
    <a href="${escapeHtml(msg.verifyUrl)}" style="background:#4f46e5;color:#fff;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:bold;">Verify Email</a>
  </p>
  <p>If you didn't create an account, you can safely ignore this email.</p>
  <p style="color:#999;font-size:12px;margin-top:40px;">Sent by Apura &mdash; Primavera P6 Analytics</p>
</div>`;
}

function teamInvitationHtml(msg: TeamInvitationMessage): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#1a1a2e;">You're Invited!</h2>
  <p><strong>${escapeHtml(msg.inviterName)}</strong> has invited you to join <strong>${escapeHtml(msg.orgName)}</strong> on Apura as a <strong>${escapeHtml(msg.role)}</strong>.</p>
  <p style="text-align:center;margin:30px 0;">
    <a href="${escapeHtml(msg.inviteUrl)}" style="background:#4f46e5;color:#fff;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:bold;">Accept Invitation</a>
  </p>
  <p>This invitation will expire in 7 days.</p>
  <p style="color:#999;font-size:12px;margin-top:40px;">Sent by Apura &mdash; Primavera P6 Analytics</p>
</div>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
