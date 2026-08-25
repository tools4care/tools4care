-- Consolidate policies without changing effective access. Authenticated users
-- already have the standard ALL policy; anonymous users retain online stock.

drop policy if exists "stock_van_admin_delete" on public.stock_van;
drop policy if exists "stock_van_admin_insert" on public.stock_van;
drop policy if exists "stock_van_admin_update" on public.stock_van;
drop policy if exists "stock_van_del" on public.stock_van;
drop policy if exists "stock_van_ins" on public.stock_van;
drop policy if exists "stock_van_insert_by_member" on public.stock_van;
drop policy if exists "stock_van_read_all" on public.stock_van;
drop policy if exists "stock_van_sel" on public.stock_van;
drop policy if exists "stock_van_select_by_member" on public.stock_van;
drop policy if exists "stock_van_upd" on public.stock_van;

alter policy "stock_van_select_online"
  on public.stock_van
  to anon;

drop policy if exists "own customer read" on public.store_customers;
drop policy if exists "own customer update" on public.store_customers;
drop policy if exists "own customer upsert" on public.store_customers;
