export const DEFAULT_LOCATION_SETTINGS = Object.freeze({
  tax_enabled: false,
  tax_rate: 0,
  tax_name: "Sales Tax",
  tax_included: false,
  customer_display_enabled: false,
  receipt_printing_enabled: true,
  cash_drawer_enabled: true,
});

export function normalizeLocationSettings(value) {
  const source = value || {};
  return {
    ...DEFAULT_LOCATION_SETTINGS,
    ...source,
    tax_enabled: Boolean(source.tax_enabled ?? source.enabled ?? false),
    tax_rate: Math.max(0, Math.min(100, Number(source.tax_rate ?? source.rate ?? 0) || 0)),
    tax_name: String(source.tax_name ?? source.name ?? "Sales Tax").trim() || "Sales Tax",
    tax_included: Boolean(source.tax_included ?? source.includeInPrice ?? source.taxIncluded ?? false),
    customer_display_enabled: Boolean(source.customer_display_enabled ?? false),
    receipt_printing_enabled: source.receipt_printing_enabled !== false,
    cash_drawer_enabled: source.cash_drawer_enabled !== false,
  };
}
