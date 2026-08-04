-- Two more instances of the same pre-existing "authenticated app access"
-- (qual: true) pattern, found while investigating why the Test tenant
-- still saw 46 products and why "Test" showed up in Tools4Care staff's
-- own location list:
--
-- 1. `vans` has a tenant_id column already (established convention, NULL
--    = Tools4Care) but its policies never used it — any authenticated
--    user of any tenant could see (and, via vans_admin_insert/update,
--    modify) every tenant's vans/locations. Symmetric leak: Tools4Care
--    staff saw the Test tenant's "Test" location, and the Test tenant
--    could see Tools4Care's real V89-100/X86-796 vans.
--
-- 2. `productos_select_public` (added for the anonymous public storefront
--    to browse online-visible items without logging in) was granted to
--    BOTH `anon` and `authenticated`. Since RLS policies are OR'd, this
--    let any authenticated user of any tenant see Tools4Care's 46
--    online-visible products regardless of tenant_id, bypassing the
--    tenant isolation added in 202608031/202608034 for that subset.
--    Restricting it to `anon` only closes this without affecting the
--    public storefront (which is always unauthenticated).

drop policy if exists "authenticated app access" on vans;
drop policy if exists "vans_read_all" on vans;

create policy "vans_tenant_isolation" on vans for select
  using (auth.role() = 'authenticated' and tenant_id is not distinct from (select current_user_tenant_id()));

create policy "vans_tenant_write" on vans for all
  using (auth.role() = 'authenticated' and is_admin() and tenant_id is not distinct from (select current_user_tenant_id()))
  with check (auth.role() = 'authenticated' and is_admin() and tenant_id is not distinct from (select current_user_tenant_id()));

drop policy if exists "vans_admin_insert" on vans;
drop policy if exists "vans_admin_update" on vans;
drop policy if exists "vans_admin_delete" on vans;

alter policy "productos_select_public" on productos to anon;

-- Missed on the first pass: vans_select_public (qual: true) was also
-- granted to `authenticated`, so it alone kept every van/location visible
-- to every tenant even after vans_tenant_isolation was added above —
-- confirmed live (Tools4Care staff still saw all 5 vans, including the
-- Test tenant's "Test" location, until this ran). Same anon-only fix.
alter policy "vans_select_public" on vans to anon;
