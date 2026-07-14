-- Productos que un cliente recompra con frecuencia (no el pedido anterior completo).
-- Umbral (ratio >= 0.3, min 3 pedidos) validado contra datos reales de producción:
-- repetir el ultimo pedido completo tiene 84% de solapamiento cero entre pedidos
-- consecutivos, pero ~55% de los clientes con 3+ pedidos SI tienen al menos un
-- producto "de cabecera" que compran en un tercio o mas de sus visitas.
CREATE OR REPLACE VIEW v_productos_habituales_cliente AS
WITH pedidos_cliente AS (
  SELECT cliente_id, COUNT(DISTINCT id) AS total_ordenes
  FROM ventas
  WHERE tipo IS DISTINCT FROM 'devolucion' AND cliente_id IS NOT NULL
  GROUP BY cliente_id
),
compras_producto AS (
  SELECT
    v.cliente_id,
    dv.producto_id,
    COUNT(DISTINCT v.id) AS veces_comprado,
    MAX(v.created_at) AS ultima_compra,
    CASE WHEN COUNT(DISTINCT v.id) >= 3 THEN
      (MAX(v.created_at)::date - MIN(v.created_at)::date)::numeric
        / NULLIF(COUNT(DISTINCT v.id) - 1, 0)
    END AS dias_promedio_entre_compras
  FROM ventas v
  JOIN detalle_ventas dv ON dv.venta_id = v.id
  WHERE v.tipo IS DISTINCT FROM 'devolucion' AND v.cliente_id IS NOT NULL
  GROUP BY v.cliente_id, dv.producto_id
)
SELECT
  cp.cliente_id,
  cp.producto_id,
  p.nombre AS producto_nombre,
  cp.veces_comprado,
  pc.total_ordenes,
  ROUND(cp.veces_comprado::numeric / pc.total_ordenes, 3) AS ratio_recompra,
  cp.ultima_compra,
  cp.dias_promedio_entre_compras,
  EXTRACT(DAY FROM NOW() - cp.ultima_compra)::int AS dias_desde_ultima_compra,
  (
    cp.dias_promedio_entre_compras IS NOT NULL
    AND EXTRACT(DAY FROM NOW() - cp.ultima_compra) > cp.dias_promedio_entre_compras * 1.2
  ) AS vencido
FROM compras_producto cp
JOIN pedidos_cliente pc ON pc.cliente_id = cp.cliente_id
JOIN productos p ON p.id = cp.producto_id
WHERE pc.total_ordenes >= 3
  AND cp.veces_comprado::numeric / pc.total_ordenes >= 0.3
ORDER BY cp.cliente_id, ratio_recompra DESC;

GRANT SELECT ON v_productos_habituales_cliente TO authenticated;
