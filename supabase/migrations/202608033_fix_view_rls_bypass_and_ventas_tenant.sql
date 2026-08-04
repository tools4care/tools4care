-- Part A: tenant-scope `ventas`, mirroring the clientes/productos fix in
-- 202608031. Reuses current_user_tenant_id()/stamp_tenant_id() from that
-- migration. NULL tenant_id = Tools4Care's own data (existing convention),
-- so no backfill is needed.

alter table ventas add column if not exists tenant_id uuid references tenants(id) on delete set null;
create index if not exists ventas_tenant_id_idx on ventas(tenant_id);

drop trigger if exists trg_ventas_stamp_tenant on ventas;
create trigger trg_ventas_stamp_tenant before insert on ventas
  for each row execute function stamp_tenant_id();

drop policy if exists "Usuarios autenticados pueden borrar ventas" on ventas;
drop policy if exists "Usuarios autenticados pueden crear ventas" on ventas;
drop policy if exists "Usuarios autenticados pueden editar ventas" on ventas;
drop policy if exists "Usuarios autenticados pueden leer ventas" on ventas;
drop policy if exists "authenticated app access" on ventas;
drop policy if exists "read_ventas" on ventas;

create policy "ventas_tenant_isolation" on ventas for all
  using (auth.role() = 'authenticated' and tenant_id is not distinct from current_user_tenant_id())
  with check (auth.role() = 'authenticated' and tenant_id is not distinct from current_user_tenant_id());

-- Part B: the actual root cause of the leak persisting after 202608031 —
-- every view in this schema is owned by `postgres` (a superuser that
-- bypasses RLS) and none had `security_invoker` set, so RLS on the
-- underlying tables was never enforced for reads that go through a view.
-- Adding security_invoker = true (supported PG15+, this project runs
-- 15.8) makes each view run with the querying user's own RLS context
-- instead of the owner's. Definitions below are byte-for-byte copies of
-- the existing views (via pg_get_viewdef), only the WITH clause is new —
-- except clientes_balance_v2, which also gains tenant_id/client_number
-- columns needed for the fix to matter here and for the client-number UI.

create or replace view clientes_balance_v2
with (security_invoker = true)
as
 SELECT c.id,
    c.nombre,
    c.telefono,
    c.email,
    c.negocio,
    c.direccion,
        CASE
            WHEN c.direccion IS NULL OR c.direccion = ''::text THEN NULL::text
            WHEN c.direccion ~~ '{%'::text OR c.direccion ~~ '"%'::text THEN COALESCE(c.direccion::jsonb ->> 'calle'::text, c.direccion)
            ELSE c.direccion
        END AS dir_calle,
        CASE
            WHEN c.direccion IS NULL OR c.direccion = ''::text THEN NULL::text
            WHEN c.direccion ~~ '{%'::text OR c.direccion ~~ '"%'::text THEN c.direccion::jsonb ->> 'ciudad'::text
            ELSE NULL::text
        END AS dir_ciudad,
        CASE
            WHEN c.direccion IS NULL OR c.direccion = ''::text THEN NULL::text
            WHEN c.direccion ~~ '{%'::text OR c.direccion ~~ '"%'::text THEN c.direccion::jsonb ->> 'estado'::text
            ELSE NULL::text
        END AS dir_estado,
        CASE
            WHEN c.direccion IS NULL OR c.direccion = ''::text THEN NULL::text
            WHEN c.direccion ~~ '{%'::text OR c.direccion ~~ '"%'::text THEN c.direccion::jsonb ->> 'zip'::text
            ELSE NULL::text
        END AS dir_zip,
    regexp_replace(COALESCE(c.telefono, ''::text), '[^0-9]'::text, ''::text, 'g'::text) AS tel_norm,
    COALESCE(cxc.saldo, 0::numeric) AS balance,
    c.tenant_id,
    c.client_number
   FROM clientes c
     LEFT JOIN v_cxc_cliente_detalle cxc ON c.id = cxc.cliente_id;

create or replace view clientes_balance
with (security_invoker = true)
as
 SELECT c.id,
    c.nombre,
    c.telefono,
    c.email,
    c.negocio,
    c.direccion,
    COALESCE(v.saldo, 0::numeric) AS balance,
    regexp_replace(COALESCE(c.telefono, ''::text), '\D'::text, ''::text, 'g'::text) AS tel_norm,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb
            ELSE NULL::jsonb
        END AS direccion_json,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb ->> 'calle'::text
            ELSE NULL::text
        END AS dir_calle,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb ->> 'ciudad'::text
            ELSE NULL::text
        END AS dir_ciudad,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb ->> 'estado'::text
            ELSE NULL::text
        END AS dir_estado,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb ->> 'zip'::text
            ELSE NULL::text
        END AS dir_zip
   FROM clientes c
     LEFT JOIN v_cxc_cliente_detalle v ON v.cliente_id = c.id;

create or replace view v_cxc_cliente_detalle
with (security_invoker = true)
as
 WITH mov AS (
         SELECT cm.cliente_id,
            sum(
                CASE cm.tipo
                    WHEN 'venta'::text THEN cm.monto
                    WHEN 'ajuste_inicial'::text THEN cm.monto
                    WHEN 'cargo'::text THEN cm.monto
                    WHEN 'pago'::text THEN - cm.monto
                    WHEN 'abono'::text THEN - cm.monto
                    WHEN 'nota_credito'::text THEN - cm.monto
                    WHEN 'devolucion'::text THEN - cm.monto
                    ELSE 0::numeric
                END) AS saldo
           FROM cxc_movimientos cm
          GROUP BY cm.cliente_id
        ), base AS (
         SELECT c_1.id AS cliente_id,
            COALESCE(c_1.score_credito, 600) AS score_base
           FROM clientes c_1
        ), lim AS (
         SELECT b.cliente_id,
            b.score_base,
                CASE
                    WHEN b.score_base < 500 THEN 0
                    WHEN b.score_base < 550 THEN 30
                    WHEN b.score_base < 600 THEN 80
                    WHEN b.score_base < 650 THEN 150
                    WHEN b.score_base < 700 THEN 200
                    WHEN b.score_base < 750 THEN 350
                    WHEN b.score_base < 800 THEN 500
                    ELSE 800
                END::numeric AS limite_politica
           FROM base b
        )
 SELECT c.id AS cliente_id,
    COALESCE(mov.saldo, 0::numeric) AS saldo,
    COALESCE(lim.limite_politica, 0::numeric) AS limite_politica,
    GREATEST(COALESCE(lim.limite_politica, 0::numeric) - GREATEST(COALESCE(mov.saldo, 0::numeric), 0::numeric), 0::numeric) AS credito_disponible,
    lim.score_base
   FROM clientes c
     LEFT JOIN mov ON mov.cliente_id = c.id
     LEFT JOIN lim ON lim.cliente_id = c.id;

create or replace view v_cxc_cliente_detalle_ext
with (security_invoker = true)
as
 WITH mov AS (
         SELECT cm.cliente_id,
            sum(
                CASE cm.tipo
                    WHEN 'venta'::text THEN cm.monto
                    WHEN 'ajuste_inicial'::text THEN cm.monto
                    WHEN 'cargo'::text THEN cm.monto
                    WHEN 'pago'::text THEN - cm.monto
                    WHEN 'abono'::text THEN - cm.monto
                    WHEN 'nota_credito'::text THEN - cm.monto
                    WHEN 'devolucion'::text THEN - cm.monto
                    ELSE 0::numeric
                END) AS saldo
           FROM cxc_movimientos cm
          GROUP BY cm.cliente_id
        ), base AS (
         SELECT c.id AS cliente_id,
            c.nombre AS cliente_nombre,
            COALESCE(c.score_credito, 600) AS score_base,
            c.limite_manual,
            c.telefono,
            c.direccion,
            c.negocio
           FROM clientes c
        ), policy AS (
         SELECT b.cliente_id,
            b.cliente_nombre,
            b.score_base,
            b.limite_manual,
            b.telefono,
            b.direccion,
            b.negocio,
                CASE
                    WHEN b.score_base < 500 THEN 0
                    WHEN b.score_base < 550 THEN 30
                    WHEN b.score_base < 600 THEN 80
                    WHEN b.score_base < 650 THEN 150
                    WHEN b.score_base < 700 THEN 200
                    WHEN b.score_base < 750 THEN 350
                    WHEN b.score_base < 800 THEN 500
                    ELSE 800
                END::numeric AS limite_politica_base
           FROM base b
        )
 SELECT p.cliente_id,
    p.cliente_nombre,
    COALESCE(m.saldo, 0::numeric) AS saldo,
    COALESCE(p.limite_manual, p.limite_politica_base) AS limite_politica,
    GREATEST(COALESCE(p.limite_manual, p.limite_politica_base) - GREATEST(COALESCE(m.saldo, 0::numeric), 0::numeric), 0::numeric) AS credito_disponible,
    p.score_base,
    p.limite_manual,
    p.telefono,
    p.direccion,
    p.negocio AS nombre_negocio
   FROM policy p
     LEFT JOIN mov m ON m.cliente_id = p.cliente_id;

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
    c.direccion AS cliente_direccion
   FROM ventas v
     LEFT JOIN clientes c ON c.id = v.cliente_id;

create or replace view v_barberia_visitas
with (security_invoker = true)
as
 SELECT c.barberia_id,
    b.nombre AS barberia_nombre,
    (v.fecha AT TIME ZONE 'America/New_York'::text)::date AS visit_date,
    min(v.fecha) AS first_sale_at,
    max(v.fecha) AS last_sale_at,
    count(DISTINCT v.id) AS sales_count,
    EXTRACT(epoch FROM max(v.fecha) - min(v.fecha)) / 60.0 AS active_minutes,
    EXTRACT(epoch FROM max(v.fecha) - min(v.fecha)) / 60.0 + (( SELECT site_settings.barberia_visit_buffer_minutes
           FROM site_settings
          WHERE site_settings.id = 1))::numeric AS estimated_minutes
   FROM ventas v
     JOIN clientes c ON c.id = v.cliente_id
     JOIN barberias b ON b.id = c.barberia_id
  WHERE c.barberia_id IS NOT NULL
  GROUP BY c.barberia_id, b.nombre, ((v.fecha AT TIME ZONE 'America/New_York'::text)::date);

create or replace view v_productos_habituales_cliente
with (security_invoker = true)
as
 WITH pedidos_cliente AS (
         SELECT ventas.cliente_id,
            count(DISTINCT ventas.id) AS total_ordenes
           FROM ventas
          WHERE ventas.tipo::text IS DISTINCT FROM 'devolucion'::text AND ventas.cliente_id IS NOT NULL
          GROUP BY ventas.cliente_id
        ), compras_producto AS (
         SELECT v.cliente_id,
            dv.producto_id,
            count(DISTINCT v.id) AS veces_comprado,
            max(v.created_at) AS ultima_compra,
                CASE
                    WHEN count(DISTINCT v.id) >= 3 THEN (max(v.created_at)::date - min(v.created_at)::date)::numeric / NULLIF(count(DISTINCT v.id) - 1, 0)::numeric
                    ELSE NULL::numeric
                END AS dias_promedio_entre_compras
           FROM ventas v
             JOIN detalle_ventas dv ON dv.venta_id = v.id
          WHERE v.tipo::text IS DISTINCT FROM 'devolucion'::text AND v.cliente_id IS NOT NULL
          GROUP BY v.cliente_id, dv.producto_id
        )
 SELECT cp.cliente_id,
    cp.producto_id,
    p.nombre AS producto_nombre,
    cp.veces_comprado,
    pc.total_ordenes,
    round(cp.veces_comprado::numeric / pc.total_ordenes::numeric, 3) AS ratio_recompra,
    cp.ultima_compra,
    cp.dias_promedio_entre_compras,
    EXTRACT(day FROM now() - cp.ultima_compra)::integer AS dias_desde_ultima_compra,
    cp.dias_promedio_entre_compras IS NOT NULL AND EXTRACT(day FROM now() - cp.ultima_compra) > (cp.dias_promedio_entre_compras * 1.2) AS vencido
   FROM compras_producto cp
     JOIN pedidos_cliente pc ON pc.cliente_id = cp.cliente_id
     JOIN productos p ON p.id = cp.producto_id
  WHERE pc.total_ordenes >= 3 AND (cp.veces_comprado::numeric / pc.total_ordenes::numeric) >= 0.3
  ORDER BY cp.cliente_id, (round(cp.veces_comprado::numeric / pc.total_ordenes::numeric, 3)) DESC;
