import { describe, it, expect } from 'vitest';
import {
  passwordResetHtml,
  emailVerificationHtml,
  teamInvitationHtml,
  escapeHtml,
} from '../templates';

describe('escapeHtml', () => {
  it('escapes &, <, >, " characters', () => {
    expect(escapeHtml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });
});

describe('passwordResetHtml', () => {
  it('contains user name, reset URL, and heading', () => {
    const html = passwordResetHtml({
      type: 'password_reset',
      to: ['user@example.com'],
      resetUrl: 'https://app.apura.xyz/reset-password/abc123',
      userName: 'Alice',
    });
    expect(html).toContain('Alice');
    expect(html).toContain('https://app.apura.xyz/reset-password/abc123');
    expect(html).toContain('Reset Your Password');
  });
});

describe('emailVerificationHtml', () => {
  it('contains user name, verify URL, and heading', () => {
    const html = emailVerificationHtml({
      type: 'email_verification',
      to: ['user@example.com'],
      verifyUrl: 'https://app.apura.xyz/verify-email/def456',
      userName: 'Bob',
    });
    expect(html).toContain('Bob');
    expect(html).toContain('https://app.apura.xyz/verify-email/def456');
    expect(html).toContain('Verify Your Email');
  });
});

describe('teamInvitationHtml', () => {
  it('contains inviter name, org name, role, invite URL, and heading', () => {
    const html = teamInvitationHtml({
      type: 'team_invitation',
      to: ['invitee@example.com'],
      inviterName: 'Carol',
      orgName: 'Acme Corp',
      inviteUrl: 'https://app.apura.xyz/accept-invite/ghi789',
      role: 'member',
    });
    expect(html).toContain('Carol');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('member');
    expect(html).toContain('https://app.apura.xyz/accept-invite/ghi789');
    expect(html).toContain("You're Invited");
  });
});

describe('XSS prevention', () => {
  it('escapes user-provided strings in template output', () => {
    const html = passwordResetHtml({
      type: 'password_reset',
      to: ['user@example.com'],
      resetUrl: 'https://example.com',
      userName: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
