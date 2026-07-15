const DEVICE_KEY = "t4c_store_register_device_id";
const NAME_KEY = "t4c_store_register_name";
const SESSION_PREFIX = "t4c_store_cash_session_";
let memoryDeviceId = null;

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getStoreDeviceId() {
  try {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value) {
      value = memoryDeviceId || makeId();
      localStorage.setItem(DEVICE_KEY, value);
    }
    memoryDeviceId = value;
    return value;
  } catch {
    if (!memoryDeviceId) memoryDeviceId = makeId();
    return memoryDeviceId;
  }
}

export function getStoreRegisterName() {
  try {
    return localStorage.getItem(NAME_KEY) || "Main Register";
  } catch {
    return "Main Register";
  }
}

export function setStoreRegisterName(value) {
  try { localStorage.setItem(NAME_KEY, String(value || "Main Register")); } catch { /* optional */ }
}

export function getStoredStoreCashSessionId(locationId) {
  if (!locationId) return null;
  try { return localStorage.getItem(`${SESSION_PREFIX}${locationId}`); } catch { return null; }
}

export function setStoredStoreCashSessionId(locationId, sessionId) {
  if (!locationId) return;
  try {
    const key = `${SESSION_PREFIX}${locationId}`;
    if (sessionId) localStorage.setItem(key, sessionId);
    else localStorage.removeItem(key);
  } catch { /* optional */ }
}

export async function resolveOpenStoreCashSession(supabase, locationId, cashierId) {
  if (!locationId || !cashierId) return null;
  const deviceId = getStoreDeviceId();
  const storedId = getStoredStoreCashSessionId(locationId);

  let query = supabase
    .from("store_cash_sessions")
    .select("*")
    .eq("location_id", locationId)
    .eq("cashier_id", cashierId)
    .eq("device_id", deviceId)
    .eq("status", "open")
    .limit(1);
  if (storedId) query = query.eq("id", storedId);

  let { data, error } = await query.maybeSingle();
  if (error) throw error;

  // Recover after local storage was cleared without creating a duplicate shift.
  if (!data && storedId) {
    const fallback = await supabase
      .from("store_cash_sessions")
      .select("*")
      .eq("location_id", locationId)
      .eq("cashier_id", cashierId)
      .eq("device_id", deviceId)
      .eq("status", "open")
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }

  setStoredStoreCashSessionId(locationId, data?.id || null);
  return data || null;
}
