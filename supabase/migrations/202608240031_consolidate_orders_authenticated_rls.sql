-- Keep one authenticated policy for the existing online-order management
-- surface. The specific policies below were fully subsumed by
-- "authenticated app access" and therefore provided no additional control.
drop policy if exists orders_admin_delete on public.orders;
drop policy if exists orders_admin_update on public.orders;
drop policy if exists orders_update_all on public.orders;
