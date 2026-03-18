/**
 * Certificate-based organization identification for mTLS connector auth.
 *
 * Maps a client certificate serial number to an org_id via the D1
 * connector_certificates table. Revoked certificates (revoked_at IS NOT NULL)
 * are excluded from lookup results.
 */
export async function lookupOrgByCertSerial(
  certSerial: string,
  db: D1Database
): Promise<string | null> {
  const result = await db
    .prepare(
      'SELECT org_id FROM connector_certificates WHERE cert_serial = ? AND revoked_at IS NULL'
    )
    .bind(certSerial)
    .first<{ org_id: string }>();
  return result?.org_id ?? null;
}
