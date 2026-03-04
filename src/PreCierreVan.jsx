// src/PreCierreVan.jsx - Corregido con Eastern Time y sin duplicación
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DollarSign, FileText, Download, RefreshCw, CheckCircle, AlertCircle,
  Calculator, Calendar, TrendingUp, AlertTriangle, X, Plus, Minus, Send, MoreHorizontal, CreditCard,
  Search, History, Eye, Printer, ChevronLeft, ChevronRight
} from "lucide-react";

/* ========================= Constants ========================= */
const PAYMENT_METHODS = {
  efectivo: { label: "Cash", color: "#4CAF50", icon: "💵" },
  tarjeta: { label: "Card", color: "#2196F3", icon: "💳" },
  transferencia: { label: "Transfer", color: "#9C27B0", icon: "🏦" },
  otro: { label: "Other", color: "#FF9800", icon: "💰" },
};

/* ========================= Helpers de fecha / formato (Eastern Time) ==================== */

// Función para obtener fecha actual en Eastern Time
function getEasternDate(date = new Date()) {
  return new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

// Función para formatear fecha como YYYY-MM-DD en Eastern Time
function easternToYMD(date) {
  const eastern = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const y = eastern.getFullYear();
  const m = String(eastern.getMonth() + 1).padStart(2, "0");
  const d = String(eastern.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Función para obtener inicio y fin del día en Eastern Time
function easternDayBounds(isoDay) {
  if (!isoDay) return { start: "", end: "" };
  
  // Crear un objeto Date para la fecha en Eastern Time
  const date = new Date(isoDay + "T00:00:00");
  
  // Obtener el inicio del día en Eastern Time (00:00:00)
  const easternStart = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  easternStart.setHours(0, 0, 0, 0);
  
  // Obtener el fin del día en Eastern Time (23:59:59.999)
  const easternEnd = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  easternEnd.setHours(23, 59, 59, 999);
  
  // Convertir a UTC para la consulta
  const start = easternStart.toISOString();
  const end = easternEnd.toISOString();
  
  return { start, end };
}

// Formato US MM/DD/YYYY a partir de 'YYYY-MM-DD'
function formatUS(isoDay) {
  if (!isoDay) return "—";
  const [y, m, d] = String(isoDay).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  const dt = new Date(y, m - 1, d); // local
  return dt.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// 'YYYY-MM-DD' del día local actual (Eastern Time)
function localTodayISO() {
  return easternToYMD(new Date());
}

/* ========================= Custom Hook ========================= */

function usePrecloseRows(vanId, diasAtras = 21) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!vanId) {
      setRows([]);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const hoy = new Date();
        const desde = new Date(hoy);
        desde.setDate(hoy.getDate() - (diasAtras - 1));

        const p_from = desde.toISOString().slice(0, 10);
        const p_to = hoy.toISOString().slice(0, 10);

        console.log("📅 Fetching pre-close rows for van:", vanId, "from:", p_from, "to:", p_to);

        // Obtener las fechas que ya tienen cierres
        const { data: cierres, error: cierresError } = await supabase
          .from('cierres_dia')
          .select('fecha')
          .eq('van_id', vanId)
          .gte('fecha', p_from)
          .lte('fecha', p_to);

        if (cierresError) {
          console.error("❌ Error fetching closures", cierresError);
          throw new Error(cierresError.message);
        }

        const fechasConCierre = new Set(cierres?.map(c => c.fecha) || []);
        console.log("🔒 Fechas con cierre:", Array.from(fechasConCierre));

        // ✅ Llamar al RPC que calcula correctamente sin duplicación
        const { data, error: rpcError } = await supabase.rpc(
          "closeout_pre_resumen_filtrado",
          {
            p_van_id: vanId,
            p_from,
            p_to,
          }
        );

        if (rpcError) {
          console.error("❌ RPC error:", rpcError);
          throw new Error(rpcError.message);
        }

        console.log("✅ RPC data received:", data);

        // Procesar y normalizar los datos
        const normalized = (data ?? [])
          .map((r) => {
            const iso = r.dia ?? r.fecha ?? r.day ?? r.f ?? null;
            return {
              dia: typeof iso === "string" ? iso.slice(0, 10) : null,
              cash_expected: Number(r.cash_expected ?? r.cash ?? 0),
              card_expected: Number(r.card_expected ?? r.card ?? 0),
              transfer_expected: Number(r.transfer_expected ?? r.transfer ?? 0),
              mix_unallocated: Number(r.mix_unallocated ?? r.mix ?? 0),
            };
          })
          // Filtrar días sin transacciones o que ya tienen cierre
          .filter((r) => {
            const total = r.cash_expected + r.card_expected + r.transfer_expected + r.mix_unallocated;
            const isValid = r.dia && /^\d{4}-\d{2}-\d{2}$/.test(r.dia);
            const hasCierre = fechasConCierre.has(r.dia);
            const hasTransactions = total > 0;
            
            if (isValid && !hasCierre && hasTransactions) {
              console.log(`✅ Día válido: ${r.dia} - Total: $${total.toFixed(2)}`);
              return true;
            }
            
            if (isValid && hasCierre) {
              console.log(`🔒 Día omitido (ya cerrado): ${r.dia}`);
            }
            
            return false;
          });

        // Ordenar por fecha descendente (más reciente primero)
        normalized.sort((a, b) => (a.dia < b.dia ? 1 : -1));
        
        console.log(`📊 Total de días pendientes: ${normalized.length}`);
        setRows(normalized);
      } catch (err) {
        console.error("❌ Error in fetchData:", err);
        setError(err.message);
        setRows([]);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      alive = false;
    };
  }, [vanId, diasAtras]);

  return { rows, loading, error };
}

/* ========================= Helper Functions ========================= */
const fmtCurrency = (n) => {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getPaymentMethodColor = (method) => {
  return PAYMENT_METHODS[method]?.color || "#9E9E9E";
};

const getPaymentMethodLabel = (method) => {
  return PAYMENT_METHODS[method]?.label || method;
};

/* ========================= Historial / Búsqueda de Cierres ========================= */

// Preview modal: shows closure details for a date range (read-only)
function CierrePreviewModal({ van, usuario, previewData, onClose }) {
  const { ventas = [], pagos = [], fechas = [], resumen = {} } = previewData || {};

  const byMethod = useMemo(() => {
    const map = { efectivo: 0, tarjeta: 0, transferencia: 0, otro: 0 };
    ventas.forEach((v) => {
      const m = (v.metodo_pago || "otro").toLowerCase();
      const key = Object.keys(map).find((k) => m.includes(k)) || "otro";
      map[key] += Number(v.total_pagado || v.total_venta || 0);
    });
    pagos.forEach((p) => {
      const m = (p.metodo || "otro").toLowerCase();
      const key = Object.keys(map).find((k) => m.includes(k)) || "otro";
      map[key] += Number(p.monto || 0);
    });
    return map;
  }, [ventas, pagos]);

  const grandTotal = Object.values(byMethod).reduce((a, b) => a + b, 0);

  // Transfer sub-method breakdown (Zelle, CashApp, Venmo, Apple Pay)
  const transferSubTotals = useMemo(() => {
    const map = { zelle: 0, cashapp: 0, venmo: 0, applepay: 0, other: 0 };
    ventas.forEach((v) => {
      const td = v.pago?.transferencia_detalle;
      if (!td) return;
      for (const k of Object.keys(map)) {
        map[k] = Number((map[k] + Number(td[k] || 0)).toFixed(2));
      }
    });
    return map;
  }, [ventas]);

  const TRANSFER_SUB_LABELS = {
    zelle:    { label: "Zelle",     icon: "⚡", color: "bg-purple-100 text-purple-800 border-purple-200", dot: "bg-purple-500", bar: "bg-purple-500" },
    cashapp:  { label: "Cash App",  icon: "💚", color: "bg-green-100  text-green-800  border-green-200",  dot: "bg-green-500",  bar: "bg-green-500"  },
    venmo:    { label: "Venmo",     icon: "💙", color: "bg-blue-100   text-blue-800   border-blue-200",   dot: "bg-blue-500",   bar: "bg-blue-500"   },
    applepay: { label: "Apple Pay", icon: "🍎", color: "bg-gray-100   text-gray-800   border-gray-300",   dot: "bg-gray-700",   bar: "bg-gray-700"   },
    other:    { label: "Other",     icon: "💸", color: "bg-amber-100  text-amber-800  border-amber-200",  dot: "bg-amber-500",  bar: "bg-amber-500"  },
  };

  const handlePrint = () => {
    const content = document.getElementById("cierre-preview-content");
    if (!content) return;
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>Closure Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #222; }
        h1 { font-size: 18px; color: #1d4ed8; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #374151; margin: 12px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th { background: #1d4ed8; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
        td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
        tr:nth-child(even) td { background: #f9fafb; }
        .summary-row { background: #eff6ff !important; font-weight: bold; }
        .total-row { background: #dbeafe !important; font-weight: bold; font-size: 13px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: bold; }
        .badge-green { background: #d1fae5; color: #065f46; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .meta { color: #6b7280; font-size: 11px; margin-bottom: 16px; }
        .method-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 16px; }
        .method-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; text-align: center; }
        .method-card p:first-child { font-size: 10px; color: #6b7280; margin: 0 0 4px; }
        .method-card p:last-child { font-size: 16px; font-weight: bold; margin: 0; }
        @media print { body { margin: 10px; } }
      </style></head><body>
      ${content.innerHTML}
      <script>window.print(); window.close();</script>
      </body></html>
    `);
    win.document.close();
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFillColor(25, 118, 210);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Tools4Care - Closure Report", 14, 18);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    const dateRange = fechas.length ? `${formatUS(fechas[0])} - ${formatUS(fechas[fechas.length - 1])}` : "—";
    doc.text(`Period: ${dateRange} | VAN: ${van?.nombre_van || van?.nombre || "—"}`, 14, 36);
    doc.text(`User: ${usuario?.nombre || usuario?.email || "—"} | Generated: ${new Date().toLocaleString()}`, 14, 43);

    // Payment methods summary
    doc.setFontSize(12);
    doc.text("Payment Summary", 14, 54);
    autoTable(doc, {
      startY: 58,
      head: [["Method", "Amount"]],
      body: [
        ["Cash", fmtCurrency(byMethod.efectivo)],
        ["Card", fmtCurrency(byMethod.tarjeta)],
        ["Transfer", fmtCurrency(byMethod.transferencia)],
        ["Other", fmtCurrency(byMethod.otro)],
        ["TOTAL", fmtCurrency(grandTotal)],
      ],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: "bold" },
      bodyStyles: {},
      rowStyles: { 4: { fontStyle: "bold", fillColor: [219, 234, 254] } },
    });

    // Sales table
    doc.setFontSize(12);
    doc.text("Sales Detail", 14, doc.lastAutoTable.finalY + 12);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 16,
      head: [["Time", "Client", "Seller", "Method", "Total", "Paid", "Status"]],
      body: ventas.map((v) => [
        new Date(v.created_at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }),
        v.clientes?.nombre || "—",
        v.usuarios?.nombre || "—",
        v.metodo_pago || "—",
        fmtCurrency(v.total_venta),
        fmtCurrency(v.total_pagado),
        v.estado_pago || "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [75, 85, 99], textColor: 255 },
    });

    // Payments table
    if (pagos.length > 0) {
      doc.setFontSize(12);
      doc.text("Direct Payments", 14, doc.lastAutoTable.finalY + 12);
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 16,
        head: [["Time", "Client", "Method", "Amount"]],
        body: pagos.map((p) => [
          new Date(p.created_at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }),
          p.clientes?.nombre || "—",
          p.metodo || "—",
          fmtCurrency(p.monto),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [75, 85, 99], textColor: 255 },
      });
    }

    doc.save(`Closure_${van?.nombre_van || "VAN"}_${fechas[0] || "report"}.pdf`);
  };

  if (!previewData) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl">
          <div>
            <h2 className="text-white text-lg font-bold flex items-center gap-2">
              <FileText size={20} /> Closure Preview
            </h2>
            <p className="text-blue-100 text-xs mt-0.5">
              {fechas.length ? `${formatUS(fechas[0])} – ${formatUS(fechas[fechas.length - 1])}` : "—"}
              &nbsp;·&nbsp; {ventas.length} sales &nbsp;·&nbsp; {pagos.length} payments
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePDF} className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors">
              <Download size={15} /> PDF
            </button>
            <button onClick={handlePrint} className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors">
              <Printer size={15} /> Print
            </button>
            <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body - scrollable */}
        <div className="flex-1 overflow-y-auto p-6" id="cierre-preview-content">
          {/* Meta */}
          <div className="meta mb-4">
            <p className="text-sm text-gray-600">
              <strong>VAN:</strong> {van?.nombre_van || van?.nombre || "—"} &nbsp;·&nbsp;
              <strong>User:</strong> {usuario?.nombre || usuario?.email || "—"} &nbsp;·&nbsp;
              <strong>Generated:</strong> {new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}
            </p>
          </div>

          {/* Payment Summary Cards */}
          <h2 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
            <DollarSign size={16} /> Payment Summary
          </h2>
          <div className="method-grid grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "💵 Cash", key: "efectivo", color: "bg-green-50 border-green-200 text-green-800" },
              { label: "💳 Card", key: "tarjeta", color: "bg-blue-50 border-blue-200 text-blue-800" },
              { label: "🏦 Transfer", key: "transferencia", color: "bg-purple-50 border-purple-200 text-purple-800" },
              { label: "💰 Other", key: "otro", color: "bg-amber-50 border-amber-200 text-amber-800" },
            ].map(({ label, key, color }) => (
              <div key={key} className={`method-card border rounded-xl p-3 text-center ${color}`}>
                <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
                <p className="text-lg font-bold">{fmtCurrency(byMethod[key])}</p>
              </div>
            ))}
          </div>
          {/* Transfer sub-method breakdown — confirmation card */}
          {byMethod.transferencia > 0 && (() => {
            const entries = Object.entries(transferSubTotals).filter(([, v]) => v > 0);
            const trackedTotal = entries.reduce((s, [, v]) => s + v, 0);
            const untracked   = Math.max(0, byMethod.transferencia - trackedTotal);
            return (
              <div className="mb-6 rounded-2xl overflow-hidden shadow-sm border border-purple-200">
                {/* ── Card header ── */}
                <div className="bg-gradient-to-r from-purple-700 to-purple-500 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                      <span className="text-xl">🏦</span>
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm leading-tight">Transfer Breakdown</div>
                      <div className="text-purple-200 text-[11px]">Confirmed received amounts</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-extrabold text-xl leading-tight">{fmtCurrency(byMethod.transferencia)}</div>
                    <div className="text-purple-200 text-[11px]">Total transfers</div>
                  </div>
                </div>

                {/* ── Rows ── */}
                <div className="bg-white divide-y divide-purple-50">
                  {entries.length === 0 ? (
                    <div className="px-4 py-5 text-center">
                      <div className="text-2xl mb-1">📭</div>
                      <p className="text-sm text-gray-400 italic">No sub-method recorded</p>
                      <p className="text-xs text-gray-300 mt-0.5">Older sales may not include this detail</p>
                    </div>
                  ) : entries.map(([key, val]) => {
                    const meta = TRANSFER_SUB_LABELS[key] || TRANSFER_SUB_LABELS.other;
                    const pct  = byMethod.transferencia > 0 ? (val / byMethod.transferencia) * 100 : 0;
                    return (
                      <div key={key} className="px-4 py-3">
                        {/* Row top: label + amount */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">{meta.icon}</span>
                            <span className="text-sm font-semibold text-gray-800">{meta.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 tabular-nums">{pct.toFixed(1)}%</span>
                            <span className="font-bold text-gray-900 text-sm tabular-nums w-20 text-right">
                              {fmtCurrency(val)}
                            </span>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${meta.bar}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Untracked remainder */}
                  {untracked > 0.01 && (
                    <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
                        <span className="text-xs text-gray-500">No method specified</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-500 tabular-nums">{fmtCurrency(untracked)}</span>
                    </div>
                  )}
                </div>

                {/* ── Confirmation footer ── */}
                <div className="bg-purple-50 border-t border-purple-100 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-purple-700">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span className="text-xs font-semibold">
                      {entries.length > 0
                        ? `${entries.length} method${entries.length !== 1 ? "s" : ""} confirmed`
                        : "Amount received — no method detail"}
                    </span>
                  </div>
                  <span className="text-xs font-extrabold text-purple-800 tabular-nums">{fmtCurrency(byMethod.transferencia)}</span>
                </div>
              </div>
            );
          })()}

          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 mb-6 text-white text-center">
            <p className="text-sm opacity-80">Grand Total</p>
            <p className="text-3xl font-bold">{fmtCurrency(grandTotal)}</p>
          </div>

          {/* Sales Table */}
          <h2 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
            <ShoppingCartIcon size={16} /> Sales ({ventas.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 mb-6">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead className="bg-gray-700 text-white">
                <tr>
                  {["Time", "Client", "Seller", "Method", "Total", "Paid", "Status"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventas.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">No sales found</td></tr>
                ) : ventas.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 text-xs">
                      {new Date(v.created_at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{v.clientes?.nombre || "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{v.usuarios?.nombre || "—"}</td>
                    <td className="px-3 py-2">
                      {(() => {
                        const raw   = (v.metodo_pago || "").toLowerCase();
                        const meta  = PAYMENT_METHODS[raw];
                        const label = meta ? `${meta.icon} ${meta.label}` : (v.metodo_pago || "—");
                        const baseChip = raw === "transferencia"
                          ? "bg-purple-100 text-purple-800"
                          : raw === "efectivo"  ? "bg-green-100 text-green-800"
                          : raw === "tarjeta"   ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800";
                        // Sub-methods for transfer
                        const metodos   = v.pago?.metodos || [];
                        const subs      = metodos.filter(m => m.forma === "transferencia" && m.subMetodo).map(m => m.subMetodo);
                        const uniqSubs  = [...new Set(subs)];
                        return (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${baseChip}`}>{label}</span>
                            {raw === "transferencia" && uniqSubs.map((k) => {
                              const sm = TRANSFER_SUB_LABELS[k] || TRANSFER_SUB_LABELS.other;
                              return (
                                <span key={k} className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${sm.color}`}>
                                  {sm.icon} {sm.label}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{fmtCurrency(v.total_venta)}</td>
                    <td className="px-3 py-2 text-green-700 font-medium">{fmtCurrency(v.total_pagado)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        v.estado_pago === "pagado" ? "bg-green-100 text-green-800" :
                        v.estado_pago === "credito" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                      }`}>{v.estado_pago || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Direct Payments Table */}
          {pagos.length > 0 && (
            <>
              <h2 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
                <CreditCard size={16} /> Direct Payments ({pagos.length})
              </h2>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-sm divide-y divide-gray-100">
                  <thead className="bg-gray-700 text-white">
                    <tr>
                      {["Time", "Client", "Method", "Amount"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagos.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 text-xs">
                          {new Date(p.created_at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900">{p.clientes?.nombre || "—"}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">{p.metodo || "—"}</span>
                        </td>
                        <td className="px-3 py-2 font-bold text-purple-700">{fmtCurrency(p.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Small local icon alias to avoid import collision
const ShoppingCartIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);

/* ========================= Historial Tab Content ========================= */
function HistorialCierres({ van, usuario }) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  });
  const [to, setTo] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  const [clientFilter, setClientFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [cierres, setCierres] = useState([]);
  const [searched, setSearched] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const searchCierres = async () => {
    if (!van?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("cierres_dia")
        .select("*")
        .eq("van_id", van.id)
        .gte("fecha", from)
        .lte("fecha", to)
        .order("fecha", { ascending: false });
      if (err) throw err;
      setCierres(data || []);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const generatePreview = async (fechas) => {
    if (!van?.id || !fechas.length) return;
    setGenerating(true);
    setError(null);
    try {
      // Build date range
      const sorted = [...fechas].sort();
      const firstDate = sorted[0];
      const lastDate = sorted[sorted.length - 1];
      const { start } = easternDayBounds(firstDate);
      const { end } = easternDayBounds(lastDate);

      // Fetch ventas — try with usuario join first, fall back without if FK not set up
      let ventas = [];
      {
        const { data: v1, error: vErr1 } = await supabase
          .from("ventas")
          .select(`
            id, created_at, total_venta, total_pagado, estado_pago, metodo_pago, pago,
            cliente_id, clientes:cliente_id(nombre),
            usuario_id, usuarios:usuario_id(nombre)
          `)
          .eq("van_id", van.id)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });
        if (!vErr1) {
          ventas = v1 || [];
        } else {
          // Fallback: without usuarios join (some schemas don't have this FK in PostgREST)
          const { data: v2, error: vErr2 } = await supabase
            .from("ventas")
            .select(`
              id, created_at, total_venta, total_pagado, estado_pago, metodo_pago, pago,
              cliente_id, clientes:cliente_id(nombre)
            `)
            .eq("van_id", van.id)
            .gte("created_at", start)
            .lte("created_at", end)
            .order("created_at", { ascending: false });
          if (vErr2) throw vErr2;
          ventas = v2 || [];
        }
      }

      // Fetch pagos (direct payments) — metodo column name varies by schema
      let pagosRows = [];
      let pagosProbeOk = false;
      for (const col of ["metodo_pago", "metodo", "forma_pago"]) {
        const sel = `id, monto, ${col}, created_at, cliente_id, clientes:cliente_id(nombre)`;
        const { data: p, error: pErr } = await supabase
          .from("pagos")
          .select(sel)
          .eq("van_id", van.id)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });
        if (!pErr) {
          pagosRows = (p || []).map(r => ({ ...r, metodo: r[col] || "—" }));
          pagosProbeOk = true;
          break;
        }
        // if column doesn't exist (400 error), try next candidate
      }
      // If all column probes failed, fetch without metodo column
      if (!pagosProbeOk) {
        const { data: p } = await supabase
          .from("pagos")
          .select("id, monto, created_at, cliente_id, clientes:cliente_id(nombre)")
          .eq("van_id", van.id)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });
        pagosRows = (p || []).map(r => ({ ...r, metodo: "Payment" }));
      }
      const pagos = pagosRows;

      // Filter by client if set
      let filteredVentas = ventas || [];
      let filteredPagos = pagos || [];
      if (clientFilter.trim()) {
        const q = clientFilter.toLowerCase();
        filteredVentas = filteredVentas.filter((v) => (v.clientes?.nombre || "").toLowerCase().includes(q));
        filteredPagos = filteredPagos.filter((p) => (p.clientes?.nombre || "").toLowerCase().includes(q));
      }

      setPreviewData({ ventas: filteredVentas, pagos: filteredPagos, fechas, resumen: {} });
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateCustom = () => generatePreview([from, to]);
  const handleViewCierre = (cierre) => generatePreview([cierre.fecha]);

  return (
    <div>
      {/* Search filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Search size={16} /> Search Closures
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-gray-600 mb-1">Client filter (optional)</label>
            <input type="text" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
              placeholder="Filter by client name..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={searchCierres} disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
          <button onClick={handleGenerateCustom} disabled={generating}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors">
            {generating ? <RefreshCw size={14} className="animate-spin" /> : <Eye size={14} />}
            Generate & Preview
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          "Search" finds recorded closures · "Generate & Preview" shows a live report for any date range without saving
        </p>
      </div>

      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>}

      {/* Results */}
      {searched && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <History size={16} /> Recorded Closures ({cierres.length})
            </h3>
          </div>
          {cierres.length === 0 ? (
            <div className="text-center py-12">
              <History size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500 font-medium">No closures found for this period</p>
              <p className="text-gray-400 text-sm mt-1">Use "Generate & Preview" to create an on-demand report</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {["Date", "Cash", "Card", "Transfer", "Other", "Total", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cierres.map((c) => {
                    const total = Number(c.total_efectivo || c.cash || 0)
                      + Number(c.total_tarjeta || c.card || 0)
                      + Number(c.total_transferencia || c.transfer || 0)
                      + Number(c.total_otro || c.other || 0);
                    return (
                      <tr key={c.id} className="hover:bg-blue-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{formatUS(c.fecha)}</td>
                        <td className="px-4 py-3 text-green-700 font-medium">{fmtCurrency(c.total_efectivo || c.cash)}</td>
                        <td className="px-4 py-3 text-blue-700 font-medium">{fmtCurrency(c.total_tarjeta || c.card)}</td>
                        <td className="px-4 py-3 text-purple-700 font-medium">{fmtCurrency(c.total_transferencia || c.transfer)}</td>
                        <td className="px-4 py-3 text-amber-700 font-medium">{fmtCurrency(c.total_otro || c.other)}</td>
                        <td className="px-4 py-3 font-bold text-gray-900">{fmtCurrency(total)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleViewCierre(c)}
                            disabled={generating}
                            className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <Eye size={12} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {previewData && (
        <CierrePreviewModal
          van={van} usuario={usuario}
          previewData={previewData}
          onClose={() => setPreviewData(null)}
        />
      )}
    </div>
  );
}

/* ========================= Main Component ========================= */
export default function PreCierreVan() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const navigate = useNavigate();
  
  // Tab state
  const [activeTab, setActiveTab] = useState("pending");

  // Estados principales
  const [invoices, setInvoices] = useState({});
  const [selected, setSelected] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  
  // Fechas
  const todayISO = useMemo(localTodayISO, []);

  // Cargar filas pendientes usando el hook personalizado
  const { rows: pendingRows, loading, error } = usePrecloseRows(van?.id, 21);
  
  // Sincronizar filas pendientes con el estado principal
  const [rows, setRows] = useState([]);
  
  useEffect(() => {
    if (pendingRows.length !== rows.length) {
      setRows(pendingRows);
    }
  }, [pendingRows, rows.length]);

  // Cargar datos iniciales
  useEffect(() => {
    if (!van?.id) return;
    
    // Cargar fechas seleccionadas del localStorage
    try {
      const saved = JSON.parse(localStorage.getItem("pre_cierre_fechas") || "[]");
      if (Array.isArray(saved)) {
        setSelected(saved);
        console.log("📅 Fechas cargadas del localStorage:", saved);
      }
    } catch (e) {
      console.error("❌ Error loading selected dates", e);
    }
  }, [van?.id]);

  // Cargar conteo de facturas
  useEffect(() => {
    if (!van?.id || rows.length === 0) return;
    
    let alive = true;
    const faltan = rows.filter((r) => invoices[r.dia] == null);
    if (faltan.length === 0) return;

    const cargarInvoices = async () => {
      const out = {};
      await Promise.all(
        faltan.map(async (r) => {
          const c = await countVentasDia(van.id, r.dia);
          out[r.dia] = c;
        })
      );

      if (alive) {
        setInvoices((prev) => ({ ...prev, ...out }));
        console.log("📋 Conteo de facturas actualizado:", out);
      }
    };

    cargarInvoices();

    return () => {
      alive = false;
    };
  }, [van?.id, rows, invoices]);

  // Asegurar que las fechas seleccionadas estén visibles
  useEffect(() => {
    if (selected.length === 0) return;
    const visible = new Set(rows.map(r => r.dia));
    const cleaned = selected.filter((d) => visible.has(d));
    if (cleaned.length !== selected.length) {
      setSelected(cleaned);
      console.log("🧹 Fechas seleccionadas limpiadas:", cleaned);
    }
  }, [rows, selected]);

  // Actualizar localStorage cuando cambian las selecciones
  useEffect(() => {
    try {
      localStorage.setItem("pre_cierre_fechas", JSON.stringify(selected));
      if (selected.length > 0) {
        localStorage.setItem("pre_cierre_fecha", selected[0]);
      }
      console.log("💾 Fechas guardadas en localStorage:", selected);
    } catch (e) {
      console.error("❌ Error saving selected dates", e);
    }
  }, [selected]);

  // Función para contar ventas por día (usa easternDayBounds)
  const countVentasDia = useCallback(async (van_id, diaISO) => {
    if (!van_id || !diaISO) return 0;

    // Usar Eastern Time para el rango del día
    const { start, end } = easternDayBounds(diaISO);

    console.log(`📊 Contando ventas para ${diaISO} (${start} - ${end})`);

    // Probamos varias columnas de fecha, según tu esquema real
    const dateCols = ["created_at", "fecha", "fecha_venta"];

    for (const col of dateCols) {
      const { count, error, status } = await supabase
        .from("ventas")
        .select("id", { count: "exact", head: true })
        .eq("van_id", van_id)
        .gte(col, start)
        .lte(col, end)
        .is("cierre_id", null);

      // status 200 y count numérico ⇒ lo tomamos como bueno
      if (!error && typeof count === "number") {
        console.log(`✅ ${count} ventas encontradas usando columna '${col}'`);
        return count;
      }

      // Si es 400 por columna inválida, intenta la siguiente
      if (status !== 400 && error) {
        console.warn(`⚠️ countVentasDia(${col}) error:`, error.message || error);
      }
    }

    // Si todas fallan, devolvemos 0
    console.log(`⚠️ No se pudieron contar ventas para ${diaISO}`);
    return 0;
  }, []);

  // Toggle individual de fechas
  const toggleOne = useCallback((day) => {
    setSelected((prev) => {
      const has = prev.includes(day);
      const next = has ? prev.filter((d) => d !== day) : [day, ...prev];
      console.log(`${has ? '❌ Deseleccionado' : '✅ Seleccionado'}: ${day}`);
      return next;
    });
  }, []);

  // Toggle todas las fechas
  const allSelected = selected.length > 0 && selected.length === rows.length;
  const onToggleAll = useCallback(() => {
    const next = allSelected ? [] : [...rows.map(r => r.dia)];
    setSelected(next);
    console.log(allSelected ? '❌ Todas deseleccionadas' : '✅ Todas seleccionadas');
  }, [rows, allSelected]);

  // Sumas del panel (sobre fechas seleccionadas)
  const sum = useMemo(() => {
    const result = selected.reduce(
      (acc, d) => {
        const r = rows.find((x) => x.dia === d);
        if (!r) return acc;
        
        // Sumar correctamente los métodos de pago del RPC
        acc.cash += Number(r.cash_expected || 0);
        acc.card += Number(r.card_expected || 0);
        acc.transfer += Number(r.transfer_expected || 0);
        acc.mix += Number(r.mix_unallocated || 0);
        acc.invoices += Number(invoices[d] || 0);
        
        return acc;
      },
      { cash: 0, card: 0, transfer: 0, mix: 0, invoices: 0 }
    );

    console.log('💰 Totales calculados para fechas seleccionadas:', result);
    return result;
  }, [selected, rows, invoices]);

  const totalExpected = sum.cash + sum.card + sum.transfer + sum.mix;
  const canProcess = selected.length > 0 && totalExpected > 0;

  // Procesar cierre
  const onProcess = useCallback(() => {
    if (!canProcess) {
      setMensaje("Please select at least one date to process");
      setTipoMensaje("warning");
      return;
    }
    
    try {
      localStorage.setItem("pre_cierre_fechas", JSON.stringify(selected));
      localStorage.setItem("pre_cierre_fecha", selected[0] || "");
      localStorage.setItem("pre_cierre_refresh", String(Date.now()));
      
      console.log("✅ Navegando a cierre con fechas:", selected);
      navigate("/cierres/van");
    } catch (e) {
      console.error("❌ Error saving selected dates", e);
      setMensaje("Error saving selected dates");
      setTipoMensaje("error");
    }
  }, [selected, canProcess, navigate]);

  // Generar PDF
  const handleGenerarPDF = useCallback(() => {
    if (!selected.length) {
      setMensaje("No dates selected to generate report");
      setTipoMensaje("warning");
      return;
    }

    try {
      const doc = new jsPDF();
      const businessName = "Tools4Care";
      const reportTitle = "Pre-Closure Report";
      
      // Header
      doc.setFillColor(25, 118, 210);
      doc.rect(0, 0, 210, 30, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.text(businessName, 14, 20);
      doc.setFontSize(16);
      doc.text(reportTitle, 14, 30);
      doc.setTextColor(0, 0, 0);

      // Business information
      doc.setFillColor(240, 240, 240);
      doc.rect(14, 35, 182, 20, "F");
      doc.setFontSize(10);
      doc.text(`VAN: ${van?.nombre || van?.alias || 'No name'}`, 14, 45);
      doc.text(`User: ${usuario?.nombre || 'No name'}`, 14, 52);
      
      // Summary
      doc.setFontSize(14);
      doc.text("Selected Days Summary", 14, 66);
      doc.setFontSize(10);
      
      const totalesData = [
        ["Date", "Cash", "Card", "Transfer", "Mix", "Total", "Invoices"],
        ...selected.map(d => {
          const r = rows.find(x => x.dia === d);
          const dayTotal = (r?.cash_expected || 0) + (r?.card_expected || 0) + 
                          (r?.transfer_expected || 0) + (r?.mix_unallocated || 0);
          return [
            formatUS(d),
            fmtCurrency(r?.cash_expected || 0),
            fmtCurrency(r?.card_expected || 0),
            fmtCurrency(r?.transfer_expected || 0),
            fmtCurrency(r?.mix_unallocated || 0),
            fmtCurrency(dayTotal),
            invoices[d] || 0
          ];
        }),
        ["", "", "", "", "", "", ""],
        [
          "Totals", 
          fmtCurrency(sum.cash), 
          fmtCurrency(sum.card), 
          fmtCurrency(sum.transfer), 
          fmtCurrency(sum.mix),
          fmtCurrency(totalExpected),
          sum.invoices
        ]
      ];
      
      autoTable(doc, {
        startY: 72,
        head: [totalesData[0]],
        body: totalesData.slice(1),
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { 
          fillColor: [25, 118, 210],
          textColor: 255,
          fontStyle: "bold"
        }
      });

      // Footer
      const footerY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on ${new Date().toLocaleString()}`, 14, footerY);
      doc.text(`Tools4Care Financial System`, 14, footerY + 6);
      
      doc.save(`PreClosure_${van?.nombre || 'VAN'}_${new Date().toISOString().slice(0, 10)}.pdf`);
      setMensaje("PDF report generated successfully");
      setTipoMensaje("success");
      
      console.log("✅ PDF generado exitosamente");
    } catch (error) {
      console.error("❌ Error generating PDF:", error);
      setMensaje("Error generating PDF: " + error.message);
      setTipoMensaje("error");
    }
  }, [selected, rows, invoices, sum, totalExpected, van, usuario]);

  // Datos para gráficos
  const datosMetodosPago = useMemo(() => {
    return [
      { name: "Cash", value: sum.cash, color: getPaymentMethodColor("efectivo") },
      { name: "Card", value: sum.card, color: getPaymentMethodColor("tarjeta") },
      { name: "Transfer", value: sum.transfer, color: getPaymentMethodColor("transferencia") },
      { name: "Mix", value: sum.mix, color: getPaymentMethodColor("otro") },
    ].filter(item => item.value > 0);
  }, [sum]);

  // Datos para el gráfico de barras por fecha
  const datosPorFecha = useMemo(() => {
    return selected
      .slice()
      .sort((a, b) => (a < b ? -1 : 1)) // Ordenar cronológicamente
      .map(d => {
        const r = rows.find(x => x.dia === d);
        return {
          date: formatUS(d),
          cash: r?.cash_expected || 0,
          card: r?.card_expected || 0,
          transfer: r?.transfer_expected || 0,
          mix: r?.mix_unallocated || 0,
          invoices: invoices[d] || 0
        };
      });
  }, [selected, rows, invoices]);

  // Verificar si el componente está montado
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  if (!isMounted) {
    return null; // Evitar renderizado antes de montar
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Van Closeout
              </h1>
              <p className="text-gray-600 mt-1 text-xs sm:text-sm">
                {activeTab === "pending" ? "Select dates to process pre-closure" : "Search and view past closures"}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => navigate("/")}
                className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 sm:px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-sm text-sm"
              >
                ← Back
              </button>
              {activeTab === "pending" && (
                <button
                  onClick={handleGenerarPDF}
                  disabled={!selected.length}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={16} />
                  <span>PDF</span>
                </button>
              )}
            </div>
          </div>

          {/* Tab Bar */}
          <div className="flex gap-2 mt-4 bg-white rounded-xl border border-gray-200 p-1.5 shadow-sm w-fit">
            <button
              onClick={() => setActiveTab("pending")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === "pending"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Calendar size={15} /> Pending Closures
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === "history"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <History size={15} /> Search / History
            </button>
          </div>
        </div>

        {/* History Tab */}
        {activeTab === "history" && (
          <HistorialCierres van={van} usuario={usuario} />
        )}

        {/* Pending Tab Content starts below */}
        {activeTab === "pending" && (<>

        {/* Messages */}
        {mensaje && (
          <div className={`mb-6 p-4 rounded-xl shadow-lg transition-all duration-300 ${
            tipoMensaje === "error" ? "bg-red-50 border border-red-200 text-red-700" :
            tipoMensaje === "warning" ? "bg-yellow-50 border border-yellow-200 text-yellow-700" :
            tipoMensaje === "success" ? "bg-green-50 border border-green-200 text-green-700" :
            "bg-blue-50 border border-blue-200 text-blue-700"
          }`}>
            <div className="flex items-center gap-2">
              {tipoMensaje === "error" ? <AlertCircle size={20} /> :
               tipoMensaje === "warning" ? <AlertTriangle size={20} /> :
               tipoMensaje === "success" ? <CheckCircle size={20} /> :
               <FileText size={20} />}
              {mensaje}
            </div>
          </div>
        )}

        {/* Summary Panel */}
        {selected.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Selected Days Summary</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Totals */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-blue-600 text-sm font-medium">Total Expected</p>
                    <p className="text-2xl font-bold text-blue-800">{fmtCurrency(totalExpected)}</p>
                    <p className="text-xs text-gray-500 mt-1">✅ No duplications</p>
                  </div>
                  <DollarSign className="text-blue-600" size={24} />
                </div>
                
                <div className="space-y-2 mt-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cash:</span>
                    <span className="font-medium text-green-700">{fmtCurrency(sum.cash)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Card:</span>
                    <span className="font-medium text-blue-700">{fmtCurrency(sum.card)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Transfer:</span>
                    <span className="font-medium text-purple-700">{fmtCurrency(sum.transfer)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mix:</span>
                    <span className="font-medium text-amber-700">{fmtCurrency(sum.mix)}</span>
                  </div>
                </div>
              </div>
              
              {/* Selected dates */}
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-purple-600 text-sm font-medium">Selected Dates</p>
                    <p className="text-2xl font-bold text-purple-800">{selected.length}</p>
                  </div>
                  <Calendar className="text-purple-600" size={24} />
                </div>
                
                <div className="max-h-32 overflow-y-auto mt-3">
                  {selected
                    .slice()
                    .sort((a, b) => (a < b ? 1 : -1))
                    .map((d) => (
                      <div key={d} className="flex justify-between items-center py-1 border-b border-purple-100 last:border-0">
                        <span className="text-sm font-medium text-gray-700">
                          {formatUS(d)}
                          {d === todayISO && " (Today)"}
                        </span>
                        <span className="text-sm text-gray-600">
                          {invoices[d] || 0} invoices
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
            
            {/* Action button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={onProcess}
                disabled={!canProcess}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle size={18} />
                <span>Process Pre-Closure ({selected.length} {selected.length === 1 ? 'date' : 'dates'})</span>
              </button>
            </div>
          </div>
        )}

        {/* Charts */}
        {selected.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Payment methods distribution */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign size={20} />
                Payment Methods Distribution
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={datosMetodosPago}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {datosMetodosPago.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmtCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Selected dates chart */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Calendar size={20} />
                Totals by Date
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosPorFecha}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(value) => `$${value}`} />
                    <Tooltip formatter={(value) => fmtCurrency(value)} />
                    <Bar dataKey="cash" fill="#4CAF50" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="card" fill="#2196F3" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="transfer" fill="#9C27B0" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="mix" fill="#FF9800" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Dates table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Calendar size={20} />
              Pending Days ({rows.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleAll}
                disabled={rows.length === 0}
                className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {allSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Loading pending days...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="bg-red-100 rounded-full p-3 w-12 h-12 mx-auto mb-3 flex items-center justify-center">
                <AlertCircle className="text-red-500" size={24} />
              </div>
              <p className="text-red-600 font-medium">Error loading data</p>
              <p className="text-red-500 text-sm mt-1">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gray-100 rounded-full p-3 w-12 h-12 mx-auto mb-3 flex items-center justify-center">
                <CheckCircle className="text-gray-400" size={24} />
              </div>
              <p className="text-gray-500 font-medium">No pending days to close</p>
              <p className="text-gray-400 text-sm mt-1">All days have been closed or there are no transactions</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Select
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cash
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Card
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transfer
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mix
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoices
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row) => {
                    const total = row.cash_expected + row.card_expected + row.transfer_expected + row.mix_unallocated;
                    const isSelected = selected.includes(row.dia);
                    
                    return (
                      <tr 
                        key={row.dia} 
                        className={`hover:bg-blue-50 cursor-pointer ${isSelected ? "bg-blue-50" : ""}`}
                        onClick={() => toggleOne(row.dia)}
                      >
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(row.dia)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatUS(row.dia)}
                          {row.dia === todayISO && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                              Today
                            </span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">
                          {fmtCurrency(row.cash_expected)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">
                          {fmtCurrency(row.card_expected)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-purple-600 font-semibold">
                          {fmtCurrency(row.transfer_expected)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-amber-600 font-semibold">
                          {fmtCurrency(row.mix_unallocated)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                          {fmtCurrency(total)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                          {invoices[row.dia] || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Final summary */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Pre-Closure Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Available Days</div>
              <div className="text-2xl font-bold text-gray-800">{rows.length}</div>
              <div className="text-xs text-gray-500 mt-1">Pending closure</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Selected Days</div>
              <div className="text-2xl font-bold text-blue-800">{selected.length}</div>
              <div className="text-xs text-gray-500 mt-1">Total: {fmtCurrency(totalExpected)}</div>
            </div>
            <div className={`bg-white rounded-lg p-4 shadow-sm ${canProcess ? 'border-2 border-green-200' : ''}`}>
              <div className="text-sm text-gray-600 mb-1">Status</div>
              <div className={`text-2xl font-bold ${canProcess ? 'text-green-800' : 'text-gray-800'}`}>
                {canProcess ? "Ready" : "Select Dates"}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {canProcess ? `${sum.invoices} total invoices` : "Choose dates to process"}
              </div>
            </div>
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}