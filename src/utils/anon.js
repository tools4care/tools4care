// src/utils/anon.js
export function getAnonId() {
  try {
    let id = localStorage.getItem("anon_id");
    if (!id) {
      const part = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
      id = `anon_${part}_${Date.now().toString(36)}`;
      localStorage.setItem("anon_id", id);
    }
    return id;
  } catch {
    // Fallback si localStorage no está disponible
    return "anon_" + Date.now().toString(36);
  }
}
