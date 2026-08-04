-- Even after wrapping current_user_tenant_id() in (select ...) (202608034),
-- clientes_balance_v2 (which nests v_cxc_cliente_detalle, which itself
-- re-scans `clientes` internally for score_credito) still timed out in
-- production for real Tools4Care staff — confirmed via EXPLAIN ANALYZE:
-- Postgres chose a Nested Loop Left Join between the two independent,
-- RLS-protected scans of `clientes` (1137 x 1137 row comparisons) instead
-- of a Hash Join, because the RLS-filtered scans get poor row-count
-- estimates that make Nested Loop look artificially cheap to the planner.
--
-- Marking the internal CTEs as MATERIALIZED forces Postgres to compute
-- each one as a standalone, hashable result before joining, restoring a
-- fast Hash Join plan. Confirmed via EXPLAIN ANALYZE this drops the same
-- 25-row page load from a 30s timeout to ~200ms.

create or replace view v_cxc_cliente_detalle
with (security_invoker = true)
as
 WITH mov AS MATERIALIZED (
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
        ), base AS MATERIALIZED (
         SELECT c_1.id AS cliente_id,
            COALESCE(c_1.score_credito, 600) AS score_base
           FROM clientes c_1
        ), lim AS MATERIALIZED (
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
 WITH mov AS MATERIALIZED (
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
        ), base AS MATERIALIZED (
         SELECT c.id AS cliente_id,
            c.nombre AS cliente_nombre,
            COALESCE(c.score_credito, 600) AS score_base,
            c.limite_manual,
            c.telefono,
            c.direccion,
            c.negocio
           FROM clientes c
        ), policy AS MATERIALIZED (
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
