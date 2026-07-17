-- Securely move an unfinished Physical Store shift to the cashier's current
-- computer. The shift, opening float, sales and movements remain unchanged.

ALTER TABLE public.store_cash_session_events
  DROP CONSTRAINT IF EXISTS store_cash_session_events_event_type_check;
ALTER TABLE public.store_cash_session_events
  ADD CONSTRAINT store_cash_session_events_event_type_check
  CHECK (event_type IN (
    'open', 'close', 'reopen', 'resume', 'movement', 'movement_void',
    'late_sale', 'payment', 'late_payment', 'report_print'
  ));

CREATE OR REPLACE FUNCTION public.resume_store_cash_session(
  p_session_id uuid,
  p_new_device_id text,
  p_register_name text DEFAULT NULL
)
RETURNS public.store_cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_issued_at bigint;
  v_session public.store_cash_sessions%ROWTYPE;
  v_resumed public.store_cash_sessions%ROWTYPE;
  v_register_id uuid;
  v_previous_device_id text;
  v_previous_register_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_issued_at := NULLIF(auth.jwt() ->> 'iat', '')::bigint;
  IF v_issued_at IS NULL
     OR extract(epoch FROM now()) - v_issued_at > 300 THEN
    RAISE EXCEPTION 'Verify your password again before resuming this shift';
  END IF;

  IF length(btrim(COALESCE(p_new_device_id, ''))) < 6 THEN
    RAISE EXCEPTION 'A valid device id is required';
  END IF;

  SELECT *
  INTO v_session
  FROM public.store_cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'open' THEN
    RAISE EXCEPTION 'The open shift could not be found';
  END IF;
  IF v_session.cashier_id <> v_actor THEN
    RAISE EXCEPTION 'Only the assigned cashier can resume this shift';
  END IF;
  IF NOT public.store_cash_can_access_location(v_session.location_id) THEN
    RAISE EXCEPTION 'Location access denied';
  END IF;

  IF v_session.device_id = btrim(p_new_device_id) THEN
    RETURN v_session;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.store_cash_sessions
    WHERE location_id = v_session.location_id
      AND device_id = btrim(p_new_device_id)
      AND status = 'open'
      AND id <> v_session.id
  ) THEN
    RAISE EXCEPTION 'This computer already has another open shift';
  END IF;

  INSERT INTO public.store_registers(location_id, device_id, name, created_by)
  VALUES (
    v_session.location_id,
    btrim(p_new_device_id),
    COALESCE(NULLIF(btrim(p_register_name), ''), 'Main Register'),
    v_actor
  )
  ON CONFLICT (location_id, device_id) DO UPDATE
    SET name = EXCLUDED.name, active = true, updated_at = now()
  RETURNING id INTO v_register_id;

  IF EXISTS (
    SELECT 1
    FROM public.store_cash_sessions
    WHERE register_id = v_register_id
      AND status = 'open'
      AND id <> v_session.id
  ) THEN
    RAISE EXCEPTION 'The destination register already has an open shift';
  END IF;

  v_previous_device_id := v_session.device_id;
  v_previous_register_id := v_session.register_id;

  UPDATE public.store_cash_sessions
  SET register_id = v_register_id,
      device_id = btrim(p_new_device_id),
      updated_at = now()
  WHERE id = v_session.id
  RETURNING * INTO v_resumed;

  INSERT INTO public.store_cash_session_events(
    session_id, location_id, event_type, actor_id, reason, snapshot
  )
  VALUES (
    v_resumed.id,
    v_resumed.location_id,
    'resume',
    v_actor,
    'Shift resumed on another computer',
    jsonb_build_object(
      'previous_device_id', v_previous_device_id,
      'new_device_id', v_resumed.device_id,
      'previous_register_id', v_previous_register_id,
      'new_register_id', v_resumed.register_id,
      'resumed_at', now(),
      'session', to_jsonb(v_resumed)
    )
  );

  RETURN v_resumed;
END;
$$;

REVOKE ALL ON FUNCTION public.resume_store_cash_session(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resume_store_cash_session(uuid,text,text) TO authenticated;
