-- Qualify cxc_movimientos columns because venta_id is also an output variable
-- of guardar_venta_transaccional.
DO $migration$
DECLARE
  v_function regprocedure := 'guardar_venta_transaccional(uuid,uuid,uuid,uuid,numeric,numeric,text,text,jsonb,numeric,numeric,numeric,numeric,text,jsonb,numeric,numeric,numeric,numeric)'::regprocedure;
  v_definition text;
  v_old text := 'SELECT 1 FROM cxc_movimientos WHERE venta_id = v_venta_id AND tipo = ''venta''';
  v_new text := 'SELECT 1 FROM cxc_movimientos AS cm WHERE cm.venta_id = v_venta_id AND cm.tipo = ''venta''';
BEGIN
  SELECT pg_get_functiondef(v_function) INTO v_definition;

  IF position(v_new IN v_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate the unqualified A/R movement lookup';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
