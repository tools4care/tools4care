-- Staff must be able to inspect line items for walk-in sales. Walk-in sales
-- intentionally have cliente_id NULL, so the customer-only policy otherwise
-- hides their detalle_ventas rows and makes receipts appear empty.
begin;

drop policy if exists detalle_ventas_staff_all on public.detalle_ventas;

create policy detalle_ventas_staff_all on public.detalle_ventas
  for all to authenticated
  using (
    exists (
      select 1
      from public.ventas v
      join public.vans vn on vn.id = v.van_id
      join public.usuarios u on u.id = auth.uid()
      where v.id = detalle_ventas.venta_id
        and u.activo = true
        and vn.tenant_id is not distinct from u.tenant_id
        and (
          v.cliente_id is null
          or public.staff_can_access_cliente(v.cliente_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.ventas v
      join public.vans vn on vn.id = v.van_id
      join public.usuarios u on u.id = auth.uid()
      where v.id = detalle_ventas.venta_id
        and u.activo = true
        and vn.tenant_id is not distinct from u.tenant_id
        and (
          v.cliente_id is null
          or public.staff_can_access_cliente(v.cliente_id)
        )
    )
  );

commit;
