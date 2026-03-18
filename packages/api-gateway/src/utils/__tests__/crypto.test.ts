import { describe, it, expect } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from '../crypto';

describe('crypto utilities', () => {
  const TEST_SECRET = 'test-jwt-secret-that-is-long-enough-for-hkdf';

  describe('encryptSecret / decryptSecret', () => {
    it('round-trips a known string', async () => {
      const plaintext = 'JBSWY3DPEHPK3PXP';
      const encrypted = await encryptSecret(plaintext, TEST_SECRET);
      const decrypted = await decryptSecret(encrypted, TEST_SECRET);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertexts for same plaintext (random IV)', async () => {
      const plaintext = 'SAME_SECRET';
      const a = await encryptSecret(plaintext, TEST_SECRET);
      const b = await encryptSecret(plaintext, TEST_SECRET);
      expect(a).not.toBe(b);
    });

    it('fails to decrypt with wrong secret', async () => {
      const encrypted = await encryptSecret('secret-data', TEST_SECRET);
      await expect(decryptSecret(encrypted, 'wrong-secret')).rejects.toThrow();
    });
  });

  describe('generateBackupCodes', () => {
    it('returns 10 codes', () => {
      const codes = generateBackupCodes();
      expect(codes).toHaveLength(10);
    });

    it('each code matches XXXX-XXXX format with valid charset', () => {
      const codes = generateBackupCodes();
      for (const code of codes) {
        expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      }
    });

    it('does not contain ambiguous characters (I, 1, O, 0)', () => {
      // Generate many codes to increase coverage
      for (let i = 0; i < 10; i++) {
        const codes = generateBackupCodes();
        for (const code of codes) {
          expect(code).not.toMatch(/[IO10]/);
        }
      }
    });
  });

  describe('hashBackupCode / verifyBackupCode', () => {
    it('verifies a correct code', async () => {
      const code = 'ABCD-EFGH';
      const hash = await hashBackupCode(code);
      const result = await verifyBackupCode(code, hash);
      expect(result).toBe(true);
    });

    it('rejects an incorrect code', async () => {
      const hash = await hashBackupCode('ABCD-EFGH');
      const result = await verifyBackupCode('WXYZ-1234', hash);
      expect(result).toBe(false);
    });

    it('normalizes hyphens and case', async () => {
      const hash = await hashBackupCode('ABCD-EFGH');
      // Verify with no hyphen and lowercase
      const result = await verifyBackupCode('abcdefgh', hash);
      expect(result).toBe(true);
    });

    it('produces different hashes for same code (random salt)', async () => {
      const code = 'TEST-CODE';
      const a = await hashBackupCode(code);
      const b = await hashBackupCode(code);
      expect(a).not.toBe(b);
    });
  });
});
