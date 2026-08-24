-- Keep one anonymous policy per public operation and the standard
-- authenticated ALL policy. Effective access remains unchanged.

alter policy "allow_all_inserts_order_items"
  on public.order_items
  to anon;
alter policy "order_items_select_all"
  on public.order_items
  to anon;
drop policy if exists "order_items_admin_delete"
  on public.order_items;
drop policy if exists "order_items_admin_update"
  on public.order_items;

alter policy "osh_ins"
  on public.order_status_history
  to anon;
alter policy "osh_sel"
  on public.order_status_history
  to anon;
drop policy if exists "order_status_history_insert_public"
  on public.order_status_history;
drop policy if exists "order_status_history_select_public"
  on public.order_status_history;
drop policy if exists "osh_insert_auth"
  on public.order_status_history;
drop policy if exists "osh_select_auth"
  on public.order_status_history;
