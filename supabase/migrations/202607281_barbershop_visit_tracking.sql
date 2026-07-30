-- Automatic barbershop visit tracking.
--
-- A "barbershop" is a physical location; each barber who works there is
-- their own client record (confirmed against live data: e.g. MVP Barbershop
-- has 8 separate client rows, one per barber). Grouping clients under a
-- canonical `barberias` row lets us treat "a sale to any of that shop's
-- clients on a given day" as a visit, automatically — no manual check-in,
-- and it captures unplanned visits (not in rutas_barberias) the same as
-- scheduled ones.

create table if not exists barberias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  telefono text,
  notas text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_barberias_nombre_unique on barberias (lower(nombre));

alter table clientes
  add column if not exists barberia_id uuid references barberias(id) on delete set null;

create index if not exists idx_clientes_barberia_id on clientes (barberia_id) where barberia_id is not null;

-- Optional: link a scheduled route stop to the canonical shop too, so the
-- route-planning UI can eventually pick from the same list instead of free
-- text. Not required for visit detection (that's sales-driven).
alter table rutas_barberias
  add column if not exists barberia_id uuid references barberias(id) on delete set null;

create index if not exists idx_rutas_barberias_barberia_id on rutas_barberias (barberia_id) where barberia_id is not null;

-- Calibrated "overhead" buffer (parking, greeting, gathering orders, walking
-- to the truck, wrap-up) in minutes, added on top of the measured
-- first-sale-to-last-sale span to estimate real time spent per visit. Starts
-- at a placeholder default; meant to be tuned once against a short manual
-- timing sample, then left alone.
alter table site_settings
  add column if not exists barberia_visit_buffer_minutes integer not null default 12;

-- One row per (barbershop, calendar day) with a sale. first_sale/last_sale
-- and active_minutes are directly measured; estimated_minutes adds the
-- calibrated buffer. Built as a view (not a stored table) so it always
-- reflects current sales data with no sync/backfill maintenance.
create or replace view v_barberia_visitas as
select
  c.barberia_id,
  b.nombre as barberia_nombre,
  (v.fecha at time zone 'America/New_York')::date as visit_date,
  min(v.fecha) as first_sale_at,
  max(v.fecha) as last_sale_at,
  count(distinct v.id) as sales_count,
  extract(epoch from (max(v.fecha) - min(v.fecha))) / 60.0 as active_minutes,
  extract(epoch from (max(v.fecha) - min(v.fecha))) / 60.0
    + (select barberia_visit_buffer_minutes from site_settings where id = 1) as estimated_minutes
from ventas v
join clientes c on c.id = v.cliente_id
join barberias b on b.id = c.barberia_id
where c.barberia_id is not null
group by c.barberia_id, b.nombre, (v.fecha at time zone 'America/New_York')::date;

-- Per-barbershop rollup: last visit, days since, average days between
-- visits (cadence), average estimated minutes per visit.
create or replace view v_barberia_resumen as
with visitas as (
  select
    barberia_id,
    barberia_nombre,
    visit_date,
    estimated_minutes,
    visit_date - lag(visit_date) over (partition by barberia_id order by visit_date) as gap_days
  from v_barberia_visitas
)
select
  barberia_id,
  barberia_nombre,
  count(*) as total_visits,
  max(visit_date) as last_visit_date,
  (current_date - max(visit_date)) as days_since_last_visit,
  round(avg(gap_days) filter (where gap_days is not null), 1) as avg_days_between_visits,
  round(avg(estimated_minutes)) as avg_estimated_minutes
from visitas
group by barberia_id, barberia_nombre;

-- Seed the shops confirmed against live data (name variants + address
-- cross-checked with rutas_barberias and clientes.direccion 2026-07-28).
insert into barberias (nombre, direccion, telefono)
values
  ('Main Barbershop', '133 Main St, Peabody, MA 01960', '(862) 297-3668'),
  ('The Fix Barbershop', '741 S Main St, Haverhill, MA', null),
  ('The Fix Barbershop 2', '3 Ferry St, Haverhill, MA 01835', null),
  ('Bibis Barbershop', '61 Essex St, Lynn, MA 01902', null)
on conflict (lower(nombre)) do nothing;
