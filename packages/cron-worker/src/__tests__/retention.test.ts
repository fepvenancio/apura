import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the function we'll create
import { runRetentionCleanup } from '../index';

describe('runRetentionCleanup', () => {
  let mockDb: {
    batch: ReturnType<typeof vi.fn>;
    prepare: ReturnType<typeof vi.fn>;
  };
  let mockStatement: {
    bind: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockStatement = {
      bind: vi.fn().mockReturnThis(),
    };
    mockDb = {
      batch: vi.fn().mockResolvedValue([]),
      prepare: vi.fn().mockReturnValue(mockStatement),
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  it('should call db.batch with exactly 2 statements', async () => {
    await runRetentionCleanup(mockDb as unknown as D1Database);

    expect(mockDb.batch).toHaveBeenCalledTimes(1);
    const batchArgs = mockDb.batch.mock.calls[0][0];
    expect(batchArgs).toHaveLength(2);
  });

  it('should DELETE queries older than 12 months with completed or failed status', async () => {
    await runRetentionCleanup(mockDb as unknown as D1Database);

    // First prepare call should be the DELETE
    const firstPrepareCall = mockDb.prepare.mock.calls[0][0];
    expect(firstPrepareCall).toContain('DELETE FROM queries');
    expect(firstPrepareCall).toContain('created_at < ?');
    expect(firstPrepareCall).toContain('status IN');

    // Check bind args include 12 months ago date and statuses
    const bindCalls = mockStatement.bind.mock.calls;
    const deleteBindArgs = bindCalls[0];
    // 12 months ago from 2026-06-15 = ~2025-06-16
    expect(deleteBindArgs[0]).toMatch(/^2025-06/);
    expect(deleteBindArgs[1]).toBe('completed');
    expect(deleteBindArgs[2]).toBe('failed');
  });

  it('should UPDATE audit_log to anonymize entries older than 24 months', async () => {
    await runRetentionCleanup(mockDb as unknown as D1Database);

    // Second prepare call should be the UPDATE
    const secondPrepareCall = mockDb.prepare.mock.calls[1][0];
    expect(secondPrepareCall).toContain('UPDATE audit_log');
    expect(secondPrepareCall).toContain('user_id = NULL');
    expect(secondPrepareCall).toContain('ip_address = NULL');
    expect(secondPrepareCall).toContain('user_agent = NULL');
    expect(secondPrepareCall).toContain('details = NULL');
    expect(secondPrepareCall).toContain('created_at < ?');

    // Check bind arg for 24 months ago
    const bindCalls = mockStatement.bind.mock.calls;
    const updateBindArgs = bindCalls[1];
    // 24 months ago from 2026-06-15 = ~2024-06-16
    expect(updateBindArgs[0]).toMatch(/^2024-06/);
  });

  it('should use db.batch for atomicity', async () => {
    await runRetentionCleanup(mockDb as unknown as D1Database);

    // Verify batch was used (not individual exec calls)
    expect(mockDb.batch).toHaveBeenCalledTimes(1);
    expect(mockDb.prepare).toHaveBeenCalledTimes(2);
  });
});
