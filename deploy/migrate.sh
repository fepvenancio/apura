#!/bin/bash
# Apura D1 Migration Runner
# Usage: ./deploy/migrate.sh [dev|staging|production]
#
# Applies all SQL migrations from migrations/ in order, skipping any
# that have already been recorded in the _migrations table.

set -euo pipefail

ENV="${1:-dev}"
DB_NAME="apura-${ENV}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/../migrations" && pwd)"

echo "==> Migrating D1 database: ${DB_NAME} (env: ${ENV})"
echo "==> Migrations directory: ${MIGRATIONS_DIR}"

# Ensure the _migrations tracking table exists
echo "==> Ensuring _migrations table exists..."
npx wrangler d1 execute "${DB_NAME}" --command "CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);"

# Get list of already-applied migrations
echo "==> Checking applied migrations..."
APPLIED=$(npx wrangler d1 execute "${DB_NAME}" --command "SELECT name FROM _migrations ORDER BY id;" --json 2>/dev/null | \
  node -e "
    const input = require('fs').readFileSync('/dev/stdin','utf8');
    try {
      const data = JSON.parse(input);
      // D1 execute --json returns an array of result sets
      const results = Array.isArray(data) ? data[0]?.results || [] : data?.results || [];
      results.forEach(r => console.log(r.name));
    } catch(e) {
      // Table might be empty or not exist yet
    }
  " 2>/dev/null || true)

APPLIED_COUNT=0
SKIPPED_COUNT=0
APPLIED_NOW=0

# Iterate over migration files in sorted order
for MIGRATION_FILE in "${MIGRATIONS_DIR}"/*.sql; do
  [ -f "${MIGRATION_FILE}" ] || continue

  MIGRATION_NAME="$(basename "${MIGRATION_FILE}")"

  # Check if already applied
  if echo "${APPLIED}" | grep -qxF "${MIGRATION_NAME}"; then
    echo "    [skip] ${MIGRATION_NAME} (already applied)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  # Check if file is empty or only comments
  if ! grep -qvE '^\s*(--|$)' "${MIGRATION_FILE}"; then
    echo "    [skip] ${MIGRATION_NAME} (empty / comments only)"
    # Still record it so we don't check again
    npx wrangler d1 execute "${DB_NAME}" --command "INSERT INTO _migrations (name) VALUES ('${MIGRATION_NAME}');"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  echo "    [apply] ${MIGRATION_NAME}..."
  npx wrangler d1 execute "${DB_NAME}" --file "${MIGRATION_FILE}"

  # Record successful migration
  npx wrangler d1 execute "${DB_NAME}" --command "INSERT INTO _migrations (name) VALUES ('${MIGRATION_NAME}');"

  APPLIED_NOW=$((APPLIED_NOW + 1))
  echo "    [done] ${MIGRATION_NAME}"
done

echo ""
echo "==> Migration complete."
echo "    Applied: ${APPLIED_NOW}"
echo "    Skipped: ${SKIPPED_COUNT}"
echo "    Database: ${DB_NAME}"
