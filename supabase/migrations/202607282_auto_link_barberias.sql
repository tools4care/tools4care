-- Automatic barbershop linking: when a client is created or edited with a
-- "negocio" (business name), figure out on its own which barbershop that
-- is — matching against existing barberias by name AND address similarity
-- (pg_trgm) — instead of requiring someone to manually assign it.
--
-- Calibrated 2026-07-28 against real name variants already in this
-- database (typos, apostrophes, a person's name prefixed to the shop name,
-- and the "same name pattern but a different location" trap — e.g. "The
-- Fix" vs "The Fix 2", two real distinct shops that score 0.7-0.8 name
-- similarity despite being different places). Address is trusted over name
-- similarity when both are available, because messy names are far more
-- common in this data than messy addresses.

alter table barberias
  add column if not exists revisar_duplicado boolean not null default false,
  add column if not exists duplicado_de uuid references barberias(id) on delete set null;

-- Strips punctuation and generic shop-type words ("Barbershop", "Barber
-- Shop", "B/S") so two names are compared on their distinctive part only —
-- otherwise e.g. "Main Barbershop" and "MVP Barbershop" look artificially
-- similar just from sharing the word "Barbershop".
create or replace function normalize_barberia_text(txt text) returns text
language sql immutable as $$
  select nullif(trim(regexp_replace(
    regexp_replace(
      upper(regexp_replace(coalesce(txt, ''), '[''.]', '', 'g')),
      '\y(BARBER\s*SHOP|BARBERSHOP|BARBER|SHOP|B/S)\y', '', 'g'
    ),
    '[^A-Z0-9]+', ' ', 'g'
  )), '');
$$;

-- Pulls just the street out of a direccion value, which in this app is
-- stored either as a JSON object ({"calle":...}) or a plain "street, city,
-- state zip" string. Comparing full addresses (with city/state/zip) is too
-- noisy — two different streets in the same town still score deceptively
-- high — so this isolates the part that actually distinguishes locations.
create or replace function barberia_extract_calle(direccion text) returns text
language plpgsql as $$
declare
  parsed jsonb;
begin
  if direccion is null then return null; end if;
  begin
    parsed := direccion::jsonb;
    if parsed ? 'calle' then
      return nullif(trim(parsed->>'calle'), '');
    end if;
  exception when others then
    null;
  end;
  return coalesce(nullif(trim(split_part(direccion, ',', 1)), ''), direccion);
end;
$$;

create or replace function fn_auto_link_barberia() returns trigger
language plpgsql as $$
declare
  v_norm_negocio text;
  v_norm_calle text;
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
    v_norm_calle := normalize_barberia_text(barberia_extract_calle(NEW.direccion));

    -- Prefer whichever candidate has a strong ADDRESS match, even if it
    -- isn't the single closest name — addresses are more reliable than
    -- shop names in this data (e.g. "The Fix 3" at 3 Ferry St must match
    -- "The Fix Barbershop 2", not "The Fix Barbershop", despite the
    -- original scoring higher on name text alone). Verified against a
    -- throwaway test insert 2026-07-28 — picking single-best-name-match
    -- first and only then checking its address missed exactly this case.
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
      -- No barbershop exists at all yet.
      insert into barberias (nombre, direccion) values (NEW.negocio, NEW.direccion) returning id into v_new_id;
      NEW.barberia_id := v_new_id;
    elsif v_match.addr_sim is not null then
      -- Address is available on both sides — trust it as the primary signal.
      if v_match.addr_sim >= 0.6 and v_match.name_sim >= 0.15 then
        NEW.barberia_id := v_match.id;
      elsif v_match.name_sim >= 0.5 then
        -- Same-ish name, different address (e.g. a second location of the
        -- same chain) — don't silently merge. Track it as its own shop and
        -- flag it so a human can confirm whether it's really different.
        insert into barberias (nombre, direccion, revisar_duplicado, duplicado_de)
        values (NEW.negocio, NEW.direccion, true, v_match.id)
        returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      else
        insert into barberias (nombre, direccion) values (NEW.negocio, NEW.direccion) returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      end if;
    else
      -- No address to cross-check — decide on name alone, more cautiously.
      if v_match.name_sim >= 0.45 then
        NEW.barberia_id := v_match.id;
      elsif v_match.name_sim >= 0.2 then
        insert into barberias (nombre, direccion, revisar_duplicado, duplicado_de)
        values (NEW.negocio, NEW.direccion, true, v_match.id)
        returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      else
        insert into barberias (nombre, direccion) values (NEW.negocio, NEW.direccion) returning id into v_new_id;
        NEW.barberia_id := v_new_id;
      end if;
    end if;

  exception when others then
    -- Auto-linking must never block saving a client.
    raise warning 'fn_auto_link_barberia failed for client %: %', NEW.id, sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_auto_link_barberia on clientes;
create trigger trg_auto_link_barberia
  before insert or update of negocio, direccion on clientes
  for each row
  execute function fn_auto_link_barberia();
