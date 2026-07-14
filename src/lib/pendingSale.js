export function isCloudPendingSale(sale, fallbackClient = null) {
  if (!sale?.id) return false;

  return (
    Object.prototype.hasOwnProperty.call(sale, "cliente_id") ||
    Object.prototype.hasOwnProperty.call(sale, "cliente_data") ||
    !!fallbackClient
  );
}

export function resolvePendingSaleClient(sale, fallbackClient = null) {
  const storedClient = sale?.cliente_data && typeof sale.cliente_data === "object"
    ? sale.cliente_data
    : {};
  const legacyClient = sale?.client && typeof sale.client === "object"
    ? sale.client
    : {};
  const currentClient = fallbackClient && typeof fallbackClient === "object"
    ? fallbackClient
    : {};

  const hasClientData =
    Object.keys(storedClient).length > 0 ||
    Object.keys(legacyClient).length > 0 ||
    Object.keys(currentClient).length > 0 ||
    sale?.cliente_id != null;

  if (!hasClientData) return null;

  return {
    ...legacyClient,
    ...storedClient,
    ...currentClient,
    id: sale?.cliente_id ?? storedClient.id ?? currentClient.id ?? legacyClient.id ?? null,
  };
}
