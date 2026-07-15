-- Physical Store cash registers, cashier shifts and inventory confirmation.
-- Store inventory itself remains in stock_van, isolated by the store location id.

CREATE TABLE IF NOT EXISTS public.store_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.vans(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, device_id)
);

CREATE TABLE IF NOT EXISTS public.store_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.vans(id) ON DELETE RESTRICT,
  register_id uuid NOT NULL REFERENCES public.store_registers(id) ON DELETE RESTRICT,
  cashier_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  device_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_float numeric(12,2) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  opening_notes text,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.usuarios(id),
  expected_cash numeric(12,2),
  counted_cash numeric(12,2),
  variance numeric(12,2),
  cash_sales numeric(12,2) NOT NULL DEFAULT 0,
  cash_returns numeric(12,2) NOT NULL DEFAULT 0,
  manual_deposits numeric(12,2) NOT NULL DEFAULT 0,
  withdrawals numeric(12,2) NOT NULL DEFAULT 0,
  expenses numeric(12,2) NOT NULL DEFAULT 0,
  closing_notes text,
  close_version integer NOT NULL DEFAULT 0,
  reopened_at timestamptz,
  reopened_by uuid REFERENCES public.usuarios(id),
  reopen_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS store_cash_sessions_one_open_register_idx
  ON public.store_cash_sessions(register_id) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS store_cash_sessions_one_open_cashier_idx
  ON public.store_cash_sessions(location_id, cashier_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS store_cash_sessions_location_opened_idx
  ON public.store_cash_sessions(location_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS public.store_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.store_cash_sessions(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.vans(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('deposit', 'withdrawal', 'expense')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  created_by uuid NOT NULL REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES public.usuarios(id),
  void_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS store_cash_movements_session_created_idx
  ON public.store_cash_movements(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.store_cash_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.store_cash_sessions(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.vans(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('open', 'close', 'reopen', 'movement', 'movement_void', 'late_sale')),
  actor_id uuid NOT NULL REFERENCES public.usuarios(id),
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_cash_session_events_session_created_idx
  ON public.store_cash_session_events(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.store_inventory_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.vans(id) ON DELETE RESTRICT,
  confirmed_by uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  item_count integer NOT NULL DEFAULT 0,
  unit_count numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS store_inventory_confirmations_location_idx
  ON public.store_inventory_confirmations(location_id, confirmed_at DESC);

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS store_cash_session_id uuid REFERENCES public.store_cash_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS store_cash_session_id uuid REFERENCES public.store_cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ventas_store_cash_session_idx ON public.ventas(store_cash_session_id);
CREATE INDEX IF NOT EXISTS pagos_store_cash_session_idx ON public.pagos(store_cash_session_id);

CREATE OR REPLACE FUNCTION public.store_cash_is_privileged()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
      AND rol IN ('admin', 'supervisor')
      AND activo IS DISTINCT FROM false
  );
$$;

CREATE OR REPLACE FUNCTION public.store_cash_can_access_location(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.store_cash_is_privileged()
    OR NOT EXISTS (
      SELECT 1 FROM public.usuarios_vans uv WHERE uv.usuario_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.usuarios_vans uv
      WHERE uv.usuario_id = auth.uid()
        AND uv.van_id = p_location_id
        AND uv.activo IS DISTINCT FROM false
    )
  );
$$;

REVOKE ALL ON FUNCTION public.store_cash_is_privileged() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_cash_can_access_location(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_cash_is_privileged() TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_cash_can_access_location(uuid) TO authenticated;

ALTER TABLE public.store_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_cash_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_registers_read_accessible ON public.store_registers;
CREATE POLICY store_registers_read_accessible ON public.store_registers
  FOR SELECT TO authenticated
  USING (public.store_cash_can_access_location(location_id));

DROP POLICY IF EXISTS store_cash_sessions_read_accessible ON public.store_cash_sessions;
CREATE POLICY store_cash_sessions_read_accessible ON public.store_cash_sessions
  FOR SELECT TO authenticated
  USING (public.store_cash_can_access_location(location_id));

DROP POLICY IF EXISTS store_cash_movements_read_accessible ON public.store_cash_movements;
CREATE POLICY store_cash_movements_read_accessible ON public.store_cash_movements
  FOR SELECT TO authenticated
  USING (public.store_cash_can_access_location(location_id));

DROP POLICY IF EXISTS store_cash_events_read_accessible ON public.store_cash_session_events;
CREATE POLICY store_cash_events_read_accessible ON public.store_cash_session_events
  FOR SELECT TO authenticated
  USING (public.store_cash_can_access_location(location_id));

DROP POLICY IF EXISTS store_inventory_confirmations_read_accessible ON public.store_inventory_confirmations;
CREATE POLICY store_inventory_confirmations_read_accessible ON public.store_inventory_confirmations
  FOR SELECT TO authenticated
  USING (public.store_cash_can_access_location(location_id));

REVOKE INSERT, UPDATE, DELETE ON public.store_registers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_cash_sessions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_cash_movements FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_cash_session_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_inventory_confirmations FROM authenticated;
GRANT SELECT ON public.store_registers, public.store_cash_sessions, public.store_cash_movements,
  public.store_cash_session_events, public.store_inventory_confirmations TO authenticated;

CREATE OR REPLACE FUNCTION public.get_store_cash_session_summary(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
    COALESCE(sum(CASE WHEN tipo = 'devolucion' THEN abs(COALESCE(pago_efectivo, 0)) ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN tipo IS DISTINCT FROM 'devolucion' THEN abs(COALESCE(pago_tarjeta, 0)) ELSE -abs(COALESCE(pago_tarjeta, 0)) END), 0),
    COALESCE(sum(CASE WHEN tipo IS DISTINCT FROM 'devolucion' THEN abs(COALESCE(pago_transferencia, 0)) ELSE -abs(COALESCE(pago_transferencia, 0)) END), 0),
    COALESCE(sum(CASE WHEN tipo IS DISTINCT FROM 'devolucion' THEN abs(COALESCE(pago_otro, 0)) ELSE -abs(COALESCE(pago_otro, 0)) END), 0),
    COALESCE(sum(CASE WHEN tipo IS DISTINCT FROM 'devolucion' THEN abs(COALESCE(total_venta, total, 0)) ELSE -abs(COALESCE(total_venta, total, 0)) END), 0),
    count(*)::integer
  INTO v_cash_sales, v_cash_returns, v_card_sales, v_transfer_sales, v_other_sales, v_total_sales, v_sales_count
  FROM public.ventas
  WHERE store_cash_session_id = p_session_id;

  SELECT
    COALESCE(sum(amount) FILTER (WHERE movement_type = 'deposit' AND voided_at IS NULL), 0),
    COALESCE(sum(amount) FILTER (WHERE movement_type = 'withdrawal' AND voided_at IS NULL), 0),
    COALESCE(sum(amount) FILTER (WHERE movement_type = 'expense' AND voided_at IS NULL), 0)
  INTO v_deposits, v_withdrawals, v_expenses
  FROM public.store_cash_movements
  WHERE session_id = p_session_id;

  v_expected := round(v_session.opening_float + v_cash_sales - v_cash_returns + v_deposits - v_withdrawals - v_expenses, 2);

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
    'manual_deposits', round(v_deposits, 2),
    'withdrawals', round(v_withdrawals, 2),
    'expenses', round(v_expenses, 2),
    'expected_cash', v_expected,
    'counted_cash', v_session.counted_cash,
    'variance', CASE WHEN v_session.counted_cash IS NULL THEN NULL ELSE round(v_session.counted_cash - v_expected, 2) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.open_store_cash_session(
  p_location_id uuid,
  p_device_id text,
  p_register_name text,
  p_opening_float numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS public.store_cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_register_id uuid;
  v_existing public.store_cash_sessions%ROWTYPE;
  v_session public.store_cash_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vans WHERE id = p_location_id AND tipo = 'store' AND activo IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'A valid Physical Store location is required';
  END IF;
  IF NOT public.store_cash_can_access_location(p_location_id) THEN RAISE EXCEPTION 'Location access denied'; END IF;
  IF length(btrim(COALESCE(p_device_id, ''))) < 6 THEN RAISE EXCEPTION 'A valid device id is required'; END IF;
  IF COALESCE(p_opening_float, -1) < 0 THEN RAISE EXCEPTION 'Opening float cannot be negative'; END IF;

  INSERT INTO public.store_registers(location_id, device_id, name, created_by)
  VALUES (p_location_id, btrim(p_device_id), COALESCE(NULLIF(btrim(p_register_name), ''), 'Store Register'), auth.uid())
  ON CONFLICT (location_id, device_id) DO UPDATE
    SET name = EXCLUDED.name, active = true, updated_at = now()
  RETURNING id INTO v_register_id;

  SELECT * INTO v_existing
  FROM public.store_cash_sessions
  WHERE register_id = v_register_id AND status = 'open';
  IF FOUND THEN
    IF v_existing.cashier_id = auth.uid() THEN RETURN v_existing; END IF;
    RAISE EXCEPTION 'This register is already open by another cashier';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.store_cash_sessions
    WHERE location_id = p_location_id AND cashier_id = auth.uid() AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'This cashier already has an open shift at another register';
  END IF;

  INSERT INTO public.store_cash_sessions(
    location_id, register_id, cashier_id, device_id, opening_float, opening_notes
  ) VALUES (
    p_location_id, v_register_id, auth.uid(), btrim(p_device_id), round(p_opening_float, 2), NULLIF(btrim(p_notes), '')
  ) RETURNING * INTO v_session;

  INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
  VALUES (v_session.id, p_location_id, 'open', auth.uid(), v_session.opening_notes, to_jsonb(v_session));
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_store_cash_movement(
  p_session_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_reason text
)
RETURNS public.store_cash_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.store_cash_sessions%ROWTYPE;
  v_movement public.store_cash_movements%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.store_cash_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR NOT public.store_cash_can_access_location(v_session.location_id) THEN RAISE EXCEPTION 'Cash session not found or access denied'; END IF;
  IF v_session.status <> 'open' THEN RAISE EXCEPTION 'Cash session is closed'; END IF;
  IF v_session.cashier_id <> auth.uid() AND NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'Only this cashier or a supervisor can add movements'; END IF;
  IF lower(p_movement_type) NOT IN ('deposit', 'withdrawal', 'expense') THEN RAISE EXCEPTION 'Invalid movement type'; END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;

  INSERT INTO public.store_cash_movements(session_id, location_id, movement_type, amount, reason, created_by)
  VALUES (p_session_id, v_session.location_id, lower(p_movement_type), round(p_amount, 2), btrim(p_reason), auth.uid())
  RETURNING * INTO v_movement;
  INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
  VALUES (p_session_id, v_session.location_id, 'movement', auth.uid(), v_movement.reason, to_jsonb(v_movement));
  RETURN v_movement;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_store_cash_movement(p_movement_id uuid, p_reason text)
RETURNS public.store_cash_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement public.store_cash_movements%ROWTYPE;
  v_status text;
BEGIN
  IF NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'Supervisor or administrator required'; END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A void reason is required'; END IF;
  SELECT m.* INTO v_movement
  FROM public.store_cash_movements m
  WHERE m.id = p_movement_id FOR UPDATE;
  IF FOUND THEN
    SELECT status INTO v_status FROM public.store_cash_sessions WHERE id = v_movement.session_id;
  END IF;
  IF NOT FOUND OR NOT public.store_cash_can_access_location(v_movement.location_id) THEN RAISE EXCEPTION 'Movement not found or access denied'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Reopen the cash session before voiding a movement'; END IF;
  IF v_movement.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Movement is already voided'; END IF;
  UPDATE public.store_cash_movements
    SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
    WHERE id = p_movement_id RETURNING * INTO v_movement;
  INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
  VALUES (v_movement.session_id, v_movement.location_id, 'movement_void', auth.uid(), btrim(p_reason), to_jsonb(v_movement));
  RETURN v_movement;
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

CREATE OR REPLACE FUNCTION public.reopen_store_cash_session(p_session_id uuid, p_reason text)
RETURNS public.store_cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.store_cash_sessions%ROWTYPE;
BEGIN
  IF NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'Supervisor or administrator required'; END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'A detailed reopen reason is required'; END IF;
  SELECT * INTO v_session FROM public.store_cash_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR NOT public.store_cash_can_access_location(v_session.location_id) THEN RAISE EXCEPTION 'Cash session not found or access denied'; END IF;
  IF v_session.status <> 'closed' THEN RAISE EXCEPTION 'Only a closed session can be reopened'; END IF;
  IF EXISTS (SELECT 1 FROM public.store_cash_sessions WHERE register_id = v_session.register_id AND status = 'open') THEN
    RAISE EXCEPTION 'This register already has another open session';
  END IF;
  IF EXISTS (SELECT 1 FROM public.store_cash_sessions WHERE location_id = v_session.location_id AND cashier_id = v_session.cashier_id AND status = 'open') THEN
    RAISE EXCEPTION 'This cashier already has another open session';
  END IF;

  INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
  VALUES (p_session_id, v_session.location_id, 'reopen', auth.uid(), btrim(p_reason), to_jsonb(v_session));
  UPDATE public.store_cash_sessions SET
    status = 'open', closed_at = NULL, closed_by = NULL,
    expected_cash = NULL, counted_cash = NULL, variance = NULL, closing_notes = NULL,
    reopened_at = now(), reopened_by = auth.uid(), reopen_reason = btrim(p_reason), updated_at = now()
  WHERE id = p_session_id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_store_sale_to_session(p_sale_id uuid, p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.store_cash_sessions%ROWTYPE;
  v_sale public.ventas%ROWTYPE;
  v_summary jsonb;
BEGIN
  SELECT * INTO v_session FROM public.store_cash_sessions WHERE id = p_session_id;
  SELECT * INTO v_sale FROM public.ventas WHERE id = p_sale_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'A cash session is required'; END IF;
  IF v_sale.id IS NULL OR v_sale.van_id <> v_session.location_id THEN RAISE EXCEPTION 'Sale and cash session locations do not match'; END IF;
  IF NOT public.store_cash_can_access_location(v_session.location_id) THEN RAISE EXCEPTION 'Location access denied'; END IF;
  IF v_session.cashier_id <> auth.uid() AND NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'The cash session belongs to another cashier'; END IF;
  IF v_sale.usuario_id IS DISTINCT FROM auth.uid() AND NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'The sale belongs to another cashier'; END IF;
  IF v_session.status = 'closed' AND NOT (
    COALESCE(v_sale.created_at, v_sale.fecha) >= v_session.opened_at
    AND COALESCE(v_sale.created_at, v_sale.fecha) <= v_session.closed_at
  ) THEN
    RAISE EXCEPTION 'A closed session only accepts an offline sale created during that shift';
  END IF;
  UPDATE public.ventas SET store_cash_session_id = p_session_id WHERE id = p_sale_id;

  -- Offline sales can reach the server just after a cashier closes. Preserve
  -- the original close while recalculating its expected cash and difference.
  IF v_session.status = 'closed' THEN
    v_summary := public.get_store_cash_session_summary(p_session_id);
    UPDATE public.store_cash_sessions SET
      expected_cash = (v_summary->>'expected_cash')::numeric,
      variance = round(counted_cash - (v_summary->>'expected_cash')::numeric, 2),
      cash_sales = (v_summary->>'cash_sales')::numeric,
      cash_returns = (v_summary->>'cash_returns')::numeric,
      manual_deposits = (v_summary->>'manual_deposits')::numeric,
      withdrawals = (v_summary->>'withdrawals')::numeric,
      expenses = (v_summary->>'expenses')::numeric,
      updated_at = now()
    WHERE id = p_session_id RETURNING * INTO v_session;
    INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
    VALUES (p_session_id, v_session.location_id, 'late_sale', auth.uid(), 'Offline sale synchronized after register close',
      jsonb_build_object('sale_id', p_sale_id, 'session', to_jsonb(v_session), 'summary', v_summary));
  END IF;
  RETURN p_sale_id;
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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vans WHERE id = p_location_id AND tipo = 'store' AND activo IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'A valid Physical Store location is required';
  END IF;
  IF NOT public.store_cash_can_access_location(p_location_id) THEN RAISE EXCEPTION 'Location access denied'; END IF;
  IF NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'Supervisor or administrator required to confirm initial inventory'; END IF;
  SELECT count(*)::integer, COALESCE(sum(COALESCE(cantidad, qty, 0)), 0)
  INTO v_items, v_units FROM public.stock_van WHERE van_id = p_location_id;
  IF v_items = 0 THEN RAISE EXCEPTION 'Assign or transfer store inventory before confirming it'; END IF;

  INSERT INTO public.store_inventory_confirmations(location_id, confirmed_by, item_count, unit_count, notes, snapshot)
  VALUES (
    p_location_id, auth.uid(), v_items, round(v_units, 2), NULLIF(btrim(p_notes), ''),
    jsonb_build_object('item_count', v_items, 'unit_count', round(v_units, 2))
  ) RETURNING * INTO v_confirmation;
  RETURN v_confirmation;
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_cash_session_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_store_cash_session(uuid,text,text,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_store_cash_movement(uuid,text,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_store_cash_movement(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_store_cash_session(uuid,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_store_cash_session(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_store_sale_to_session(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_store_inventory(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_cash_session_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_store_cash_session(uuid,text,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_store_cash_movement(uuid,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_store_cash_movement(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_store_cash_session(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_store_cash_session(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_store_sale_to_session(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_store_inventory(uuid,text) TO authenticated;

-- Secured inventory entry points. They delegate to the existing atomic stock
-- RPCs after validating warehouse privilege and assigned-location access.
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
  RETURN QUERY SELECT * FROM public.transferir_stock(
    p_producto_id, p_cantidad, v_origin, p_origen_van_id,
    v_destination, p_destino_van_id, p_motivo, auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_location_stock(
  p_producto_id uuid,
  p_cantidad numeric,
  p_ubicacion text,
  p_van_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS TABLE(producto_id uuid, cantidad numeric, ubicacion text, van_id uuid, delta numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location text := lower(COALESCE(p_ubicacion, ''));
BEGIN
  IF v_location = 'warehouse' THEN v_location := 'almacen'; END IF;
  IF v_location = 'almacen' AND NOT public.store_cash_is_privileged() THEN
    RAISE EXCEPTION 'Supervisor or administrator required for Warehouse adjustments';
  END IF;
  IF v_location = 'van' AND NOT public.store_cash_can_access_location(p_van_id) THEN
    RAISE EXCEPTION 'Location access denied';
  END IF;
  RETURN QUERY SELECT * FROM public.establecer_stock(
    p_producto_id, p_cantidad, v_location, p_van_id, p_motivo, auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_location_stock(uuid,numeric,text,uuid,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_location_stock(uuid,numeric,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_location_stock(uuid,numeric,text,uuid,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_location_stock(uuid,numeric,text,uuid,text) TO authenticated;
