-- A quick sale may omit a customer only when it creates no customer balance.
-- Fail before inserting the sale so the transaction remains atomic and the
-- operator receives a useful message instead of a NOT NULL constraint error.
DO $migration$
DECLARE
  v_function regprocedure := 'guardar_venta_transaccional(uuid,uuid,uuid,uuid,numeric,numeric,text,text,jsonb,numeric,numeric,numeric,numeric,text,jsonb,numeric,numeric,numeric,numeric)'::regprocedure;
  v_definition text;
  v_anchor text := 'IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN RAISE EXCEPTION ''At least one item is required''; END IF;';
  v_guard text := $guard$

  IF p_cliente_id IS NULL AND (
    COALESCE(p_deuda_nueva, 0) > 0
    OR COALESCE(p_pago_deuda_anterior, 0) > 0
    OR COALESCE(p_credito_favor_aplicado, 0) > 0
    OR COALESCE(p_credito_favor_a_deuda, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Select a customer before creating or applying an A/R balance';
  END IF;$guard$;
BEGIN
  SELECT pg_get_functiondef(v_function) INTO v_definition;

  IF position('Select a customer before creating or applying an A/R balance' IN v_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(v_anchor IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate validation anchor in guardar_venta_transaccional';
  END IF;

  EXECUTE replace(v_definition, v_anchor, v_anchor || v_guard);
END;
$migration$;
