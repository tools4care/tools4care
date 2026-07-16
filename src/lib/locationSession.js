const LOCATION_STORAGE_KEY = "tools4care_selected_van";
const LEGACY_LOCATION_STORAGE_KEY = "van";
const SESSION_PREFIX = "tools4care_location_confirmed_";

const sessionKey = (userId) => `${SESSION_PREFIX}${userId}`;

function safeParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function loadConfirmedLocation(userId, persistentStorage = localStorage, currentSessionStorage = sessionStorage) {
  if (!userId) return null;
  const confirmedId = currentSessionStorage.getItem(sessionKey(userId));
  const saved = safeParse(persistentStorage.getItem(LOCATION_STORAGE_KEY));
  return confirmedId && saved?.id === confirmedId ? saved : null;
}

export function persistConfirmedLocation(userId, location, persistentStorage = localStorage, currentSessionStorage = sessionStorage) {
  if (!userId || !location?.id) return;
  persistentStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
  persistentStorage.setItem(LEGACY_LOCATION_STORAGE_KEY, JSON.stringify(location));
  currentSessionStorage.setItem(sessionKey(userId), location.id);
}

export function clearConfirmedLocation(userId, persistentStorage = localStorage, currentSessionStorage = sessionStorage) {
  persistentStorage.removeItem(LOCATION_STORAGE_KEY);
  persistentStorage.removeItem(LEGACY_LOCATION_STORAGE_KEY);
  if (userId) currentSessionStorage.removeItem(sessionKey(userId));
}

export const locationSessionKey = sessionKey;
