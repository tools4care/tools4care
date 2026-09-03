/** Consistent customer label for payment screens, receipts and Stripe records. */
export function formatCustomerDisplayName(customer: any, fallback = "Customer") {
  const person = String(customer?.nombre || "").trim();
  const business = String(customer?.negocio || "").trim();
  if (person && business) return `${person} — ${business}`;
  return person || business || fallback;
}
