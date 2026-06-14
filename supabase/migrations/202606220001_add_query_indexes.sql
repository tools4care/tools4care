-- Indexes for columns that are filtered on heavily in Ventas, CuentasPorCobrar,
-- CierreVan/PreCierreVan and Productos but had no supporting index.

CREATE INDEX IF NOT EXISTS idx_ventas_cliente_id ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_van_id_fecha ON ventas(van_id, fecha);

CREATE INDEX IF NOT EXISTS idx_pagos_cliente_id ON pagos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha_pago ON pagos(fecha_pago);

CREATE INDEX IF NOT EXISTS idx_detalle_ventas_venta_id ON detalle_ventas(venta_id);
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_producto_id ON detalle_ventas(producto_id);

CREATE INDEX IF NOT EXISTS idx_stock_van_van_producto ON stock_van(van_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_stock_almacen_producto_id ON stock_almacen(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_producto_id ON movimientos_stock(producto_id);

-- Prefix search support for barcode/code lookups (ilike 'codigo%')
CREATE INDEX IF NOT EXISTS idx_productos_codigo_pattern ON productos(codigo text_pattern_ops);
