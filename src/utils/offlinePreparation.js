const CUSTOMER_COLUMNS = "id,nombre,negocio,telefono,email,direccion,balance";

export async function fetchAllCustomersForOffline(db, {
  view = "clientes_balance_v2",
  pageSize = 1000,
  maxRows = 10000,
} = {}) {
  const all = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await db
      .from(view)
      .select(CUSTOMER_COLUMNS)
      .order("nombre", { ascending: true })
      .range(from, Math.min(from + pageSize - 1, maxRows - 1));

    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    all.push(...page);
    if (page.length < pageSize) break;
  }

  return all;
}
