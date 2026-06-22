export function normalizeSearchTerm(value) {
  return String(value || "").trim();
}

export function compactSearchTerm(value) {
  return normalizeSearchTerm(value).replace(/\s+/g, "");
}

export function digitsOnly(value) {
  return compactSearchTerm(value).replace(/\D/g, "");
}

export function isCodeLikeSearch(value) {
  const compact = compactSearchTerm(value);
  if (!compact) return false;
  const digits = digitsOnly(compact);
  if (digits.length >= 4 && digits.length >= compact.length - 2) return true;
  return compact.length >= 6 && /^[a-z0-9._-]+$/i.test(compact);
}

export function barcodeVariants(value) {
  const rawCompact = compactSearchTerm(value);
  const compact = rawCompact.toLowerCase();
  const digits = digitsOnly(compact);
  const variants = [];

  const add = (v) => {
    const clean = String(v || "").trim();
    if (clean && !variants.includes(clean)) variants.push(clean);
  };

  add(rawCompact);
  add(compact);
  add(rawCompact.toUpperCase());
  add(digits);

  const strippedCompact = compact.replace(/^0+/, "");
  const strippedDigits = digits.replace(/^0+/, "");
  add(strippedCompact);
  add(strippedDigits);

  const base = strippedDigits || strippedCompact || compact;
  if (base && base !== "0") {
    add(`0${base}`);
    add(`00${base}`);
  }

  return variants;
}

export function productPayload(row) {
  return row?.productos || row?.producto || row || {};
}

export function productCode(row) {
  const p = productPayload(row);
  return String(p.codigo || row?.codigo || "").trim().toLowerCase();
}

export function productName(row) {
  const p = productPayload(row);
  return String(p.nombre || row?.nombre || "").trim().toLowerCase();
}

export function productBrand(row) {
  const p = productPayload(row);
  return String(p.marca || row?.marca || "").trim().toLowerCase();
}

export function productRowId(row) {
  const p = productPayload(row);
  return row?.producto_id || p.id || row?.id || productCode(row);
}

export function productQty(row) {
  return Number(row?.cantidad ?? row?.stock ?? 0);
}

export function scoreProductRow(row, term) {
  const normalized = normalizeSearchTerm(term).toLowerCase();
  const compact = compactSearchTerm(term).toLowerCase();
  const variants = barcodeVariants(term);
  const code = productCode(row);
  const name = productName(row);
  const brand = productBrand(row);

  if (code && variants.includes(code)) return 0;
  if (code && variants.some((v) => code.startsWith(v))) return 1;
  if (code && variants.some((v) => code.includes(v))) return 2;
  if (name && name.includes(normalized)) return 3;
  if (brand && brand.includes(normalized)) return 4;
  if (compact && `${name}${brand}`.includes(compact)) return 5;
  return null;
}

export function filterProductRowsLocal(rows, term, options = {}) {
  const { inStockOnly = false, limit = 50 } = options;
  const scored = [];
  const seen = new Set();

  (rows || []).forEach((row, index) => {
    if (inStockOnly && productQty(row) <= 0) return;
    const score = scoreProductRow(row, term);
    if (score === null) return;

    const id = productRowId(row);
    if (seen.has(id)) return;
    seen.add(id);
    scored.push({ row, score, index });
  });

  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.row);
}

export function hasExactCodeMatch(rows, term) {
  const variants = barcodeVariants(term);
  return (rows || []).some((row) => variants.includes(productCode(row)));
}
