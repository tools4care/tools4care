-- Prevent is_admin() from being inlined back into usuarios RLS policies.

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select coalesce(u.rol = 'admin' and u.activo = true, false)
    into v_is_admin
  from public.usuarios u
  where u.id = auth.uid();

  return coalesce(v_is_admin, false);
end;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
