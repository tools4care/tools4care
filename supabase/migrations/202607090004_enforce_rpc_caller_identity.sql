-- Closes the identity-spoofing hole found in the 2026-07 security audit: every
-- transactional/stock RPC took `p_usuario_id` as a plain parameter from the
-- caller and trusted it verbatim — any authenticated user could call these
-- RPCs directly (they are already GRANTed to `authenticated`) with someone
-- else's usuario_id, attributing a sale/adjustment to a different person
-- (affects commissions and the audit trail).
--
-- Fix: every function now ignores the *value* of p_usuario_id for anything
-- that matters (attribution) and uses auth.uid() instead — the parameter is
-- kept in the signature only so existing frontend call sites don't need to
-- change. This is a clean CREATE OR REPLACE with the full current body of
-- each function (including the fixes from 20260615/20260616/20260619 for
-- guardar_venta_transaccional, and the column-qualification fix from
-- 202606250001 for the stock RPCs) — not another string-replace patch, since
-- the 2026-07 audit flagged that pattern as fragile.
--
-- Out of scope (deliberately deferred): van_id is NOT similarly restricted
-- here. The app currently has no enforced concept of "which van a vendor is
-- assigned to" (VanSelector.jsx lets any vendor pick any van, and
-- usuarios_vans is barely populated/used) — restricting van_id access is a
-- product decision, not just a security patch, and needs the business rule
-- confirmed before enforcing it, to avoid locking real vendors out of vans
-- they're expected to use.

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
  v_usuario_id uuid := auth.uid();
  v_venta_id uuid;
  v_item jsonb;
  v_qty numeric;
  v_stock numeric;
  v_credito_disponible numeric := 0;
  v_credito_aplicado numeric := 0;
  v_credito_restante numeric := 0;
BEGIN
  IF p_transaction_id IS NULL THEN RAISE EXCEPTION 'transaction_id is required'; END IF;
  IF p_van_id IS NULL THEN RAISE EXCEPTION 'VAN is required'; END IF;
  IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN RAISE EXCEPTION 'At least one item is required'; END IF;

  IF p_cliente_id IS NULL AND (
    COALESCE(p_deuda_nueva, 0) > 0
    OR COALESCE(p_pago_deuda_anterior, 0) > 0
    OR COALESCE(p_credito_favor_aplicado, 0) > 0
    OR COALESCE(p_credito_favor_a_deuda, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Select a customer before creating or applying an A/R balance';
  END IF;

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
    p_cliente_id, p_van_id, v_usuario_id, ROUND(p_total, 2), ROUND(p_total, 2),
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
       v_venta_id, v_usuario_id, p_van_id, 'Applied automatically during transactional sale');
  END IF;

  IF COALESCE(p_credito_favor_a_deuda, 0) > 0 THEN
    INSERT INTO cxc_movimientos (cliente_id, tipo, monto, venta_id, usuario_id, fecha, van_id, nota)
    VALUES (
      p_cliente_id, 'devolucion', ROUND(p_credito_favor_a_deuda, 2), NULL,
      v_usuario_id, now(), p_van_id,
      'Customer store credit applied to prior A/R during sale ' || LEFT(v_venta_id::text, 8) || ' — no money received'
    );
  END IF;

  IF COALESCE(p_deuda_nueva, 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM cxc_movimientos AS cm WHERE cm.venta_id = v_venta_id AND cm.tipo = 'venta'
  ) THEN
    INSERT INTO cxc_movimientos (cliente_id, tipo, monto, venta_id, usuario_id, fecha, van_id, nota)
    VALUES (
      p_cliente_id, 'venta', ROUND(p_deuda_nueva, 2), v_venta_id,
      v_usuario_id, now(), p_van_id, 'Saldo de venta no pagado'
    );
  END IF;

  IF COALESCE(p_pago_deuda_anterior, 0) > 0 THEN
    INSERT INTO pagos (
      venta_id, cliente_id, van_id, usuario_id, fecha_pago, monto,
      metodo_pago, referencia, notas, idem_key, transaction_id
    ) VALUES (
      NULL, p_cliente_id, p_van_id, v_usuario_id, now(), ROUND(p_pago_deuda_anterior, 2),
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
  v_usuario_id uuid := auth.uid();
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
  IF p_venta_origen_id IS NULL OR p_van_id IS NULL THEN
    RAISE EXCEPTION 'Origin sale and VAN are required';
  END IF;
  IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
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
    p_cliente_id, p_van_id, v_usuario_id, v_total, v_total, v_total,
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
      v_usuario_id, p_van_id
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
      v_usuario_id, now(), p_van_id,
      'A/R reduction — return of invoice #' || LEFT(p_venta_origen_id::text, 8) || ' — no money returned'
    );
  END IF;

  IF v_is_credit AND v_store_credit > 0 THEN
    SELECT agregar_credito_favor_cliente(
      p_cliente_id, v_store_credit, 'devolucion', v_return_id, v_usuario_id, p_van_id,
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


CREATE OR REPLACE FUNCTION ajustar_stock(
  p_producto_id uuid,
  p_delta numeric,
  p_ubicacion text,
  p_van_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id uuid DEFAULT NULL
)
RETURNS TABLE(producto_id uuid, cantidad numeric, ubicacion text, van_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id uuid := auth.uid();
  v_row_id uuid;
  v_current numeric;
  v_next numeric;
  v_ubicacion text := lower(coalesce(p_ubicacion, ''));
BEGIN
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'producto_id is required'; END IF;
  IF COALESCE(p_delta, 0) = 0 THEN RAISE EXCEPTION 'delta must be non-zero'; END IF;
  IF v_ubicacion NOT IN ('warehouse', 'almacen', 'van') THEN
    RAISE EXCEPTION 'Invalid location: %', p_ubicacion;
  END IF;

  IF v_ubicacion = 'van' THEN
    IF p_van_id IS NULL THEN RAISE EXCEPTION 'van_id is required for van stock'; END IF;

    SELECT sv.id, sv.cantidad INTO v_row_id, v_current
    FROM stock_van AS sv
    WHERE sv.van_id = p_van_id AND sv.producto_id = p_producto_id
    FOR UPDATE;

    v_next := GREATEST(0, COALESCE(v_current, 0) + p_delta);

    IF v_row_id IS NULL THEN
      IF v_next > 0 THEN
        INSERT INTO stock_van(van_id, producto_id, cantidad)
        VALUES (p_van_id, p_producto_id, v_next);
      END IF;
    ELSIF v_next <= 0 THEN
      DELETE FROM stock_van AS sv WHERE sv.id = v_row_id;
    ELSE
      UPDATE stock_van AS sv SET cantidad = v_next WHERE sv.id = v_row_id;
    END IF;

    INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, referencia_tipo, referencia_id)
    VALUES (
      p_producto_id,
      CASE WHEN p_delta > 0 THEN 'AJUSTE_POSITIVO' ELSE 'AJUSTE_NEGATIVO' END,
      p_delta,
      'van',
      p_van_id,
      p_motivo,
      now(),
      v_usuario_id,
      p_referencia_tipo,
      p_referencia_id
    );

    RETURN QUERY SELECT p_producto_id, v_next, 'van'::text, p_van_id;
    RETURN;
  END IF;

  SELECT sa.id, sa.cantidad INTO v_row_id, v_current
  FROM stock_almacen AS sa
  WHERE sa.producto_id = p_producto_id
  FOR UPDATE;

  v_next := GREATEST(0, COALESCE(v_current, 0) + p_delta);

  IF v_row_id IS NULL THEN
    IF v_next > 0 THEN
      INSERT INTO stock_almacen(producto_id, cantidad)
      VALUES (p_producto_id, v_next);
    END IF;
  ELSIF v_next <= 0 THEN
    DELETE FROM stock_almacen AS sa WHERE sa.id = v_row_id;
  ELSE
    UPDATE stock_almacen AS sa SET cantidad = v_next WHERE sa.id = v_row_id;
  END IF;

  INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, referencia_tipo, referencia_id)
  VALUES (
    p_producto_id,
    CASE WHEN p_delta > 0 THEN 'AJUSTE_POSITIVO' ELSE 'AJUSTE_NEGATIVO' END,
    p_delta,
    'almacen',
    NULL,
    p_motivo,
    now(),
    v_usuario_id,
    p_referencia_tipo,
    p_referencia_id
  );

  RETURN QUERY SELECT p_producto_id, v_next, 'almacen'::text, NULL::uuid;
END;
$$;


CREATE OR REPLACE FUNCTION transferir_stock(
  p_producto_id uuid,
  p_cantidad numeric,
  p_origen_tipo text,
  p_origen_van_id uuid DEFAULT NULL,
  p_destino_tipo text DEFAULT NULL,
  p_destino_van_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(producto_id uuid, origen_cantidad numeric, destino_cantidad numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id uuid := auth.uid();
  v_origen text := lower(coalesce(p_origen_tipo, ''));
  v_destino text := lower(coalesce(p_destino_tipo, ''));
  v_origin_row uuid;
  v_dest_row uuid;
  v_origin_current numeric;
  v_dest_current numeric;
  v_origin_next numeric;
  v_dest_next numeric;
BEGIN
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'producto_id is required'; END IF;
  IF COALESCE(p_cantidad, 0) <= 0 THEN RAISE EXCEPTION 'cantidad must be positive'; END IF;
  IF v_origen IN ('warehouse') THEN v_origen := 'almacen'; END IF;
  IF v_destino IN ('warehouse') THEN v_destino := 'almacen'; END IF;
  IF v_origen NOT IN ('almacen', 'van') OR v_destino NOT IN ('almacen', 'van') THEN
    RAISE EXCEPTION 'Invalid transfer locations';
  END IF;
  IF v_origen = v_destino AND COALESCE(p_origen_van_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_destino_van_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'Origin and destination must be different';
  END IF;
  IF v_origen = 'van' AND p_origen_van_id IS NULL THEN RAISE EXCEPTION 'origin van_id is required'; END IF;
  IF v_destino = 'van' AND p_destino_van_id IS NULL THEN RAISE EXCEPTION 'destination van_id is required'; END IF;

  IF v_origen = 'van' THEN
    SELECT sv.id, sv.cantidad INTO v_origin_row, v_origin_current
    FROM stock_van AS sv
    WHERE sv.van_id = p_origen_van_id AND sv.producto_id = p_producto_id
    FOR UPDATE;
  ELSE
    SELECT sa.id, sa.cantidad INTO v_origin_row, v_origin_current
    FROM stock_almacen AS sa
    WHERE sa.producto_id = p_producto_id
    FOR UPDATE;
  END IF;

  IF v_origin_row IS NULL OR COALESCE(v_origin_current, 0) < p_cantidad THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %', COALESCE(v_origin_current, 0), p_cantidad;
  END IF;

  v_origin_next := COALESCE(v_origin_current, 0) - p_cantidad;

  IF v_origen = 'van' THEN
    IF v_origin_next <= 0 THEN
      DELETE FROM stock_van AS sv WHERE sv.id = v_origin_row;
    ELSE
      UPDATE stock_van AS sv SET cantidad = v_origin_next WHERE sv.id = v_origin_row;
    END IF;
  ELSE
    IF v_origin_next <= 0 THEN
      DELETE FROM stock_almacen AS sa WHERE sa.id = v_origin_row;
    ELSE
      UPDATE stock_almacen AS sa SET cantidad = v_origin_next WHERE sa.id = v_origin_row;
    END IF;
  END IF;

  IF v_destino = 'van' THEN
    SELECT sv.id, sv.cantidad INTO v_dest_row, v_dest_current
    FROM stock_van AS sv
    WHERE sv.van_id = p_destino_van_id AND sv.producto_id = p_producto_id
    FOR UPDATE;

    v_dest_next := COALESCE(v_dest_current, 0) + p_cantidad;

    IF v_dest_row IS NULL THEN
      INSERT INTO stock_van(van_id, producto_id, cantidad)
      VALUES (p_destino_van_id, p_producto_id, v_dest_next);
    ELSE
      UPDATE stock_van AS sv SET cantidad = v_dest_next WHERE sv.id = v_dest_row;
    END IF;
  ELSE
    SELECT sa.id, sa.cantidad INTO v_dest_row, v_dest_current
    FROM stock_almacen AS sa
    WHERE sa.producto_id = p_producto_id
    FOR UPDATE;

    v_dest_next := COALESCE(v_dest_current, 0) + p_cantidad;

    IF v_dest_row IS NULL THEN
      INSERT INTO stock_almacen(producto_id, cantidad)
      VALUES (p_producto_id, v_dest_next);
    ELSE
      UPDATE stock_almacen AS sa SET cantidad = v_dest_next WHERE sa.id = v_dest_row;
    END IF;
  END IF;

  INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, metadata)
  VALUES
    (p_producto_id, 'TRANSFER_OUT', -p_cantidad, v_origen, CASE WHEN v_origen = 'van' THEN p_origen_van_id ELSE NULL END, p_motivo, now(), v_usuario_id,
      jsonb_build_object('destino_tipo', v_destino, 'destino_van_id', p_destino_van_id)),
    (p_producto_id, 'TRANSFER_IN', p_cantidad, v_destino, CASE WHEN v_destino = 'van' THEN p_destino_van_id ELSE NULL END, p_motivo, now(), v_usuario_id,
      jsonb_build_object('origen_tipo', v_origen, 'origen_van_id', p_origen_van_id));

  RETURN QUERY SELECT p_producto_id, v_origin_next, v_dest_next;
END;
$$;


CREATE OR REPLACE FUNCTION establecer_stock(
  p_producto_id uuid,
  p_cantidad numeric,
  p_ubicacion text,
  p_van_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(producto_id uuid, cantidad numeric, ubicacion text, van_id uuid, delta numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id uuid := auth.uid();
  v_row_id uuid;
  v_current numeric := 0;
  v_next numeric;
  v_delta numeric;
  v_ubicacion text := lower(coalesce(p_ubicacion, ''));
BEGIN
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'producto_id is required'; END IF;
  IF COALESCE(p_cantidad, -1) < 0 THEN RAISE EXCEPTION 'cantidad must be zero or greater'; END IF;
  IF v_ubicacion IN ('warehouse') THEN v_ubicacion := 'almacen'; END IF;
  IF v_ubicacion NOT IN ('almacen', 'van') THEN RAISE EXCEPTION 'Invalid location: %', p_ubicacion; END IF;
  IF v_ubicacion = 'van' AND p_van_id IS NULL THEN RAISE EXCEPTION 'van_id is required for van stock'; END IF;

  v_next := ROUND(p_cantidad, 4);

  IF v_ubicacion = 'van' THEN
    SELECT sv.id, sv.cantidad INTO v_row_id, v_current
    FROM stock_van AS sv
    WHERE sv.van_id = p_van_id AND sv.producto_id = p_producto_id
    FOR UPDATE;

    v_delta := v_next - COALESCE(v_current, 0);

    IF v_row_id IS NULL THEN
      IF v_next > 0 THEN
        INSERT INTO stock_van(van_id, producto_id, cantidad)
        VALUES (p_van_id, p_producto_id, v_next);
      END IF;
    ELSIF v_next <= 0 THEN
      DELETE FROM stock_van AS sv WHERE sv.id = v_row_id;
    ELSE
      UPDATE stock_van AS sv SET cantidad = v_next WHERE sv.id = v_row_id;
    END IF;

    INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, metadata)
    VALUES (p_producto_id, 'CONTEO_FISICO', v_delta, 'van', p_van_id, p_motivo, now(), v_usuario_id,
      jsonb_build_object('cantidad_anterior', COALESCE(v_current, 0), 'cantidad_nueva', v_next));

    RETURN QUERY SELECT p_producto_id, v_next, 'van'::text, p_van_id, v_delta;
    RETURN;
  END IF;

  SELECT sa.id, sa.cantidad INTO v_row_id, v_current
  FROM stock_almacen AS sa
  WHERE sa.producto_id = p_producto_id
  FOR UPDATE;

  v_delta := v_next - COALESCE(v_current, 0);

  IF v_row_id IS NULL THEN
    IF v_next > 0 THEN
      INSERT INTO stock_almacen(producto_id, cantidad)
      VALUES (p_producto_id, v_next);
    END IF;
  ELSIF v_next <= 0 THEN
    DELETE FROM stock_almacen AS sa WHERE sa.id = v_row_id;
  ELSE
    UPDATE stock_almacen AS sa SET cantidad = v_next WHERE sa.id = v_row_id;
  END IF;

  INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, metadata)
  VALUES (p_producto_id, 'CONTEO_FISICO', v_delta, 'almacen', NULL, p_motivo, now(), v_usuario_id,
    jsonb_build_object('cantidad_anterior', COALESCE(v_current, 0), 'cantidad_nueva', v_next));

  RETURN QUERY SELECT p_producto_id, v_next, 'almacen'::text, NULL::uuid, v_delta;
END;
$$;

GRANT EXECUTE ON FUNCTION ajustar_stock(uuid, numeric, text, uuid, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION transferir_stock(uuid, numeric, text, uuid, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION establecer_stock(uuid, numeric, text, uuid, text, uuid) TO authenticated;
