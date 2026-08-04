-- CRITICAL: clientes and productos had no tenant scoping at all — any
-- authenticated user (including a newly invited tenant owner) could read
-- and write the full tables via long-standing, overly-permissive policies
-- ("authenticated app access" ALL/true, "read_clientes" SELECT/true,
-- "productos_read_all" SELECT/true, and several `auth.role() =
-- 'authenticated'` variants). Discovered 2026-08-03 when a real test tenant
-- ("Test", team.evangephotography@gmail.com) was found able to see all
-- 1137 production clients and 8527 products.
--
-- NULL tenant_id means "Tools4Care's own original data" — matches how
-- usuarios.tenant_id and vans.tenant_id already work, so the existing
-- 1137/8527 rows need no backfill; they're already correctly NULL.

alter table clientes add column if not exists tenant_id uuid references tenants(id) on delete set null;
alter table productos add column if not exists tenant_id uuid references tenants(id) on delete set null;

create index if not exists clientes_tenant_id_idx on clientes(tenant_id);
create index if not exists productos_tenant_id_idx on productos(tenant_id);

-- The calling user's own tenant (or null for Tools4Care's own staff).
create or replace function current_user_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from usuarios where id = auth.uid();
$$;

-- Forces tenant_id to match the inserting user on every insert — the app
-- layer never has to remember to set it, and a client-side bug can't leak
-- a row into (or read a row out of) the wrong tenant.
create or replace function stamp_tenant_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  NEW.tenant_id := current_user_tenant_id();
  return NEW;
end;
$$;

drop trigger if exists trg_clientes_stamp_tenant on clientes;
create trigger trg_clientes_stamp_tenant before insert on clientes
  for each row execute function stamp_tenant_id();

drop trigger if exists trg_productos_stamp_tenant on productos;
create trigger trg_productos_stamp_tenant before insert on productos
  for each row execute function stamp_tenant_id();

-- Replace the pile of overlapping, overly-permissive policies with one
-- clear tenant-scoped policy per table. The admin-gated variants
-- (clientes_admin_insert etc.) were redundant anyway — "authenticated app
-- access" alone already granted blanket access to everyone.
drop policy if exists "Enable insert for authenticated users only" on clientes;
drop policy if exists "Usuarios autenticados pueden borrar clientes" on clientes;
drop policy if exists "Usuarios autenticados pueden crear clientes" on clientes;
drop policy if exists "Usuarios autenticados pueden editar clientes" on clientes;
drop policy if exists "Usuarios autenticados pueden leer clientes" on clientes;
drop policy if exists "authenticated app access" on clientes;
drop policy if exists "clientes_admin_delete" on clientes;
drop policy if exists "clientes_admin_insert" on clientes;
drop policy if exists "clientes_admin_update" on clientes;
drop policy if exists "read_clientes" on clientes;

create policy "clientes_tenant_isolation" on clientes for all
  using (auth.role() = 'authenticated' and tenant_id is not distinct from current_user_tenant_id())
  with check (auth.role() = 'authenticated' and tenant_id is not distinct from current_user_tenant_id());

drop policy if exists "Enable insert for authenticated users only" on productos;
drop policy if exists "Usuarios autenticados pueden borrar productos" on productos;
drop policy if exists "Usuarios autenticados pueden editar productos" on productos;
drop policy if exists "Usuarios autenticados pueden leer productos" on productos;
drop policy if exists "allow productos select" on productos;
drop policy if exists "authenticated app access" on productos;
drop policy if exists "productos_admin_delete" on productos;
drop policy if exists "productos_admin_insert" on productos;
drop policy if exists "productos_admin_update" on productos;
drop policy if exists "productos_read_all" on productos;
-- "productos_select_public" is deliberately left alone — it's the public
-- storefront's own narrower policy (anonymous read of online-visible
-- items only, scoped through stock_van/vans/online_product_meta), a
-- separate concern from authenticated in-app access.

create policy "productos_tenant_isolation" on productos for all
  using (auth.role() = 'authenticated' and tenant_id is not distinct from current_user_tenant_id())
  with check (auth.role() = 'authenticated' and tenant_id is not distinct from current_user_tenant_id());
