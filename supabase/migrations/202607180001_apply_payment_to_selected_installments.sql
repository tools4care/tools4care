-- Allow a cashier to choose which existing payment-agreement installments
-- receive the portion of a sale payment allocated to the prior A/R balance.
CREATE OR REPLACE FUNCTION public.aplicar_pago_a_cuotas_seleccionadas(
  p_cliente_id uuid,
  p_monto numeric,
  p_cuota_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_restante numeric := ROUND(COALESCE(p_monto, 0), 2);
  v_aplicado_total numeric := 0;
  v_capacidad numeric := 0;
  v_elegibles integer := 0;
  v_solicitadas integer := 0;
  v_cuotas_pagadas integer := 0;
  v_acuerdos_cerrados integer := 0;
  v_cuota record;
  v_aplicar numeric;
BEGIN
  IF p_cliente_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'cliente_id is required');
  END IF;

  IF v_restante <= 0 THEN
    RETURN json_build_object(
      'ok', true,
      'monto_aplicado', 0,
      'monto_sobrante', 0,
      'cuotas_pagadas', 0,
      'acuerdos_cerrados', 0
    );
  END IF;

  v_solicitadas := COALESCE(array_length(p_cuota_ids, 1), 0);
  IF v_solicitadas = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'Select at least one installment');
  END IF;

  SELECT
    COUNT(*),
    COALESCE(ROUND(SUM(c.monto - c.monto_pagado), 2), 0)
  INTO v_elegibles, v_capacidad
  FROM cuotas_acuerdo c
  JOIN acuerdos_pago a ON a.id = c.acuerdo_id
  WHERE a.cliente_id = p_cliente_id
    AND a.estado = 'activo'
    AND c.id = ANY(p_cuota_ids)
    AND c.estado IN ('pendiente', 'vencida', 'parcial')
    AND ROUND(c.monto - c.monto_pagado, 2) > 0;

  IF v_elegibles <> v_solicitadas THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'One or more selected installments are invalid or already paid'
    );
  END IF;

  IF v_capacidad + 0.005 < v_restante THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'Selected installments do not cover the payment',
      'monto_requerido', v_restante,
      'capacidad_seleccionada', v_capacidad
    );
  END IF;

  FOR v_cuota IN
    SELECT
      c.id AS cuota_id,
      c.acuerdo_id,
      c.monto,
      c.monto_pagado,
      ROUND(c.monto - c.monto_pagado, 2) AS pendiente
    FROM cuotas_acuerdo c
    JOIN acuerdos_pago a ON a.id = c.acuerdo_id
    WHERE a.cliente_id = p_cliente_id
      AND a.estado = 'activo'
      AND c.id = ANY(p_cuota_ids)
      AND c.estado IN ('pendiente', 'vencida', 'parcial')
      AND ROUND(c.monto - c.monto_pagado, 2) > 0
    ORDER BY
      array_position(p_cuota_ids, c.id),
      c.fecha_vencimiento,
      c.numero_cuota
    FOR UPDATE OF c
  LOOP
    EXIT WHEN v_restante <= 0;
    v_aplicar := LEAST(v_restante, v_cuota.pendiente);

    UPDATE cuotas_acuerdo
    SET
      monto_pagado = ROUND(monto_pagado + v_aplicar, 2),
      estado = CASE
        WHEN ROUND(monto_pagado + v_aplicar, 2) >= monto THEN 'pagada'
        WHEN ROUND(monto_pagado + v_aplicar, 2) > 0 THEN 'parcial'
        ELSE estado
      END,
      fecha_pago = CASE
        WHEN ROUND(monto_pagado + v_aplicar, 2) >= monto THEN NOW()
        ELSE fecha_pago
      END
    WHERE id = v_cuota.cuota_id;

    UPDATE acuerdos_pago
    SET monto_pagado = ROUND(monto_pagado + v_aplicar, 2)
    WHERE id = v_cuota.acuerdo_id;

    v_restante := ROUND(v_restante - v_aplicar, 2);
    v_aplicado_total := ROUND(v_aplicado_total + v_aplicar, 2);
    IF ROUND(v_cuota.monto_pagado + v_aplicar, 2) >= v_cuota.monto THEN
      v_cuotas_pagadas := v_cuotas_pagadas + 1;
    END IF;
  END LOOP;

  UPDATE acuerdos_pago
  SET estado = 'completado'
  WHERE cliente_id = p_cliente_id
    AND estado = 'activo'
    AND ROUND(monto_pagado, 2) >= ROUND(monto_total, 2);
  GET DIAGNOSTICS v_acuerdos_cerrados = ROW_COUNT;

  RETURN json_build_object(
    'ok', v_restante <= 0.005,
    'monto_aplicado', v_aplicado_total,
    'monto_sobrante', GREATEST(v_restante, 0),
    'cuotas_pagadas', v_cuotas_pagadas,
    'acuerdos_cerrados', v_acuerdos_cerrados,
    'cuotas_seleccionadas', v_solicitadas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.aplicar_pago_a_cuotas_seleccionadas(uuid, numeric, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aplicar_pago_a_cuotas_seleccionadas(uuid, numeric, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_pago_a_cuotas_seleccionadas(uuid, numeric, uuid[]) TO service_role;
