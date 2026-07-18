-- Fix closeout report generation for the actual vans schema.
-- The location display column is vans.nombre_van, not vans.nombre.

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
      COALESCE(v.nombre_van, 'Physical Store') AS location_name,
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

REVOKE ALL ON FUNCTION public.get_store_cash_closeout_report(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_cash_closeout_report(uuid,integer) TO authenticated;
