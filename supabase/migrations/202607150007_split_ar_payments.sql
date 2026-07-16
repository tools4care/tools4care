-- Record one customer A/R collection from multiple payment sources as a
-- single database transaction. This serves both VAN and Physical Store;
-- Physical Store batches are tied to the cashier's open register session.

CREATE TABLE IF NOT EXISTS public.ar_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.vans(id) ON DELETE RESTRICT,
  store_cash_session_id uuid REFERENCES public.store_cash_sessions(id) ON DELETE SET NULL,
  total numeric(12,2) NOT NULL CHECK (total > 0),
  parts jsonb NOT NULL CHECK (jsonb_typeof(parts) = 'array'),
  created_by uuid NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ar_payment_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ar_payment_batches_read_own ON public.ar_payment_batches;
CREATE POLICY ar_payment_batches_read_own ON public.ar_payment_batches
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.store_cash_is_privileged());
GRANT SELECT ON public.ar_payment_batches TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ar_payment_batches FROM authenticated;

CREATE OR REPLACE FUNCTION public.record_split_ar_payment(
  p_cliente_id uuid,
  p_location_id uuid,
  p_session_id uuid,
  p_parts jsonb,
  p_transaction_id uuid DEFAULT gen_random_uuid(),
  p_paid_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.ar_payment_batches%ROWTYPE;
  v_session public.store_cash_sessions%ROWTYPE;
  v_part jsonb;
  v_part_amount numeric;
  v_part_method text;
  v_part_reference text;
  v_part_transaction_id uuid;
  v_total numeric := 0;
  v_balance numeric := 0;
  v_payment_ids jsonb := '[]'::jsonb;
  v_payment_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'A customer is required'; END IF;
  IF p_location_id IS NULL THEN RAISE EXCEPTION 'A location is required'; END IF;
  IF p_transaction_id IS NULL THEN RAISE EXCEPTION 'Transaction id is required'; END IF;
  IF jsonb_typeof(p_parts) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_parts) < 1
     OR jsonb_array_length(p_parts) > 4 THEN
    RAISE EXCEPTION 'Provide between one and four payment sources';
  END IF;

  SELECT * INTO v_existing
  FROM public.ar_payment_batches
  WHERE transaction_id = p_transaction_id;
  IF FOUND THEN
    IF v_existing.cliente_id <> p_cliente_id OR v_existing.location_id <> p_location_id THEN
      RAISE EXCEPTION 'Transaction id is already used by another payment';
    END IF;
    RETURN to_jsonb(v_existing) || jsonb_build_object('already_existed', true);
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.store_cash_sessions
    WHERE id = p_session_id
    FOR UPDATE;
    IF NOT FOUND OR v_session.location_id <> p_location_id THEN
      RAISE EXCEPTION 'Cash session and store location do not match';
    END IF;
    IF NOT public.store_cash_can_access_location(p_location_id) THEN
      RAISE EXCEPTION 'Location access denied';
    END IF;
    IF v_session.cashier_id <> auth.uid() AND NOT public.store_cash_is_privileged() THEN
      RAISE EXCEPTION 'The cash session belongs to another cashier';
    END IF;
    IF v_session.status <> 'open' THEN
      RAISE EXCEPTION 'The cash register session must be open';
    END IF;
  END IF;

  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_parts)
  LOOP
    v_part_amount := round(COALESCE((v_part->>'amount')::numeric, 0), 2);
    v_part_method := btrim(COALESCE(v_part->>'method', ''));
    IF v_part_amount <= 0 THEN RAISE EXCEPTION 'Every payment source must be positive'; END IF;
    IF length(v_part_method) < 2 THEN RAISE EXCEPTION 'Every payment source needs a method'; END IF;
    IF NULLIF(v_part->>'transaction_id', '') IS NULL THEN
      RAISE EXCEPTION 'Every payment source needs a transaction id';
    END IF;
    v_total := v_total + v_part_amount;
  END LOOP;
  v_total := round(v_total, 2);

  SELECT COALESCE(saldo, 0) INTO v_balance
  FROM public.v_cxc_cliente_detalle_ext
  WHERE cliente_id = p_cliente_id;
  IF COALESCE(v_balance, 0) <= 0 THEN RAISE EXCEPTION 'This customer has no outstanding balance'; END IF;
  IF v_total > round(v_balance, 2) + 0.005 THEN
    RAISE EXCEPTION 'Payment exceeds the current customer balance. Balance: %, payment: %', round(v_balance, 2), v_total;
  END IF;

  INSERT INTO public.ar_payment_batches(
    transaction_id, cliente_id, location_id, store_cash_session_id,
    total, parts, created_by, paid_at
  ) VALUES (
    p_transaction_id, p_cliente_id, p_location_id, p_session_id,
    v_total, p_parts, auth.uid(), COALESCE(p_paid_at, now())
  );

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_parts)
  LOOP
    v_part_amount := round((v_part->>'amount')::numeric, 2);
    v_part_method := btrim(v_part->>'method');
    v_part_reference := NULLIF(btrim(COALESCE(v_part->>'reference', '')), '');
    v_part_transaction_id := (v_part->>'transaction_id')::uuid;

    IF EXISTS (SELECT 1 FROM public.pagos WHERE transaction_id = v_part_transaction_id) THEN
      RAISE EXCEPTION 'A payment source transaction id has already been used';
    END IF;

    INSERT INTO public.pagos(
      cliente_id, van_id, usuario_id, fecha_pago, monto, metodo_pago,
      referencia, notas, idem_key, transaction_id, store_cash_session_id
    ) VALUES (
      p_cliente_id, p_location_id, auth.uid(), COALESCE(p_paid_at, now()),
      v_part_amount, v_part_method, v_part_reference,
      CASE WHEN p_session_id IS NULL
        THEN 'Split A/R payment collected in VAN'
        ELSE 'Split A/R payment collected at Physical Store register'
      END,
      NULL, v_part_transaction_id, p_session_id
    )
    RETURNING id INTO v_payment_id;
    v_payment_ids := v_payment_ids || jsonb_build_array(v_payment_id);
  END LOOP;

  IF p_session_id IS NOT NULL THEN
    INSERT INTO public.store_cash_session_events(
      session_id, location_id, event_type, actor_id, reason, snapshot
    ) VALUES (
      p_session_id, p_location_id, 'payment', auth.uid(),
      CASE WHEN jsonb_array_length(p_parts) > 1 THEN 'Split direct A/R payment' ELSE 'Direct A/R payment' END,
      jsonb_build_object(
        'batch_transaction_id', p_transaction_id,
        'cliente_id', p_cliente_id,
        'total', v_total,
        'parts', p_parts,
        'payment_ids', v_payment_ids
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', p_transaction_id,
    'cliente_id', p_cliente_id,
    'location_id', p_location_id,
    'store_cash_session_id', p_session_id,
    'total', v_total,
    'parts', p_parts,
    'payment_ids', v_payment_ids,
    'already_existed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_split_ar_payment(uuid,uuid,uuid,jsonb,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_split_ar_payment(uuid,uuid,uuid,jsonb,uuid,timestamptz) TO authenticated;
