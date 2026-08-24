-- These legacy/internal routines are not part of the anonymous storefront.
-- Storefront finalization now runs through the Stripe-verifying Edge backend.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'increment_item_qty',
        'sp_create_order_and_discount',
        'sp_create_order_and_discount_v2',
        'vincular_cliente_portal'
      ])
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end;
$$;
