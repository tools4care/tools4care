-- Stripe Terminal payments are card payments, not unclassified transfers.
-- Rebuild the canonical ledger view while preserving its current definition.
do $$
declare
  view_sql text;
begin
  select pg_get_viewdef('public.v_financial_ledger'::regclass, true) into view_sql;
  view_sql := replace(
    view_sql,
    '(card|tarjeta|credit|debit)',
    '(card|tarjeta|credit|debit|stripe|terminal)'
  );
  execute 'create or replace view public.v_financial_ledger as ' || view_sql;
end
$$;
