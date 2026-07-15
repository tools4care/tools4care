const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

function asProduct(value) {
  return Array.isArray(value) ? value[0] : value;
}

function asSale(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safeQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

async function fetchRemainingPages(pageCount, fetchPage) {
  if (pageCount <= 1) return [];
  const pages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      fetchPage((index + 1) * PAGE_SIZE, (index + 2) * PAGE_SIZE - 1)
    )
  );
  return pages.flatMap((result) => {
    if (result.error) throw result.error;
    return result.data || [];
  });
}

export function buildReorderRecommendations({ salesLines = [], stockRows = [], now = new Date() }) {
  const nowMs = new Date(now).getTime();
  const since30Ms = nowMs - 30 * DAY_MS;
  const demandByProduct = new Map();

  for (const line of salesLines) {
    const sale = asSale(line.ventas);
    if (!line.producto_id || sale?.tipo === "devolucion") continue;
    const soldAt = new Date(sale?.created_at).getTime();
    const quantity = safeQuantity(line.cantidad);
    if (!Number.isFinite(soldAt) || quantity <= 0) continue;

    const current = demandByProduct.get(line.producto_id) || {
      producto_id: line.producto_id,
      vendido30d: 0,
      vendido90d: 0,
      ultimaVenta: null,
      producto: asProduct(line.productos) || null,
    };
    current.vendido90d += quantity;
    if (soldAt >= since30Ms) current.vendido30d += quantity;
    if (!current.ultimaVenta || soldAt > new Date(current.ultimaVenta).getTime()) {
      current.ultimaVenta = sale.created_at;
    }
    if (!current.producto) current.producto = asProduct(line.productos) || null;
    demandByProduct.set(line.producto_id, current);
  }

  const ranked = [...demandByProduct.values()]
    .filter((item) => item.vendido90d >= 3)
    .sort((a, b) => b.vendido90d - a.vendido90d || b.vendido30d - a.vendido30d);
  const bestSellerSlots = Math.min(50, Math.max(10, Math.ceil(ranked.length * 0.15)));
  const bestSellerRanks = new Map(
    ranked.slice(0, bestSellerSlots).map((item, index) => [item.producto_id, index + 1])
  );

  const stockByProduct = new Map(
    stockRows.map((row) => [row.producto_id, row])
  );
  const urgencyOrder = { critico: 0, bajo: 1, watch: 2 };
  const recommendations = [];

  for (const demand of demandByProduct.values()) {
    const stockRow = stockByProduct.get(demand.producto_id);
    const product = asProduct(stockRow?.productos) || demand.producto || {};
    const stock = Math.max(0, Number(stockRow?.cantidad) || 0);
    const recentDaily = demand.vendido30d / 30;
    const historicalDaily = demand.vendido90d / 90;
    const velocity = recentDaily > 0
      ? recentDaily * 0.7 + historicalDaily * 0.3
      : historicalDaily * 0.6;
    const isBestSeller = bestSellerRanks.has(demand.producto_id);
    const hasRepeatDemand = demand.vendido30d >= 2 || demand.vendido90d >= 3;
    if (!hasRepeatDemand || velocity <= 0) continue;

    const daysRemaining = stock === 0 ? 0 : Math.floor(stock / velocity);
    let urgency = null;
    if (stock === 0 || daysRemaining < 7) urgency = "critico";
    else if (daysRemaining < 14) urgency = "bajo";
    else if (isBestSeller && daysRemaining < 30) urgency = "watch";
    if (!urgency) continue;

    const targetDays = isBestSeller ? 30 : 21;
    const recommendedQuantity = Math.max(1, Math.ceil(velocity * targetDays - stock));
    recommendations.push({
      producto_id: demand.producto_id,
      nombre: product.nombre || demand.producto_id,
      codigo: product.codigo || "",
      marca: product.marca || "",
      size: product.size || "",
      precio: Number(product.precio || 0),
      cantidad: stock,
      stockActual: stock,
      vendido30d: Number(demand.vendido30d.toFixed(2)),
      vendido90d: Number(demand.vendido90d.toFixed(2)),
      velocidad: Number(velocity.toFixed(2)),
      diasRestantes: daysRemaining,
      ultimaVenta: demand.ultimaVenta,
      urgencia: urgency,
      esMasVendido: isBestSeller,
      rankingVentas: bestSellerRanks.get(demand.producto_id) || null,
      cantidadRecomendada: recommendedQuantity,
    });
  }

  return recommendations.sort((a, b) =>
    urgencyOrder[a.urgencia] - urgencyOrder[b.urgencia] ||
    Number(b.esMasVendido) - Number(a.esMasVendido) ||
    a.diasRestantes - b.diasRestantes ||
    b.velocidad - a.velocidad
  );
}

export async function loadVanReorderRecommendations(supabase, vanId, { now = new Date() } = {}) {
  if (!vanId) return [];
  const since90 = new Date(new Date(now).getTime() - 90 * DAY_MS).toISOString();
  const detailsSelect = `
    venta_id,
    producto_id,
    cantidad,
    productos(id,nombre,codigo,precio,marca,size),
    ventas!detalle_ventas_venta_id_fkey!inner(van_id,created_at,tipo)
  `;
  const stockSelect = "producto_id,cantidad,productos(id,nombre,codigo,precio,marca,size)";

  const fetchDetailsPage = (from, to, withCount = false) =>
    supabase
      .from("detalle_ventas")
      .select(detailsSelect, withCount ? { count: "exact" } : undefined)
      .eq("ventas.van_id", vanId)
      .gte("ventas.created_at", since90)
      .range(from, to);
  const fetchStockPage = (from, to, withCount = false) =>
    supabase
      .from("stock_van")
      .select(stockSelect, withCount ? { count: "exact" } : undefined)
      .eq("van_id", vanId)
      .range(from, to);

  const [firstDetails, firstStock] = await Promise.all([
    fetchDetailsPage(0, PAGE_SIZE - 1, true),
    fetchStockPage(0, PAGE_SIZE - 1, true),
  ]);
  if (firstDetails.error) throw firstDetails.error;
  if (firstStock.error) throw firstStock.error;

  const [remainingDetails, remainingStock] = await Promise.all([
    fetchRemainingPages(Math.ceil((firstDetails.count || 0) / PAGE_SIZE), fetchDetailsPage),
    fetchRemainingPages(Math.ceil((firstStock.count || 0) / PAGE_SIZE), fetchStockPage),
  ]);

  return buildReorderRecommendations({
    salesLines: [...(firstDetails.data || []), ...remainingDetails],
    stockRows: [...(firstStock.data || []), ...remainingStock],
    now,
  });
}
