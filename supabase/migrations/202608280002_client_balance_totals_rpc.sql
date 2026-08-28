-- Aggregate the Customers summary in PostgreSQL instead of downloading every
-- customer balance to the browser. The invoker view preserves existing RLS.
create or replace function public.get_clientes_balance_totals()
returns table(total_clients bigint, clients_with_debt bigint, total_outstanding numeric)
language sql stable set search_path = public
as $$
  select count(*)::bigint,
         count(*) filter (where balance > 0)::bigint,
         coalesce(sum(greatest(balance, 0)), 0)::numeric
    from public.clientes_balance_v2;
$$;
revoke all on function public.get_clientes_balance_totals() from public;
grant execute on function public.get_clientes_balance_totals() to authenticated;
