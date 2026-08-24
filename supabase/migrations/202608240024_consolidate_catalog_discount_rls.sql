-- Preserve the current effective access with one policy per role/action:
-- anonymous catalog reads remain available and authenticated users retain
-- their standard full-access policy.

drop policy if exists "discount_codes_select_public"
  on public.discount_codes;
drop policy if exists "discount_codes_write_authenticated"
  on public.discount_codes;
drop policy if exists "discounts-write-admin"
  on public.discount_codes;
alter policy "discounts-select-public"
  on public.discount_codes
  to anon;

drop policy if exists "meta rw authenticated"
  on public.online_product_meta;
drop policy if exists "meta_insert"
  on public.online_product_meta;
drop policy if exists "meta_select"
  on public.online_product_meta;
drop policy if exists "meta_update"
  on public.online_product_meta;
drop policy if exists "opm_admin_delete"
  on public.online_product_meta;
drop policy if exists "opm_admin_insert"
  on public.online_product_meta;
drop policy if exists "opm_admin_update"
  on public.online_product_meta;
drop policy if exists "opm_read_all"
  on public.online_product_meta;
drop policy if exists "opm_select_public"
  on public.online_product_meta;

alter policy "Public read product_main_image_map"
  on public.product_main_image_map
  to anon;
