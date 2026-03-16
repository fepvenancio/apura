/**
 * Validates an agent API key by hashing it with SHA-256 and looking up
 * the hash in the D1 `organizations` table.
 */
export async function validateAgentApiKey(
  apiKey: string,
  db: D1Database
): Promise<{ valid: boolean; orgId?: string }> {
  // Hash the raw API key with SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // Look up the hash in D1
  const result = await db
    .prepare('SELECT id FROM organizations WHERE agent_api_key_hash = ?')
    .bind(hashHex)
    .first<{ id: string }>();

  if (!result) {
    return { valid: false };
  }

  return { valid: true, orgId: result.id };
}
