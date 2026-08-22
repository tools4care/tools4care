#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
migration_file="${project_dir}/supabase/migrations/202608140001_automatic_credit_score_history.sql"

if [[ ! -f "$migration_file" ]]; then
  echo "ERROR: migration not found: $migration_file" >&2
  exit 1
fi

read -r -s -p "Database password: " credit_db_password
echo

connection="host=aws-0-us-east-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.gvloygqbavibmpakzdma sslmode=require"

PGPASSWORD="$credit_db_password" psql "$connection" \
  -v ON_ERROR_STOP=1 \
  -f "$migration_file"

PGPASSWORD="$credit_db_password" psql "$connection" \
  -v ON_ERROR_STOP=1 \
  -c "select to_regclass('public.credit_score_history') as history_table, to_regprocedure('public.refresh_customer_credit_score(uuid,text,text,uuid,text)') as scoring_function;" \
  -c "select tgname from pg_trigger where tgname like 'zz_refresh_credit_score_%' and not tgisinternal order by tgname;" \
  -c "select count(*) as baseline_history_rows, count(distinct cliente_id) as scored_customers from public.credit_score_history;"

unset credit_db_password
echo "Automatic credit scoring installed and verified successfully."
