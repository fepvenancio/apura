/**
 * Resend API helper — sends transactional emails.
 */

export interface ResendAttachment {
  filename: string;
  content: string; // base64
  content_type: string;
}

export async function sendEmail(
  env: { RESEND_API_KEY: string; FROM_EMAIL: string },
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
