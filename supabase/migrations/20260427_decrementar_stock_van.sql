-- Atomic stock decrement — replaces the read-modify-write race in syncManager.js
-- Single UPDATE ensures concurrent offline syncs from multiple devices don't corrupt stock
create or replace function decrementar_stock_van(
  p_van_id      uuid,
  p_producto_id uuid,
  p_cantidad    numeric
)
returns void
language sql
security definer
as $$
  update stock_van
  set    cantidad = greatest(0, cantidad - p_cantidad)
  where  van_id      = p_van_id
  and    producto_id = p_producto_id;
$$;
