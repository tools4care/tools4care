-- Administrative inventory RPCs are staff/backend operations. The legacy
-- decrement_stock_van RPC is intentionally excluded until the storefront's
-- post-payment fallback is moved fully server-side.

revoke all on function public.acknowledge_inventory_transfer(uuid) from public, anon;
revoke all on function public.adjust_stock_van(uuid,uuid,integer) from public, anon;
revoke all on function public.ajustar_stock(uuid,numeric,text,uuid,text,uuid,text,uuid) from public, anon;
revoke all on function public.decrementar_stock_van(uuid,uuid,numeric) from public, anon;
revoke all on function public.establecer_stock(uuid,numeric,text,uuid,text,uuid) from public, anon;
revoke all on function public.get_low_stock_van(uuid) from public, anon;
revoke all on function public.increment_stock_van(uuid,uuid,integer) from public, anon;
revoke all on function public.set_location_stock(uuid,numeric,text,uuid,text) from public, anon;
revoke all on function public.transferir_stock(uuid,numeric,text,uuid,text,uuid,text,uuid) from public, anon;

grant execute on function public.acknowledge_inventory_transfer(uuid) to authenticated, service_role;
grant execute on function public.adjust_stock_van(uuid,uuid,integer) to authenticated, service_role;
grant execute on function public.ajustar_stock(uuid,numeric,text,uuid,text,uuid,text,uuid) to authenticated, service_role;
grant execute on function public.decrementar_stock_van(uuid,uuid,numeric) to authenticated, service_role;
grant execute on function public.establecer_stock(uuid,numeric,text,uuid,text,uuid) to authenticated, service_role;
grant execute on function public.get_low_stock_van(uuid) to authenticated, service_role;
grant execute on function public.increment_stock_van(uuid,uuid,integer) to authenticated, service_role;
grant execute on function public.set_location_stock(uuid,numeric,text,uuid,text) to authenticated, service_role;
grant execute on function public.transferir_stock(uuid,numeric,text,uuid,text,uuid,text,uuid) to authenticated, service_role;
