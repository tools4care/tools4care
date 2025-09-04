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
      .select("code, percent, created_at")
      .order("created_at", { ascending: false });
    if (!error) setCodes(data || []);
    setLoading(false);
  }

  async function addCode(e) {
    e.preventDefault();
    const upc = String(form.code || "").trim().toUpperCase();
    const pct = Number(form.percent || 0);
    if (!upc || pct <= 0) return alert("Code and % required");

    // evita duplicados del mismo code
    const { error } = await supabase
      .from("discount_codes")
      .upsert({ code: upc, percent: pct }, { onConflict: "code" });

    if (error) return alert(error.message);
    setForm({ code: "", percent: 0 });
    loadCodes();
  }

  async function deleteCode(code) {
    if (!confirm("Delete this code?")) return;
    const upc = String(code || "").toUpperCase();
    const { error } = await supabase.from("discount_codes").delete().eq("code", upc);
    if (error) return alert(error.message);
    loadCodes();
  }

  useEffect(() => {
    loadCodes();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Discount Codes</h1>

      <form onSubmit={addCode} className="flex gap-2 mb-6">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Code"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <input
          type="number"
          className="border rounded px-3 py-2 w-28"
          placeholder="%"
          value={form.percent}
          onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })}
        />
        <button type="submit" className="bg-blue-600 text-white px-4 rounded">
          Add
        </button>
      </form>

      {loading ? (
        <div>Loading…</div>
      ) : codes.length === 0 ? (
        <div className="text-gray-500">No discount codes created yet.</div>
      ) : (
        <table className="w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Code</th>
              <th className="p-2">%</th>
              <th className="p-2">Created</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.code} className="border-t">
                <td className="p-2">{c.code}</td>
                <td className="p-2 text-center">{Number(c.percent || 0)}%</td>
                <td className="p-2">
                  {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
                </td>
                <td className="p-2 text-right">
                  <button
                    onClick={() => deleteCode(c.code)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
