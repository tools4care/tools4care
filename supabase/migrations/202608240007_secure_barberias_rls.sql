-- Protect the canonical barbershop directory from unauthenticated access.
-- Staff use this table from authenticated application sessions. Database
-- triggers and trusted backend jobs continue to work as owner/service_role.

alter table public.barberias enable row level security;

revoke all privileges on table public.barberias from anon;

drop policy if exists barberias_authenticated_access on public.barberias;
create policy barberias_authenticated_access
  on public.barberias
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.barberias to authenticated;

comment on policy barberias_authenticated_access on public.barberias is
  'Staff-only access. Anonymous users cannot read or mutate the barbershop directory.';
