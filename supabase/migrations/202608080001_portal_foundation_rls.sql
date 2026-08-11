-- Customer portal foundation and financial-table tenant isolation.
--
-- This migration is intentionally atomic. It closes the legacy permissive
-- policies before granting portal reads, while preserving active staff access
-- through the staff user's tenant. Service-role processes continue to bypass
-- RLS, as required by transactional RPCs and future Stripe webhooks.

begin;

-- A login may be linked to one customer. Multiple logins may be linked to the
-- same customer (for example, multiple owners of one barbershop).
create table if not exists public.cliente_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_cliente_usuarios_cliente
  on public.cliente_usuarios (cliente_id);

alter table public.cliente_usuarios enable row level security;

drop policy if exists cliente_usuarios_self on public.cliente_usuarios;
create policy cliente_usuarios_self on public.cliente_usuarios
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.cliente_usuarios from anon;
revoke insert, update, delete on table public.cliente_usuarios from authenticated;
grant select on table public.cliente_usuarios to authenticated;

-- A portal login must never inherit access merely because both its missing
-- staff tenant and legacy Tools4Care rows evaluate to NULL.
create or replace function public.is_active_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and u.activo = true
  );
$$;

create or replace function public.staff_can_access_cliente(p_cliente_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    join public.clientes c
      on c.id = p_cliente_id
    where u.id = auth.uid()
      and u.activo = true
      and c.tenant_id is not distinct from u.tenant_id
  );
$$;

create or replace function public.auth_cliente_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select cu.cliente_id
  from public.cliente_usuarios cu
  where cu.user_id = auth.uid();
$$;

revoke all on function public.is_active_staff() from public;
revoke all on function public.staff_can_access_cliente(uuid) from public;
revoke all on function public.auth_cliente_ids() from public;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.staff_can_access_cliente(uuid) to authenticated;
grant execute on function public.auth_cliente_ids() to authenticated;

-- Unknown authenticated accounts must not be able to turn themselves into
-- staff. Staff provisioning remains available through the existing admin-users
-- Edge Function, whose service-role client bypasses RLS.
drop policy if exists "self-provision baseline vendedor account" on public.usuarios;

-- Keep direct admin inserts available for same-tenant administration without
-- allowing self-provisioning by an unrecognized login.
drop policy if exists "admin inserts staff in own tenant" on public.usuarios;
create policy "admin inserts staff in own tenant" on public.usuarios
  for insert to authenticated
  with check (
    public.is_active_staff()
    and public.is_admin()
    and tenant_id is not distinct from (select public.current_user_tenant_id())
  );

-- Existing tenant policies are retained by name but now require a recognized,
-- active staff identity. Portal SELECT policies are additive and read-only.
drop policy if exists clientes_tenant_isolation on public.clientes;
create policy clientes_tenant_isolation on public.clientes
  for all to authenticated
  using (
    public.is_active_staff()
    and tenant_id is not distinct from (select public.current_user_tenant_id())
  )
  with check (
    public.is_active_staff()
    and tenant_id is not distinct from (select public.current_user_tenant_id())
  );

drop policy if exists clientes_portal_select on public.clientes;
create policy clientes_portal_select on public.clientes
  for select to authenticated
  using (id in (select public.auth_cliente_ids()));

drop policy if exists ventas_tenant_isolation on public.ventas;
create policy ventas_tenant_isolation on public.ventas
  for all to authenticated
  using (
    public.is_active_staff()
    and tenant_id is not distinct from (select public.current_user_tenant_id())
  )
  with check (
    public.is_active_staff()
    and tenant_id is not distinct from (select public.current_user_tenant_id())
  );

drop policy if exists ventas_portal_select on public.ventas;
create policy ventas_portal_select on public.ventas
  for select to authenticated
  using (cliente_id in (select public.auth_cliente_ids()));

-- Replace every legacy pagos policy that granted global access. All current
-- production payments have cliente_id populated; new staff writes must keep it.
drop policy if exists "Usuarios autenticados pueden agregar pagos" on public.pagos;
drop policy if exists "Usuarios autenticados pueden leer pagos" on public.pagos;
drop policy if exists "authenticated app access" on public.pagos;
drop policy if exists read_pagos on public.pagos;
drop policy if exists pagos_tenant_isolation on public.pagos;
drop policy if exists pagos_portal_select on public.pagos;

create policy pagos_tenant_isolation on public.pagos
  for all to authenticated
  using (public.staff_can_access_cliente(cliente_id))
  with check (public.staff_can_access_cliente(cliente_id));

create policy pagos_portal_select on public.pagos
  for select to authenticated
  using (cliente_id in (select public.auth_cliente_ids()));

-- The balance view is security-invoker and reads cxc_movimientos, so this table
-- needs the same split between tenant-scoped staff and portal read access.
drop policy if exists "authenticated app access" on public.cxc_movimientos;
drop policy if exists cxc_movimientos_tenant_isolation on public.cxc_movimientos;
drop policy if exists cxc_movimientos_portal_select on public.cxc_movimientos;

create policy cxc_movimientos_tenant_isolation on public.cxc_movimientos
  for all to authenticated
  using (public.staff_can_access_cliente(cliente_id))
  with check (public.staff_can_access_cliente(cliente_id));

create policy cxc_movimientos_portal_select on public.cxc_movimientos
  for select to authenticated
  using (cliente_id in (select public.auth_cliente_ids()));

-- Payment agreements are not exposed in portal v1, but their global ALL/true
-- policies would remain a cross-tenant financial leak if left untouched.
drop policy if exists acuerdos_all on public.acuerdos_pago;
drop policy if exists "authenticated app access" on public.acuerdos_pago;
drop policy if exists acuerdos_pago_tenant_isolation on public.acuerdos_pago;

create policy acuerdos_pago_tenant_isolation on public.acuerdos_pago
  for all to authenticated
  using (public.staff_can_access_cliente(cliente_id))
  with check (public.staff_can_access_cliente(cliente_id));

-- Link an existing auth account to a customer. Only an active admin who can
-- access the target customer may call this function. Dual staff/customer
-- identities are rejected to keep authorization unambiguous.
create or replace function public.vincular_cliente_portal(
  p_email text,
  p_cliente_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
begin
  if not public.is_active_staff() or not public.is_admin() then
    raise exception 'Only an active admin can link portal customers';
  end if;

  if not public.staff_can_access_cliente(p_cliente_id) then
    raise exception 'Customer is outside the current staff tenant';
  end if;

  select au.id
    into v_uid
  from auth.users au
  where lower(au.email) = lower(trim(p_email))
  limit 1;

  if v_uid is null then
    raise exception 'No auth user for email %', p_email;
  end if;

  if exists (select 1 from public.usuarios u where u.id = v_uid) then
    raise exception 'Auth user % is already a staff identity', p_email;
  end if;

  insert into public.cliente_usuarios (user_id, cliente_id)
  values (v_uid, p_cliente_id)
  on conflict (user_id)
  do update set cliente_id = excluded.cliente_id;
end;
$$;

revoke all on function public.vincular_cliente_portal(text, uuid) from public;
grant execute on function public.vincular_cliente_portal(text, uuid) to authenticated;

commit;
