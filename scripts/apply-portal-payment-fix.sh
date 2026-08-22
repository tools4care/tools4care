#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
migration_file="${project_dir}/supabase/migrations/202608110001_portal_stripe_payment_application.sql"

if [[ ! -f "$migration_file" ]]; then
  echo "ERROR: no se encontró la migración: $migration_file" >&2
  exit 1
fi

read -r -s -p "Database password: " portal_db_password
echo

PGPASSWORD="$portal_db_password" psql \
  "host=aws-0-us-east-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.gvloygqbavibmpakzdma sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f "$migration_file"

unset portal_db_password
echo "Portal payment database fix applied successfully."
