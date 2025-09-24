// src/lib/cxcApi.js
const API_BASE = import.meta.env.VITE_CXC_API_BASE || "https://cxc-api.onrender.com";

export async function makeReminder({ cliente, saldo, limite, disponible, total_cxc, signal }) {
  const res = await fetch(`${API_BASE}/reminder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ cliente, saldo, limite, disponible, total_cxc }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || "API error");
  // El endpoint devuelve { ok, message }
  return json.message;
}
