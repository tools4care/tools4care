-- Remove manually-created legacy usuario policies that still grant blanket
-- authenticated access in production. Portal users must never be able to
-- create or promote a staff identity.

begin;

drop policy if exists "authenticated app access" on public.usuarios;
drop policy if exists "Usuarios pueden actualizar su propio perfil" on public.usuarios;
drop policy if exists "Admins pueden actualizar cualquier perfil" on public.usuarios;
drop policy if exists "Usuarios pueden ver todos los perfiles" on public.usuarios;
drop policy if exists "select own or admin" on public.usuarios;
drop policy if exists "update own profile without escalating, or admin" on public.usuarios;
drop policy if exists "admin deletes users" on public.usuarios;

create policy "select own or admin" on public.usuarios
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "update own profile without escalating, or admin" on public.usuarios
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (
    public.is_admin()
    or (
      id = (select auth.uid())
      and rol = (select u.rol from public.usuarios u where u.id = (select auth.uid()))
      and activo = (select u.activo from public.usuarios u where u.id = (select auth.uid()))
      and descuento_max is not distinct from (
        select u.descuento_max from public.usuarios u where u.id = (select auth.uid())
      )
      and modulos is not distinct from (
        select u.modulos from public.usuarios u where u.id = (select auth.uid())
      )
      and tenant_id is not distinct from (
        select u.tenant_id from public.usuarios u where u.id = (select auth.uid())
      )
    )
  );

create policy "admin deletes users" on public.usuarios
  for delete to authenticated
  using (public.is_active_staff() and public.is_admin());

commit;
