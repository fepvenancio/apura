import { describe, it, expect, vi } from 'vitest';
import { lookupOrgByCertSerial } from '../auth/cert-auth';

/**
 * Unit tests for certificate-based org identification.
 * Tests the lookupOrgByCertSerial function that maps a client certificate
 * serial number to an organization ID via the D1 connector_certificates table.
 */

function createMockDb(result: Record<string, unknown> | null) {
  const first = vi.fn().mockResolvedValue(result);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, bind, first, db: { prepare } as unknown as D1Database };
}

describe('lookupOrgByCertSerial', () => {
  it('returns org_id when cert_serial exists and is not revoked', async () => {
    const { db, prepare, bind, first } = createMockDb({ org_id: 'org-123' });

    const result = await lookupOrgByCertSerial('SERIAL-ABC', db);

    expect(result).toBe('org-123');
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining('connector_certificates')
    );
    expect(bind).toHaveBeenCalledWith('SERIAL-ABC');
    expect(prepare.mock.calls[0][0]).toContain('revoked_at IS NULL');
  });

  it('returns null when cert_serial is not found', async () => {
    const { db } = createMockDb(null);

    const result = await lookupOrgByCertSerial('UNKNOWN-SERIAL', db);

    expect(result).toBeNull();
  });

  it('returns null when cert is revoked (revoked_at IS NOT NULL)', async () => {
    // The SQL query includes "AND revoked_at IS NULL", so revoked certs
    // simply won't match and D1 returns null
    const { db } = createMockDb(null);

    const result = await lookupOrgByCertSerial('REVOKED-SERIAL', db);

    expect(result).toBeNull();
  });
});
