-- Create an agreement, all installments, and consolidate prior agreements
-- as one transaction. Partial agreements can no longer be left behind.
CREATE OR REPLACE FUNCTION public.create_payment_agreement_transactional(
  p_cliente_id uuid,
  p_venta_id uuid,
  p_van_id uuid,
  p_monto_total numeric,
  p_num_cuotas integer,
  p_dias_plazo integer,
  p_fecha_limite timestamptz,
  p_excepcion_vendedor boolean DEFAULT false,
  p_excepcion_nota text DEFAULT NULL,
  p_cuotas jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement public.acuerdos_pago%ROWTYPE;
  v_previous_ids uuid[] := ARRAY[]::uuid[];
  v_previous_count integer := 0;
  v_parent_id uuid;
  v_installment jsonb;
  v_installments jsonb;
  v_installment_total numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.staff_can_access_cliente(p_cliente_id) THEN
    RAISE EXCEPTION 'Client not found or access denied';
  END IF;
  IF p_venta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ventas sale
    WHERE sale.id = p_venta_id
      AND sale.cliente_id = p_cliente_id
      AND sale.tenant_id IS NOT DISTINCT FROM public.current_user_tenant_id()
  ) THEN
    RAISE EXCEPTION 'Sale not found or access denied';
  END IF;
  IF p_van_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vans location
    WHERE location.id = p_van_id
      AND location.tenant_id IS NOT DISTINCT FROM public.current_user_tenant_id()
  ) THEN
    RAISE EXCEPTION 'Location not found or access denied';
  END IF;
  IF COALESCE(p_monto_total, 0) <= 0 THEN RAISE EXCEPTION 'Agreement total must be positive'; END IF;
  IF COALESCE(p_num_cuotas, 0) <= 0 THEN RAISE EXCEPTION 'Installment count must be positive'; END IF;
  IF jsonb_typeof(p_cuotas) <> 'array' OR jsonb_array_length(p_cuotas) <> p_num_cuotas THEN
    RAISE EXCEPTION 'Installment schedule does not match installment count';
  END IF;

  SELECT COALESCE(ROUND(SUM((item->>'monto')::numeric), 2), 0)
  INTO v_installment_total
  FROM jsonb_array_elements(p_cuotas) item;
  IF ABS(v_installment_total - ROUND(p_monto_total, 2)) > 0.02 THEN
    RAISE EXCEPTION 'Installment total does not match agreement total';
  END IF;

  SELECT COALESCE(array_agg(locked.id ORDER BY locked.fecha_acuerdo), ARRAY[]::uuid[]), count(*)
  INTO v_previous_ids, v_previous_count
  FROM (
    SELECT agreement.id, agreement.fecha_acuerdo
    FROM public.acuerdos_pago agreement
    WHERE agreement.cliente_id = p_cliente_id AND agreement.estado = 'activo'
    ORDER BY agreement.fecha_acuerdo
    FOR UPDATE
  ) locked;
  IF v_previous_count = 1 THEN v_parent_id := v_previous_ids[1]; END IF;

  INSERT INTO public.acuerdos_pago(
    cliente_id, venta_id, van_id, usuario_id, monto_total, num_cuotas,
    dias_plazo, fecha_limite, excepcion_vendedor, excepcion_nota, acuerdo_padre_id
  ) VALUES (
    p_cliente_id, p_venta_id, p_van_id, auth.uid(), ROUND(p_monto_total, 2),
    p_num_cuotas, p_dias_plazo, p_fecha_limite,
    COALESCE(p_excepcion_vendedor, false), NULLIF(btrim(p_excepcion_nota), ''), v_parent_id
  ) RETURNING * INTO v_agreement;

  FOR v_installment IN SELECT * FROM jsonb_array_elements(p_cuotas)
  LOOP
    IF COALESCE((v_installment->>'numero_cuota')::integer, 0) <= 0
       OR COALESCE((v_installment->>'monto')::numeric, 0) <= 0
       OR NULLIF(v_installment->>'fecha_vencimiento', '') IS NULL THEN
      RAISE EXCEPTION 'Invalid installment schedule';
    END IF;
    INSERT INTO public.cuotas_acuerdo(acuerdo_id, numero_cuota, monto, fecha_vencimiento)
    VALUES (
      v_agreement.id,
      (v_installment->>'numero_cuota')::integer,
      ROUND((v_installment->>'monto')::numeric, 2),
      (v_installment->>'fecha_vencimiento')::timestamptz
    );
  END LOOP;

  IF v_previous_count > 0 THEN
    UPDATE public.acuerdos_pago
    SET estado = 'renegociado', fue_renegociado = true, updated_at = now()
    WHERE id = ANY(v_previous_ids);
    UPDATE public.cuotas_acuerdo
    SET estado = 'cancelado'
    WHERE acuerdo_id = ANY(v_previous_ids)
      AND estado IN ('pendiente', 'vencida', 'parcial');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(inst) ORDER BY inst.numero_cuota), '[]'::jsonb)
  INTO v_installments
  FROM public.cuotas_acuerdo inst
  WHERE inst.acuerdo_id = v_agreement.id;

  RETURN jsonb_build_object(
    'acuerdo', to_jsonb(v_agreement),
    'cuotas', v_installments,
    'acuerdos_previos', to_jsonb(v_previous_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_agreement_transactional(
  uuid,uuid,uuid,numeric,integer,integer,timestamptz,boolean,text,jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payment_agreement_transactional(
  uuid,uuid,uuid,numeric,integer,integer,timestamptz,boolean,text,jsonb
) TO authenticated;
