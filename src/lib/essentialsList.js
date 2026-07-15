export function normalizeEssentialItem(product) {
  const rawQuantity = Number(product?.cantidad);
  return {
    id: product?.id,
    nombre: product?.nombre || "Unnamed product",
    marca: product?.marca || "",
    size: product?.size || "",
    codigo: product?.codigo || "",
    notas: product?.notas || "",
    cantidad: Number.isFinite(rawQuantity) && rawQuantity > 0 ? Math.floor(rawQuantity) : 1,
  };
}

export function normalizeEssentialList(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item?.id).map(normalizeEssentialItem);
}

export function addEssentialProduct(items, product) {
  const safeItems = normalizeEssentialList(items);
  if (!product?.id || safeItems.some((item) => item.id === product.id)) {
    return { items: safeItems, added: false };
  }
  return { items: [...safeItems, normalizeEssentialItem(product)], added: true };
}

export function updateEssentialQuantity(items, productId, quantity) {
  const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  return normalizeEssentialList(items).map((item) =>
    item.id === productId ? { ...item, cantidad: safeQuantity } : item
  );
}

export function buildEssentialsText(items, vanName, date = new Date()) {
  const safeItems = normalizeEssentialList(items);
  const formattedDate = date.toLocaleDateString("es-PR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const header = `📋 LISTA DE COMPRAS ESENCIALES${vanName ? " — " + vanName : ""}\n📅 ${formattedDate}\n${"─".repeat(38)}`;
  const lines = safeItems.map((item, index) => {
    const parts = [
      `${index + 1}. ${item.nombre}`,
      `   Cantidad: ${item.cantidad}`,
      item.marca ? `   Marca: ${item.marca}` : null,
      item.size ? `   Tamaño: ${item.size}` : null,
      item.codigo ? `   Código: ${item.codigo}` : null,
      item.notas ? `   Nota: ${item.notas}` : null,
    ].filter(Boolean);
    return parts.join("\n");
  });
  return [header, ...lines, "─".repeat(38)].join("\n\n");
}
