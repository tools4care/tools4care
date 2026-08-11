// One-time (re-runnable) backfill: fills barberias.latitude/longitude from
// the free-text `direccion` field using OpenStreetMap's Nominatim geocoder
// (no API key needed). Nominatim's usage policy caps requests at 1/second,
// so this deliberately runs sequentially with a delay — do not parallelize.
//
// Requires the `latitude`/`longitude` columns to exist first — run
// supabase/migrations/202608111_add_barberia_geolocation.sql in the
// Supabase SQL editor before this script.
//
// Usage: node scripts/geocode-barberias.mjs
import 'dotenv/config';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPending() {
  const res = await fetch(
    `${URL}/rest/v1/barberias?select=id,nombre,direccion&latitude=is.null&direccion=not.is.null`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
  );
  return res.json();
}

async function geocode(address) {
  const params = new URLSearchParams({ q: address, format: "json", limit: "1", countrycodes: "us" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "tools4care-route-planning/1.0 (internal ops tool)" },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  return data[0] ? { lat: Number(data[0].lat), lon: Number(data[0].lon) } : null;
}

async function saveCoords(id, lat, lon) {
  const res = await fetch(`${URL}/rest/v1/barberias?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ latitude: lat, longitude: lon, geocoded_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);
}

const pending = await fetchPending();
console.log(`${pending.length} barbershops need geocoding.`);

let ok = 0, missed = 0;
for (const [i, shop] of pending.entries()) {
  try {
    const coords = await geocode(shop.direccion);
    if (coords) {
      await saveCoords(shop.id, coords.lat, coords.lon);
      ok++;
      console.log(`[${i + 1}/${pending.length}] OK  ${shop.nombre} -> ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`);
    } else {
      missed++;
      console.log(`[${i + 1}/${pending.length}] MISS ${shop.nombre} (${shop.direccion})`);
    }
  } catch (err) {
    missed++;
    console.log(`[${i + 1}/${pending.length}] ERROR ${shop.nombre}: ${err.message}`);
  }
  await sleep(1100); // stay under Nominatim's 1 req/sec limit
}

console.log(`\nDone. Geocoded: ${ok}, missed: ${missed}.`);
