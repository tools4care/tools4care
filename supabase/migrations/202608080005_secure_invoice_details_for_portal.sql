-- Restrict invoice line items to active staff or the customer who owns the sale.
-- This replaces legacy permissive policies; financial writes remain staff-only.

begin;

alter table public.detalle_ventas enable row level security;

drop policy if exists "Permitir insertar detalle_ventas" on public.detalle_ventas;
drop policy if exists "Solo usuarios autenticados pueden insertar" on public.detalle_ventas;
drop policy if exists "Usuarios autenticados pueden leer detalle de ventas" on public.detalle_ventas;
drop policy if exists "authenticated app access" on public.detalle_ventas;
drop policy if exists detalle_ventas_read on public.detalle_ventas;
drop policy if exists detalle_ventas_staff_all on public.detalle_ventas;
drop policy if exists detalle_ventas_portal_select on public.detalle_ventas;

create policy detalle_ventas_staff_all on public.detalle_ventas
  for all to authenticated
  using (
    exists (
      select 1
      from public.ventas v
      where v.id = detalle_ventas.venta_id
        and public.staff_can_access_cliente(v.cliente_id)
    )
  )
  with check (
    exists (
      select 1
      from public.ventas v
      where v.id = detalle_ventas.venta_id
        and public.staff_can_access_cliente(v.cliente_id)
    )
  );

create policy detalle_ventas_portal_select on public.detalle_ventas
  for select to authenticated
  using (
    exists (
      select 1
      from public.ventas v
      where v.id = detalle_ventas.venta_id
        and v.cliente_id in (select public.auth_cliente_ids())
    )
  );

commit;
