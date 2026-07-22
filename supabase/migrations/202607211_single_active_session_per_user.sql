-- One active session per user account. Logging in on a new device claims a
-- fresh session_id for that user, overwriting whatever was there before —
-- any other device polling this row will see it no longer matches its local
-- copy and sign itself out. This stops the same account from staying logged
-- in in two places at once.

CREATE TABLE IF NOT EXISTS public.user_active_sessions (
  user_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own active session" ON public.user_active_sessions;
CREATE POLICY "Users manage their own active session" ON public.user_active_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
