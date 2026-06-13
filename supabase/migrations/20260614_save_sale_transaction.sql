ALTER TABLE ventas ADD COLUMN IF NOT EXISTS transaction_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS ventas_transaction_id_unique
  ON ventas(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION guardar_venta_transaccional(
  p_transaction_id uuid,
  p_cliente_id uuid,
  p_van_id uuid,
  p_usuario_id uuid,
  p_total numeric,
  p_total_pagado numeric,
  p_estado_pago text,
  p_metodo_pago text,
  p_pago jsonb,
  p_pago_efectivo numeric,
  p_pago_tarjeta numeric,
  p_pago_transferencia numeric,
  p_pago_otro numeric,
  p_notas text,
  p_items jsonb,
  p_deuda_nueva numeric DEFAULT 0,
  p_pago_deuda_anterior numeric DEFAULT 0,
  p_credito_favor_aplicado numeric DEFAULT 0,
  p_credito_favor_a_deuda numeric DEFAULT 0
)
RETURNS TABLE(venta_id uuid, credito_favor_restante numeric, already_existed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta_id uuid;
  v_item jsonb;
  v_qty numeric;
  v_stock numeric;
  v_credito_disponible numeric := 0;
  v_credito_aplicado numeric := 0;
  v_credito_restante numeric := 0;
BEGIN
  IF p_transaction_id IS NULL THEN RAISE EXCEPTION 'transaction_id is required'; END IF;
  IF p_van_id IS NULL OR p_usuario_id IS NULL THEN RAISE EXCEPTION 'VAN and user are required'; END IF;
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN RAISE EXCEPTION 'At least one item is required'; END IF;

  SELECT id INTO v_venta_id FROM ventas WHERE transaction_id = p_transaction_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_venta_id, COALESCE((SELECT saldo_a_favor FROM clientes WHERE id = p_cliente_id), 0), true;
    RETURN;
  END IF;

  -- Lock and validate every inventory row before creating any record.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'cantidad')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity for product %', v_item->>'producto_id'; END IF;

    SELECT cantidad INTO v_stock
    FROM stock_van
    WHERE van_id = p_van_id AND producto_id = (v_item->>'producto_id')::uuid
    FOR UPDATE;

    IF NOT FOUND OR v_stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, requested: %',
        v_item->>'producto_id', COALESCE(v_stock, 0), v_qty;
    END IF;
  END LOOP;

  IF COALESCE(p_credito_favor_aplicado, 0) > 0 THEN
    IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'Store credit requires a client'; END IF;
    SELECT COALESCE(saldo_a_favor, 0) INTO v_credito_disponible
    FROM clientes WHERE id = p_cliente_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Client not found'; END IF;
    IF v_credito_disponible + 0.005 < p_credito_favor_aplicado THEN
      RAISE EXCEPTION 'Customer store credit changed. Available: %, requested: %',
        v_credito_disponible, p_credito_favor_aplicado;
    END IF;
  END IF;

  INSERT INTO ventas (
    cliente_id, van_id, usuario_id, total_venta, total, total_pagado,
    estado_pago, pago, pago_efectivo, pago_tarjeta, pago_transferencia,
    pago_otro, metodo_pago, notas, transaction_id, tipo
  ) VALUES (
    p_cliente_id, p_van_id, p_usuario_id, ROUND(p_total, 2), ROUND(p_total, 2),
    ROUND(p_total_pagado, 2), p_estado_pago, p_pago, ROUND(COALESCE(p_pago_efectivo, 0), 2),
    ROUND(COALESCE(p_pago_tarjeta, 0), 2), ROUND(COALESCE(p_pago_transferencia, 0), 2),
    ROUND(COALESCE(p_pago_otro, 0), 2), p_metodo_pago, p_notas, p_transaction_id, 'venta'
  )
  RETURNING id INTO v_venta_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, descuento, subtotal)
    VALUES (
      v_venta_id,
      (v_item->>'producto_id')::uuid,
      (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric,
      COALESCE((v_item->>'descuento')::numeric, 0),
      (v_item->>'subtotal')::numeric
    );

    UPDATE stock_van
    SET cantidad = cantidad - (v_item->>'cantidad')::numeric
    WHERE van_id = p_van_id AND producto_id = (v_item->>'producto_id')::uuid;
  END LOOP;

  IF COALESCE(p_credito_favor_aplicado, 0) > 0 THEN
    v_credito_aplicado := ROUND(p_credito_favor_aplicado, 2);
    v_credito_restante := ROUND(v_credito_disponible - v_credito_aplicado, 2);
    UPDATE clientes SET saldo_a_favor = v_credito_restante WHERE id = p_cliente_id;

    INSERT INTO cliente_credito_movimientos
      (cliente_id, tipo, monto, saldo_resultante, venta_id, usuario_id, van_id, nota)
    VALUES
      (p_cliente_id, 'aplicado_venta', -v_credito_aplicado, v_credito_restante,
       v_venta_id, p_usuario_id, p_van_id, 'Applied automatically during transactional sale');
  END IF;

  IF COALESCE(p_credito_favor_a_deuda, 0) > 0 THEN
    INSERT INTO cxc_movimientos (cliente_id, tipo, monto, venta_id, usuario_id, fecha, van_id, nota)
    VALUES (
      p_cliente_id, 'devolucion', ROUND(p_credito_favor_a_deuda, 2), NULL,
      p_usuario_id, now(), p_van_id,
      'Customer store credit applied to prior A/R during sale ' || LEFT(v_venta_id::text, 8) || ' — no money received'
    );
  END IF;

  IF COALESCE(p_deuda_nueva, 0) > 0 THEN
    INSERT INTO cxc_movimientos (cliente_id, tipo, monto, venta_id, usuario_id, fecha, van_id, nota)
    VALUES (
      p_cliente_id, 'venta', ROUND(p_deuda_nueva, 2), v_venta_id,
      p_usuario_id, now(), p_van_id, 'Saldo de venta no pagado'
    );
  END IF;

  IF COALESCE(p_pago_deuda_anterior, 0) > 0 THEN
    INSERT INTO pagos (
      venta_id, cliente_id, van_id, usuario_id, fecha_pago, monto,
      metodo_pago, referencia, notas, idem_key, transaction_id
    ) VALUES (
      NULL, p_cliente_id, p_van_id, p_usuario_id, now(), ROUND(p_pago_deuda_anterior, 2),
      p_metodo_pago, 'Pago CxC dentro de venta ' || v_venta_id::text,
      'Pago a cuenta por cobrar aplicado desde pantalla de ventas',
      gen_random_uuid(), p_transaction_id
    );
  END IF;

  RETURN QUERY SELECT v_venta_id, v_credito_restante, false;
END;
$$;

GRANT EXECUTE ON FUNCTION guardar_venta_transaccional(
  uuid, uuid, uuid, uuid, numeric, numeric, text, text, jsonb,
  numeric, numeric, numeric, numeric, text, jsonb, numeric, numeric, numeric, numeric
) TO authenticated;
