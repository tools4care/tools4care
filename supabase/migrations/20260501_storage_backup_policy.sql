-- Allow authenticated users to read from the backups bucket
-- The bucket is private so we need explicit RLS policies

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- SELECT: authenticated users can list and download backups
create policy "authenticated can read backups"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'backups');

-- INSERT: authenticated users can upload backups manually from the UI
create policy "authenticated can upload backups"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'backups');

-- DELETE: authenticated users can delete backups (for rotation)
create policy "authenticated can delete backups"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'backups');
