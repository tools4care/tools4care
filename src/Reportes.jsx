// src/Reportes.jsx - Custom Reports Hub
import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ShoppingCart, AlertTriangle, Users, Package, TrendingUp,
  RotateCcw, Download, RefreshCw, Calendar, DollarSign,
  FileText, ChevronDown, ChevronUp, Search, X,
} from "lucide-react";

/* ========================= Helpers ========================= */
const fmtCurrency = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

function getToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function get30DaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function easternDayBounds(isoDay) {
  const date = new Date(isoDay + "T00:00:00");
  const s = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  s.setHours(0, 0, 0, 0);
  const e = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  e.setHours(23, 59, 59, 999);
  return { start: s.toISOString(), end: e.toISOString() };
}

function dateRangeBounds(from, to) {
  const { start } = easternDayBounds(from);
  const { end } = easternDayBounds(to);
  return { start, end };
}

const CHART_COLORS = ["#2196F3", "#4CAF50", "#9C27B0", "#FF9800", "#F44336", "#00BCD4", "#E91E63", "#607D8B"];

/* ========================= Tab Config ========================= */
const TABS = [
  { id: "ventas", label: "Daily Sales", icon: ShoppingCart, color: "text-green-600" },
  { id: "devoluciones", label: "Returns", icon: RotateCcw, color: "text-red-600" },
  { id: "pagos_atrasados", label: "Late Payments", icon: AlertTriangle, color: "text-amber-600" },
  { id: "top_clientes", label: "Top Clients", icon: Users, color: "text-blue-600" },
  { id: "productos", label: "Top Products", icon: Package, color: "text-purple-600" },
  { id: "ganancias", label: "Profit Report", icon: TrendingUp, color: "text-emerald-600" },
];

/* ========================= Reusable Summary Card ========================= */
function SummaryCard({ label, value, sub, color = "blue", icon: Icon }) {
  const colors = {
    blue: "from-blue-50 to-blue-100 border-blue-200 text-blue-800",
    green: "from-green-50 to-green-100 border-green-200 text-green-800",
    red: "from-red-50 to-red-100 border-red-200 text-red-800",
    amber: "from-amber-50 to-amber-100 border-amber-200 text-amber-800",
    purple: "from-purple-50 to-purple-100 border-purple-200 text-purple-800",
    emerald: "from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-800",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium opacity-80">{label}</p>
        {Icon && <Icon size={18} className="opacity-60" />}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

/* ========================= Date Filter Bar ========================= */
function DateFilterBar({ from, to, onFrom, onTo, onSearch, loading }) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
        <input
          type="date" value={from} onChange={(e) => onFrom(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
        <input
          type="date" value={to} onChange={(e) => onTo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <button
        onClick={onSearch} disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
        Search
      </button>
    </div>
  );
}

/* ========================= 1. VENTAS REPORT ========================= */
function VentasReport({ van, usuario }) {
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo] = useState(getToday());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);
      const { data: rows, error: err } = await supabase
        .from("ventas")
        .select(`
          id, created_at, total_venta, total_pagado, estado_pago, metodo_pago,
          cliente_id, clientes:cliente_id(nombre),
          usuario_id, usuarios:usuario_id(nombre)
        `)
        .eq("van_id", van.id)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      if (err) throw err;
      setData(rows || []);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => ({
    total: data.reduce((s, r) => s + Number(r.total_venta || 0), 0),
    cobrado: data.reduce((s, r) => s + Number(r.total_pagado || 0), 0),
    pendiente: data.reduce((s, r) => s + Math.max(0, Number(r.total_venta || 0) - Number(r.total_pagado || 0)), 0),
    count: data.length,
  }), [data]);

  const byMethod = useMemo(() => {
    const map = {};
    data.forEach((r) => {
      const m = r.metodo_pago || "otro";
      map[m] = (map[m] || 0) + Number(r.total_venta || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [data]);

  const byDay = useMemo(() => {
    const map = {};
    data.forEach((r) => {
      const day = String(r.created_at || "").slice(0, 10);
      if (!map[day]) map[day] = 0;
      map[day] += Number(r.total_venta || 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([day, total]) => ({ day: fmtDate(day), total }));
  }, [data]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFillColor(25, 118, 210);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Tools4Care - Daily Sales Report", 14, 18);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)}`, 14, 36);
    doc.text(`VAN: ${van?.nombre_van || van?.nombre || "—"} | Generated: ${new Date().toLocaleString()}`, 14, 43);
    autoTable(doc, {
      startY: 50,
      head: [["#", "Date/Time", "Client", "Seller", "Method", "Total", "Paid", "Status"]],
      body: data.map((r, i) => [
        i + 1,
        fmtDateTime(r.created_at),
        r.clientes?.nombre || "—",
        r.usuarios?.nombre || "—",
        r.metodo_pago || "—",
        fmtCurrency(r.total_venta),
        fmtCurrency(r.total_pagado),
        r.estado_pago || "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: "bold" },
      foot: [["", "", "", "", "TOTALS", fmtCurrency(summary.total), fmtCurrency(summary.cobrado), ""]],
      footStyles: { fillColor: [240, 248, 255], fontStyle: "bold" },
    });
    doc.save(`Sales_Report_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <DateFilterBar from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={search} loading={loading} />
      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>}
      {searched && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="Total Sales" value={fmtCurrency(summary.total)} sub={`${summary.count} transactions`} color="blue" icon={ShoppingCart} />
            <SummaryCard label="Collected" value={fmtCurrency(summary.cobrado)} color="green" icon={DollarSign} />
            <SummaryCard label="Pending" value={fmtCurrency(summary.pendiente)} color="amber" icon={AlertTriangle} />
            <SummaryCard label="Transactions" value={summary.count} sub={`${fmtDate(from)} – ${fmtDate(to)}`} color="purple" icon={FileText} />
          </div>
          {byDay.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="font-semibold text-gray-700 mb-3">Sales by Day</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => fmtCurrency(v)} />
                    <Bar dataKey="total" fill="#2196F3" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="font-semibold text-gray-700 mb-3">By Payment Method</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={byMethod} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {byMethod.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center mb-3">
            <p className="font-semibold text-gray-700">{data.length} sales found</p>
            <button onClick={exportPDF} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-blue-700">
              <Download size={14} /> Export PDF
            </button>
          </div>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Date/Time", "Client", "Seller", "Method", "Total", "Paid", "Pending", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">No sales found for this period</td></tr>
                ) : data.map((r) => {
                  const pend = Math.max(0, Number(r.total_venta || 0) - Number(r.total_pagado || 0));
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap text-gray-700">{fmtDateTime(r.created_at)}</td>
                      <td className="px-4 py-2 font-medium text-gray-900">{r.clientes?.nombre || "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{r.usuarios?.nombre || "—"}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{r.metodo_pago || "—"}</span>
                      </td>
                      <td className="px-4 py-2 font-semibold text-gray-900">{fmtCurrency(r.total_venta)}</td>
                      <td className="px-4 py-2 text-green-700 font-medium">{fmtCurrency(r.total_pagado)}</td>
                      <td className="px-4 py-2 text-amber-700 font-medium">{fmtCurrency(pend)}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.estado_pago === "pagado" ? "bg-green-100 text-green-800" :
                          r.estado_pago === "credito" ? "bg-amber-100 text-amber-800" :
                          "bg-red-100 text-red-800"
                        }`}>{r.estado_pago || "—"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ========================= 2. DEVOLUCIONES REPORT ========================= */
function DevolucionesReport({ van }) {
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo] = useState(getToday());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);
      // Try devoluciones table first
      let rows = [];
      const { data: devs, error: devErr } = await supabase
        .from("devoluciones")
        .select(`id, created_at, monto, motivo, cliente_id, clientes:cliente_id(nombre), producto_id, productos:producto_id(nombre), venta_id`)
        .eq("van_id", van.id)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });

      if (!devErr) {
        rows = devs || [];
      } else {
        // Fallback: look for ventas with estado devolucion or negative amounts
        const { data: ventas, error: vErr } = await supabase
          .from("ventas")
          .select(`id, created_at, total_venta, cliente_id, clientes:cliente_id(nombre), observaciones`)
          .eq("van_id", van.id)
          .gte("created_at", start)
          .lte("created_at", end)
          .or("estado_pago.eq.devolucion,observaciones.ilike.%devolucion%,observaciones.ilike.%return%");
        if (!vErr) rows = (ventas || []).map((v) => ({ ...v, monto: v.total_venta, motivo: v.observaciones || "Return" }));
      }
      setData(rows);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const total = useMemo(() => data.reduce((s, r) => s + Number(r.monto || r.total_venta || 0), 0), [data]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Tools4Care - Returns Report", 14, 18);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)} | Generated: ${new Date().toLocaleString()}`, 14, 36);
    autoTable(doc, {
      startY: 44,
      head: [["Date", "Client", "Product", "Reason", "Amount"]],
      body: data.map((r) => [
        fmtDateTime(r.created_at),
        r.clientes?.nombre || "—",
        r.productos?.nombre || "—",
        r.motivo || r.observaciones || "—",
        fmtCurrency(r.monto || r.total_venta),
      ]),
      foot: [["", "", "", "TOTAL", fmtCurrency(total)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255 },
      footStyles: { fontStyle: "bold" },
    });
    doc.save(`Returns_Report_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <DateFilterBar from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={search} loading={loading} />
      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>}
      {searched && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <SummaryCard label="Total Returns" value={fmtCurrency(total)} sub={`${data.length} transactions`} color="red" icon={RotateCcw} />
            <SummaryCard label="Transactions" value={data.length} sub={`${fmtDate(from)} – ${fmtDate(to)}`} color="amber" icon={FileText} />
          </div>
          <div className="flex justify-between items-center mb-3">
            <p className="font-semibold text-gray-700">{data.length} returns found</p>
            <button onClick={exportPDF} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-red-700">
              <Download size={14} /> Export PDF
            </button>
          </div>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Date/Time", "Client", "Product", "Reason", "Amount"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-400">No returns found for this period</td></tr>
                ) : data.map((r) => (
                  <tr key={r.id} className="hover:bg-red-50">
                    <td className="px-4 py-2 text-gray-700">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2 font-medium">{r.clientes?.nombre || "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{r.productos?.nombre || "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{r.motivo || r.observaciones || "—"}</td>
                    <td className="px-4 py-2 font-semibold text-red-700">{fmtCurrency(r.monto || r.total_venta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ========================= 3. PAGOS ATRASADOS REPORT ========================= */
function PagosAtrasadosReport({ van }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true);
    setError(null);
    try {
      const today = getToday();
      const { data: cuotas, error: err } = await supabase
        .from("cuotas_acuerdo")
        .select(`
          id, fecha_vencimiento, monto_cuota, monto_pagado, estado,
          acuerdo_id,
          acuerdos_pago:acuerdo_id(
            cliente_id, van_id,
            clientes:cliente_id(id, nombre, telefono)
          )
        `)
        .in("estado", ["pendiente", "atrasado", "parcial"])
        .lte("fecha_vencimiento", today)
        .order("fecha_vencimiento", { ascending: true });
      if (err) throw err;
      const filtered = (cuotas || []).filter(
        (c) => c.acuerdos_pago?.van_id === van.id
      );
      setData(filtered);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const today = new Date();
    return data.reduce((acc, r) => {
      const owed = Number(r.monto_cuota || 0) - Number(r.monto_pagado || 0);
      const dueDate = new Date(r.fecha_vencimiento);
      const days = Math.floor((today - dueDate) / 86400000);
      acc.totalOwed += owed;
      acc.count += 1;
      acc.maxDays = Math.max(acc.maxDays, days);
      return acc;
    }, { totalOwed: 0, count: 0, maxDays: 0 });
  }, [data]);

  const byClient = useMemo(() => {
    const map = {};
    data.forEach((r) => {
      const c = r.acuerdos_pago?.clientes;
      if (!c) return;
      if (!map[c.id]) map[c.id] = { nombre: c.nombre, telefono: c.telefono, totalOwed: 0, count: 0 };
      map[c.id].totalOwed += Number(r.monto_cuota || 0) - Number(r.monto_pagado || 0);
      map[c.id].count += 1;
    });
    return Object.values(map).sort((a, b) => b.totalOwed - a.totalOwed).slice(0, 10);
  }, [data]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Tools4Care - Late Payments Report", 14, 18);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()} | VAN: ${van?.nombre_van || "—"}`, 14, 36);
    const today = new Date();
    autoTable(doc, {
      startY: 44,
      head: [["Client", "Due Date", "Days Overdue", "Owed", "Status"]],
      body: data.map((r) => {
        const c = r.acuerdos_pago?.clientes;
        const owed = Number(r.monto_cuota || 0) - Number(r.monto_pagado || 0);
        const days = Math.floor((today - new Date(r.fecha_vencimiento)) / 86400000);
        return [c?.nombre || "—", fmtDate(r.fecha_vencimiento), `${days} days`, fmtCurrency(owed), r.estado || "—"];
      }),
      foot: [["", "", "TOTAL OWED", fmtCurrency(summary.totalOwed), ""]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [217, 119, 6], textColor: 255 },
      footStyles: { fontStyle: "bold" },
    });
    doc.save(`Late_Payments_Report_${getToday()}.pdf`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-600">Shows all overdue installments from payment agreements</p>
        <button onClick={search} disabled={loading}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          Load Late Payments
        </button>
      </div>
      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>}
      {searched && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <SummaryCard label="Total Owed" value={fmtCurrency(summary.totalOwed)} sub={`${summary.count} installments`} color="red" icon={DollarSign} />
            <SummaryCard label="Overdue Installments" value={summary.count} color="amber" icon={AlertTriangle} />
            <SummaryCard label="Max Days Overdue" value={`${summary.maxDays} days`} color="red" icon={Calendar} />
          </div>
          {byClient.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <p className="font-semibold text-gray-700 mb-3">Top 10 Clients by Amount Owed</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byClient.map((c) => ({ name: c.nombre?.split(" ")[0] || "—", owed: c.totalOwed }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtCurrency(v)} />
                  <Bar dataKey="owed" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex justify-between items-center mb-3">
            <p className="font-semibold text-gray-700">{data.length} overdue installments</p>
            <button onClick={exportPDF} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-amber-700">
              <Download size={14} /> Export PDF
            </button>
          </div>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Client", "Phone", "Due Date", "Days Overdue", "Owed", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">No overdue payments found</td></tr>
                ) : data.map((r) => {
                  const c = r.acuerdos_pago?.clientes;
                  const owed = Number(r.monto_cuota || 0) - Number(r.monto_pagado || 0);
                  const days = Math.floor((new Date() - new Date(r.fecha_vencimiento)) / 86400000);
                  return (
                    <tr key={r.id} className="hover:bg-amber-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{c?.nombre || "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{c?.telefono || "—"}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtDate(r.fecha_vencimiento)}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${days > 30 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                          {days} days
                        </span>
                      </td>
                      <td className="px-4 py-2 font-bold text-red-700">{fmtCurrency(owed)}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">{r.estado}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ========================= 4. TOP CLIENTES REPORT ========================= */
function TopClientesReport({ van }) {
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo] = useState(getToday());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [sortBy, setSortBy] = useState("total"); // total | balance | days

  const search = async () => {
    if (!van?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);
      const { data: ventas, error: err } = await supabase
        .from("ventas")
        .select(`total_venta, total_pagado, estado_pago, created_at, cliente_id, clientes:cliente_id(id, nombre, telefono)`)
        .eq("van_id", van.id)
        .gte("created_at", start)
        .lte("created_at", end);
      if (err) throw err;

      const map = {};
      (ventas || []).forEach((v) => {
        const c = v.clientes;
        if (!c) return;
        if (!map[c.id]) map[c.id] = { id: c.id, nombre: c.nombre, telefono: c.telefono, totalCompras: 0, totalPagado: 0, count: 0, lastPurchase: null };
        map[c.id].totalCompras += Number(v.total_venta || 0);
        map[c.id].totalPagado += Number(v.total_pagado || 0);
        map[c.id].count += 1;
        if (!map[c.id].lastPurchase || v.created_at > map[c.id].lastPurchase) map[c.id].lastPurchase = v.created_at;
      });

      const result = Object.values(map).map((c) => ({
        ...c,
        balance: c.totalCompras - c.totalPagado,
        daysSinceLast: c.lastPurchase ? Math.floor((new Date() - new Date(c.lastPurchase)) / 86400000) : 999,
      }));
      setData(result);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const sorted = useMemo(() => {
    return [...data].sort((a, b) =>
      sortBy === "total" ? b.totalCompras - a.totalCompras :
      sortBy === "balance" ? b.balance - a.balance :
      b.daysSinceLast - a.daysSinceLast
    ).slice(0, 20);
  }, [data, sortBy]);

  const top10Chart = sorted.slice(0, 10).map((c) => ({
    name: (c.nombre || "—").split(" ")[0],
    total: c.totalCompras,
    balance: c.balance,
  }));

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Tools4Care - Top Clients Report", 14, 18);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)} | Generated: ${new Date().toLocaleString()}`, 14, 36);
    autoTable(doc, {
      startY: 44,
      head: [["#", "Client", "Phone", "Purchases", "Total", "Balance", "Last Purchase"]],
      body: sorted.map((c, i) => [
        i + 1, c.nombre || "—", c.telefono || "—", c.count,
        fmtCurrency(c.totalCompras), fmtCurrency(c.balance), fmtDate(c.lastPurchase),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    });
    doc.save(`Top_Clients_Report_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <DateFilterBar from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={search} loading={loading} />
      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>}
      {searched && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <SummaryCard label="Unique Clients" value={data.length} color="blue" icon={Users} />
            <SummaryCard label="Total Revenue" value={fmtCurrency(data.reduce((s, c) => s + c.totalCompras, 0))} color="green" icon={DollarSign} />
            <SummaryCard label="Total Pending" value={fmtCurrency(data.reduce((s, c) => s + c.balance, 0))} color="amber" icon={AlertTriangle} />
          </div>
          {top10Chart.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <p className="font-semibold text-gray-700 mb-3">Top 10 Clients by Sales</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top10Chart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtCurrency(v)} />
                  <Bar dataKey="total" fill="#2563EB" name="Total" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="balance" fill="#F59E0B" name="Balance" radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap justify-between items-center mb-3 gap-3">
            <div className="flex gap-2">
              {[["total", "By Sales"], ["balance", "By Balance"], ["days", "By Inactivity"]].map(([val, lbl]) => (
                <button key={val} onClick={() => setSortBy(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${sortBy === val ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {lbl}
                </button>
              ))}
            </div>
            <button onClick={exportPDF} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-blue-700">
              <Download size={14} /> Export PDF
            </button>
          </div>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["#", "Client", "Phone", "Purchases", "Total", "Balance", "Last Purchase", "Days Inactive"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">No data for this period</td></tr>
                ) : sorted.map((c, i) => (
                  <tr key={c.id} className="hover:bg-blue-50">
                    <td className="px-4 py-2 font-bold text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-semibold text-gray-900">{c.nombre || "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{c.telefono || "—"}</td>
                    <td className="px-4 py-2 text-center">{c.count}</td>
                    <td className="px-4 py-2 font-semibold text-green-700">{fmtCurrency(c.totalCompras)}</td>
                    <td className="px-4 py-2 font-semibold text-amber-700">{fmtCurrency(c.balance)}</td>
                    <td className="px-4 py-2 text-gray-600">{fmtDate(c.lastPurchase)}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.daysSinceLast > 30 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                        {c.daysSinceLast === 999 ? "—" : `${c.daysSinceLast}d`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ========================= 5. PRODUCTOS MÁS VENDIDOS ========================= */
function ProductosReport({ van }) {
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo] = useState(getToday());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);
      const { data: rows, error: err } = await supabase
        .from("detalle_ventas")
        .select(`
          cantidad, precio_unitario, subtotal, producto_id,
          productos:producto_id(id, nombre),
          ventas:venta_id(van_id, created_at)
        `)
        .gte("ventas.created_at", start)
        .lte("ventas.created_at", end);

      if (err) throw err;
      const filtered = (rows || []).filter((r) => r.ventas?.van_id === van.id);
      const map = {};
      filtered.forEach((r) => {
        const p = r.productos;
        if (!p) return;
        if (!map[p.id]) map[p.id] = { id: p.id, nombre: p.nombre, totalQty: 0, totalRevenue: 0 };
        map[p.id].totalQty += Number(r.cantidad || 0);
        map[p.id].totalRevenue += Number(r.subtotal || 0);
      });
      setData(Object.values(map).sort((a, b) => b.totalQty - a.totalQty));
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const top10 = data.slice(0, 10).map((p) => ({ name: p.nombre?.slice(0, 15) || "—", qty: p.totalQty, revenue: p.totalRevenue }));

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFillColor(124, 58, 237);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Tools4Care - Top Products Report", 14, 18);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)} | Generated: ${new Date().toLocaleString()}`, 14, 36);
    autoTable(doc, {
      startY: 44,
      head: [["#", "Product", "Qty Sold", "Revenue"]],
      body: data.map((p, i) => [i + 1, p.nombre || "—", p.totalQty, fmtCurrency(p.totalRevenue)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255 },
    });
    doc.save(`Top_Products_Report_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <DateFilterBar from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={search} loading={loading} />
      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>}
      {searched && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <SummaryCard label="Products Sold" value={data.length} sub="unique products" color="purple" icon={Package} />
            <SummaryCard label="Total Units" value={data.reduce((s, p) => s + p.totalQty, 0)} color="blue" icon={ShoppingCart} />
            <SummaryCard label="Revenue" value={fmtCurrency(data.reduce((s, p) => s + p.totalRevenue, 0))} color="green" icon={DollarSign} />
          </div>
          {top10.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <p className="font-semibold text-gray-700 mb-3">Top 10 Products by Units Sold</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top10}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, name) => name === "revenue" ? fmtCurrency(v) : v} />
                  <Bar dataKey="qty" fill="#7C3AED" name="Units" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex justify-between items-center mb-3">
            <p className="font-semibold text-gray-700">{data.length} products</p>
            <button onClick={exportPDF} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-purple-700">
              <Download size={14} /> Export PDF
            </button>
          </div>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["#", "Product", "Units Sold", "Revenue", "Avg Price"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-400">No product data for this period</td></tr>
                ) : data.map((p, i) => (
                  <tr key={p.id} className="hover:bg-purple-50">
                    <td className="px-4 py-2 font-bold text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-semibold text-gray-900">{p.nombre || "—"}</td>
                    <td className="px-4 py-2 text-center font-bold text-purple-700">{p.totalQty}</td>
                    <td className="px-4 py-2 font-semibold text-green-700">{fmtCurrency(p.totalRevenue)}</td>
                    <td className="px-4 py-2 text-gray-600">{p.totalQty > 0 ? fmtCurrency(p.totalRevenue / p.totalQty) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ========================= 6. GANANCIAS REPORT ========================= */
function GananciasReport({ van }) {
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo] = useState(getToday());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [noCostField, setNoCostField] = useState(false);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true);
    setError(null);
    setNoCostField(false);
    try {
      const { start, end } = dateRangeBounds(from, to);
      const { data: rows, error: err } = await supabase
        .from("detalle_ventas")
        .select(`
          cantidad, precio_unitario, subtotal, producto_id,
          productos:producto_id(id, nombre, precio_costo, costo, precio_venta),
          ventas:venta_id(van_id, created_at)
        `)
        .gte("ventas.created_at", start)
        .lte("ventas.created_at", end);

      if (err) throw err;
      const filtered = (rows || []).filter((r) => r.ventas?.van_id === van.id);

      const map = {};
      let hasCost = false;
      filtered.forEach((r) => {
        const p = r.productos;
        if (!p) return;
        const costo = Number(p.precio_costo || p.costo || 0);
        if (costo > 0) hasCost = true;
        if (!map[p.id]) map[p.id] = { id: p.id, nombre: p.nombre, costo, precioVenta: Number(p.precio_venta || 0), totalQty: 0, totalRevenue: 0, totalCost: 0 };
        map[p.id].totalQty += Number(r.cantidad || 0);
        map[p.id].totalRevenue += Number(r.subtotal || 0);
        map[p.id].totalCost += Number(r.cantidad || 0) * costo;
      });

      if (!hasCost) setNoCostField(true);
      setData(Object.values(map).sort((a, b) => (b.totalRevenue - b.totalCost) - (a.totalRevenue - a.totalCost)));
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => ({
    revenue: data.reduce((s, p) => s + p.totalRevenue, 0),
    cost: data.reduce((s, p) => s + p.totalCost, 0),
    profit: data.reduce((s, p) => s + (p.totalRevenue - p.totalCost), 0),
    margin: data.length > 0 ? (data.reduce((s, p) => s + (p.totalRevenue - p.totalCost), 0) / Math.max(data.reduce((s, p) => s + p.totalRevenue, 0), 1)) * 100 : 0,
  }), [data]);

  const top10 = data.slice(0, 10).map((p) => ({
    name: p.nombre?.slice(0, 15) || "—",
    profit: p.totalRevenue - p.totalCost,
    revenue: p.totalRevenue,
  }));

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFillColor(5, 150, 105);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Tools4Care - Profit Report", 14, 18);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)} | Generated: ${new Date().toLocaleString()}`, 14, 36);
    autoTable(doc, {
      startY: 44,
      head: [["#", "Product", "Units", "Revenue", "Cost", "Profit", "Margin %"]],
      body: data.map((p, i) => {
        const profit = p.totalRevenue - p.totalCost;
        const margin = p.totalRevenue > 0 ? ((profit / p.totalRevenue) * 100).toFixed(1) : "—";
        return [i + 1, p.nombre || "—", p.totalQty, fmtCurrency(p.totalRevenue), fmtCurrency(p.totalCost), fmtCurrency(profit), `${margin}%`];
      }),
      foot: [["", "TOTALS", "", fmtCurrency(summary.revenue), fmtCurrency(summary.cost), fmtCurrency(summary.profit), `${summary.margin.toFixed(1)}%`]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255 },
      footStyles: { fontStyle: "bold" },
    });
    doc.save(`Profit_Report_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <DateFilterBar from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={search} loading={loading} />
      {noCostField && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg p-3 mb-4 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          No cost data found for products. Add a "costo" or "precio_costo" field to your products table to enable profit tracking.
        </div>
      )}
      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>}
      {searched && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="Total Revenue" value={fmtCurrency(summary.revenue)} color="blue" icon={DollarSign} />
            <SummaryCard label="Total Cost" value={fmtCurrency(summary.cost)} color="red" icon={TrendingUp} />
            <SummaryCard label="Gross Profit" value={fmtCurrency(summary.profit)} color="emerald" icon={TrendingUp} />
            <SummaryCard label="Margin" value={`${summary.margin.toFixed(1)}%`} sub="Revenue - Cost / Revenue" color="green" icon={TrendingUp} />
          </div>
          {top10.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <p className="font-semibold text-gray-700 mb-3">Top 10 Most Profitable Products</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top10}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtCurrency(v)} />
                  <Bar dataKey="profit" fill="#059669" name="Profit" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="revenue" fill="#93C5FD" name="Revenue" radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex justify-between items-center mb-3">
            <p className="font-semibold text-gray-700">{data.length} products</p>
            <button onClick={exportPDF} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-emerald-700">
              <Download size={14} /> Export PDF
            </button>
          </div>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["#", "Product", "Units", "Revenue", "Cost", "Profit", "Margin"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No product data for this period</td></tr>
                ) : data.map((p, i) => {
                  const profit = p.totalRevenue - p.totalCost;
                  const margin = p.totalRevenue > 0 ? ((profit / p.totalRevenue) * 100).toFixed(1) : null;
                  return (
                    <tr key={p.id} className="hover:bg-emerald-50">
                      <td className="px-4 py-2 font-bold text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-semibold text-gray-900">{p.nombre || "—"}</td>
                      <td className="px-4 py-2 text-center">{p.totalQty}</td>
                      <td className="px-4 py-2 font-semibold text-blue-700">{fmtCurrency(p.totalRevenue)}</td>
                      <td className="px-4 py-2 text-red-600">{p.totalCost > 0 ? fmtCurrency(p.totalCost) : <span className="text-gray-400 text-xs">No cost</span>}</td>
                      <td className="px-4 py-2 font-bold text-emerald-700">{p.totalCost > 0 ? fmtCurrency(profit) : <span className="text-gray-400 text-xs">—</span>}</td>
                      <td className="px-4 py-2">
                        {margin != null && p.totalCost > 0 ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${Number(margin) > 20 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                            {margin}%
                          </span>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ========================= MAIN COMPONENT ========================= */
export default function Reportes() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const [activeTab, setActiveTab] = useState("ventas");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-slate-100 p-2 sm:p-4">
      <div className="w-full max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-700 to-blue-700 bg-clip-text text-transparent">
            Custom Reports
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            VAN: <span className="font-medium text-gray-700">{van?.nombre_van || van?.nombre || "—"}</span>
            {usuario && <> &nbsp;·&nbsp; User: <span className="font-medium text-gray-700">{usuario.nombre || usuario.email}</span></>}
          </p>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 sm:gap-2 flex-wrap mb-6 bg-white rounded-xl border border-gray-200 p-2 shadow-sm">
          {TABS.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === id
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon size={15} className={activeTab === id ? "text-white" : color} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
            {(() => {
              const tab = TABS.find((t) => t.id === activeTab);
              const Icon = tab?.icon;
              return (
                <>
                  {Icon && <Icon size={20} className={tab?.color} />}
                  <h2 className="text-lg font-bold text-gray-800">{tab?.label}</h2>
                </>
              );
            })()}
          </div>
          {activeTab === "ventas" && <VentasReport van={van} usuario={usuario} />}
          {activeTab === "devoluciones" && <DevolucionesReport van={van} />}
          {activeTab === "pagos_atrasados" && <PagosAtrasadosReport van={van} />}
          {activeTab === "top_clientes" && <TopClientesReport van={van} />}
          {activeTab === "productos" && <ProductosReport van={van} />}
          {activeTab === "ganancias" && <GananciasReport van={van} />}
        </div>
      </div>
    </div>
  );
}
