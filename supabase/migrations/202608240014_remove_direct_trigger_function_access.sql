-- Trigger functions are invoked by PostgreSQL through their registered
-- triggers. They must not be exposed as callable PostgREST RPC endpoints.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      fn.signature
    );
  end loop;
end;
$$;
