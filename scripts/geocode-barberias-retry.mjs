// Second pass for scripts/geocode-barberias.mjs: retries barberias that
// missed on the first pass because `direccion` wasn't a clean street
// address — either JSON-encoded ({"calle":...,"ciudad":...}) like
// VisitNotebook.jsx's extractCalle() already handles, or polluted with a
// literal "None" token from a historical import bug (e.g. "454 MAIN ST
// None, WOBURN, 1801"). Builds a clean "street, city, state zip" string
// before handing it to Nominatim.
import 'dotenv/config';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanAddress(direccion) {
  if (!direccion) return null;
  try {
    const parsed = JSON.parse(direccion);
    if (parsed && typeof parsed === "object" && parsed.calle) {
      const calle = String(parsed.calle).replace(/\bNone\b/gi, "").trim();
      const ciudad = String(parsed.ciudad || "").trim();
      const estado = String(parsed.estado || "MA").trim();
      const zip = String(parsed.zip || "").trim();
      return [calle, ciudad, [estado, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    }
  } catch { /* not JSON, fall through */ }
  return String(direccion).replace(/\bNone\b/gi, "").replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();
}

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
console.log(`${pending.length} barbershops still missing coordinates. Retrying with cleaned addresses.`);

let ok = 0, missed = 0;
for (const [i, shop] of pending.entries()) {
  const address = cleanAddress(shop.direccion);
  try {
    const coords = address ? await geocode(address) : null;
    if (coords) {
      await saveCoords(shop.id, coords.lat, coords.lon);
      ok++;
      console.log(`[${i + 1}/${pending.length}] OK  ${shop.nombre} ("${address}") -> ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`);
    } else {
      missed++;
      console.log(`[${i + 1}/${pending.length}] MISS ${shop.nombre} ("${address}")`);
    }
  } catch (err) {
    missed++;
    console.log(`[${i + 1}/${pending.length}] ERROR ${shop.nombre}: ${err.message}`);
  }
  await sleep(1100);
}

console.log(`\nDone. Geocoded: ${ok}, still missed: ${missed}.`);
