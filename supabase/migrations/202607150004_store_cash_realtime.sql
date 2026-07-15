-- The summary is called after writes during late offline synchronization, so
-- it must use a fresh command snapshot rather than STABLE read semantics.
ALTER FUNCTION public.get_store_cash_session_summary(uuid) VOLATILE;

-- Keep register screens current across cashier computers when Realtime is
-- available. The guards make this safe to re-run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'store_cash_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.store_cash_sessions;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'store_cash_movements'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.store_cash_movements;
    END IF;
  END IF;
END;
$$;
