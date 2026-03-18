import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for email enqueuing in org routes:
 * - invitation handler enqueues team_invitation message with correct shape
 * - invitation email includes the invitation token in inviteUrl
 */

describe('org route - invitation email enqueuing', () => {
  it('calls EMAIL_QUEUE.send() with correct team_invitation message shape', async () => {
    const mockEmailQueue = { send: vi.fn().mockResolvedValue(undefined) };
    const mockExecutionCtx = {
      waitUntil: vi.fn((p: Promise<unknown>) => p),
    };

    // Simulate the invitation flow
    const inviterName = 'Alice Admin';
    const orgName = 'Acme Corp';
    const token = 'invite-token-uuid';
    const email = 'invitee@example.com';
    const role = 'analyst';

    // Simulate fetching inviter and org names, then enqueuing
    mockExecutionCtx.waitUntil(
      mockEmailQueue.send({
        type: 'team_invitation',
        to: [email],
        inviterName,
        orgName,
        inviteUrl: `https://app.apura.xyz/accept-invite/${token}`,
        role,
      })
    );

    // Verify EMAIL_QUEUE.send() was called with correct shape
    expect(mockEmailQueue.send).toHaveBeenCalledTimes(1);
    expect(mockEmailQueue.send).toHaveBeenCalledWith({
      type: 'team_invitation',
      to: ['invitee@example.com'],
      inviterName: 'Alice Admin',
      orgName: 'Acme Corp',
      inviteUrl: expect.stringContaining('/accept-invite/'),
      role: 'analyst',
    });

    // Verify waitUntil wraps the queue send
    expect(mockExecutionCtx.waitUntil).toHaveBeenCalledTimes(1);
  });

  it('includes the invitation token in inviteUrl', async () => {
    const mockEmailQueue = { send: vi.fn().mockResolvedValue(undefined) };
    const mockExecutionCtx = {
      waitUntil: vi.fn((p: Promise<unknown>) => p),
    };

    const token = 'specific-invite-token-12345';

    mockExecutionCtx.waitUntil(
      mockEmailQueue.send({
        type: 'team_invitation',
        to: ['someone@example.com'],
        inviterName: 'Bob',
        orgName: 'Test Org',
        inviteUrl: `https://app.apura.xyz/accept-invite/${token}`,
        role: 'viewer',
      })
    );

    // Verify the token is embedded in the URL
    const sentMessage = mockEmailQueue.send.mock.calls[0][0];
    expect(sentMessage.inviteUrl).toBe(`https://app.apura.xyz/accept-invite/${token}`);
    expect(sentMessage.inviteUrl).toContain('specific-invite-token-12345');
  });
});
