function cleanPart(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function canonicalAddress(value) {
  let source = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) source = {};
    else {
      try {
        source = JSON.parse(trimmed);
      } catch {
        source = { calle: trimmed };
      }
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) source = {};

  return {
    calle: cleanPart(source.calle),
    ciudad: cleanPart(source.ciudad),
    estado: cleanPart(source.estado).toUpperCase(),
    zip: cleanPart(source.zip),
  };
}

export function serializeCanonicalAddress(value) {
  const normalized = canonicalAddress(value);
  return Object.values(normalized).some(Boolean) ? JSON.stringify(normalized) : null;
}
