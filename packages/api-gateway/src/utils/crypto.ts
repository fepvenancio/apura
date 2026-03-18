/**
 * MFA crypto utilities: AES-256-GCM encryption for TOTP secrets,
 * backup code generation and verification.
 * Uses Web Crypto API for Cloudflare Workers compatibility.
 */

const HKDF_SALT = new TextEncoder().encode('apura-mfa-v1');
const IV_LENGTH = 12;
const BACKUP_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/1/O/0
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;

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
 * Derive an AES-256-GCM key from the JWT secret using HKDF.
 */
async function deriveKey(jwtSecret: string): Promise<CryptoKey> {
  const rawKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(jwtSecret),
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: new Uint8Array(0) },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns base64(iv + ciphertext) where iv is 12 random bytes.
 */
export async function encryptSecret(plaintext: string, jwtSecret: string): Promise<string> {
  const key = await deriveKey(jwtSecret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  // Concatenate iv + ciphertext
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Expects base64(iv + ciphertext) format.
 */
export async function decryptSecret(encrypted: string, jwtSecret: string): Promise<string> {
  const key = await deriveKey(jwtSecret);
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Generate 10 backup codes, each 8 chars formatted as XXXX-XXXX.
 * Uses charset without ambiguous characters (no I/1/O/0).
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(BACKUP_CODE_LENGTH));
    let code = '';
    for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
      code += BACKUP_CODE_CHARSET[bytes[j] % BACKUP_CODE_CHARSET.length];
    }
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Hash a backup code using SHA-256 with a random 16-byte salt.
 * Returns "salt_hex:hash_hex" format.
 * Input is normalized: hyphens stripped, uppercased.
 */
export async function hashBackupCode(code: string): Promise<string> {
  const normalized = code.replace(/-/g, '').toUpperCase();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt);

  const data = new TextEncoder().encode(saltHex + normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = toHex(new Uint8Array(hashBuffer));

  return `${saltHex}:${hashHex}`;
}

/**
 * Verify a backup code against a stored "salt_hex:hash_hex" hash.
 * Uses constant-time comparison.
 */
export async function verifyBackupCode(code: string, storedHash: string): Promise<boolean> {
  const normalized = code.replace(/-/g, '').toUpperCase();
  const [saltHex, expectedHash] = storedHash.split(':');
  if (!saltHex || !expectedHash) return false;

  const data = new TextEncoder().encode(saltHex + normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = toHex(new Uint8Array(hashBuffer));

  // Constant-time comparison
  if (hashHex.length !== expectedHash.length) return false;
  let result = 0;
  for (let i = 0; i < hashHex.length; i++) {
    result |= hashHex.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return result === 0;
}
