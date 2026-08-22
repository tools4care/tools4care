#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
read -r -s -p "Database password: " WALKIN_DB_PASSWORD
printf '\n'
trap 'unset WALKIN_DB_PASSWORD' EXIT

DB_URL="host=aws-0-us-east-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.gvloygqbavibmpakzdma sslmode=require"
PGPASSWORD="$WALKIN_DB_PASSWORD" psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/202608200001_allow_walkin_terminal_sales.sql

echo "Walk-in Tap to Pay database migration applied successfully."
