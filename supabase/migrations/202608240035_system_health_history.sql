-- Persist operational health checks for weekly/monthly availability reports.
create table if not exists public.system_health_checks (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  worst_status text not null check (worst_status in ('ok', 'warn', 'error', 'checking')),
  counts jsonb not null default '{}'::jsonb,
  average_response_ms numeric,
  services jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists system_health_checks_checked_at_idx
  on public.system_health_checks (checked_at desc);

alter table public.system_health_checks enable row level security;

create or replace function public.is_health_operator()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and u.activo = true
      and lower(coalesce(u.rol, '')) in ('admin', 'supervisor')
  );
$$;

revoke all on function public.is_health_operator() from public;
grant execute on function public.is_health_operator() to authenticated;

drop policy if exists "health checks operators read" on public.system_health_checks;
create policy "health checks operators read"
  on public.system_health_checks for select to authenticated
  using (public.is_health_operator());

drop policy if exists "health checks operators insert" on public.system_health_checks;
create policy "health checks operators insert"
  on public.system_health_checks for insert to authenticated
  with check (public.is_health_operator() and created_by = (select auth.uid()));

grant select, insert on public.system_health_checks to authenticated;
