-- SECURITY DEFINER functions receive EXECUTE for PUBLIC by default. These
-- staff-only RPCs already validate the caller, but should not be exposed as
-- callable endpoints to unauthenticated users at all.

revoke all on function public.create_product_with_initial_stock(jsonb,numeric,text,uuid) from public, anon;
grant execute on function public.create_product_with_initial_stock(jsonb,numeric,text,uuid) to authenticated, service_role;

revoke all on function public.delete_unused_product(uuid) from public, anon;
grant execute on function public.delete_unused_product(uuid) to authenticated, service_role;

revoke all on function public.guardar_venta_con_cuotas_transaccional(uuid,uuid,uuid,uuid,numeric,numeric,text,text,jsonb,numeric,numeric,numeric,numeric,text,jsonb,numeric,numeric,numeric,numeric,text,uuid[]) from public, anon;
grant execute on function public.guardar_venta_con_cuotas_transaccional(uuid,uuid,uuid,uuid,numeric,numeric,text,text,jsonb,numeric,numeric,numeric,numeric,text,jsonb,numeric,numeric,numeric,numeric,text,uuid[]) to authenticated, service_role;

revoke all on function public.create_payment_agreement_transactional(uuid,uuid,uuid,numeric,integer,integer,timestamp with time zone,boolean,text,jsonb) from public, anon;
grant execute on function public.create_payment_agreement_transactional(uuid,uuid,uuid,numeric,integer,integer,timestamp with time zone,boolean,text,jsonb) to authenticated, service_role;

revoke all on function public.buscar_clientes_por_telefono(text,integer) from public, anon;
grant execute on function public.buscar_clientes_por_telefono(text,integer) to authenticated, service_role;

revoke all on function public.aplicar_pago_a_cuotas(uuid,numeric) from public, anon;
grant execute on function public.aplicar_pago_a_cuotas(uuid,numeric) to authenticated, service_role;

revoke all on function public.aplicar_pago_a_cuotas_seleccionadas(uuid,numeric,uuid[]) from public, anon;
grant execute on function public.aplicar_pago_a_cuotas_seleccionadas(uuid,numeric,uuid[]) to authenticated, service_role;

-- This helper is intentionally callable only by its SECURITY DEFINER wrapper.
revoke all on function public.aplicar_pago_a_cuotas_seleccionadas_internal(uuid,numeric,uuid[]) from public, anon, authenticated, service_role;
