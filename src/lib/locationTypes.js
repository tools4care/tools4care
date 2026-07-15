export const LOCATION_TYPES = Object.freeze({
  VAN: "van",
  STORE: "store",
  ONLINE: "online",
});

const VALID_LOCATION_TYPES = new Set(Object.values(LOCATION_TYPES));

export function getLocationName(location) {
  return location?.nombre || location?.nombre_van || location?.name || "Workspace";
}

export function getLocationType(location) {
  const explicitType = String(location?.tipo || location?.type || "").trim().toLowerCase();
  if (VALID_LOCATION_TYPES.has(explicitType)) return explicitType;

  // Backward compatibility while the location migration is rolling out.
  const name = getLocationName(location).toLowerCase();
  if (name.includes("online")) return LOCATION_TYPES.ONLINE;
  if (name.includes("store") || name.includes("tienda")) return LOCATION_TYPES.STORE;
  return LOCATION_TYPES.VAN;
}

export const isStoreLocation = (location) => getLocationType(location) === LOCATION_TYPES.STORE;
export const isOnlineLocation = (location) => getLocationType(location) === LOCATION_TYPES.ONLINE;
export const isVanLocation = (location) => getLocationType(location) === LOCATION_TYPES.VAN;

export function getLocationLabel(location) {
  const type = getLocationType(location);
  if (type === LOCATION_TYPES.STORE) return "Physical Store";
  if (type === LOCATION_TYPES.ONLINE) return "Online Store";
  return "VAN / Route";
}
