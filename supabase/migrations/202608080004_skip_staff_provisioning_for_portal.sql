-- Keep customer portal identities separate from staff identities.
-- Existing staff signup flows remain unchanged unless they explicitly carry
-- the portal_customer marker set by PortalLogin.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'portal_customer' then
    return new;
  end if;

  insert into public.usuarios (id, email, nombre, rol, activo, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'vendedor',
    true,
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

commit;
