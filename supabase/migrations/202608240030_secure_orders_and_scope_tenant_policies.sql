-- Restrict storefront order writes/reads to the server finalization path and
-- make tenant-only policies explicitly authenticated. The storefront checkout
-- finalizes orders through the service-role Edge Function after Stripe confirms
-- payment; no browser code inserts or lists orders as anon.

drop policy if exists orders_insert_all on public.orders;
drop policy if exists orders_select_all on public.orders;

-- These predicates already require auth.role() = authenticated. Scoping the
-- role list removes the public-role overlap without changing authenticated or
-- anonymous effective access.
alter policy "productos_tenant_isolation" on public.productos to authenticated;
alter policy "vans_tenant_isolation" on public.vans to authenticated;
alter policy "vans_tenant_write" on public.vans to authenticated;
