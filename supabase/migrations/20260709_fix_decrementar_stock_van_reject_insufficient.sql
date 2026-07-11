-- decrementar_stock_van previously did a single clamp-to-zero UPDATE with no
-- availability check, so it silently absorbed an oversell (e.g. the legacy
-- offline-sync path in src/utils/syncManager.js) instead of rejecting it —
-- confirmed by the 2026-07 QA/security audit and by test-db/run-real-tests.mjs.
--
-- This mirrors the same "lock row, check availability, raise on shortfall"
-- pattern already used by guardar_venta_transaccional
-- (supabase/migrations/20260614_save_sale_transaction.sql) so both code paths
-- behave the same way: never silently clamp, always reject an oversell.
CREATE OR REPLACE FUNCTION decrementar_stock_van(
  p_van_id uuid,
  p_producto_id uuid,
  p_cantidad numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
BEGIN
  IF COALESCE(p_cantidad, 0) <= 0 THEN
    RAISE EXCEPTION 'Invalid quantity for product %', p_producto_id;
  END IF;

  SELECT cantidad INTO v_stock
  FROM stock_van
  WHERE van_id = p_van_id AND producto_id = p_producto_id
  FOR UPDATE;

  IF NOT FOUND OR v_stock < p_cantidad THEN
    RAISE EXCEPTION 'Insufficient stock for product %. Available: %, requested: %',
      p_producto_id, COALESCE(v_stock, 0), p_cantidad;
  END IF;

  UPDATE stock_van
  SET cantidad = cantidad - p_cantidad
  WHERE van_id = p_van_id AND producto_id = p_producto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION decrementar_stock_van(uuid, uuid, numeric) TO authenticated;
