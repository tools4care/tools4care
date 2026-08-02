-- The auto-link trigger (fn_auto_link_barberia, 202607282) creates a new
-- barbershop for any client with a non-empty "negocio" field, trusting
-- that text is a real business name. In practice a lot of client records
-- have "negocio" set to a person's name instead (a data-entry habit from
-- before this field's purpose was clarified) — auditing production found
-- 796 barberias, 706 of them (89%) linked to exactly one client, and 619
-- (78%) with names that don't read like a business at all. This migration
-- doesn't touch those existing rows — it only stops new false positives
-- from being created going forward, per Edwin's direction 2026-08-02.

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

    -- "Negocio" holding the client's own name is the clearest false-positive
    -- signal: a real barbershop is never going to be named identically to
    -- one of its own customers. Uses trigram similarity rather than plain
    -- substring containment — a short shop name like "MVP" can otherwise
    -- coincidentally appear inside an unrelated client's own full name.
    v_norm_own_name := normalize_barberia_text(NEW.nombre);
    if v_norm_own_name is not null and similarity(v_norm_negocio, v_norm_own_name) >= 0.6 then
      return NEW;
    end if;

    v_norm_calle := normalize_barberia_text(barberia_extract_calle(NEW.direccion));

    -- Doesn't prove or disprove anything on its own (real shops like
    -- "Mezzina" or "T Stop" won't match either) — used below only to
    -- decide whether a brand-new shop needs a human's eyes before it's
    -- trusted, not to block it outright.
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
      -- No barbershop exists at all yet. Still create it (we'd rather
      -- have a flagged row to review than silently drop a real new shop),
      -- but flag it for review when the name doesn't look business-like —
      -- that's exactly the pattern behind most of the 619 false positives.
      insert into barberias (nombre, direccion, revisar_duplicado)
      values (NEW.negocio, NEW.direccion, not v_looks_like_shop)
      returning id into v_new_id;
      NEW.barberia_id := v_new_id;
    elsif v_match.addr_sim is not null then
      if v_match.addr_sim >= 0.6 and v_match.name_sim >= 0.15 then
        NEW.barberia_id := v_match.id;
      elsif v_match.name_sim >= 0.5 then
        insert into barberias (nombre, direccion, revisar_duplicado, duplicado_de)
        values (NEW.negocio, NEW.direccion, true, v_match.id)
        returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      else
        insert into barberias (nombre, direccion, revisar_duplicado)
        values (NEW.negocio, NEW.direccion, not v_looks_like_shop)
        returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      end if;
    else
      if v_match.name_sim >= 0.45 then
        NEW.barberia_id := v_match.id;
      elsif v_match.name_sim >= 0.2 then
        insert into barberias (nombre, direccion, revisar_duplicado, duplicado_de)
        values (NEW.negocio, NEW.direccion, true, v_match.id)
        returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      else
        insert into barberias (nombre, direccion, revisar_duplicado)
        values (NEW.negocio, NEW.direccion, not v_looks_like_shop)
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
