-- Keep public storefront/cart RPCs available, but prevent anonymous callers
-- from invoking internal staff, accounting, closeout, return, and stock RPCs.
-- Authenticated application users and trusted backend jobs retain access.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (array[
        'agregar_credito_favor_cliente',
        'aplicar_credito_favor_cliente',
        'apply_online_stock_for_order',
        'auto_mark_merchant_fault_cargos',
        'auto_mark_merchant_fault_cargos_lite',
        'create_sale',
        'cxc_aplicar_ajuste',
        'cxc_crear_ajuste_inicial',
        'cxc_registrar_pago',
        'dec_stock_for_order_v2',
        'dec_stock_for_payment',
        'dec_stock_for_payment_uuid',
        'dec_stock_online_for_order',
        'decrement_online_stock',
        'fechas_pendientes_cierre_van',
        'fn_apply_sale_stock',
        'fn_apply_stock_for_venta',
        'fn_revert_stock_for_venta',
        'get_orders',
        'mark_merchant_fault_cargos_auto',
        'mark_merchant_fault_cargos_auto_lite',
        'mark_order_paid',
        'mark_order_paid_v2',
        'procesar_devolucion',
        'refresh_customer_credit_score',
        'sp_sumar_stock_solo_existente',
        'sync_online_meta',
        'transfer_location_stock',
        'transferir_stock',
        'ventas_guardar_v3'
      ])
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end;
$$;
