-- Separate public reads from authenticated admin writes so SELECT requests
-- evaluate one policy while preserving the existing effective permissions.

drop policy if exists "Anyone can read business info"
  on public.business_info;
drop policy if exists "Admins can write business info"
  on public.business_info;

create policy "business_info_public_read"
  on public.business_info
  for select
  to anon, authenticated
  using (true);

create policy "business_info_admin_insert"
  on public.business_info
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.usuarios u
      where u.id = (select auth.uid())
        and u.rol = 'admin'
    )
  );

create policy "business_info_admin_update"
  on public.business_info
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios u
      where u.id = (select auth.uid())
        and u.rol = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.usuarios u
      where u.id = (select auth.uid())
        and u.rol = 'admin'
    )
  );

create policy "business_info_admin_delete"
  on public.business_info
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios u
      where u.id = (select auth.uid())
        and u.rol = 'admin'
    )
  );
