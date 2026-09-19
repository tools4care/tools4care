export const DEFAULT_SHIPPING_SETTINGS = {
  origin_name: "Salem, MA",
  origin_lat: 42.5195,
  origin_lng: -70.8967,
  free_delivery_radius_miles: 30,
  local_delivery_fee: 0,
  zone_30_50_fee: 9.99,
  zone_50_100_fee: 14.99,
  outside_zone_fee: 19.99,
  standard_fee: 6.99,
  standard_free_threshold: 75,
  express_fee: 14.99,
  pickup_enabled: true,
  local_delivery_enabled: true,
};

export function normalizeShippingSettings(row) {
  const source = row || {};
  return Object.fromEntries(Object.entries(DEFAULT_SHIPPING_SETTINGS).map(([key, fallback]) => {
    if (typeof fallback === "boolean") return [key, source[key] == null ? fallback : Boolean(source[key])];
    if (typeof fallback === "number") {
      const value = Number(source[key]);
      return [key, Number.isFinite(value) ? value : fallback];
    }
    return [key, source[key] || fallback];
  }));
}

export function haversineMiles(lat1, lng1, lat2, lng2) {
  const values = [lat1, lng1, lat2, lng2].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [a, b, c, d] = values.map((value) => (value * Math.PI) / 180);
  const h = Math.sin((c - a) / 2) ** 2 + Math.cos(a) * Math.cos(c) * Math.sin((d - b) / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function localDeliveryQuote(distanceMiles, settings = DEFAULT_SHIPPING_SETTINGS) {
  if (!Number.isFinite(Number(distanceMiles))) return { fee: null, zone: "unknown" };
  const distance = Number(distanceMiles);
  if (distance <= Number(settings.free_delivery_radius_miles)) return { fee: Number(settings.local_delivery_fee), zone: "local" };
  if (distance <= 50) return { fee: Number(settings.zone_30_50_fee), zone: "30-50 miles" };
  if (distance <= 100) return { fee: Number(settings.zone_50_100_fee), zone: "50-100 miles" };
  return { fee: Number(settings.outside_zone_fee), zone: "outside delivery area" };
}

export async function geocodeUsZip(zip) {
  const normalized = String(zip || "").trim().match(/^\d{5}/)?.[0];
  if (!normalized) return null;
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${normalized}`);
    if (!response.ok) return null;
    const data = await response.json();
    const place = data?.places?.[0];
    const lat = Number(place?.latitude);
    const lng = Number(place?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, zip: normalized } : null;
  } catch {
    return null;
  }
}
