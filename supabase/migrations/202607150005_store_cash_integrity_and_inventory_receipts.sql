-- Close the remaining Physical Store audit gaps:
--   * direct A/R collections belong to the cashier/register shift
--   * cash refunds are included in the drawer expectation
--   * initial inventory keeps a product-level baseline
--   * location transfers keep sender and receiver acknowledgements

ALTER TABLE public.store_cash_sessions
  ADD COLUMN IF NOT EXISTS ar_cash_collections numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ar_card_collections numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ar_transfer_collections numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ar_other_collections numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.store_cash_session_events
  DROP CONSTRAINT IF EXISTS store_cash_session_events_event_type_check;
ALTER TABLE public.store_cash_session_events
  ADD CONSTRAINT store_cash_session_events_event_type_check
  CHECK (event_type IN (
    'open', 'close', 'reopen', 'movement', 'movement_void',
    'late_sale', 'payment', 'late_payment'
  ));

CREATE OR REPLACE FUNCTION public.get_store_cash_session_summary(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.store_cash_sessions%ROWTYPE;
  v_cash_sales numeric := 0;
  v_cash_returns numeric := 0;
  v_card_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_other_sales numeric := 0;
  v_total_sales numeric := 0;
  v_ar_cash numeric := 0;
  v_ar_card numeric := 0;
  v_ar_transfer numeric := 0;
  v_ar_other numeric := 0;
  v_deposits numeric := 0;
  v_withdrawals numeric := 0;
  v_expenses numeric := 0;
  v_sales_count integer := 0;
  v_expected numeric := 0;
BEGIN
  SELECT * INTO v_session FROM public.store_cash_sessions WHERE id = p_session_id;
  IF NOT FOUND OR NOT public.store_cash_can_access_location(v_session.location_id) THEN
    RAISE EXCEPTION 'Cash session not found or access denied';
  END IF;

  SELECT
    COALESCE(sum(CASE WHEN tipo IS DISTINCT FROM 'devolucion' THEN abs(COALESCE(pago_efectivo, 0)) ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN tipo = 'devolucion' THEN
      COALESCE(NULLIF(abs(COALESCE(pago_efectivo, 0)), 0),
        CASE WHEN lower(COALESCE(metodo_pago, '')) ~ '(cash|efectivo)'
          THEN abs(COALESCE(total_venta, total, 0)) ELSE 0 END)
      ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN tipo IS DISTINCT FROM 'devolucion' THEN abs(COALESCE(pago_tarjeta, 0)) ELSE
      -COALESCE(NULLIF(abs(COALESCE(pago_tarjeta, 0)), 0),
        CASE WHEN lower(COALESCE(metodo_pago, '')) ~ '(card|tarjeta|stripe)'
          THEN abs(COALESCE(total_venta, total, 0)) ELSE 0 END)
      END), 0),
    COALESCE(sum(CASE WHEN tipo IS DISTINCT FROM 'devolucion' THEN abs(COALESCE(pago_transferencia, 0)) ELSE
      -COALESCE(NULLIF(abs(COALESCE(pago_transferencia, 0)), 0),
        CASE WHEN lower(COALESCE(metodo_pago, '')) ~ '(transfer|zelle|venmo|cash ?app|apple ?pay|paypal)'
          THEN abs(COALESCE(total_venta, total, 0)) ELSE 0 END)
      END), 0),
    COALESCE(sum(CASE WHEN tipo IS DISTINCT FROM 'devolucion' THEN abs(COALESCE(pago_otro, 0)) ELSE
      -COALESCE(NULLIF(abs(COALESCE(pago_otro, 0)), 0),
        CASE WHEN NOT (lower(COALESCE(metodo_pago, '')) ~ '(cash|efectivo|card|tarjeta|stripe|transfer|zelle|venmo|cash ?app|apple ?pay|paypal)')
          THEN abs(COALESCE(total_venta, total, 0)) ELSE 0 END)
      END), 0),
    COALESCE(sum(CASE WHEN tipo IS DISTINCT FROM 'devolucion' THEN abs(COALESCE(total_venta, total, 0)) ELSE -abs(COALESCE(total_venta, total, 0)) END), 0),
    count(*)::integer
  INTO v_cash_sales, v_cash_returns, v_card_sales, v_transfer_sales, v_other_sales, v_total_sales, v_sales_count
  FROM public.ventas
  WHERE store_cash_session_id = p_session_id;

  SELECT
    COALESCE(sum(monto) FILTER (WHERE lower(COALESCE(metodo_pago, '')) ~ '(cash|efectivo)'), 0),
    COALESCE(sum(monto) FILTER (WHERE lower(COALESCE(metodo_pago, '')) ~ '(card|tarjeta|stripe)'), 0),
    COALESCE(sum(monto) FILTER (WHERE lower(COALESCE(metodo_pago, '')) ~ '(transfer|zelle|venmo|cash ?app|apple ?pay|paypal)'), 0),
    COALESCE(sum(monto) FILTER (WHERE NOT (lower(COALESCE(metodo_pago, '')) ~ '(cash|efectivo|card|tarjeta|stripe|transfer|zelle|venmo|cash ?app|apple ?pay|paypal)')), 0)
  INTO v_ar_cash, v_ar_card, v_ar_transfer, v_ar_other
  FROM public.pagos
  WHERE store_cash_session_id = p_session_id;

  SELECT
    COALESCE(sum(amount) FILTER (WHERE movement_type = 'deposit' AND voided_at IS NULL), 0),
    COALESCE(sum(amount) FILTER (WHERE movement_type = 'withdrawal' AND voided_at IS NULL), 0),
    COALESCE(sum(amount) FILTER (WHERE movement_type = 'expense' AND voided_at IS NULL), 0)
  INTO v_deposits, v_withdrawals, v_expenses
  FROM public.store_cash_movements
  WHERE session_id = p_session_id;

  v_expected := round(
    v_session.opening_float + v_cash_sales - v_cash_returns + v_ar_cash
    + v_deposits - v_withdrawals - v_expenses,
    2
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'opening_float', v_session.opening_float,
    'cash_sales', round(v_cash_sales, 2),
    'cash_returns', round(v_cash_returns, 2),
    'card_sales', round(v_card_sales, 2),
    'transfer_sales', round(v_transfer_sales, 2),
    'other_sales', round(v_other_sales, 2),
    'total_sales', round(v_total_sales, 2),
    'sales_count', v_sales_count,
    'ar_cash_collections', round(v_ar_cash, 2),
    'ar_card_collections', round(v_ar_card, 2),
    'ar_transfer_collections', round(v_ar_transfer, 2),
    'ar_other_collections', round(v_ar_other, 2),
    'ar_total_collections', round(v_ar_cash + v_ar_card + v_ar_transfer + v_ar_other, 2),
    'manual_deposits', round(v_deposits, 2),
    'withdrawals', round(v_withdrawals, 2),
    'expenses', round(v_expenses, 2),
    'expected_cash', v_expected,
    'counted_cash', v_session.counted_cash,
    'variance', CASE WHEN v_session.counted_cash IS NULL THEN NULL ELSE round(v_session.counted_cash - v_expected, 2) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_store_cash_session(
  p_session_id uuid,
  p_counted_cash numeric,
  p_notes text DEFAULT NULL
)
RETURNS public.store_cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.store_cash_sessions%ROWTYPE;
  v_summary jsonb;
BEGIN
  SELECT * INTO v_session FROM public.store_cash_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR NOT public.store_cash_can_access_location(v_session.location_id) THEN RAISE EXCEPTION 'Cash session not found or access denied'; END IF;
  IF v_session.status <> 'open' THEN RAISE EXCEPTION 'Cash session is already closed'; END IF;
  IF v_session.cashier_id <> auth.uid() AND NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'Only this cashier or a supervisor can close the session'; END IF;
  IF COALESCE(p_counted_cash, -1) < 0 THEN RAISE EXCEPTION 'Counted cash cannot be negative'; END IF;
  v_summary := public.get_store_cash_session_summary(p_session_id);

  UPDATE public.store_cash_sessions SET
    status = 'closed', closed_at = now(), closed_by = auth.uid(),
    expected_cash = (v_summary->>'expected_cash')::numeric,
    counted_cash = round(p_counted_cash, 2),
    variance = round(p_counted_cash - (v_summary->>'expected_cash')::numeric, 2),
    cash_sales = (v_summary->>'cash_sales')::numeric,
    cash_returns = (v_summary->>'cash_returns')::numeric,
    ar_cash_collections = (v_summary->>'ar_cash_collections')::numeric,
    ar_card_collections = (v_summary->>'ar_card_collections')::numeric,
    ar_transfer_collections = (v_summary->>'ar_transfer_collections')::numeric,
    ar_other_collections = (v_summary->>'ar_other_collections')::numeric,
    manual_deposits = (v_summary->>'manual_deposits')::numeric,
    withdrawals = (v_summary->>'withdrawals')::numeric,
    expenses = (v_summary->>'expenses')::numeric,
    closing_notes = NULLIF(btrim(p_notes), ''), close_version = close_version + 1, updated_at = now()
  WHERE id = p_session_id RETURNING * INTO v_session;

  INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
  VALUES (p_session_id, v_session.location_id, 'close', auth.uid(), v_session.closing_notes,
    to_jsonb(v_session) || jsonb_build_object('summary', v_summary));
  RETURN v_session;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS pagos_store_session_transaction_unique
  ON public.pagos(transaction_id)
  WHERE transaction_id IS NOT NULL AND store_cash_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_store_ar_payment(
  p_cliente_id uuid,
  p_location_id uuid,
  p_session_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_transaction_id uuid DEFAULT gen_random_uuid(),
  p_paid_at timestamptz DEFAULT now()
)
RETURNS public.pagos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.store_cash_sessions%ROWTYPE;
  v_payment public.pagos%ROWTYPE;
  v_summary jsonb;
  v_balance numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'A customer is required'; END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
  IF length(btrim(COALESCE(p_method, ''))) < 2 THEN RAISE EXCEPTION 'Payment method is required'; END IF;
  IF p_transaction_id IS NULL THEN RAISE EXCEPTION 'Transaction id is required'; END IF;

  SELECT * INTO v_payment
  FROM public.pagos
  WHERE transaction_id = p_transaction_id AND store_cash_session_id IS NOT NULL;
  IF FOUND THEN
    IF v_payment.cliente_id <> p_cliente_id OR v_payment.van_id <> p_location_id OR v_payment.store_cash_session_id <> p_session_id THEN
      RAISE EXCEPTION 'Transaction id is already used by another payment';
    END IF;
    RETURN v_payment;
  END IF;

  SELECT * INTO v_session FROM public.store_cash_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.location_id <> p_location_id THEN RAISE EXCEPTION 'Cash session and store location do not match'; END IF;
  IF NOT public.store_cash_can_access_location(p_location_id) THEN RAISE EXCEPTION 'Location access denied'; END IF;
  IF v_session.cashier_id <> auth.uid() AND NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'The cash session belongs to another cashier'; END IF;
  IF v_session.status = 'closed' AND NOT (
    p_paid_at >= v_session.opened_at AND p_paid_at <= v_session.closed_at
  ) THEN
    RAISE EXCEPTION 'A closed session only accepts an offline payment created during that shift';
  END IF;

  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
  SELECT COALESCE(saldo, 0) INTO v_balance
  FROM public.v_cxc_cliente_detalle_ext
  WHERE cliente_id = p_cliente_id;
  IF COALESCE(v_balance, 0) <= 0 THEN RAISE EXCEPTION 'This customer has no outstanding balance'; END IF;
  IF round(p_amount, 2) > round(v_balance, 2) + 0.005 THEN
    RAISE EXCEPTION 'Payment exceeds the current customer balance. Balance: %, payment: %', round(v_balance, 2), round(p_amount, 2);
  END IF;

  INSERT INTO public.pagos(
    cliente_id, van_id, usuario_id, fecha_pago, monto, metodo_pago,
    referencia, notas, idem_key, transaction_id, store_cash_session_id
  ) VALUES (
    p_cliente_id, p_location_id, auth.uid(), COALESCE(p_paid_at, now()), round(p_amount, 2), btrim(p_method),
    NULLIF(btrim(p_reference), ''), 'Direct A/R payment collected at Physical Store register',
    NULL, p_transaction_id, p_session_id
  )
  RETURNING * INTO v_payment;

  INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
  VALUES (
    p_session_id, p_location_id,
    CASE WHEN v_session.status = 'closed' THEN 'late_payment' ELSE 'payment' END,
    auth.uid(), 'Direct A/R payment', to_jsonb(v_payment)
  );

  IF v_session.status = 'closed' THEN
    v_summary := public.get_store_cash_session_summary(p_session_id);
    UPDATE public.store_cash_sessions SET
      expected_cash = (v_summary->>'expected_cash')::numeric,
      variance = round(counted_cash - (v_summary->>'expected_cash')::numeric, 2),
      cash_sales = (v_summary->>'cash_sales')::numeric,
      cash_returns = (v_summary->>'cash_returns')::numeric,
      ar_cash_collections = (v_summary->>'ar_cash_collections')::numeric,
      ar_card_collections = (v_summary->>'ar_card_collections')::numeric,
      ar_transfer_collections = (v_summary->>'ar_transfer_collections')::numeric,
      ar_other_collections = (v_summary->>'ar_other_collections')::numeric,
      manual_deposits = (v_summary->>'manual_deposits')::numeric,
      withdrawals = (v_summary->>'withdrawals')::numeric,
      expenses = (v_summary->>'expenses')::numeric,
      updated_at = now()
    WHERE id = p_session_id;
  END IF;
  RETURN v_payment;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_payment FROM public.pagos
  WHERE transaction_id = p_transaction_id AND store_cash_session_id = p_session_id;
  IF v_payment.id IS NULL THEN RAISE; END IF;
  RETURN v_payment;
END;
$$;

CREATE TABLE IF NOT EXISTS public.location_inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  quantity numeric(14,2) NOT NULL CHECK (quantity > 0),
  origin_type text NOT NULL CHECK (origin_type IN ('almacen', 'van')),
  origin_location_id uuid REFERENCES public.vans(id) ON DELETE RESTRICT,
  destination_type text NOT NULL CHECK (destination_type IN ('almacen', 'van')),
  destination_location_id uuid REFERENCES public.vans(id) ON DELETE RESTRICT,
  reason text,
  status text NOT NULL DEFAULT 'pending_receipt' CHECK (status IN ('pending_receipt', 'received')),
  initiated_by uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  received_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS location_inventory_transfers_destination_pending_idx
  ON public.location_inventory_transfers(destination_location_id, initiated_at DESC)
  WHERE status = 'pending_receipt';
CREATE INDEX IF NOT EXISTS location_inventory_transfers_origin_idx
  ON public.location_inventory_transfers(origin_location_id, initiated_at DESC);

ALTER TABLE public.location_inventory_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS location_inventory_transfers_read_accessible ON public.location_inventory_transfers;
CREATE POLICY location_inventory_transfers_read_accessible ON public.location_inventory_transfers
  FOR SELECT TO authenticated USING (
    public.store_cash_is_privileged()
    OR public.store_cash_can_access_location(origin_location_id)
    OR public.store_cash_can_access_location(destination_location_id)
  );
REVOKE INSERT, UPDATE, DELETE ON public.location_inventory_transfers FROM authenticated;
GRANT SELECT ON public.location_inventory_transfers TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_location_stock(
  p_producto_id uuid,
  p_cantidad numeric,
  p_origen_tipo text,
  p_origen_van_id uuid DEFAULT NULL,
  p_destino_tipo text DEFAULT NULL,
  p_destino_van_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS TABLE(producto_id uuid, origen_cantidad numeric, destino_cantidad numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin text := lower(COALESCE(p_origen_tipo, ''));
  v_destination text := lower(COALESCE(p_destino_tipo, ''));
  v_product uuid;
  v_origin_quantity numeric;
  v_destination_quantity numeric;
  v_status text;
BEGIN
  IF v_origin = 'warehouse' THEN v_origin := 'almacen'; END IF;
  IF v_destination = 'warehouse' THEN v_destination := 'almacen'; END IF;
  IF (v_origin = 'almacen' OR v_destination = 'almacen') AND NOT public.store_cash_is_privileged() THEN
    RAISE EXCEPTION 'Supervisor or administrator required for Warehouse transfers';
  END IF;
  IF v_origin = 'van' AND NOT public.store_cash_can_access_location(p_origen_van_id) THEN
    RAISE EXCEPTION 'Origin location access denied';
  END IF;
  IF v_destination = 'van' AND NOT public.store_cash_can_access_location(p_destino_van_id) THEN
    RAISE EXCEPTION 'Destination location access denied';
  END IF;

  SELECT t.producto_id, t.origen_cantidad, t.destino_cantidad
  INTO v_product, v_origin_quantity, v_destination_quantity
  FROM public.transferir_stock(
    p_producto_id, p_cantidad, v_origin, p_origen_van_id,
    v_destination, p_destino_van_id, p_motivo, auth.uid()
  ) t;

  v_status := CASE WHEN v_destination = 'van' THEN 'pending_receipt' ELSE 'received' END;
  INSERT INTO public.location_inventory_transfers(
    product_id, quantity, origin_type, origin_location_id,
    destination_type, destination_location_id, reason, status,
    initiated_by, received_by, received_at
  ) VALUES (
    p_producto_id, round(p_cantidad, 2), v_origin,
    CASE WHEN v_origin = 'van' THEN p_origen_van_id ELSE NULL END,
    v_destination, CASE WHEN v_destination = 'van' THEN p_destino_van_id ELSE NULL END,
    NULLIF(btrim(p_motivo), ''), v_status, auth.uid(),
    CASE WHEN v_status = 'received' THEN auth.uid() ELSE NULL END,
    CASE WHEN v_status = 'received' THEN now() ELSE NULL END
  );

  RETURN QUERY SELECT v_product, v_origin_quantity, v_destination_quantity;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_inventory_receipts(
  p_location_id uuid,
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.store_cash_can_access_location(p_location_id) THEN RAISE EXCEPTION 'Location access denied'; END IF;
  SELECT COALESCE(jsonb_agg(entry ORDER BY initiated_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT to_jsonb(t) || jsonb_build_object(
      'product_name', COALESCE(p.nombre, t.product_id::text),
      'product_code', p.codigo,
      'initiated_by_name', COALESCE(u.nombre, u.email, t.initiated_by::text),
      'origin_name', CASE WHEN t.origin_type = 'almacen' THEN 'Central Warehouse'
        ELSE COALESCE(v.nombre_van, t.origin_location_id::text) END
    ) AS entry, t.initiated_at
    FROM public.location_inventory_transfers t
    LEFT JOIN public.productos p ON p.id = t.product_id
    LEFT JOIN public.usuarios u ON u.id = t.initiated_by
    LEFT JOIN public.vans v ON v.id = t.origin_location_id
    WHERE t.destination_location_id = p_location_id
      AND t.status = 'pending_receipt'
    ORDER BY t.initiated_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
  ) pending;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_inventory_transfer(p_transfer_id uuid)
RETURNS public.location_inventory_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer public.location_inventory_transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_transfer FROM public.location_inventory_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.destination_location_id IS NULL OR NOT public.store_cash_can_access_location(v_transfer.destination_location_id) THEN
    RAISE EXCEPTION 'Destination access denied';
  END IF;
  IF v_transfer.status = 'received' THEN RETURN v_transfer; END IF;
  UPDATE public.location_inventory_transfers
  SET status = 'received', received_by = auth.uid(), received_at = now()
  WHERE id = p_transfer_id
  RETURNING * INTO v_transfer;
  RETURN v_transfer;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_store_inventory(p_location_id uuid, p_notes text DEFAULT NULL)
RETURNS public.store_inventory_confirmations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmation public.store_inventory_confirmations%ROWTYPE;
  v_items integer;
  v_units numeric;
  v_snapshot jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vans WHERE id = p_location_id AND tipo = 'store' AND activo IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'A valid Physical Store location is required';
  END IF;
  IF NOT public.store_cash_can_access_location(p_location_id) THEN RAISE EXCEPTION 'Location access denied'; END IF;
  IF NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'Supervisor or administrator required to confirm initial inventory'; END IF;

  SELECT count(*)::integer, COALESCE(sum(COALESCE(s.cantidad, s.qty, 0)), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', s.producto_id,
      'product_name', p.nombre,
      'product_code', p.codigo,
      'quantity', COALESCE(s.cantidad, s.qty, 0)
    ) ORDER BY p.nombre), '[]'::jsonb)
  INTO v_items, v_units, v_snapshot
  FROM public.stock_van s
  LEFT JOIN public.productos p ON p.id = s.producto_id
  WHERE s.van_id = p_location_id;

  IF v_items = 0 THEN RAISE EXCEPTION 'Assign or transfer store inventory before confirming it'; END IF;
  INSERT INTO public.store_inventory_confirmations(location_id, confirmed_by, item_count, unit_count, notes, snapshot)
  VALUES (
    p_location_id, auth.uid(), v_items, round(v_units, 2), NULLIF(btrim(p_notes), ''),
    jsonb_build_object('item_count', v_items, 'unit_count', round(v_units, 2), 'products', v_snapshot)
  ) RETURNING * INTO v_confirmation;
  RETURN v_confirmation;
END;
$$;

REVOKE ALL ON FUNCTION public.record_store_ar_payment(uuid,uuid,uuid,numeric,text,text,uuid,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_inventory_receipts(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acknowledge_inventory_transfer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_store_ar_payment(uuid,uuid,uuid,numeric,text,text,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_inventory_receipts(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_inventory_transfer(uuid) TO authenticated;
