-- Keep the standard authenticated ALL policy and preserve any distinct anon
-- or public read policy. Removed policies add no effective access.

drop policy if exists "auth manage audit log"
  on public.audit_log;

drop policy if exists "auth manage client store credit"
  on public.cliente_credito_movimientos;

drop policy if exists "authenticated manage gastos_conductor"
  on public.gastos_conductor;

drop policy if exists "imgs rw authenticated"
  on public.online_product_images;

drop policy if exists "site_settings_write_auth"
  on public.site_settings;

drop policy if exists "auth_write_product_images_tbl"
  on public.product_images;
drop policy if exists "product_images_admin_delete"
  on public.product_images;
drop policy if exists "product_images_admin_insert"
  on public.product_images;
drop policy if exists "product_images_admin_update"
  on public.product_images;
drop policy if exists "product_images_read_all"
  on public.product_images;
drop policy if exists "product_images_select_public"
  on public.product_images;

alter policy "public_read_product_images_tbl"
  on public.product_images
  to anon;

alter policy "site_settings_select_public"
  on public.site_settings
  to anon;
