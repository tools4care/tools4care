-- Relax "one active session per user" to "up to 2 at a time" — the common
-- real workflow is one person scanning from a phone while completing the
-- sale / showing the customer on a laptop. A 3rd concurrent login still
-- evicts the oldest session, so account-sharing beyond a pair is still
-- blocked.

ALTER TABLE public.user_active_sessions DROP CONSTRAINT IF EXISTS user_active_sessions_pkey;
ALTER TABLE public.user_active_sessions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.user_active_sessions SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.user_active_sessions ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.user_active_sessions ADD PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS user_active_sessions_user_id_created_at_idx
  ON public.user_active_sessions (user_id, created_at DESC);

-- Writes now go exclusively through claim_user_session_slot() below (it runs
-- SECURITY DEFINER so it isn't bound by RLS); regular users only need read
-- access to their own rows to check whether their session is still alive.
DROP POLICY IF EXISTS "Users manage their own active session" ON public.user_active_sessions;
DROP POLICY IF EXISTS "Users can view their own active sessions" ON public.user_active_sessions;
CREATE POLICY "Users can view their own active sessions" ON public.user_active_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.claim_user_session_slot(
  p_session_id uuid,
  p_device_label text DEFAULT NULL,
  p_max_sessions int DEFAULT 2
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.user_active_sessions (user_id, session_id, device_label, created_at, last_seen_at)
  VALUES (v_actor, p_session_id, p_device_label, now(), now());

  DELETE FROM public.user_active_sessions
  WHERE user_id = v_actor
    AND id NOT IN (
      SELECT id FROM public.user_active_sessions
      WHERE user_id = v_actor
      ORDER BY created_at DESC
      LIMIT GREATEST(p_max_sessions, 1)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_user_session_slot(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_user_session_slot(uuid, text, int) TO authenticated;
