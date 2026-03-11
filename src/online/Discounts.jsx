// src/online/Discounts.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="Copiar código"
      className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
        copied
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700"
      }`}
    >
      {copied ? (
        <span className="flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copiado
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copiar
        </span>
      )}
    </button>
  );
}

export default function OnlineDiscounts() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ code: "", percent: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // id or code

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
    const code = (form.code || "").trim().toUpperCase();
    const percent = Number(form.percent || 0);
    if (!code || percent <= 0 || percent > 100) return;

    setSaving(true);
    const { error } = await supabase.from("discount_codes").insert({ code, percent });
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setForm({ code: "", percent: "" });
    loadCodes();
  }

  async function deleteCode(row) {
    const key = row.id ?? row.code;
    setDeletingId(key);
    try {
      if (row.id != null) {
        const { error } = await supabase.from("discount_codes").delete().eq("id", row.id);
        if (!error) {
          loadCodes();
          return;
        }
      }
      const { error } = await supabase.from("discount_codes").delete().eq("code", row.code);
      if (error) alert(error.message);
      loadCodes();
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  }

  useEffect(() => {
    loadCodes();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cupones de descuento</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {codes.length} {codes.length === 1 ? "cupón activo" : "cupones activos"}
            </p>
          </div>
        </div>

        {/* Add form */}
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="text-sm font-semibold text-gray-700 mb-3">Crear nuevo cupón</div>
          <form onSubmit={addCode} className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <input
                className="w-full border rounded-xl px-3 py-2.5 font-mono uppercase text-sm placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Código (ej: CARE10)"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                maxLength={30}
                required
              />
            </div>
            <div className="relative w-full sm:w-36">
              <input
                type="number"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                placeholder="% descuento"
                value={form.percent}
                min={1}
                max={100}
                step={1}
                onChange={(e) => setForm({ ...form, percent: e.target.value })}
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                %
              </span>
            </div>
            <button
              type="submit"
              disabled={saving || !form.code || !form.percent}
              className="px-5 py-2.5 rounded-xl text-white bg-gray-900 hover:bg-black font-medium text-sm disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-18 0" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              )}
              Crear
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-2">
            Los cupones aplican un descuento porcentual sobre el subtotal al hacer checkout.
          </p>
        </div>

        {/* Codes list */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <svg className="animate-spin mx-auto text-gray-400 mb-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-18 0" />
              </svg>
              <div className="text-sm text-gray-400">Cargando cupones…</div>
            </div>
          ) : codes.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                  <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div className="text-sm font-medium text-gray-600">Sin cupones creados</div>
              <div className="text-xs text-gray-400 mt-1">Crea tu primer cupón arriba.</div>
            </div>
          ) : (
            <div className="divide-y">
              {codes.map((c) => {
                const key = c.id ?? c.code;
                const isPendingDelete = confirmDelete === key;
                const isDeleting = deletingId === key;
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between px-5 py-4 transition-colors ${
                      isPendingDelete ? "bg-red-50" : "hover:bg-gray-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Code pill */}
                      <div className="flex items-center gap-1.5 bg-gray-900 text-white rounded-lg px-3 py-1.5 font-mono text-sm font-semibold tracking-wider">
                        {c.code}
                      </div>
                      {/* Discount badge */}
                      <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-sm font-semibold">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {Number(c.percent || 0)}% OFF
                      </div>
                      <div className="text-xs text-gray-400 hidden sm:block">
                        {c.created_at
                          ? new Date(c.created_at).toLocaleDateString("es-MX", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <CopyButton text={c.code} />

                      {isPendingDelete ? (
                        <>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1 rounded-lg text-xs border bg-white text-gray-600 hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => deleteCode(c)}
                            disabled={isDeleting}
                            className="px-2 py-1 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 font-medium"
                          >
                            {isDeleting ? "…" : "Confirmar"}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(key)}
                          className="px-2 py-1 rounded-lg text-xs border text-red-500 border-red-200 hover:bg-red-50 transition-colors"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
