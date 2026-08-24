-- Keep the proven allocation engine internal and expose tenant-safe entry
-- points for selected and automatic installment allocation.
ALTER FUNCTION public.aplicar_pago_a_cuotas_seleccionadas(uuid, numeric, uuid[])
  RENAME TO aplicar_pago_a_cuotas_seleccionadas_internal;

REVOKE ALL ON FUNCTION public.aplicar_pago_a_cuotas_seleccionadas_internal(uuid,numeric,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aplicar_pago_a_cuotas_seleccionadas_internal(uuid,numeric,uuid[]) FROM authenticated;

CREATE OR REPLACE FUNCTION public.aplicar_pago_a_cuotas_seleccionadas(
  p_cliente_id uuid,
  p_monto numeric,
  p_cuota_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.staff_can_access_cliente(p_cliente_id) THEN
    RETURN json_build_object('ok', false, 'error', 'Client not found or access denied');
  END IF;
  RETURN public.aplicar_pago_a_cuotas_seleccionadas_internal(
    p_cliente_id, p_monto, p_cuota_ids
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_pago_a_cuotas(
  p_cliente_id uuid,
  p_monto numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := ROUND(COALESCE(p_monto, 0), 2);
  v_ids uuid[];
  v_capacity numeric := 0;
  v_apply numeric := 0;
  v_result json;
  v_applied numeric := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.staff_can_access_cliente(p_cliente_id) THEN
    RETURN json_build_object('ok', false, 'error', 'Client not found or access denied');
  END IF;
  IF v_amount <= 0 THEN
    RETURN json_build_object(
      'ok', true, 'monto_aplicado', 0, 'monto_sobrante', 0,
      'cuotas_pagadas', 0, 'acuerdos_cerrados', 0
    );
  END IF;

  SELECT
    array_agg(pending.id ORDER BY pending.fecha_acuerdo, pending.numero_cuota),
    COALESCE(ROUND(SUM(pending.pendiente), 2), 0)
  INTO v_ids, v_capacity
  FROM (
    SELECT c.id, c.numero_cuota, a.fecha_acuerdo,
      ROUND(c.monto - c.monto_pagado, 2) AS pendiente
    FROM public.cuotas_acuerdo c
    JOIN public.acuerdos_pago a ON a.id = c.acuerdo_id
    WHERE a.cliente_id = p_cliente_id
      AND a.estado = 'activo'
      AND c.estado IN ('pendiente', 'vencida', 'parcial')
      AND ROUND(c.monto - c.monto_pagado, 2) > 0
  ) pending;

  v_apply := LEAST(v_amount, v_capacity);
  IF v_apply <= 0 THEN
    RETURN json_build_object(
      'ok', true, 'monto_aplicado', 0, 'monto_sobrante', v_amount,
      'cuotas_pagadas', 0, 'acuerdos_cerrados', 0
    );
  END IF;

  v_result := public.aplicar_pago_a_cuotas_seleccionadas_internal(
    p_cliente_id, v_apply, v_ids
  );
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;
  v_applied := COALESCE((v_result->>'monto_aplicado')::numeric, 0);
  RETURN (
    v_result::jsonb || jsonb_build_object(
      'monto_sobrante', GREATEST(ROUND(v_amount - v_applied, 2), 0)
    )
  )::json;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_pago_a_cuotas_seleccionadas(uuid,numeric,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aplicar_pago_a_cuotas(uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aplicar_pago_a_cuotas_seleccionadas(uuid,numeric,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_pago_a_cuotas(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_pago_a_cuotas_seleccionadas(uuid,numeric,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_pago_a_cuotas(uuid,numeric) TO service_role;
