-- Immutable, printable Physical Store closeouts per register/cashier shift.
-- The cash session remains the operational record; every close version gets
-- a frozen report plus the cashier's external reconciliation declarations.

CREATE TABLE IF NOT EXISTS public.store_cash_closeout_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.store_cash_sessions(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.vans(id) ON DELETE RESTRICT,
  register_id uuid NOT NULL REFERENCES public.store_registers(id) ON DELETE RESTRICT,
  cashier_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  closed_by uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  close_version integer NOT NULL CHECK (close_version > 0),
  report_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'final' CHECK (status IN ('final', 'adjusted', 'reopened')),
  opened_at timestamptz NOT NULL,
  closed_at timestamptz NOT NULL,
  system_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  declared_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  variances jsonb NOT NULL DEFAULT '{}'::jsonb,
  card_batch_reference text,
  notes text,
  print_status text NOT NULL DEFAULT 'pending' CHECK (print_status IN ('pending', 'printed')),
  print_count integer NOT NULL DEFAULT 0 CHECK (print_count >= 0),
  last_printed_at timestamptz,
  last_printed_by uuid REFERENCES public.usuarios(id),
  adjustment_count integer NOT NULL DEFAULT 0 CHECK (adjustment_count >= 0),
  last_adjusted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, close_version)
);

CREATE INDEX IF NOT EXISTS store_cash_closeout_reports_location_closed_idx
  ON public.store_cash_closeout_reports(location_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS store_cash_closeout_reports_session_idx
  ON public.store_cash_closeout_reports(session_id, close_version DESC);

ALTER TABLE public.store_cash_closeout_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_cash_closeout_reports_read_accessible ON public.store_cash_closeout_reports;
CREATE POLICY store_cash_closeout_reports_read_accessible ON public.store_cash_closeout_reports
  FOR SELECT TO authenticated
  USING (public.store_cash_can_access_location(location_id));

REVOKE INSERT, UPDATE, DELETE ON public.store_cash_closeout_reports FROM authenticated;
GRANT SELECT ON public.store_cash_closeout_reports TO authenticated;

ALTER TABLE public.store_cash_session_events
  DROP CONSTRAINT IF EXISTS store_cash_session_events_event_type_check;
ALTER TABLE public.store_cash_session_events
  ADD CONSTRAINT store_cash_session_events_event_type_check
  CHECK (event_type IN (
    'open', 'close', 'reopen', 'movement', 'movement_void',
    'late_sale', 'payment', 'late_payment', 'report_print'
  ));

CREATE OR REPLACE FUNCTION public.get_store_cash_closeout_preview(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary jsonb;
  v_gross_sales numeric := 0;
  v_refund_total numeric := 0;
  v_sale_count integer := 0;
  v_return_count integer := 0;
  v_tax_sales numeric := 0;
  v_tax_refunds numeric := 0;
  v_subtotal_sales numeric := 0;
  v_subtotal_refunds numeric := 0;
  v_discounts numeric := 0;
  v_cash_gross numeric := 0;
  v_cash_refunds numeric := 0;
  v_card_gross numeric := 0;
  v_card_refunds numeric := 0;
  v_transfer_gross numeric := 0;
  v_transfer_refunds numeric := 0;
  v_other_gross numeric := 0;
  v_other_refunds numeric := 0;
  v_system_cash numeric := 0;
  v_system_card numeric := 0;
  v_system_transfer numeric := 0;
  v_system_other numeric := 0;
BEGIN
  v_summary := public.get_store_cash_session_summary(p_session_id);

  SELECT
    COALESCE(sum(abs(COALESCE(total_venta, total, 0))) FILTER (WHERE tipo IS DISTINCT FROM 'devolucion'), 0),
    COALESCE(sum(abs(COALESCE(total_venta, total, 0))) FILTER (WHERE tipo = 'devolucion'), 0),
    count(*) FILTER (WHERE tipo IS DISTINCT FROM 'devolucion')::integer,
    count(*) FILTER (WHERE tipo = 'devolucion')::integer,
    COALESCE(sum(GREATEST(0, COALESCE(NULLIF(pago->>'tax_amount', '')::numeric, 0))) FILTER (WHERE tipo IS DISTINCT FROM 'devolucion'), 0),
    COALESCE(sum(GREATEST(0, COALESCE(NULLIF(pago->>'tax_amount', '')::numeric, 0))) FILTER (WHERE tipo = 'devolucion'), 0),
    COALESCE(sum(GREATEST(0, COALESCE(NULLIF(pago->>'subtotal', '')::numeric, 0))) FILTER (WHERE tipo IS DISTINCT FROM 'devolucion'), 0),
    COALESCE(sum(GREATEST(0, COALESCE(NULLIF(pago->>'subtotal', '')::numeric, 0))) FILTER (WHERE tipo = 'devolucion'), 0),
    COALESCE(sum(abs(COALESCE(pago_efectivo, 0))) FILTER (WHERE tipo IS DISTINCT FROM 'devolucion'), 0),
    COALESCE(sum(abs(COALESCE(pago_efectivo, 0))) FILTER (WHERE tipo = 'devolucion'), 0),
    COALESCE(sum(abs(COALESCE(pago_tarjeta, 0))) FILTER (WHERE tipo IS DISTINCT FROM 'devolucion'), 0),
    COALESCE(sum(abs(COALESCE(pago_tarjeta, 0))) FILTER (WHERE tipo = 'devolucion'), 0),
    COALESCE(sum(abs(COALESCE(pago_transferencia, 0))) FILTER (WHERE tipo IS DISTINCT FROM 'devolucion'), 0),
    COALESCE(sum(abs(COALESCE(pago_transferencia, 0))) FILTER (WHERE tipo = 'devolucion'), 0),
    COALESCE(sum(abs(COALESCE(pago_otro, 0))) FILTER (WHERE tipo IS DISTINCT FROM 'devolucion'), 0),
    COALESCE(sum(abs(COALESCE(pago_otro, 0))) FILTER (WHERE tipo = 'devolucion'), 0)
  INTO
    v_gross_sales, v_refund_total, v_sale_count, v_return_count,
    v_tax_sales, v_tax_refunds, v_subtotal_sales, v_subtotal_refunds,
    v_cash_gross, v_cash_refunds, v_card_gross, v_card_refunds,
    v_transfer_gross, v_transfer_refunds, v_other_gross, v_other_refunds
  FROM public.ventas
  WHERE store_cash_session_id = p_session_id;

  SELECT COALESCE(sum(GREATEST(0,
    (abs(COALESCE(d.cantidad, 0)) * abs(COALESCE(d.precio_unitario, 0)))
    - abs(COALESCE(d.subtotal, 0))
  )), 0)
  INTO v_discounts
  FROM public.detalle_ventas d
  JOIN public.ventas v ON v.id = d.venta_id
  WHERE v.store_cash_session_id = p_session_id
    AND v.tipo IS DISTINCT FROM 'devolucion';

  v_system_cash := round(v_cash_gross - v_cash_refunds + COALESCE((v_summary->>'ar_cash_collections')::numeric, 0), 2);
  v_system_card := round(v_card_gross - v_card_refunds + COALESCE((v_summary->>'ar_card_collections')::numeric, 0), 2);
  v_system_transfer := round(v_transfer_gross - v_transfer_refunds + COALESCE((v_summary->>'ar_transfer_collections')::numeric, 0), 2);
  v_system_other := round(v_other_gross - v_other_refunds + COALESCE((v_summary->>'ar_other_collections')::numeric, 0), 2);

  RETURN v_summary || jsonb_build_object(
    'gross_sales', round(v_gross_sales, 2),
    'refund_total', round(v_refund_total, 2),
    'net_sales', round(v_gross_sales - v_refund_total, 2),
    'completed_sales_count', v_sale_count,
    'return_count', v_return_count,
    'tax_sales', round(v_tax_sales, 2),
    'tax_refunds', round(v_tax_refunds, 2),
    'tax_net', round(v_tax_sales - v_tax_refunds, 2),
    'subtotal_sales', round(v_subtotal_sales, 2),
    'subtotal_refunds', round(v_subtotal_refunds, 2),
    'discounts', round(v_discounts, 2),
    'payment_breakdown', jsonb_build_object(
      'cash', jsonb_build_object('gross', round(v_cash_gross, 2), 'refunds', round(v_cash_refunds, 2), 'ar', COALESCE((v_summary->>'ar_cash_collections')::numeric, 0), 'net', v_system_cash),
      'card', jsonb_build_object('gross', round(v_card_gross, 2), 'refunds', round(v_card_refunds, 2), 'ar', COALESCE((v_summary->>'ar_card_collections')::numeric, 0), 'net', v_system_card),
      'transfer', jsonb_build_object('gross', round(v_transfer_gross, 2), 'refunds', round(v_transfer_refunds, 2), 'ar', COALESCE((v_summary->>'ar_transfer_collections')::numeric, 0), 'net', v_system_transfer),
      'other', jsonb_build_object('gross', round(v_other_gross, 2), 'refunds', round(v_other_refunds, 2), 'ar', COALESCE((v_summary->>'ar_other_collections')::numeric, 0), 'net', v_system_other)
    ),
    'system_payments', jsonb_build_object(
      'cash', v_system_cash,
      'card', v_system_card,
      'transfer', v_system_transfer,
      'other', v_system_other,
      'total', round(v_system_cash + v_system_card + v_system_transfer + v_system_other, 2)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_cash_closeout_report(
  p_session_id uuid,
  p_close_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_location_id uuid;
BEGIN
  SELECT r.location_id INTO v_location_id
  FROM public.store_cash_closeout_reports r
  WHERE r.session_id = p_session_id
    AND (p_close_version IS NULL OR r.close_version = p_close_version)
  ORDER BY r.close_version DESC
  LIMIT 1;

  IF v_location_id IS NULL OR NOT public.store_cash_can_access_location(v_location_id) THEN
    RAISE EXCEPTION 'Closeout report not found or access denied';
  END IF;

  SELECT to_jsonb(report) INTO v_result
  FROM (
    SELECT
      r.*,
      COALESCE(v.nombre, 'Physical Store') AS location_name,
      COALESCE(reg.name, 'Store Register') AS register_name,
      COALESCE(cashier.nombre, cashier.email, r.cashier_id::text) AS cashier_name,
      COALESCE(closer.nombre, closer.email, r.closed_by::text) AS closed_by_name,
      COALESCE(printer.nombre, printer.email) AS last_printed_by_name
    FROM public.store_cash_closeout_reports r
    JOIN public.vans v ON v.id = r.location_id
    JOIN public.store_registers reg ON reg.id = r.register_id
    LEFT JOIN public.usuarios cashier ON cashier.id = r.cashier_id
    LEFT JOIN public.usuarios closer ON closer.id = r.closed_by
    LEFT JOIN public.usuarios printer ON printer.id = r.last_printed_by
    WHERE r.session_id = p_session_id
      AND (p_close_version IS NULL OR r.close_version = p_close_version)
    ORDER BY r.close_version DESC
    LIMIT 1
  ) report;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_store_cash_session_v2(
  p_session_id uuid,
  p_reconciliation jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.store_cash_sessions%ROWTYPE;
  v_preview jsonb;
  v_report public.store_cash_closeout_reports%ROWTYPE;
  v_cash numeric;
  v_card numeric;
  v_transfer numeric;
  v_other numeric;
  v_system_card numeric;
  v_system_transfer numeric;
  v_system_other numeric;
  v_variances jsonb;
  v_close_version integer;
  v_report_number text;
  v_has_variance boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_reconciliation) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Reconciliation totals are required'; END IF;
  IF NOT (p_reconciliation ? 'cash_counted' AND p_reconciliation ? 'card_declared'
    AND p_reconciliation ? 'transfer_declared' AND p_reconciliation ? 'other_declared') THEN
    RAISE EXCEPTION 'Cash, card, transfer and other totals must be reviewed';
  END IF;

  v_cash := round((p_reconciliation->>'cash_counted')::numeric, 2);
  v_card := round((p_reconciliation->>'card_declared')::numeric, 2);
  v_transfer := round((p_reconciliation->>'transfer_declared')::numeric, 2);
  v_other := round((p_reconciliation->>'other_declared')::numeric, 2);
  IF v_cash < 0 THEN RAISE EXCEPTION 'Counted cash cannot be negative'; END IF;

  SELECT * INTO v_session FROM public.store_cash_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR NOT public.store_cash_can_access_location(v_session.location_id) THEN RAISE EXCEPTION 'Cash session not found or access denied'; END IF;
  IF v_session.status <> 'open' THEN RAISE EXCEPTION 'Cash session is already closed'; END IF;
  IF v_session.cashier_id <> auth.uid() AND NOT public.store_cash_is_privileged() THEN RAISE EXCEPTION 'Only this cashier or a supervisor can close the session'; END IF;

  v_preview := public.get_store_cash_closeout_preview(p_session_id);
  v_system_card := COALESCE((v_preview#>>'{system_payments,card}')::numeric, 0);
  v_system_transfer := COALESCE((v_preview#>>'{system_payments,transfer}')::numeric, 0);
  v_system_other := COALESCE((v_preview#>>'{system_payments,other}')::numeric, 0);
  v_variances := jsonb_build_object(
    'cash', round(v_cash - COALESCE((v_preview->>'expected_cash')::numeric, 0), 2),
    'card', round(v_card - v_system_card, 2),
    'transfer', round(v_transfer - v_system_transfer, 2),
    'other', round(v_other - v_system_other, 2)
  );
  v_has_variance := abs((v_variances->>'cash')::numeric) > 0.009
    OR abs((v_variances->>'card')::numeric) > 0.009
    OR abs((v_variances->>'transfer')::numeric) > 0.009
    OR abs((v_variances->>'other')::numeric) > 0.009;
  IF v_has_variance AND length(btrim(COALESCE(p_notes, ''))) < 5 THEN
    RAISE EXCEPTION 'Explain every closeout difference with a clear note';
  END IF;

  v_close_version := v_session.close_version + 1;
  v_report_number := 'STORE-' || to_char(current_date, 'YYYYMMDD') || '-'
    || upper(left(replace(v_session.id::text, '-', ''), 8)) || '-V' || v_close_version::text;

  UPDATE public.store_cash_sessions SET
    status = 'closed', closed_at = now(), closed_by = auth.uid(),
    expected_cash = (v_preview->>'expected_cash')::numeric,
    counted_cash = v_cash,
    variance = (v_variances->>'cash')::numeric,
    cash_sales = (v_preview->>'cash_sales')::numeric,
    cash_returns = (v_preview->>'cash_returns')::numeric,
    ar_cash_collections = (v_preview->>'ar_cash_collections')::numeric,
    ar_card_collections = (v_preview->>'ar_card_collections')::numeric,
    ar_transfer_collections = (v_preview->>'ar_transfer_collections')::numeric,
    ar_other_collections = (v_preview->>'ar_other_collections')::numeric,
    manual_deposits = (v_preview->>'manual_deposits')::numeric,
    withdrawals = (v_preview->>'withdrawals')::numeric,
    expenses = (v_preview->>'expenses')::numeric,
    closing_notes = NULLIF(btrim(p_notes), ''), close_version = v_close_version, updated_at = now()
  WHERE id = p_session_id RETURNING * INTO v_session;

  INSERT INTO public.store_cash_closeout_reports(
    session_id, location_id, register_id, cashier_id, closed_by,
    close_version, report_number, opened_at, closed_at, system_summary,
    declared_totals, variances, card_batch_reference, notes
  ) VALUES (
    v_session.id, v_session.location_id, v_session.register_id, v_session.cashier_id, auth.uid(),
    v_close_version, v_report_number, v_session.opened_at, v_session.closed_at, v_preview,
    jsonb_build_object('cash', v_cash, 'card', v_card, 'transfer', v_transfer, 'other', v_other),
    v_variances, NULLIF(btrim(COALESCE(p_reconciliation->>'card_batch_reference', '')), ''),
    NULLIF(btrim(p_notes), '')
  ) RETURNING * INTO v_report;

  INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
  VALUES (p_session_id, v_session.location_id, 'close', auth.uid(), v_session.closing_notes,
    jsonb_build_object('session', to_jsonb(v_session), 'report', to_jsonb(v_report)));

  RETURN public.get_store_cash_closeout_report(p_session_id, v_close_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_store_cash_closeout_printed(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.store_cash_closeout_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_report FROM public.store_cash_closeout_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND OR NOT public.store_cash_can_access_location(v_report.location_id) THEN
    RAISE EXCEPTION 'Closeout report not found or access denied';
  END IF;
  UPDATE public.store_cash_closeout_reports SET
    print_status = 'printed', print_count = print_count + 1,
    last_printed_at = now(), last_printed_by = auth.uid(), updated_at = now()
  WHERE id = p_report_id RETURNING * INTO v_report;
  INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
  VALUES (v_report.session_id, v_report.location_id, 'report_print', auth.uid(),
    CASE WHEN v_report.print_count > 1 THEN 'Closeout report reprint' ELSE 'Closeout report print' END,
    jsonb_build_object('report_id', v_report.id, 'report_number', v_report.report_number, 'print_count', v_report.print_count));
  RETURN public.get_store_cash_closeout_report(v_report.session_id, v_report.close_version);
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
  IF EXISTS (SELECT 1 FROM public.store_cash_sessions WHERE register_id = v_session.register_id AND status = 'open') THEN RAISE EXCEPTION 'This register already has another open session'; END IF;
  IF EXISTS (SELECT 1 FROM public.store_cash_sessions WHERE location_id = v_session.location_id AND cashier_id = v_session.cashier_id AND status = 'open') THEN RAISE EXCEPTION 'This cashier already has another open session'; END IF;

  INSERT INTO public.store_cash_session_events(session_id, location_id, event_type, actor_id, reason, snapshot)
  VALUES (p_session_id, v_session.location_id, 'reopen', auth.uid(), btrim(p_reason), to_jsonb(v_session));
  UPDATE public.store_cash_closeout_reports SET status = 'reopened', updated_at = now()
  WHERE session_id = p_session_id AND close_version = v_session.close_version;
  UPDATE public.store_cash_sessions SET
    status = 'open', closed_at = NULL, closed_by = NULL,
    expected_cash = NULL, counted_cash = NULL, variance = NULL, closing_notes = NULL,
    reopened_at = now(), reopened_by = auth.uid(), reopen_reason = btrim(p_reason), updated_at = now()
  WHERE id = p_session_id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_store_closeout_after_late_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.store_cash_sessions%ROWTYPE;
  v_preview jsonb;
  v_declared jsonb;
BEGIN
  IF NEW.event_type NOT IN ('late_sale', 'late_payment') THEN RETURN NEW; END IF;
  SELECT * INTO v_session FROM public.store_cash_sessions WHERE id = NEW.session_id;
  IF v_session.status <> 'closed' THEN RETURN NEW; END IF;
  SELECT declared_totals INTO v_declared
  FROM public.store_cash_closeout_reports
  WHERE session_id = NEW.session_id AND close_version = v_session.close_version;
  IF v_declared IS NULL THEN RETURN NEW; END IF;
  v_preview := public.get_store_cash_closeout_preview(NEW.session_id);
  UPDATE public.store_cash_closeout_reports SET
    status = 'adjusted', system_summary = v_preview,
    variances = jsonb_build_object(
      'cash', round((v_declared->>'cash')::numeric - (v_preview->>'expected_cash')::numeric, 2),
      'card', round((v_declared->>'card')::numeric - (v_preview#>>'{system_payments,card}')::numeric, 2),
      'transfer', round((v_declared->>'transfer')::numeric - (v_preview#>>'{system_payments,transfer}')::numeric, 2),
      'other', round((v_declared->>'other')::numeric - (v_preview#>>'{system_payments,other}')::numeric, 2)
    ),
    print_status = 'pending', adjustment_count = adjustment_count + 1,
    last_adjusted_at = now(), updated_at = now()
  WHERE session_id = NEW.session_id AND close_version = v_session.close_version;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_closeout_refresh_after_late_event ON public.store_cash_session_events;
CREATE TRIGGER store_closeout_refresh_after_late_event
AFTER INSERT ON public.store_cash_session_events
FOR EACH ROW EXECUTE FUNCTION public.refresh_store_closeout_after_late_event();

CREATE OR REPLACE FUNCTION public.get_store_cash_session_history(
  p_location_id uuid,
  p_limit integer DEFAULT 60
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
  SELECT COALESCE(jsonb_agg(entry ORDER BY opened_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      to_jsonb(s)
      || jsonb_build_object(
        'register_name', r.name,
        'cashier_name', COALESCE(cashier.nombre, cashier.email, s.cashier_id::text),
        'closed_by_name', COALESCE(closer.nombre, closer.email),
        'reopened_by_name', COALESCE(reopener.nombre, reopener.email),
        'closeout_report_id', report.id,
        'closeout_report_number', report.report_number,
        'closeout_report_status', report.status,
        'closeout_print_status', report.print_status,
        'closeout_print_count', report.print_count
      ) AS entry,
      s.opened_at
    FROM public.store_cash_sessions s
    JOIN public.store_registers r ON r.id = s.register_id
    LEFT JOIN public.usuarios cashier ON cashier.id = s.cashier_id
    LEFT JOIN public.usuarios closer ON closer.id = s.closed_by
    LEFT JOIN public.usuarios reopener ON reopener.id = s.reopened_by
    LEFT JOIN LATERAL (
      SELECT cr.id, cr.report_number, cr.status, cr.print_status, cr.print_count
      FROM public.store_cash_closeout_reports cr
      WHERE cr.session_id = s.id
      ORDER BY cr.close_version DESC
      LIMIT 1
    ) report ON true
    WHERE s.location_id = p_location_id
    ORDER BY s.opened_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200)
  ) history;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_cash_closeout_preview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_store_cash_closeout_report(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_store_cash_session_v2(uuid,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_store_cash_closeout_printed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_cash_closeout_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_cash_closeout_report(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_store_cash_session_v2(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_store_cash_closeout_printed(uuid) TO authenticated;
