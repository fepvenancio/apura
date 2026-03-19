import { scrypt } from '@noble/hashes/scrypt';
import { randomBytes } from '@noble/hashes/utils';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Hash a password using scrypt.
 * Returns a string in the format: $scrypt$N$r$p$salt$hash
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scrypt(
    new TextEncoder().encode(password),
    salt,
    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, dkLen: KEY_LENGTH },
  );

  return `$scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toHex(salt)}$${toHex(derived)}`;
}

/**
 * Verify a password against a stored hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  // Format: $scrypt$N$r$p$salt$hash -> ['', 'scrypt', N, r, p, salt, hash]
  if (parts.length !== 7 || parts[1] !== 'scrypt') {
    return false;
  }

  const N = parseInt(parts[2], 10);
  const r = parseInt(parts[3], 10);
  const p = parseInt(parts[4], 10);
  const salt = fromHex(parts[5]);
  const expectedHash = parts[6];

  const derived = scrypt(
    new TextEncoder().encode(password),
    salt,
    { N, r, p, dkLen: KEY_LENGTH },
  );

  return constantTimeEqual(toHex(derived), expectedHash);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Always iterates the full length — no early exit on length mismatch.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let result = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}
