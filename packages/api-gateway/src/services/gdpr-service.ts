/**
 * GDPR service — erasure (cascade delete) and data export.
 *
 * eraseUserData intentionally does NOT clean up KV sessions.
 * Auth middleware validates the user via D1 lookup, so deleted users
 * are automatically rejected. KV entries expire via TTL.
 */

export async function eraseUserData(
  db: D1Database,
  r2: R2Bucket,
  userId: string,
  orgId: string,
): Promise<void> {
  // Check if this user is the sole member of the org
  const memberCount = await db
    .prepare('SELECT COUNT(*) as count FROM users WHERE org_id = ?')
    .bind(orgId)
    .first<{ count: number }>();

  const isSoleOwner = memberCount?.count === 1;

  // Build batch statements in FK dependency order (children first)
  const statements: D1PreparedStatement[] = [
    db.prepare(
      'DELETE FROM dashboard_widgets WHERE dashboard_id IN (SELECT id FROM dashboards WHERE user_id = ? AND org_id = ?)',
    ).bind(userId, orgId),
    db.prepare(
      'DELETE FROM schedule_runs WHERE schedule_id IN (SELECT id FROM schedules WHERE created_by = ? AND org_id = ?)',
    ).bind(userId, orgId),
    db.prepare(
      'DELETE FROM schedules WHERE created_by = ? AND org_id = ?',
    ).bind(userId, orgId),
    db.prepare(
      'DELETE FROM dashboards WHERE user_id = ? AND org_id = ?',
    ).bind(userId, orgId),
    db.prepare(
      'DELETE FROM reports WHERE user_id = ? AND org_id = ?',
    ).bind(userId, orgId),
    db.prepare(
      'DELETE FROM queries WHERE user_id = ? AND org_id = ?',
    ).bind(userId, orgId),
    db.prepare(
      'DELETE FROM api_keys WHERE user_id = ? AND org_id = ?',
    ).bind(userId, orgId),
    db.prepare(
      'DELETE FROM invitations WHERE invited_by = ?',
    ).bind(userId),
    // Anonymize audit_log — do NOT delete (compliance evidence)
    db.prepare(
      'UPDATE audit_log SET user_id = NULL, ip_address = NULL, user_agent = NULL, details = NULL WHERE user_id = ? AND org_id = ?',
    ).bind(userId, orgId),
    // Delete user last
    db.prepare(
      'DELETE FROM users WHERE id = ? AND org_id = ?',
    ).bind(userId, orgId),
  ];

  // If sole owner, also clean up org-scoped data
  if (isSoleOwner) {
    statements.push(
      db.prepare(
        'DELETE FROM schema_columns WHERE table_id IN (SELECT id FROM schema_tables WHERE org_id = ?)',
      ).bind(orgId),
      db.prepare(
        'DELETE FROM schema_tables WHERE org_id = ?',
      ).bind(orgId),
      db.prepare(
        'DELETE FROM organizations WHERE id = ?',
      ).bind(orgId),
    );
  }

  await db.batch(statements);

  // Clean up R2 export files for this user
  const listed = await r2.list({ prefix: `exports/${orgId}/${userId}/` });
  for (const obj of listed.objects) {
    await r2.delete(obj.key);
  }
}

export async function exportUserData(
  db: D1Database,
  r2: R2Bucket,
  emailQueue: Queue,
  userId: string,
  orgId: string,
  userEmail: string,
  userName: string,
): Promise<string> {
  // Query all user PII in parallel
  const [user, queries, reports, auditLog] = await Promise.all([
    db.prepare(
      'SELECT id, email, name, role, created_at FROM users WHERE id = ? AND org_id = ?',
    ).bind(userId, orgId).first(),
    db.prepare(
      'SELECT id, natural_language, generated_sql, status, created_at FROM queries WHERE user_id = ? AND org_id = ?',
    ).bind(userId, orgId).all(),
    db.prepare(
      'SELECT id, name, description, natural_language, sql_query, created_at FROM reports WHERE user_id = ? AND org_id = ?',
    ).bind(userId, orgId).all(),
    db.prepare(
      'SELECT id, action, resource_type, ip_address, created_at FROM audit_log WHERE user_id = ? AND org_id = ?',
    ).bind(userId, orgId).all(),
  ]);

  const exportData = {
    exportDate: new Date().toISOString(),
    user,
    queries: queries.results,
    reports: reports.results,
    auditLog: auditLog.results,
  };

  const exportKey = `exports/${orgId}/${userId}/${crypto.randomUUID()}.json`;

  await r2.put(exportKey, JSON.stringify(exportData, null, 2), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    },
  });

  await emailQueue.send({
    type: 'data_export',
    to: [userEmail],
    downloadUrl: `/api/gdpr/export/download?key=${encodeURIComponent(exportKey)}`,
    userName,
  });

  return exportKey;
}
