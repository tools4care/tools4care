ALTER TABLE gastos_conductor
  ADD COLUMN IF NOT EXISTS factura_url text DEFAULT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='expense receipts public read') THEN
    EXECUTE 'CREATE POLICY "expense receipts public read" ON storage.objects FOR SELECT USING (bucket_id = ''expense-receipts'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='expense receipts auth upload') THEN
    EXECUTE 'CREATE POLICY "expense receipts auth upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''expense-receipts'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='expense receipts auth update') THEN
    EXECUTE 'CREATE POLICY "expense receipts auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''expense-receipts'') WITH CHECK (bucket_id = ''expense-receipts'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='expense receipts auth delete') THEN
    EXECUTE 'CREATE POLICY "expense receipts auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''expense-receipts'')';
  END IF;
END $$;
