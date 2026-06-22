export function normalizeClientTerm(value) {
  return String(value || "").trim();
}

export function clientDigits(value) {
  return normalizeClientTerm(value).replace(/\D/g, "");
}

export function isPhoneLikeSearch(value) {
  const term = normalizeClientTerm(value);
  const digits = clientDigits(term);
  if (!digits) return false;
  if (digits.length >= 4 && digits.length >= term.replace(/\s+/g, "").length - 2) return true;
  return digits.length >= 7;
}

export function phoneSearchVariants(value) {
  const digits = clientDigits(value);
  if (!digits) return [];
  const variants = [];
  const add = (v) => {
    const clean = String(v || "").trim();
    if (clean && !variants.includes(clean)) variants.push(clean);
  };

  add(digits);
  if (digits.length === 10) {
    add(`1${digits}`);
    add(`+1${digits}`);
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    add(digits.slice(1));
    add(`+${digits}`);
  }
  if (digits.length >= 7) add(digits.slice(-7));
  if (digits.length >= 4) add(digits.slice(-4));
  if (digits.length >= 3) add(digits.slice(0, 3));

  return variants;
}

export function addressText(direccion) {
  if (!direccion) return "";
  if (typeof direccion === "string") return direccion;
  return [
    direccion.calle,
    direccion.ciudad,
    direccion.estado,
    direccion.zip,
  ].filter(Boolean).join(" ");
}

export function clientSearchScore(client, term) {
  const safe = normalizeClientTerm(term).toLowerCase();
  const digits = clientDigits(term);
  const phoneDigits = clientDigits(client?.telefono);
  const variants = phoneSearchVariants(term).map(clientDigits).filter(Boolean);

  if (digits && phoneDigits) {
    if (phoneDigits === digits || variants.includes(phoneDigits)) return 0;
    if (variants.some((v) => phoneDigits.startsWith(v))) return 1;
    if (variants.some((v) => phoneDigits.includes(v))) return 2;
  }

  const name = String(client?.nombre || "").toLowerCase();
  const business = String(client?.negocio || client?.nombre_negocio || "").toLowerCase();
  const email = String(client?.email || "").toLowerCase();
  const address = addressText(client?.direccion).toLowerCase();
  const credit = String(client?.credito_numero || client?.cliente_id || client?.id || "").toLowerCase();

  if (name.includes(safe)) return 3;
  if (business.includes(safe)) return 4;
  if (email.includes(safe)) return 5;
  if (address.includes(safe)) return 6;
  if (credit.includes(safe)) return 7;
  return null;
}

export function filterClientsLocal(clients, term, limit = 30) {
  const scored = [];
  const seen = new Set();

  (clients || []).forEach((client, index) => {
    const score = clientSearchScore(client, term);
    if (score === null) return;
    const id = client?.id || client?.cliente_id || `${client?.telefono || ""}:${client?.nombre || ""}`;
    if (seen.has(id)) return;
    seen.add(id);
    scored.push({ client, score, index });
  });

  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.client);
}
