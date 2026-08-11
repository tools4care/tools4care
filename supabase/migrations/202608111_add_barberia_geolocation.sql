-- Adds coordinates to barberias so route order can be optimized by real
-- distance instead of the free-text `direccion` field. Backfilled once via
-- scripts/geocode-barberias.mjs (OpenStreetMap Nominatim), then kept current
-- by re-running that script whenever a new shop is added without coordinates.

alter table barberias
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocoded_at timestamptz;

create index if not exists idx_barberias_coords on barberias (latitude, longitude)
  where latitude is not null and longitude is not null;
