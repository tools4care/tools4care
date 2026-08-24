-- Save the sale and allocate prior A/R payments to installments atomically.
CREATE OR REPLACE FUNCTION public.guardar_venta_con_cuotas_transaccional(
  p_transaction_id uuid, p_cliente_id uuid, p_van_id uuid, p_usuario_id uuid,
  p_total numeric, p_total_pagado numeric, p_estado_pago text, p_metodo_pago text,
  p_pago jsonb, p_pago_efectivo numeric, p_pago_tarjeta numeric,
  p_pago_transferencia numeric, p_pago_otro numeric, p_notas text, p_items jsonb,
  p_deuda_nueva numeric DEFAULT 0, p_pago_deuda_anterior numeric DEFAULT 0,
  p_credito_favor_aplicado numeric DEFAULT 0, p_credito_favor_a_deuda numeric DEFAULT 0,
  p_acuerdo_aplicacion text DEFAULT 'auto',
  p_acuerdo_cuota_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE(
  venta_id uuid, credito_favor_restante numeric, already_existed boolean,
  acuerdo_resultado json
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_result json := json_build_object('ok', true, 'monto_aplicado', 0);
  v_mode text := lower(COALESCE(p_acuerdo_aplicacion, 'auto'));
  v_auto_ids uuid[];
  v_auto_capacity numeric := 0;
  v_auto_amount numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = p_cliente_id
      AND c.tenant_id IS NOT DISTINCT FROM public.current_user_tenant_id()
  ) THEN
    RAISE EXCEPTION 'Client not found or access denied';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vans v
    WHERE v.id = p_van_id
      AND v.tenant_id IS NOT DISTINCT FROM public.current_user_tenant_id()
  ) THEN
    RAISE EXCEPTION 'Location not found or access denied';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) item
    LEFT JOIN public.productos product
      ON product.id = (item->>'producto_id')::uuid
     AND product.tenant_id IS NOT DISTINCT FROM public.current_user_tenant_id()
    WHERE product.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more products were not found or access was denied';
  END IF;

  SELECT * INTO v_sale FROM public.guardar_venta_transaccional(
    p_transaction_id, p_cliente_id, p_van_id, p_usuario_id, p_total,
    p_total_pagado, p_estado_pago, p_metodo_pago, p_pago, p_pago_efectivo,
    p_pago_tarjeta, p_pago_transferencia, p_pago_otro, p_notas, p_items,
    p_deuda_nueva, p_pago_deuda_anterior, p_credito_favor_aplicado,
    p_credito_favor_a_deuda
  );

  IF v_sale.venta_id IS NULL THEN
    RAISE EXCEPTION 'The transactional sale did not return a sale ID';
  END IF;

  -- A retry of the same transaction must not pay installments twice.
  IF NOT COALESCE(v_sale.already_existed, false)
     AND COALESCE(p_pago_deuda_anterior, 0) > 0 THEN
    IF v_mode = 'selected' THEN
      v_result := public.aplicar_pago_a_cuotas_seleccionadas(
        p_cliente_id, ROUND(p_pago_deuda_anterior, 2),
        COALESCE(p_acuerdo_cuota_ids, ARRAY[]::uuid[])
      );
      IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', COALESCE(
          v_result->>'error', 'Could not apply payment to selected installments'
        );
      END IF;
    ELSIF v_mode = 'auto' THEN
      SELECT
        array_agg(c.id ORDER BY a.fecha_acuerdo, c.numero_cuota),
        COALESCE(ROUND(SUM(c.monto - c.monto_pagado), 2), 0)
      INTO v_auto_ids, v_auto_capacity
      FROM public.cuotas_acuerdo c
      JOIN public.acuerdos_pago a ON a.id = c.acuerdo_id
      WHERE a.cliente_id = p_cliente_id
        AND a.estado = 'activo'
        AND c.estado IN ('pendiente', 'vencida', 'parcial')
        AND ROUND(c.monto - c.monto_pagado, 2) > 0;

      v_auto_amount := LEAST(ROUND(p_pago_deuda_anterior, 2), v_auto_capacity);
      IF v_auto_amount > 0 THEN
        v_result := public.aplicar_pago_a_cuotas_seleccionadas(
          p_cliente_id, v_auto_amount, v_auto_ids
        );
        IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
          RAISE EXCEPTION '%', COALESCE(
            v_result->>'error', 'Could not apply payment to installments'
          );
        END IF;
      ELSE
        v_result := json_build_object(
          'ok', true, 'monto_aplicado', 0,
          'monto_sobrante', ROUND(p_pago_deuda_anterior, 2)
        );
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid agreement allocation mode: %', p_acuerdo_aplicacion;
    END IF;
  END IF;

  RETURN QUERY SELECT v_sale.venta_id, v_sale.credito_favor_restante,
    v_sale.already_existed, v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_venta_con_cuotas_transaccional(
  uuid,uuid,uuid,uuid,numeric,numeric,text,text,jsonb,numeric,numeric,numeric,
  numeric,text,jsonb,numeric,numeric,numeric,numeric,text,uuid[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_venta_con_cuotas_transaccional(
  uuid,uuid,uuid,uuid,numeric,numeric,text,text,jsonb,numeric,numeric,numeric,
  numeric,text,jsonb,numeric,numeric,numeric,numeric,text,uuid[]
) TO authenticated;
