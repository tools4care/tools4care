-- Makes returns use the amount actually charged after discounts and refund the
-- proportional tax recorded on the original sale. Money refunds are capped by
-- actual money applied to the sale, excluding customer store credit.

CREATE OR REPLACE FUNCTION public.procesar_devolucion_transaccional(
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
  v_origin ventas%ROWTYPE;
  v_origin_payment jsonb := '{}'::jsonb;
  v_return_id uuid;
  v_item jsonb;
  v_detail detalle_ventas%ROWTYPE;
  v_qty numeric;
  v_previously_returned numeric;
  v_effective_unit numeric;
  v_line_subtotal numeric;
  v_merchandise_total numeric := 0;
  v_tax_total numeric := 0;
  v_total numeric := 0;
  v_origin_subtotal numeric := 0;
  v_origin_tax numeric := 0;
  v_origin_tax_rate numeric := 0;
  v_origin_total numeric := 0;
  v_tax_included boolean := false;
  v_previous_tax_refunds numeric := 0;
  v_money_paid numeric := 0;
  v_previous_money_refunds numeric := 0;
  v_current_debt numeric := 0;
  v_debt_reduction numeric := 0;
  v_store_credit numeric := 0;
  v_credit_balance numeric := 0;
  v_is_credit boolean := p_tipo_devolucion = 'credit';
  v_method text := lower(trim(COALESCE(p_metodo_reembolso, 'other')));
BEGIN
  IF p_transaction_id IS NULL THEN RAISE EXCEPTION 'transaction_id is required'; END IF;
  IF p_venta_origen_id IS NULL OR p_van_id IS NULL THEN
    RAISE EXCEPTION 'Origin sale and location are required';
  END IF;
  IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN RAISE EXCEPTION 'At least one return item is required'; END IF;
  IF v_is_credit AND p_cliente_id IS NULL THEN RAISE EXCEPTION 'Store credit requires a customer'; END IF;

  SELECT v.id INTO v_return_id
  FROM public.ventas AS v
  WHERE v.transaction_id = p_transaction_id;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      v_return_id,
      COALESCE((SELECT COALESCE(v.total_venta, v.total, 0) FROM public.ventas AS v WHERE v.id = v_return_id), 0),
      0::numeric,
      0::numeric,
      COALESCE((SELECT c.saldo_a_favor FROM public.clientes AS c WHERE c.id = p_cliente_id), 0),
      true;
    RETURN;
  END IF;

  SELECT v.* INTO v_origin
  FROM public.ventas AS v
  WHERE v.id = p_venta_origen_id
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_origin.tipo, 'venta') = 'devolucion' THEN
    RAISE EXCEPTION 'Original sale not found';
  END IF;
  IF v_origin.van_id IS DISTINCT FROM p_van_id THEN
    RAISE EXCEPTION 'Original sale belongs to a different location';
  END IF;
  IF v_origin.cliente_id IS DISTINCT FROM p_cliente_id THEN
    RAISE EXCEPTION 'Customer does not match the original sale';
  END IF;

  IF jsonb_typeof(v_origin.pago) = 'object' THEN
    v_origin_payment := v_origin.pago;
  END IF;
  v_origin_total := GREATEST(0, COALESCE(v_origin.total_venta, v_origin.total, 0));
  v_origin_subtotal := GREATEST(0, COALESCE(NULLIF(v_origin_payment->>'subtotal', '')::numeric, 0));
  v_origin_tax := GREATEST(0, COALESCE(NULLIF(v_origin_payment->>'tax_amount', '')::numeric, 0));
  v_origin_tax_rate := GREATEST(0, COALESCE(NULLIF(v_origin_payment->>'tax_rate', '')::numeric, 0));

  IF v_origin_subtotal <= 0 THEN
    SELECT COALESCE(SUM(CASE
      WHEN COALESCE(d.subtotal, 0) >= 0 THEN d.subtotal
      ELSE d.cantidad * d.precio_unitario * (1 - LEAST(100, GREATEST(0, COALESCE(d.descuento, 0))) / 100)
    END), 0)
    INTO v_origin_subtotal
    FROM public.detalle_ventas AS d
    WHERE d.venta_id = p_venta_origen_id;
  END IF;

  IF v_origin_payment ? 'tax_included' THEN
    v_tax_included := COALESCE((v_origin_payment->>'tax_included')::boolean, false);
  ELSE
    v_tax_included := v_origin_tax > 0
      AND v_origin_subtotal > 0
      AND abs(v_origin_total - v_origin_subtotal) <= 0.01;
  END IF;

  -- Lock and validate original detail rows. Use subtotal/quantity so discounts
  -- and bulk pricing are refunded at the amount actually charged.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'cantidad')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Invalid return quantity'; END IF;

    SELECT d.* INTO v_detail
    FROM public.detalle_ventas AS d
    WHERE d.id = (v_item->>'detalle_venta_id')::uuid
      AND d.venta_id = p_venta_origen_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Original sale detail not found'; END IF;

    SELECT COALESCE(SUM(dd.cantidad_devuelta), 0)
    INTO v_previously_returned
    FROM public.devoluciones_detalle AS dd
    WHERE dd.detalle_venta_id = v_detail.id;

    IF v_previously_returned + v_qty > v_detail.cantidad + 0.005 THEN
      RAISE EXCEPTION 'Return quantity exceeds available quantity for product %', v_detail.producto_id;
    END IF;

    v_effective_unit := CASE
      WHEN COALESCE(v_detail.cantidad, 0) > 0 AND v_detail.subtotal IS NOT NULL
        THEN v_detail.subtotal / v_detail.cantidad
      ELSE COALESCE(v_detail.precio_unitario, 0)
        * (1 - LEAST(100, GREATEST(0, COALESCE(v_detail.descuento, 0))) / 100)
    END;
    v_merchandise_total := v_merchandise_total + (v_qty * v_effective_unit);
  END LOOP;

  v_merchandise_total := ROUND(v_merchandise_total, 2);

  SELECT COALESCE(SUM(GREATEST(0, COALESCE(NULLIF(r.pago->>'tax_amount', '')::numeric, 0))), 0)
  INTO v_previous_tax_refunds
  FROM public.ventas AS r
  WHERE r.venta_origen_id = p_venta_origen_id
    AND r.tipo = 'devolucion';

  IF v_origin_tax > 0 AND v_origin_subtotal > 0 THEN
    v_tax_total := ROUND(v_origin_tax * (v_merchandise_total / v_origin_subtotal), 2);
    v_tax_total := LEAST(v_tax_total, GREATEST(0, ROUND(v_origin_tax - v_previous_tax_refunds, 2)));
  END IF;

  v_total := CASE
    WHEN v_tax_included THEN v_merchandise_total
    ELSE ROUND(v_merchandise_total + v_tax_total, 2)
  END;

  IF NOT v_is_credit THEN
    v_money_paid := CASE
      WHEN v_origin_payment ? 'aplicado_venta'
        THEN GREATEST(0, COALESCE(NULLIF(v_origin_payment->>'aplicado_venta', '')::numeric, 0))
      ELSE GREATEST(0, COALESCE(v_origin.total_pagado, 0))
    END;

    SELECT COALESCE(SUM(COALESCE(r.total_venta, r.total, 0)), 0)
    INTO v_previous_money_refunds
    FROM public.ventas AS r
    WHERE r.venta_origen_id = p_venta_origen_id
      AND r.tipo = 'devolucion'
      AND r.estado_pago = 'reembolsado';

    IF v_total > GREATEST(0, v_money_paid - v_previous_money_refunds) + 0.005 THEN
      RAISE EXCEPTION 'Refund exceeds money paid and still refundable. Use Reduce A/R for the unpaid or store-credit portion.';
    END IF;
  END IF;

  IF v_is_credit THEN
    SELECT COALESCE(d.saldo, 0)
    INTO v_current_debt
    FROM public.v_cxc_cliente_detalle_ext AS d
    WHERE d.cliente_id = p_cliente_id;

    v_debt_reduction := LEAST(COALESCE(v_current_debt, 0), v_total);
    v_store_credit := ROUND(v_total - v_debt_reduction, 2);
  END IF;

  INSERT INTO public.ventas (
    cliente_id, van_id, usuario_id, total, total_venta, total_pagado,
    tipo, venta_origen_id, motivo_devolucion, estado_pago, metodo_pago,
    pago, pago_efectivo, pago_tarjeta, pago_transferencia, pago_otro,
    notas, transaction_id
  ) VALUES (
    p_cliente_id, p_van_id, v_usuario_id, v_total, v_total, v_total,
    'devolucion', p_venta_origen_id, COALESCE(NULLIF(p_motivo, ''), 'Return'),
    CASE WHEN v_is_credit THEN 'credito_tienda' ELSE 'reembolsado' END,
    CASE WHEN v_is_credit THEN NULL ELSE p_metodo_reembolso END,
    jsonb_build_object(
      'return', true,
      'origin_sale_id', p_venta_origen_id,
      'subtotal', v_merchandise_total,
      'tax_amount', v_tax_total,
      'tax_rate', v_origin_tax_rate,
      'tax_included', v_tax_included
    ),
    CASE WHEN NOT v_is_credit AND v_method IN ('cash', 'efectivo') THEN v_total ELSE 0 END,
    CASE WHEN NOT v_is_credit AND v_method IN ('card', 'tarjeta') THEN v_total ELSE 0 END,
    CASE WHEN NOT v_is_credit AND v_method IN ('transfer', 'transferencia', 'zelle', 'venmo', 'cash app', 'cashapp') THEN v_total ELSE 0 END,
    CASE WHEN NOT v_is_credit AND v_method NOT IN ('cash', 'efectivo', 'card', 'tarjeta', 'transfer', 'transferencia', 'zelle', 'venmo', 'cash app', 'cashapp') THEN v_total ELSE 0 END,
    'Return of invoice #' || LEFT(p_venta_origen_id::text, 8) || ' - ' ||
      CASE WHEN v_is_credit THEN 'A/R reduction / store credit (no money returned)'
           ELSE 'Money refund (' || COALESCE(p_metodo_reembolso, 'other') || ')' END,
    p_transaction_id
  )
  RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT d.* INTO v_detail
    FROM public.detalle_ventas AS d
    WHERE d.id = (v_item->>'detalle_venta_id')::uuid;
    v_qty := (v_item->>'cantidad')::numeric;
    v_effective_unit := CASE
      WHEN COALESCE(v_detail.cantidad, 0) > 0 AND v_detail.subtotal IS NOT NULL
        THEN v_detail.subtotal / v_detail.cantidad
      ELSE COALESCE(v_detail.precio_unitario, 0)
        * (1 - LEAST(100, GREATEST(0, COALESCE(v_detail.descuento, 0))) / 100)
    END;
    v_line_subtotal := ROUND(v_qty * v_effective_unit, 2);

    INSERT INTO public.detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, descuento, subtotal)
    VALUES (v_return_id, v_detail.producto_id, v_qty, ROUND(v_effective_unit, 2), 0, v_line_subtotal);

    INSERT INTO public.devoluciones_detalle (
      venta_origen_id, venta_devolucion_id, detalle_venta_id, producto_id,
      cantidad_devuelta, precio_unitario, motivo, usuario_id, van_id
    ) VALUES (
      p_venta_origen_id, v_return_id, v_detail.id, v_detail.producto_id,
      v_qty, ROUND(v_effective_unit, 2), COALESCE(NULLIF(p_motivo, ''), 'Return'),
      v_usuario_id, p_van_id
    );

    UPDATE public.stock_van AS s
    SET cantidad = s.cantidad + v_qty
    WHERE s.van_id = p_van_id AND s.producto_id = v_detail.producto_id;

    IF NOT FOUND THEN
      INSERT INTO public.stock_van (van_id, producto_id, cantidad)
      VALUES (p_van_id, v_detail.producto_id, v_qty);
    END IF;
  END LOOP;

  IF v_is_credit AND v_debt_reduction > 0 AND NOT EXISTS (
    SELECT 1 FROM public.cxc_movimientos AS cm
    WHERE cm.venta_id = v_return_id AND cm.tipo = 'devolucion'
  ) THEN
    INSERT INTO public.cxc_movimientos (cliente_id, tipo, monto, venta_id, usuario_id, fecha, van_id, nota)
    VALUES (
      p_cliente_id, 'devolucion', v_debt_reduction, v_return_id,
      v_usuario_id, now(), p_van_id,
      'A/R reduction - return of invoice #' || LEFT(p_venta_origen_id::text, 8) || ' - no money returned'
    );
  END IF;

  IF v_is_credit AND v_store_credit > 0 THEN
    SELECT public.agregar_credito_favor_cliente(
      p_cliente_id, v_store_credit, 'devolucion', v_return_id, v_usuario_id, p_van_id,
      'Excess from return of invoice #' || LEFT(p_venta_origen_id::text, 8)
    ) INTO v_credit_balance;
  ELSE
    SELECT COALESCE(c.saldo_a_favor, 0) INTO v_credit_balance
    FROM public.clientes AS c WHERE c.id = p_cliente_id;
  END IF;

  RETURN QUERY SELECT
    v_return_id, v_total, v_debt_reduction, v_store_credit,
    COALESCE(v_credit_balance, 0), false;
END;
$$;

REVOKE ALL ON FUNCTION public.procesar_devolucion_transaccional(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.procesar_devolucion_transaccional(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) TO authenticated;
