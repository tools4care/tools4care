-- Persists whether a barberias row actually reads like a business, instead
-- of recomputing a name-keyword guess on every report load. A production
-- audit (see 202608021_reduce_barberia_false_positives.sql) found ~78% of
-- barberia rows hold a client's personal name in the "negocio" field from
-- before its purpose was clarified — those aren't real route destinations
-- and shouldn't count toward visit cadence, pace, or growth-opportunity
-- reporting.
--
-- Backfilled once here for the 796 existing rows using the same keyword
-- heuristic fn_auto_link_barberia already uses for new ones (v_looks_like_shop),
-- then kept current automatically by that trigger for every future client
-- save — no manual review queue, no extra UI. If a specific shop is ever
-- misclassified, correct it directly:
--   update barberias set es_negocio = true where id = '...';

alter table barberias
  add column if not exists es_negocio boolean not null default true;

update barberias
set es_negocio = (nombre ~* '(barber|barbershop|salon|cuts?|fade|shop|studio|kutz|kuts|klipper|clipper|lounge|palace|kingz?|room|spa|style)')
where es_negocio is distinct from (nombre ~* '(barber|barbershop|salon|cuts?|fade|shop|studio|kutz|kuts|klipper|clipper|lounge|palace|kingz?|room|spa|style)');

create index if not exists idx_barberias_es_negocio on barberias (es_negocio) where es_negocio = false;

-- Keep the flag current for every shop created from here on, using the
-- exact same keyword check the trigger already runs for the
-- revisar_duplicado decision — one classification, two uses.
create or replace function fn_auto_link_barberia() returns trigger
language plpgsql as $$
declare
  v_norm_negocio text;
  v_norm_calle text;
  v_norm_own_name text;
  v_looks_like_shop boolean;
  v_match record;
  v_new_id uuid;
begin
  begin
    if NEW.barberia_id is not null then
      return NEW;
    end if;
    if NEW.negocio is null or trim(NEW.negocio) = '' then
      return NEW;
    end if;

    v_norm_negocio := normalize_barberia_text(NEW.negocio);
    if v_norm_negocio is null then
      return NEW;
    end if;

    v_norm_own_name := normalize_barberia_text(NEW.nombre);
    if v_norm_own_name is not null and similarity(v_norm_negocio, v_norm_own_name) >= 0.6 then
      return NEW;
    end if;

    v_norm_calle := normalize_barberia_text(barberia_extract_calle(NEW.direccion));

    v_looks_like_shop := NEW.negocio ~* '(barber|barbershop|salon|cuts?|fade|shop|studio|kutz|kuts|klipper|clipper|lounge|palace|kingz?|room|spa|style)';

    select b.id, b.nombre, ns.name_sim, ns.addr_sim
    into v_match
    from barberias b,
    lateral (
      select
        similarity(normalize_barberia_text(b.nombre), v_norm_negocio) as name_sim,
        case when v_norm_calle is not null
          then similarity(normalize_barberia_text(barberia_extract_calle(b.direccion)), v_norm_calle)
          else null
        end as addr_sim
    ) ns
    order by
      (coalesce(ns.addr_sim, 0) >= 0.6) desc,
      case when coalesce(ns.addr_sim, 0) >= 0.6 then ns.addr_sim else ns.name_sim end desc
    limit 1;

    if v_match.id is null then
      insert into barberias (nombre, direccion, revisar_duplicado, es_negocio)
      values (NEW.negocio, NEW.direccion, not v_looks_like_shop, v_looks_like_shop)
      returning id into v_new_id;
      NEW.barberia_id := v_new_id;
    elsif v_match.addr_sim is not null then
      if v_match.addr_sim >= 0.6 and v_match.name_sim >= 0.15 then
        NEW.barberia_id := v_match.id;
      elsif v_match.name_sim >= 0.5 then
        insert into barberias (nombre, direccion, revisar_duplicado, duplicado_de, es_negocio)
        values (NEW.negocio, NEW.direccion, true, v_match.id, v_looks_like_shop)
        returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      else
        insert into barberias (nombre, direccion, revisar_duplicado, es_negocio)
        values (NEW.negocio, NEW.direccion, not v_looks_like_shop, v_looks_like_shop)
        returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      end if;
    else
      if v_match.name_sim >= 0.45 then
        NEW.barberia_id := v_match.id;
      elsif v_match.name_sim >= 0.2 then
        insert into barberias (nombre, direccion, revisar_duplicado, duplicado_de, es_negocio)
        values (NEW.negocio, NEW.direccion, true, v_match.id, v_looks_like_shop)
        returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      else
        insert into barberias (nombre, direccion, revisar_duplicado, es_negocio)
        values (NEW.negocio, NEW.direccion, not v_looks_like_shop, v_looks_like_shop)
        returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      end if;
    end if;

  exception when others then
    raise warning 'fn_auto_link_barberia failed for client %: %', NEW.id, sqlerrm;
  end;

  return NEW;
end;
$$;
