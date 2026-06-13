-- Sales already create their A/R movement through the existing ventas trigger.
-- Keep the RPC compatible with databases without that trigger, but never insert
-- a second movement for the same sale.
DO $migration$
DECLARE
  v_function regprocedure := 'guardar_venta_transaccional(uuid,uuid,uuid,uuid,numeric,numeric,text,text,jsonb,numeric,numeric,numeric,numeric,text,jsonb,numeric,numeric,numeric,numeric)'::regprocedure;
  v_definition text;
  v_old text := 'IF COALESCE(p_deuda_nueva, 0) > 0 THEN';
  v_new text := $replacement$IF COALESCE(p_deuda_nueva, 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM cxc_movimientos WHERE venta_id = v_venta_id AND tipo = 'venta'
  ) THEN$replacement$;
BEGIN
  SELECT pg_get_functiondef(v_function) INTO v_definition;

  IF position(v_new IN v_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate the A/R insert condition in guardar_venta_transaccional';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
