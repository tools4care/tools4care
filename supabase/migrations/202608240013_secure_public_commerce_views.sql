-- Public commerce views keep their existing grants, but must enforce RLS as
-- the actual caller. Administrative/staging views are not anonymous surfaces.

alter view public._online_van_id set (security_invoker = true);
alter view public.online_catalog_v set (security_invoker = true);
alter view public.online_products_v set (security_invoker = true);
alter view public.order_paid_items_v set (security_invoker = true);
alter view public.orders_view set (security_invoker = true);
alter view public.orders_view_v2 set (security_invoker = true);
alter view public.product_main_image_v set (security_invoker = true);
alter view public.product_reserved_qty_v set (security_invoker = true);
alter view public.stg_clientes_legacy set (security_invoker = true);
alter view public.v_catalogo_online set (security_invoker = true);
alter view public.v_online_catalog_admin set (security_invoker = true);

revoke all on table public.stg_clientes_legacy from anon;
revoke all on table public.v_online_catalog_admin from anon;
grant select on table public.v_online_catalog_admin to authenticated, service_role;
