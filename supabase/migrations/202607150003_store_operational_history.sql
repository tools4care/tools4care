-- Read-only operational history with human-readable cashier and inventory names.

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
        'reopened_by_name', COALESCE(reopener.nombre, reopener.email)
      ) AS entry,
      s.opened_at
    FROM public.store_cash_sessions s
    JOIN public.store_registers r ON r.id = s.register_id
    LEFT JOIN public.usuarios cashier ON cashier.id = s.cashier_id
    LEFT JOIN public.usuarios closer ON closer.id = s.closed_by
    LEFT JOIN public.usuarios reopener ON reopener.id = s.reopened_by
    WHERE s.location_id = p_location_id
    ORDER BY s.opened_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200)
  ) history;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_inventory_activity(
  p_location_id uuid,
  p_limit integer DEFAULT 20
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
  SELECT COALESCE(jsonb_agg(entry ORDER BY movement_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      to_jsonb(m)
      || jsonb_build_object(
        'product_name', COALESCE(p.nombre, m.producto_id::text),
        'product_code', p.codigo,
        'user_name', COALESCE(u.nombre, u.email, 'System')
      ) AS entry,
      m.fecha AS movement_at
    FROM public.movimientos_stock m
    LEFT JOIN public.productos p ON p.id = m.producto_id
    LEFT JOIN public.usuarios u ON u.id = m.usuario_id
    WHERE m.van_id = p_location_id
    ORDER BY m.fecha DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  ) activity;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_cash_session_history(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_store_inventory_activity(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_cash_session_history(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_inventory_activity(uuid,integer) TO authenticated;
