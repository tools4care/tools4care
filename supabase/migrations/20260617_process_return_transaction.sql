CREATE OR REPLACE FUNCTION procesar_devolucion_transaccional(
  p_transaction_id uuid,
  p_venta_origen_id uuid,
  p_cliente_id uuid,
  p_van_id uuid,
  p_usuario_id uuid,
  p_tipo_devolucion text,
  p_metodo_reembolso text,
  p_motivo text,
  p_items jsonb
)
RETURNS TABLE(
  venta_devolucion_id uuid,
  total_devolucion numeric,
  deuda_reducida numeric,
  credito_favor_creado numeric,
  saldo_favor_resultante numeric,
  already_existed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_id uuid;
  v_item jsonb;
  v_detail detalle_ventas%ROWTYPE;
  v_qty numeric;
  v_previously_returned numeric;
  v_total numeric := 0;
  v_current_debt numeric := 0;
  v_debt_reduction numeric := 0;
  v_store_credit numeric := 0;
  v_credit_balance numeric := 0;
  v_is_credit boolean := p_tipo_devolucion = 'credit';
BEGIN
  IF p_transaction_id IS NULL THEN RAISE EXCEPTION 'transaction_id is required'; END IF;
  IF p_venta_origen_id IS NULL OR p_van_id IS NULL OR p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Origin sale, VAN and user are required';
  END IF;
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN RAISE EXCEPTION 'At least one return item is required'; END IF;
  IF v_is_credit AND p_cliente_id IS NULL THEN RAISE EXCEPTION 'Store credit requires a customer'; END IF;

  SELECT v.id INTO v_return_id
  FROM ventas AS v
  WHERE v.transaction_id = p_transaction_id;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      v_return_id,
      COALESCE((SELECT COALESCE(v.total_venta, v.total, 0) FROM ventas AS v WHERE v.id = v_return_id), 0),
      0::numeric,
      0::numeric,
      COALESCE((SELECT c.saldo_a_favor FROM clientes AS c WHERE c.id = p_cliente_id), 0),
      true;
    RETURN;
  END IF;

  -- Lock and validate original detail rows before creating any return record.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'cantidad')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Invalid return quantity'; END IF;

    SELECT d.* INTO v_detail
    FROM detalle_ventas AS d
    WHERE d.id = (v_item->>'detalle_venta_id')::uuid
      AND d.venta_id = p_venta_origen_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Original sale detail not found'; END IF;

    SELECT COALESCE(SUM(dd.cantidad_devuelta), 0)
    INTO v_previously_returned
    FROM devoluciones_detalle AS dd
    WHERE dd.detalle_venta_id = v_detail.id;

    IF v_previously_returned + v_qty > v_detail.cantidad + 0.005 THEN
      RAISE EXCEPTION 'Return quantity exceeds available quantity for product %', v_detail.producto_id;
    END IF;

    v_total := v_total + (v_qty * COALESCE(v_detail.precio_unitario, 0));
  END LOOP;

  v_total := ROUND(v_total, 2);

  IF v_is_credit THEN
    SELECT COALESCE(d.saldo, 0)
    INTO v_current_debt
    FROM v_cxc_cliente_detalle_ext AS d
    WHERE d.cliente_id = p_cliente_id;

    v_debt_reduction := LEAST(COALESCE(v_current_debt, 0), v_total);
    v_store_credit := ROUND(v_total - v_debt_reduction, 2);
  END IF;

  INSERT INTO ventas (
    cliente_id, van_id, usuario_id, total, total_venta, total_pagado,
    tipo, venta_origen_id, motivo_devolucion, estado_pago, metodo_pago,
    notas, transaction_id
  ) VALUES (
    p_cliente_id, p_van_id, p_usuario_id, v_total, v_total, v_total,
    'devolucion', p_venta_origen_id, COALESCE(NULLIF(p_motivo, ''), 'Return'),
    CASE WHEN v_is_credit THEN 'credito_tienda' ELSE 'reembolsado' END,
    CASE WHEN v_is_credit THEN NULL ELSE p_metodo_reembolso END,
    'Return of invoice #' || LEFT(p_venta_origen_id::text, 8) || ' — ' ||
      CASE WHEN v_is_credit THEN 'A/R reduction / store credit (no money returned)'
           ELSE 'Money refund (' || COALESCE(p_metodo_reembolso, 'other') || ')' END,
    p_transaction_id
  )
  RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT d.* INTO v_detail
    FROM detalle_ventas AS d
    WHERE d.id = (v_item->>'detalle_venta_id')::uuid;
    v_qty := (v_item->>'cantidad')::numeric;

    INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, descuento, subtotal)
    VALUES (
      v_return_id, v_detail.producto_id, v_qty, v_detail.precio_unitario, 0,
      ROUND(v_qty * COALESCE(v_detail.precio_unitario, 0), 2)
    );

    INSERT INTO devoluciones_detalle (
      venta_origen_id, venta_devolucion_id, detalle_venta_id, producto_id,
      cantidad_devuelta, precio_unitario, motivo, usuario_id, van_id
    ) VALUES (
      p_venta_origen_id, v_return_id, v_detail.id, v_detail.producto_id,
      v_qty, v_detail.precio_unitario, COALESCE(NULLIF(p_motivo, ''), 'Return'),
      p_usuario_id, p_van_id
    );

    UPDATE stock_van AS s
    SET cantidad = s.cantidad + v_qty
    WHERE s.van_id = p_van_id AND s.producto_id = v_detail.producto_id;

    IF NOT FOUND THEN
      INSERT INTO stock_van (van_id, producto_id, cantidad)
      VALUES (p_van_id, v_detail.producto_id, v_qty);
    END IF;
  END LOOP;

  IF v_is_credit AND v_debt_reduction > 0 AND NOT EXISTS (
    SELECT 1 FROM cxc_movimientos AS cm
    WHERE cm.venta_id = v_return_id AND cm.tipo = 'devolucion'
  ) THEN
    INSERT INTO cxc_movimientos (cliente_id, tipo, monto, venta_id, usuario_id, fecha, van_id, nota)
    VALUES (
      p_cliente_id, 'devolucion', v_debt_reduction, v_return_id,
      p_usuario_id, now(), p_van_id,
      'A/R reduction — return of invoice #' || LEFT(p_venta_origen_id::text, 8) || ' — no money returned'
    );
  END IF;

  IF v_is_credit AND v_store_credit > 0 THEN
    SELECT agregar_credito_favor_cliente(
      p_cliente_id, v_store_credit, 'devolucion', v_return_id, p_usuario_id, p_van_id,
      'Excess from return of invoice #' || LEFT(p_venta_origen_id::text, 8)
    ) INTO v_credit_balance;
  ELSE
    SELECT COALESCE(c.saldo_a_favor, 0) INTO v_credit_balance
    FROM clientes AS c WHERE c.id = p_cliente_id;
  END IF;

  RETURN QUERY SELECT
    v_return_id, v_total, v_debt_reduction, v_store_credit,
    COALESCE(v_credit_balance, 0), false;
END;
$$;

GRANT EXECUTE ON FUNCTION procesar_devolucion_transaccional(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) TO authenticated;
