-- Cover photo URL for subscription plans
ALTER TABLE subscription_planes
  ADD COLUMN IF NOT EXISTS imagen_url text DEFAULT NULL;

-- Storage bucket for plan cover photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('plan-images', 'plan-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='plan-images public read') THEN
    EXECUTE 'CREATE POLICY "plan-images public read" ON storage.objects FOR SELECT USING (bucket_id = ''plan-images'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='plan-images auth upload') THEN
    EXECUTE 'CREATE POLICY "plan-images auth upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''plan-images'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='plan-images auth delete') THEN
    EXECUTE 'CREATE POLICY "plan-images auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''plan-images'')';
  END IF;
END $$;
