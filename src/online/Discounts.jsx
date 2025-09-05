// src/online/Discounts.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function OnlineDiscounts() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ code: "", percent: 0 });

  async function loadCodes() {
    setLoading(true);
    const { data, error } = await supabase
      .from("discount_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setCodes(data || []);
    setLoading(false);
  }

  async function addCode(e) {
    e.preventDefault();
    const code = (form.code || "").trim();
    const percent = Number(form.percent || 0);
    if (!code || percent <= 0) return alert("Code and % required");

    const { error } = await supabase.from("discount_codes").insert({
      code,
      percent,
    });
    if (error) return alert(error.message);
    setForm({ code: "", percent: 0 });
    loadCodes();
  }

  async function deleteCode(row) {
    if (!confirm("Delete this code?")) return;
    // intenta por id; si no existe la columna, cae por code
    try {
      if (row.id != null) {
        const { error } = await supabase.from("discount_codes").delete().eq("id", row.id);
        if (!error) return loadCodes();
      }
    } catch {}
    const { error } = await supabase.from("discount_codes").delete().eq("code", row.code);
    if (error) alert(error.message);
    loadCodes();
  }

  useEffect(() => {
    loadCodes();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              🎟️ Discount Codes
            </h1>
            <div className="text-sm text-gray-500">{codes.length} codes</div>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Crea cupones simples en % para usarlos en el checkout.
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <form onSubmit={addCode} className="flex flex-col sm:flex-row gap-2">
            <input
              className="border rounded-lg px-3 py-2 flex-1"
              placeholder="Code (e.g. CARE10)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <input
              type="number"
              className="border rounded-lg px-3 py-2 w-28"
              placeholder="%"
              value={form.percent}
              onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-white bg-gradient-to-r from-blue-600 to-blue-700 shadow-md hover:shadow-lg"
            >
              Add
            </button>
          </form>
        </div>

        {/* Listado */}
        <div className="bg-white rounded-xl shadow-lg p-0 overflow-hidden">
          {loading ? (
            <div className="p-6 text-gray-500">Loading…</div>
          ) : codes.length === 0 ? (
            <div className="p-6 text-gray-500">No discount codes created yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100/80 text-gray-700">
                  <tr>
                    <th className="p-3 text-left">Code</th>
                    <th className="p-3 text-center">%</th>
                    <th className="p-3 text-left">Created</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {codes.map((c) => (
                    <tr key={c.id ?? c.code}>
                      <td className="p-3 font-mono">{c.code}</td>
                      <td className="p-3 text-center">{Number(c.percent || 0)}%</td>
                      <td className="p-3">
                        {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => deleteCode(c)}
                          className="px-3 py-1.5 rounded-lg border text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
