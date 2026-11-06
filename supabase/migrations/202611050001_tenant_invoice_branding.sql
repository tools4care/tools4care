-- Tenant pilot §1: invoices must show the tenant's own business info, not
-- Tools4Care's. Adds the fields the invoice header needs and exposes
-- ventas.tenant_id through facturas_ext so the client can resolve the
-- right seller per invoice.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS logo_url text;

-- CREATE OR REPLACE VIEW only allows appending columns at the end — it
-- cannot change the ordinal position of an existing column (errors with
-- 42P16). tenant_id is therefore appended last, not inserted after
-- cliente_id, so every already-existing column keeps its original slot.
create or replace view facturas_ext
with (security_invoker = true)
as
 SELECT v.id,
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
    c.nombre AS cliente_nombre_c,
    c.email AS cliente_email,
    c.telefono AS cliente_telefono,
    c.direccion AS cliente_direccion,
    v.tenant_id
   FROM ventas v
     LEFT JOIN clientes c ON c.id = v.cliente_id;
