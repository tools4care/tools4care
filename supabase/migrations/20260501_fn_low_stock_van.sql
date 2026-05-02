create or replace function get_low_stock_van(p_van_id uuid)
returns table(
  producto_id uuid,
  nombre       text,
  codigo       text,
  precio       numeric,
  cantidad     int,
  vendido30d   bigint,
  vendido90d   bigint
) language sql security definer as $$
  select
    sv.producto_id,
    p.nombre,
    p.codigo,
    p.precio,
    sv.cantidad,
    coalesce(sum(dv.cantidad) filter (
      where v.created_at >= now() - interval '30 days'
    ), 0) as vendido30d,
    coalesce(sum(dv.cantidad) filter (
      where v.created_at >= now() - interval '90 days'
    ), 0) as vendido90d
  from stock_van sv
  join productos p on p.id = sv.producto_id
  join detalle_ventas dv on dv.producto_id = sv.producto_id
  join ventas v
    on v.id = dv.venta_id
   and v.van_id = p_van_id
   and v.created_at >= now() - interval '90 days'
  where sv.van_id   = p_van_id
    and sv.cantidad < 10
  group by sv.producto_id, p.nombre, p.codigo, p.precio, sv.cantidad
  having coalesce(sum(dv.cantidad) filter (
    where v.created_at >= now() - interval '90 days'
  ), 0) > 0
  order by sv.cantidad asc, vendido30d desc;
$$;
