-- Use a deterministic function lookup path. Keeping public and extensions
-- preserves legacy unqualified references while pg_catalog remains first.

do $$
declare
  fn record;
begin
  for fn in
    select
      p.oid::regprocedure as signature,
      case when p.prokind = 'p' then 'procedure' else 'function' end as routine_kind
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from pg_depend dependency
        where dependency.classid = 'pg_proc'::regclass
          and dependency.objid = p.oid
          and dependency.deptype = 'e'
      )
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
  loop
    execute format(
      'alter %s %s set search_path = pg_catalog, public, extensions',
      fn.routine_kind,
      fn.signature
    );
  end loop;
end;
$$;
