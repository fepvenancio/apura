// ---------------------------------------------------------------------------
// Email message types
// ---------------------------------------------------------------------------

export interface ScheduledReportMessage {
  type: 'scheduled_report';
  to: string[];
  subject: string;
  reportName: string;
  reportObjectKey: string;
  generatedAt: string;
  rowCount: number;
  format: string;
}

export interface PasswordResetMessage {
  type: 'password_reset';
  to: string[];
  resetUrl: string;
  userName: string;
}

export interface EmailVerificationMessage {
  type: 'email_verification';
  to: string[];
  verifyUrl: string;
  userName: string;
}

export interface TeamInvitationMessage {
  type: 'team_invitation';
  to: string[];
  inviterName: string;
  orgName: string;
  inviteUrl: string;
  role: string;
}

export type EmailMessage =
  | ScheduledReportMessage
  | PasswordResetMessage
  | EmailVerificationMessage
  | TeamInvitationMessage;

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

export function scheduledReportHtml(msg: ScheduledReportMessage): string {
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

export function passwordResetHtml(msg: PasswordResetMessage): string {
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

export function emailVerificationHtml(msg: EmailVerificationMessage): string {
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

export function teamInvitationHtml(msg: TeamInvitationMessage): string {
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
