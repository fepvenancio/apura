const BASE62_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KEY_LENGTH = 40;
const PREFIX = 'apura_live_';

function randomBase62(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[bytes[i] % BASE62_CHARS.length];
  }
  return result;
}

/**
 * Hash an API key using SHA-256 (async, Web Crypto API).
 * Returns hex-encoded hash for storage in DB.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a new API key with its hash and display prefix.
 *
 * Format: apura_live_<40 random base62 chars>
 *
 * Returns:
 * - key: The full plaintext key (show to user once)
 * - hash: SHA-256 hash of the key (store in DB)
 * - prefix: First 8 chars after prefix (for display: apura_live_XXXXXXXX...)
 */
export async function generateApiKey(): Promise<{ key: string; hash: string; prefix: string }> {
  const random = randomBase62(KEY_LENGTH);
  const key = `${PREFIX}${random}`;
  const hash = await hashApiKey(key);
  const prefix = `${PREFIX}${random.slice(0, 8)}...`;

  return { key, hash, prefix };
}
