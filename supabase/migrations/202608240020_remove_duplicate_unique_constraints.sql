-- Each removed constraint has an equivalent retained PRIMARY KEY or UNIQUE
-- constraint on the same columns and no dependent foreign keys.

alter table public.productos
  drop constraint if exists productos_codigo_unique;

alter table public.stock_almacen
  drop constraint if exists stock_almacen_producto_id_key;

alter table public.stock_van
  drop constraint if exists stock_van_van_id_producto_id_key;
