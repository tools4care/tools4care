-- Keep the general Store Closeout and register history current when a report
-- is printed, reprinted, or adjusted by a late synchronized transaction.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'store_cash_closeout_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_cash_closeout_reports;
  END IF;
END;
$$;
