-- Centralized shipping configuration for the online store.
create table if not exists public.online_shipping_settings (
  id boolean primary key default true check (id = true),
  origin_name text not null default 'Salem, MA',
  origin_lat numeric(9,6) not null default 42.519500,
  origin_lng numeric(9,6) not null default -70.896700,
  free_delivery_radius_miles numeric(8,2) not null default 30,
  local_delivery_fee numeric(10,2) not null default 0,
  zone_30_50_fee numeric(10,2) not null default 9.99,
  zone_50_100_fee numeric(10,2) not null default 14.99,
  outside_zone_fee numeric(10,2) not null default 19.99,
  standard_fee numeric(10,2) not null default 6.99,
  standard_free_threshold numeric(10,2) not null default 75,
  express_fee numeric(10,2) not null default 14.99,
  pickup_enabled boolean not null default true,
  local_delivery_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.online_shipping_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.online_shipping_settings enable row level security;
drop policy if exists "online shipping settings public read" on public.online_shipping_settings;
create policy "online shipping settings public read"
  on public.online_shipping_settings for select to anon, authenticated using (true);
drop policy if exists "online shipping settings authenticated write" on public.online_shipping_settings;
create policy "online shipping settings authenticated write"
  on public.online_shipping_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

comment on table public.online_shipping_settings is 'Admin-configurable online store shipping zones and rates';
