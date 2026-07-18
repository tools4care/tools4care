export function normalizeClientTerm(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return normalizeClientTerm(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function includesAllTokens(haystack, tokens) {
  if (!tokens.length) return false;
  return tokens.every((token) => haystack.includes(token));
}

function startsWithAnyWord(haystack, term) {
  return haystack
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => word.startsWith(term));
}

export function clientDigits(value) {
  return normalizeClientTerm(value).replace(/\D/g, "");
}

export function canonicalPhoneDigits(value) {
  const digits = clientDigits(value);
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
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
  if (digits.length >= 4 && digits.length < 7) add(digits.slice(-4));

  return variants;
}

export async function findClientIdsByPhone(db, value, limit = 100) {
  const digits = canonicalPhoneDigits(value);
  if (!db || digits.length < 3 || !isPhoneLikeSearch(value)) return [];

  const { data, error } = await db.rpc("buscar_clientes_por_telefono", {
    p_busqueda: value,
    p_limite: limit,
  });
  if (error) {
    console.warn("Normalized phone search unavailable:", error.message || error);
    return [];
  }

  return [...new Set((data || []).map((row) => row?.cliente_id).filter(Boolean))];
}

export function phoneIdFilter(column, ids) {
  const safeIds = (ids || []).filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))
  );
  return safeIds.length ? `${column}.in.(${safeIds.join(",")})` : "";
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
  const safe = normalizeText(term);
  const digits = canonicalPhoneDigits(term);
  const phoneDigits = canonicalPhoneDigits(client?.telefono);
  const variants = phoneSearchVariants(term)
    .map(clientDigits)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (digits && phoneDigits) {
    if (phoneDigits === digits || variants.includes(phoneDigits)) return 0;
    const startsMatch = variants.find((v) => phoneDigits.startsWith(v));
    const includesMatch = variants.find((v) => phoneDigits.includes(v));
    const bestPhoneMatch = [startsMatch, includesMatch]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0];
    if (bestPhoneMatch) {
      const positionPenalty = phoneDigits.startsWith(bestPhoneMatch) ? 0 : 0.01;
      return 1 + (20 - bestPhoneMatch.length) / 100 + positionPenalty;
    }
  }

  const name = normalizeText(client?.nombre);
  const business = normalizeText(client?.negocio || client?.nombre_negocio);
  const email = normalizeText(client?.email);
  const address = normalizeText(addressText(client?.direccion));
  const credit = normalizeText(client?.credito_numero || client?.cliente_id || client?.id);
  const combined = [name, business, email, address, credit].filter(Boolean).join(" ");
  const tokens = tokensOf(safe);

  if (name === safe) return 2;
  if (business === safe) return 2.2;
  if (name.startsWith(safe)) return 2.4;
  if (business.startsWith(safe)) return 2.6;
  if (tokens.length >= 2 && includesAllTokens(name, tokens)) return 2.8;
  if (tokens.length >= 2 && includesAllTokens(business, tokens)) return 3;
  if (tokens.length >= 2 && includesAllTokens(combined, tokens)) return 3.2;
  if (startsWithAnyWord(name, safe)) return 3.4;
  if (name.includes(safe)) return 3.8;
  if (startsWithAnyWord(business, safe)) return 4;
  if (business.includes(safe)) return 4.4;
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
