export const CUSTOMER_DISPLAY_CHANNEL = "tools4care-customer-display";

export const customerDisplayStorageKey = (locationId) =>
  `tools4care_customer_display_${locationId || "current"}`;

const moneyNumber = (value) => Number((Number(value) || 0).toFixed(2));

export function buildCustomerDisplaySnapshot({
  locationId,
  locationName,
  customerName,
  items = [],
  subtotal = 0,
  taxName = "Sales Tax",
  taxRate = 0,
  taxAmount = 0,
  taxIncluded = false,
  total = 0,
  previousBalance = 0,
  amountDue = total,
  paid = 0,
  remaining = 0,
  change = 0,
}) {
  return {
    version: 1,
    locationId: locationId || null,
    locationName: locationName || "Physical Store",
    customerName: customerName || "Welcome",
    updatedAt: new Date().toISOString(),
    items: items.map((item) => ({
      id: item.producto_id || item.id,
      name: item.nombre || item.name || "Product",
      quantity: Number(item.cantidad || item.quantity || 0),
      unitPrice: moneyNumber(item.precio_unitario ?? item.unitPrice),
      lineTotal: moneyNumber(
        Number(item.cantidad || item.quantity || 0) *
        Number(item.precio_unitario ?? item.unitPrice ?? 0),
      ),
    })),
    subtotal: moneyNumber(subtotal),
    tax: {
      name: taxName || "Sales Tax",
      rate: Number(taxRate) || 0,
      amount: moneyNumber(taxAmount),
      included: Boolean(taxIncluded),
    },
    purchaseTotal: moneyNumber(total),
    previousBalance: moneyNumber(previousBalance),
    amountDue: moneyNumber(amountDue),
    paid: moneyNumber(paid),
    remaining: moneyNumber(remaining),
    change: moneyNumber(change),
  };
}

export function publishCustomerDisplay(snapshot) {
  if (typeof window === "undefined" || !snapshot?.locationId) return;
  localStorage.setItem(customerDisplayStorageKey(snapshot.locationId), JSON.stringify(snapshot));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channel.postMessage(snapshot);
    channel.close();
  }
}
