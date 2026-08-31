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
  -- The generic cash pattern matched "Cash App" before transfer was
  -- evaluated. Match only the literal Cash method (or Spanish efectivo).
  view_sql := replace(view_sql, '(cash|efectivo)', '(efectivo|^cash$)');
  execute 'create or replace view public.v_financial_ledger as ' || view_sql;
end
$$;
