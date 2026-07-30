-- Complete automatic barbershop visit marking.
--
-- The original visit view correctly derives visits from sales, but historical
-- clients created before clientes.barberia_id existed were never linked. The
-- daily route also kept its independent manual `visitada` flag. This migration
-- closes both gaps:
--   1. backfill canonical barbershop links for existing clients;
--   2. link route stops to the same canonical barbershop where possible;
--   3. mark a same-day route stop visited whenever a sale is inserted/synced.
--
-- Because the trigger runs on `ventas`, an offline sale receives exactly the
-- same treatment when SyncManager later inserts it into Supabase.

create or replace function public.fn_link_sale_to_barbershop_visit()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_barberia_id uuid;
  v_negocio text;
  v_direccion text;
  v_sale_date date;
begin
  -- Returns/refunds are not physical sales visits.
  if coalesce(new.tipo, 'venta') = 'devolucion' or new.cliente_id is null then
    return new;
  end if;

  select c.barberia_id, c.negocio, c.direccion
    into v_barberia_id, v_negocio, v_direccion
  from public.clientes c
  where c.id = new.cliente_id;

  -- Historical clients may predate automatic linking. Updating the business
  -- field to its current value deliberately invokes trg_auto_link_barberia.
  if v_barberia_id is null and nullif(trim(v_negocio), '') is not null then
    update public.clientes
       set negocio = negocio
     where id = new.cliente_id
       and barberia_id is null;

    select c.barberia_id
      into v_barberia_id
    from public.clientes c
    where c.id = new.cliente_id;
  end if;

  if new.fecha is null then
    v_sale_date := (coalesce(new.created_at, now()) at time zone 'America/New_York')::date;
  else
    v_sale_date := (new.fecha at time zone 'America/New_York')::date;
  end if;

  -- Prefer the canonical id. Name/address fallbacks also cover old or manually
  -- entered route rows that have not yet received a barberia_id.
  update public.rutas_barberias r
     set visitada = true,
         barberia_id = coalesce(r.barberia_id, v_barberia_id)
   where r.van_id = new.van_id
     and r.dia = v_sale_date
     and (
       (v_barberia_id is not null and r.barberia_id = v_barberia_id)
       or (
         r.barberia_id is null
         and (
           public.normalize_barberia_text(r.barberia_nombre)
             = public.normalize_barberia_text(v_negocio)
           or (
             public.normalize_barberia_text(public.barberia_extract_calle(r.direccion)) is not null
             and public.normalize_barberia_text(public.barberia_extract_calle(v_direccion)) is not null
             and similarity(
               public.normalize_barberia_text(public.barberia_extract_calle(r.direccion)),
               public.normalize_barberia_text(public.barberia_extract_calle(v_direccion))
             ) >= 0.60
           )
           or similarity(
             public.normalize_barberia_text(r.barberia_nombre),
             public.normalize_barberia_text(v_negocio)
           ) >= 0.45
         )
       )
     );

  return new;
exception when others then
  -- Visit tracking must never prevent a sale from being saved.
  raise warning 'fn_link_sale_to_barbershop_visit failed for sale %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_link_sale_to_barbershop_visit on public.ventas;
create trigger trg_link_sale_to_barbershop_visit
  after insert or update of cliente_id, fecha, van_id, tipo
  on public.ventas
  for each row
  execute function public.fn_link_sale_to_barbershop_visit();

-- Link existing clients. This intentionally fires trg_auto_link_barberia,
-- which owns the conservative name/address matching and duplicate safeguards.
update public.clientes
   set negocio = negocio
 where barberia_id is null
   and nullif(trim(negocio), '') is not null;

-- Attach historical route rows to the best safe canonical match.
with best_match as (
  select distinct on (r.id)
    r.id as route_id,
    b.id as barberia_id
  from public.rutas_barberias r
  join public.barberias b
    on (
      public.normalize_barberia_text(r.barberia_nombre)
        = public.normalize_barberia_text(b.nombre)
      or (
        public.normalize_barberia_text(public.barberia_extract_calle(r.direccion)) is not null
        and public.normalize_barberia_text(public.barberia_extract_calle(b.direccion)) is not null
        and similarity(
          public.normalize_barberia_text(public.barberia_extract_calle(r.direccion)),
          public.normalize_barberia_text(public.barberia_extract_calle(b.direccion))
        ) >= 0.60
      )
      or similarity(
        public.normalize_barberia_text(r.barberia_nombre),
        public.normalize_barberia_text(b.nombre)
      ) >= 0.45
    )
  where r.barberia_id is null
  order by r.id,
    case
      when public.normalize_barberia_text(public.barberia_extract_calle(r.direccion)) is not null
       and public.normalize_barberia_text(public.barberia_extract_calle(b.direccion)) is not null
      then similarity(
        public.normalize_barberia_text(public.barberia_extract_calle(r.direccion)),
        public.normalize_barberia_text(public.barberia_extract_calle(b.direccion))
      )
      else similarity(
        public.normalize_barberia_text(r.barberia_nombre),
        public.normalize_barberia_text(b.nombre)
      )
    end desc
)
update public.rutas_barberias r
   set barberia_id = bm.barberia_id
  from best_match bm
 where r.id = bm.route_id;

-- Backfill the manual route flag from real historical sales.
update public.rutas_barberias r
   set visitada = true
 where coalesce(r.visitada, false) = false
   and exists (
     select 1
     from public.ventas v
     join public.clientes c on c.id = v.cliente_id
     where v.van_id = r.van_id
       and coalesce(v.tipo, 'venta') <> 'devolucion'
       and (v.fecha at time zone 'America/New_York')::date = r.dia
       and c.barberia_id = r.barberia_id
   );
