#!/bin/bash
# Seeds the master_schema table from docs/schema/master-schema.json
# Usage: ./deploy/seed-schema.sh [dev|staging|production]
#
# Reads the JSON file and inserts rows into the D1 master_schema table.
# Existing rows are replaced (upsert on the unique constraint).

set -euo pipefail

ENV="${1:-dev}"
DB_NAME="apura-${ENV}"
SCHEMA_FILE="$(cd "$(dirname "$0")/.." && pwd)/docs/schema/master-schema.json"

echo "==> Seeding master_schema in D1 database: ${DB_NAME}"
echo "==> Source file: ${SCHEMA_FILE}"

if [ ! -f "${SCHEMA_FILE}" ]; then
  echo "ERROR: ${SCHEMA_FILE} not found."
  echo "TODO: Create docs/schema/master-schema.json with Primavera schema definitions."
  exit 1
fi

# Generate INSERT statements from the JSON file
INSERTS=$(node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('${SCHEMA_FILE}', 'utf8'));
  const entries = Array.isArray(data) ? data : data.entries || data.columns || [];

  if (entries.length === 0) {
    console.error('No entries found in master-schema.json');
    process.exit(1);
  }

  const escape = (s) => s ? s.replace(/'/g, \"''\") : '';

  for (const e of entries) {
    const version = escape(e.primavera_version || 'V10');
    const table = escape(e.table_name);
    const column = escape(e.column_name);
    const descPt = escape(e.description_pt || '');
    const descEn = escape(e.description_en || '');
    const category = escape(e.category || '');
    const joins = escape(e.common_joins || '');

    console.log(
      \"INSERT OR REPLACE INTO master_schema (id, primavera_version, table_name, column_name, description_pt, description_en, category, common_joins) \" +
      \"VALUES (lower(hex(randomblob(16))), '\" + version + \"', '\" + table + \"', '\" + column + \"', '\" + descPt + \"', '\" + descEn + \"', '\" + category + \"', '\" + joins + \"');\"
    );
  }
")

if [ -z "${INSERTS}" ]; then
  echo "ERROR: No INSERT statements generated."
  exit 1
fi

ROW_COUNT=$(echo "${INSERTS}" | wc -l | tr -d ' ')
echo "==> Generated ${ROW_COUNT} INSERT statements"

# Write to a temp file and execute
TMPFILE=$(mktemp /tmp/apura-seed-XXXXXX.sql)
echo "${INSERTS}" > "${TMPFILE}"

echo "==> Executing seed SQL..."
npx wrangler d1 execute "${DB_NAME}" --file "${TMPFILE}"

rm -f "${TMPFILE}"

echo "==> Seed complete. Inserted/replaced ${ROW_COUNT} rows into master_schema."
