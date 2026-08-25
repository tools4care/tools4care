-- Enforce ownership using auth.uid() for signed-in carts and x-ev-anon for
-- anonymous carts. Remove broad compatibility policies that bypassed these
-- ownership checks.

drop policy if exists "authenticated app access" on public.carts;
drop policy if exists "carts_delete_own" on public.carts;
drop policy if exists "carts_insert_any" on public.carts;
drop policy if exists "carts_insert_own" on public.carts;
drop policy if exists "carts_rw_public" on public.carts;
drop policy if exists "carts_select_own" on public.carts;
drop policy if exists "carts_update_own" on public.carts;

drop policy if exists "authenticated app access" on public.cart_items;
drop policy if exists "cart_items_anon_all" on public.cart_items;
drop policy if exists "cart_items_auth_all" on public.cart_items;
drop policy if exists "cart_items_rw_by_cart" on public.cart_items;
drop policy if exists "cart_items_rw_public" on public.cart_items;
