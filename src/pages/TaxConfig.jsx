// src/pages/TaxConfig.jsx
// Módulo de configuración de impuestos + reporte de ventas con tax

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { useVan } from "../hooks/VanContext";
import { useToast } from "../hooks/useToast";

const fmt = (n) =>
  (Number(n) || 0).toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "7d",    label: "7 días" },
  { key: "30d",   label: "30 días" },
  { key: "month", label: "Este mes" },
];

function getPeriodRange(key) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (key === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (key === "7d") {
    return { start: new Date(now.getTime() - 7 * 86400000), end };
  }
  if (key === "30d") {
    return { start: new Date(now.getTime() - 30 * 86400000), end };
  }
  if (key === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end };
  }
  return { start: null, end };
}

// ── Storage: persist tax settings in localStorage ──
const TAX_KEY = "tools4care_tax_config";
function loadTaxConfig() {
  try {
    const raw = localStorage.getItem(TAX_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { rate: 0, enabled: false, name: "Sales Tax", includeInPrice: false };
}
function saveTaxConfig(cfg) {
  localStorage.setItem(TAX_KEY, JSON.stringify(cfg));
}

function StatCard({ label, value, sub, color = "blue" }) {
  const colors = {
    blue:   "from-blue-500 to-indigo-600",
    green:  "from-emerald-500 to-teal-600",
    amber:  "from-amber-400 to-orange-500",
    purple: "from-purple-500 to-pink-500",
    red:    "from-red-500 to-rose-600",
  };
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4">
      <div className={`inline-flex w-9 h-9 rounded-xl bg-gradient-to-br ${colors[color]} items-center justify-center mb-3`} />
      <div className="text-xl font-extrabold text-gray-900">{value}</div>
      <div className="text-sm font-medium text-gray-600">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function TaxConfig() {
  const { van } = useVan();
  const { toast } = useToast();

  // ── Tax settings ──
  const [config, setConfig] = useState(loadTaxConfig);
  const [saving, setSaving]  = useState(false);

  // ── Report ──
  const [period, setPeriod]   = useState("month");
  const [loading, setLoading] = useState(false);
  const [ventas, setVentas]   = useState([]);

  // Load sales for selected period
  const loadVentas = useCallback(async (p = period) => {
    if (!van?.id) return;
    setLoading(true);
    try {
      const { start, end } = getPeriodRange(p);
      let q = supabase
        .from("ventas")
        .select("id,fecha,total,pago_efectivo,pago_tarjeta,pago_transferencia,pago_otro,estado_pago")
        .eq("van_id", van.id)
        .eq("tipo", "venta")
        .order("fecha", { ascending: false })
        .limit(5000);
      if (start) q = q.gte("fecha", start.toISOString());
      if (end)   q = q.lte("fecha", end.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      setVentas(data || []);
    } catch (e) {
      toast.error("Error cargando ventas: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [van?.id, period, toast]);

  useEffect(() => { loadVentas(period); }, [period, van?.id]);

  // ── Tax calculations ──
  const report = useMemo(() => {
    const rate = config.enabled ? (Number(config.rate) || 0) / 100 : 0;
    let subtotal = 0, taxTotal = 0, grandTotal = 0;

    ventas.forEach((v) => {
      const total = Number(v.total || 0);
      if (config.includeInPrice) {
        // Tax included in price: subtotal = total / (1 + rate)
        const sub = rate > 0 ? total / (1 + rate) : total;
        const tax = total - sub;
        subtotal   += sub;
        taxTotal   += tax;
        grandTotal += total;
      } else {
        // Tax on top
        const tax = total * rate;
        subtotal   += total;
        taxTotal   += tax;
        grandTotal += total + tax;
      }
    });

    return {
      subtotal: Number(subtotal.toFixed(2)),
      taxTotal: Number(taxTotal.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
      count: ventas.length,
      avgTax: ventas.length ? Number((taxTotal / ventas.length).toFixed(2)) : 0,
    };
  }, [ventas, config]);

  const handleSave = () => {
    const rate = parseFloat(config.rate);
    if (isNaN(rate) || rate < 0 || rate > 99) {
      toast.error("La tasa debe estar entre 0% y 99%");
      return;
    }
    setSaving(true);
    saveTaxConfig({ ...config, rate });
    setTimeout(() => {
      setSaving(false);
      toast.success("Configuración de impuesto guardada");
    }, 300);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Impuestos / Tax</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configura la tasa de impuesto y visualiza el reporte de tax por período.
          </p>
        </div>

        {/* Config card */}
        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-lg">Configuración</h2>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                className={`relative w-11 h-6 rounded-full transition-colors ${config.enabled ? "bg-blue-600" : "bg-gray-300"}`}
                onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.enabled ? "translate-x-5" : ""}`} />
              </div>
              <span className="text-sm font-semibold text-gray-700">
                {config.enabled ? "Activo" : "Desactivado"}
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del impuesto
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={config.name}
                onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
                placeholder="Sales Tax / IVA / GST..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tasa (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="99"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-10"
                  value={config.rate}
                  onChange={(e) => setConfig((c) => ({ ...c, rate: e.target.value }))}
                  placeholder="8.25"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <input
              type="checkbox"
              id="includeInPrice"
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
              checked={config.includeInPrice}
              onChange={(e) => setConfig((c) => ({ ...c, includeInPrice: e.target.checked }))}
            />
            <label htmlFor="includeInPrice" className="text-sm text-amber-800 font-medium cursor-pointer">
              El impuesto ya está incluido en el precio de venta (tax-inclusive)
            </label>
          </div>

          {config.enabled && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
              <strong>Preview:</strong> Una venta de $100.00 →{" "}
              {config.includeInPrice
                ? `subtotal ${fmt(100 / (1 + (parseFloat(config.rate) || 0) / 100))} + ${config.name} ${fmt(100 - 100 / (1 + (parseFloat(config.rate) || 0) / 100))}`
                : `subtotal $100.00 + ${config.name} ${fmt(100 * ((parseFloat(config.rate) || 0) / 100))} = ${fmt(100 * (1 + (parseFloat(config.rate) || 0) / 100))}`
              }
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
          >
            {saving ? "Guardando..." : "💾 Guardar configuración"}
          </button>
        </div>

        {/* Report */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b">
            <h2 className="font-semibold text-gray-900 text-lg">
              Reporte de {config.enabled ? config.name : "Ventas"}
            </h2>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl border bg-gray-50 overflow-hidden">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                      period === p.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => loadVentas(period)}
                disabled={loading}
                className="p-1.5 rounded-xl border bg-gray-50 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <svg className={loading ? "animate-spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="p-5">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[0,1,2,3].map((i) => (
                  <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <StatCard label="Ventas" value={report.count} sub="transacciones" color="blue" />
                <StatCard label="Subtotal" value={fmt(report.subtotal)} sub="antes de tax" color="green" />
                <StatCard label={config.name || "Tax"} value={fmt(report.taxTotal)} sub={`${config.rate || 0}% tasa`} color="amber" />
                <StatCard label="Total con Tax" value={fmt(report.grandTotal)} sub="ingresos totales" color="purple" />
              </div>
            )}

            {/* Breakdown table */}
            {!loading && ventas.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">🧾</div>
                <div className="text-gray-500 font-semibold">Sin ventas en este período</div>
                <div className="text-sm text-gray-400 mt-1">
                  Cambia el filtro de período para ver más datos
                </div>
              </div>
            ) : !loading && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-xs font-bold text-gray-500 uppercase">Fecha</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-gray-500 uppercase">Subtotal</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-gray-500 uppercase">{config.name || "Tax"}</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ventas.slice(0, 50).map((v) => {
                      const total = Number(v.total || 0);
                      const rate  = config.enabled ? (Number(config.rate) || 0) / 100 : 0;
                      const sub   = config.includeInPrice && rate > 0 ? total / (1 + rate) : total;
                      const tax   = config.includeInPrice && rate > 0 ? total - sub : total * rate;
                      const grand = config.includeInPrice ? total : total + tax;
                      return (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-700">
                            {new Date(v.fecha).toLocaleDateString("es-MX", {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                            })}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-700">{fmt(sub)}</td>
                          <td className="py-2 px-3 text-right text-amber-600 font-medium">{fmt(tax)}</td>
                          <td className="py-2 px-3 text-right font-semibold text-gray-900">{fmt(grand)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {ventas.length > 50 && (
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="py-2 px-3 text-center text-xs text-gray-400">
                          Mostrando 50 de {ventas.length} registros — usa filtro de período para acotar
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
