-- Keep return documents visible in Invoice History, but expose their origin so
-- the UI can distinguish them from revenue-generating sales.
create or replace view public.facturas_ext
with (security_invoker = true)
as
select
  v.id,
  v.van_id,
  v.usuario_id,
  v.cliente_id,
  v.fecha,
  v.total,
  v.estado_pago,
  v.numero_factura,
  v.total_venta,
  v.total_pagado,
  v.pago_efectivo,
  v.pago_tarjeta,
  v.pago_transferencia,
  v.pago_otro,
  v.cierre_id,
  v.factura_seq,
  c.nombre as cliente_nombre_c,
  c.email as cliente_email,
  c.telefono as cliente_telefono,
  c.direccion as cliente_direccion,
  v.tipo,
  v.venta_origen_id
from public.ventas v
left join public.clientes c on c.id = v.cliente_id;
