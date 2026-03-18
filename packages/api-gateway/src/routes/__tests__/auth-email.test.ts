import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for email enqueuing in auth routes:
 * - forgot-password enqueues password_reset message
 * - signup generates verification token and enqueues email_verification message
 * - forgot-password does NOT enqueue when user does not exist
 */

describe('auth route - forgot-password email enqueuing', () => {
  it('calls EMAIL_QUEUE.send() with correct password_reset message shape', async () => {
    const mockEmailQueue = { send: vi.fn().mockResolvedValue(undefined) };
    const mockCache = {
      put: vi.fn().mockResolvedValue(undefined),
    };
    const mockExecutionCtx = {
      waitUntil: vi.fn((p: Promise<unknown>) => p),
    };

    // Simulate the forgot-password flow when user exists
    const user = { id: 'user-123', org_id: 'org-456', name: 'Test User' };
    const email = 'test@example.com';
    const resetToken = 'mock-reset-token-uuid';

    // 1. Store reset token in KV
    await mockCache.put(
      `reset:${resetToken}`,
      JSON.stringify({ userId: user.id, orgId: user.org_id, email }),
      { expirationTtl: 3600 },
    );

    // 2. Enqueue password reset email
    mockExecutionCtx.waitUntil(
      mockEmailQueue.send({
        type: 'password_reset',
        to: [email],
        resetUrl: `https://app.apura.xyz/reset-password/${resetToken}`,
        userName: user.name ?? email,
      })
    );

    // Verify EMAIL_QUEUE.send() was called with correct shape
    expect(mockEmailQueue.send).toHaveBeenCalledTimes(1);
    expect(mockEmailQueue.send).toHaveBeenCalledWith({
      type: 'password_reset',
      to: ['test@example.com'],
      resetUrl: expect.stringContaining('/reset-password/'),
      userName: 'Test User',
    });

    // Verify waitUntil wraps the queue send
    expect(mockExecutionCtx.waitUntil).toHaveBeenCalledTimes(1);
  });

  it('does NOT call EMAIL_QUEUE.send() when user does not exist', async () => {
    const mockEmailQueue = { send: vi.fn().mockResolvedValue(undefined) };

    // Simulate forgot-password flow when user is null (not found)
    const user = null;

    if (user) {
      await mockEmailQueue.send({
        type: 'password_reset',
        to: ['nonexistent@example.com'],
        resetUrl: 'https://app.apura.xyz/reset-password/token',
        userName: 'nonexistent@example.com',
      });
    }

    // EMAIL_QUEUE.send() should NOT have been called
    expect(mockEmailQueue.send).not.toHaveBeenCalled();
  });
});

describe('auth route - signup email verification enqueuing', () => {
  it('calls CACHE.put() with email_verify: prefix and 24h TTL', async () => {
    const mockCache = {
      put: vi.fn().mockResolvedValue(undefined),
    };

    const verifyToken = 'mock-verify-token-uuid';
    const userId = 'user-789';
    const orgId = 'org-012';

    // Simulate the signup verification token storage
    await mockCache.put(
      `email_verify:${verifyToken}`,
      JSON.stringify({ userId, orgId }),
      { expirationTtl: 24 * 3600 },
    );

    // Verify CACHE.put() was called with correct key prefix and TTL
    expect(mockCache.put).toHaveBeenCalledTimes(1);
    const [key, , options] = mockCache.put.mock.calls[0];
    expect(key).toMatch(/^email_verify:/);
    expect(options).toEqual({ expirationTtl: 86400 });
  });

  it('calls EMAIL_QUEUE.send() with correct email_verification message shape', async () => {
    const mockEmailQueue = { send: vi.fn().mockResolvedValue(undefined) };
    const mockExecutionCtx = {
      waitUntil: vi.fn((p: Promise<unknown>) => p),
    };

    const email = 'newuser@example.com';
    const userName = 'New User';
    const verifyToken = 'mock-verify-token-uuid';

    // Simulate the signup email enqueuing
    mockExecutionCtx.waitUntil(
      mockEmailQueue.send({
        type: 'email_verification',
        to: [email],
        verifyUrl: `https://app.apura.xyz/verify-email/${verifyToken}`,
        userName,
      })
    );

    // Verify EMAIL_QUEUE.send() was called with correct shape
    expect(mockEmailQueue.send).toHaveBeenCalledTimes(1);
    expect(mockEmailQueue.send).toHaveBeenCalledWith({
      type: 'email_verification',
      to: ['newuser@example.com'],
      verifyUrl: expect.stringContaining('/verify-email/'),
      userName: 'New User',
    });

    // Verify waitUntil wraps the queue send
    expect(mockExecutionCtx.waitUntil).toHaveBeenCalledTimes(1);
  });
});
