-- Allow authenticated users to read from the backups bucket
-- The bucket is private so we need explicit RLS policies

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='authenticated can read backups') THEN
    EXECUTE 'create policy "authenticated can read backups" on storage.objects for select to authenticated using (bucket_id = ''backups'')'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='authenticated can upload backups') THEN
    EXECUTE 'create policy "authenticated can upload backups" on storage.objects for insert to authenticated with check (bucket_id = ''backups'')'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='authenticated can delete backups') THEN
    EXECUTE 'create policy "authenticated can delete backups" on storage.objects for delete to authenticated using (bucket_id = ''backups'')'; END IF;
END $$;
