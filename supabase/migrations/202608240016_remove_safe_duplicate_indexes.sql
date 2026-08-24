-- Remove only duplicate indexes that do not back a PRIMARY KEY or UNIQUE
-- constraint. An equivalent index remains available for every definition.

drop index if exists public.cxc_cargos_cliente_idx;

drop index if exists public.idx_detalle_ventas_prod;
drop index if exists public.idx_detalle_ventas_producto_id;
drop index if exists public.detalle_ventas_venta_id_idx;
drop index if exists public.idx_detalle_ventas_venta_id;

drop index if exists public.idx_movs_prod;
drop index if exists public.online_product_meta_producto_id_uidx;

drop index if exists public.idx_pagos_cliente;
drop index if exists public.idx_pagos_fecha;

drop index if exists public.idx_stock_almacen_prod;
drop index if exists public.idx_stock_almacen_producto_id;
drop index if exists public.stock_almacen_uq;

drop index if exists public.idx_stock_van_van_prod_unique;
drop index if exists public.ux_stock_van_van_prod;
drop index if exists public.ux_stock_van_van_producto;

drop index if exists public.idx_ventas_cliente;
drop index if exists public.idx_ventas_cliente_pendiente;
drop index if exists public.idx_ventas_fecha;
