import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import dayjs from "dayjs";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
  Cell,
  LineChart,
  ReferenceLine,
  PieChart,
  Pie,
} from "recharts";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { useSyncGlobal } from "./hooks/SyncContext";
import SyncStatusWidget from "./components/SyncStatusWidget";
import BackupManagerModal from "./components/BackupManagerModal";

/* ---------- Helpers ---------- */
function fmtMoney(n) {
  const v = Number(n || 0);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function shortDate(iso) {
  return dayjs(iso).format("MM-DD");
}
function rangeDaysArray(days) {
  const arr = [];
  for (let i = days - 1; i >= 0; i--) {
    arr.push(dayjs().subtract(i, "day").format("YYYY-MM-DD"));
  }
  return arr;
}
function dinero(n) {
  return "$" + Number(n || 0).toFixed(2);
}

function withMA(data, key = "total", windowSize = 7) {
  const out = [];
  let sum = 0;
  const q = [];
  for (const d of data) {
    const v = Number(d[key] || 0);
    q.push(v);
    sum += v;
    if (q.length > windowSize) sum -= q.shift();
    out.push({ ...d, ma7: q.length === windowSize ? sum / windowSize : null });
  }
  return out;
}

/* ---------- Iconos SVG ---------- */
const IconDollar = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconTrending = ({ up }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {up ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    )}
  </svg>
);

const IconShoppingCart = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const IconUsers = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const IconAlert = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const IconPackage = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const IconClock = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconMap = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);

const IconCheck = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const IconPlus = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const IconEdit = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const IconTrash = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const IconPhone = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const IconLocation = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconSearch = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

/* ---------- Modal Low Stock ---------- */
function LowStockModal({ open, items, onClose }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s
      ? items.filter(i =>
          String(i.codigo).toLowerCase().includes(s) ||
          String(i.nombre).toLowerCase().includes(s)
        )
      : items;
    return base;
  }, [q, items]);

  const criticos      = filtered.filter(p => p.urgencia === "critico");
  const bajos         = filtered.filter(p => p.urgencia === "bajo");
  const vigilar       = filtered.filter(p => p.urgencia === "watch");
  const sinMovimiento = filtered.filter(p => p.urgencia === "sin_movimiento");

  const StockRow = ({ p }) => {
    const diasLabel = p.cantidad === 0
      ? "OUT OF STOCK"
      : p.urgencia === "sin_movimiento"
      ? `${p.cantidad} u.`
      : p.diasRestantes >= 999
      ? `${p.cantidad} u.`
      : `~${p.diasRestantes}d left`;
    const urgColor = p.urgencia === "critico"
      ? { border: "border-red-500",    badge: "bg-red-500 text-white",        bg: "from-red-50 to-red-50" }
      : p.urgencia === "bajo"
      ? { border: "border-orange-400", badge: "bg-orange-100 text-orange-700", bg: "from-orange-50 to-orange-50" }
      : p.urgencia === "sin_movimiento"
      ? { border: "border-gray-300",   badge: "bg-gray-100 text-gray-600",    bg: "from-gray-50 to-gray-50" }
      : { border: "border-yellow-400", badge: "bg-yellow-100 text-yellow-700", bg: "from-yellow-50 to-yellow-50" };
    const ultimaLabel = p.ultimaVenta
      ? `Last sale ${dayjs().diff(dayjs(p.ultimaVenta), "day")}d ago`
      : p.urgencia === "sin_movimiento"
      ? "No recent sales"
      : null;
    return (
      <li className={`bg-gradient-to-r ${urgColor.bg} rounded-xl p-3.5 border-l-4 ${urgColor.border}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 truncate">{p.nombre}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {p.codigo && <span className="text-xs text-gray-400 font-mono">{p.codigo}</span>}
              {p.vendido30d > 0 && <span className="text-xs text-gray-500">{p.vendido30d} u./30d · {p.velocidad}/day</span>}
              {ultimaLabel && <span className="text-xs text-gray-400">{ultimaLabel}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="text-xs text-gray-400">Stock</div>
              <div className="text-2xl font-bold text-gray-800">{p.cantidad}</div>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${urgColor.badge}`}>
              {diasLabel}
            </span>
          </div>
        </div>
      </li>
    );
  };

  const Grupo = ({ titulo, color, items: grupo }) => {
    if (!grupo.length) return null;
    return (
      <div className="mb-4">
        <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${color}`}>{titulo} ({grupo.length})</div>
        <ul className="space-y-2">
          {grupo.map((p, i) => <StockRow key={`${p.codigo}-${i}`} p={p} />)}
        </ul>
      </div>
    );
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlert />
            <div>
              <h3 className="font-bold text-lg">Running Low</h3>
              <p className="text-xs opacity-80">Active in last 60 days · {items.length} products</p>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={onClose}
          >
            ✖
          </button>
        </div>
        <div className="p-4 flex-1 overflow-hidden flex flex-col">
          <input
            className="w-full border-2 border-gray-200 focus:border-red-500 rounded-xl px-4 py-2.5 mb-4 transition-colors"
            placeholder="Search by code or name..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-8">No results found.</div>
            ) : (
              <>
                <Grupo titulo="🔴 Critical — less than 7 days"  color="text-red-600"    items={criticos}      />
                <Grupo titulo="🟠 Low Stock — less than 14 days" color="text-orange-600" items={bajos}         />
                <Grupo titulo="🟡 Watch — less than 30 days"     color="text-yellow-600" items={vigilar}       />
                <Grupo titulo="⚪ No Recent Sales — no movement" color="text-gray-500"   items={sinMovimiento} />
              </>
            )}
          </div>
        </div>
        <div className="p-4 border-t">
          <button
            className="w-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white font-semibold py-3 px-4 rounded-xl transition-all"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Modal Recent Sales ---------- */
function RecentSalesModal({ open, ventas, onClose, getNombreCliente, onSelectVenta }) {
  const [searchTerm, setSearchTerm] = useState("");
  
  const filtered = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return ventas;
    return ventas.filter((v) => {
      const cliente = getNombreCliente(v.cliente_id).toLowerCase();
      const fecha = dayjs(v.fecha).format("DD/MM/YYYY").toLowerCase();
      return cliente.includes(s) || fecha.includes(s);
    });
  }, [searchTerm, ventas, getNombreCliente]);

  if (!open) return null;
  
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconShoppingCart />
            <h3 className="font-bold text-lg">Recent Sales</h3>
          </div>
          <button
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={onClose}
          >
            ✖
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-hidden flex flex-col">
          <input
            className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-lg px-4 py-2.5 mb-3 transition-colors"
            placeholder="Search by client or date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-8">No sales found.</div>
            ) : (
              <>
                {/* Desktop View */}
                <div className="hidden md:block">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="p-3 text-left text-xs font-bold text-gray-700">Date</th>
                        <th className="p-3 text-left text-xs font-bold text-gray-700">Client</th>
                        <th className="p-3 text-right text-xs font-bold text-gray-700">Total</th>
                        <th className="p-3 text-center text-xs font-bold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map((v) => (
                        <tr
                          key={v.id}
                          className="hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() => {
                            onSelectVenta(v);
                            onClose();
                          }}
                        >
                          <td className="p-3">
                            <div className="font-medium text-gray-900 text-sm">{dayjs(v.fecha).format("MM/DD/YYYY")}</div>
                            <div className="text-xs text-gray-500">{dayjs(v.fecha).format("HH:mm")}</div>
                          </td>
                          <td className="p-3 font-medium text-gray-800 text-sm">{getNombreCliente(v.cliente_id)}</td>
                          <td className="p-3 text-right">
                            <div className="font-bold text-lg text-gray-900">{fmtMoney(v.total || 0)}</div>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                                v.estado_pago === "pagado"
                                  ? "bg-green-500 text-white"
                                  : v.estado_pago === "parcial"
                                  ? "bg-blue-500 text-white"
                                  : "bg-amber-500 text-white"
                              }`}
                            >
                              {v.estado_pago === "pagado" ? "✓ Paid" : v.estado_pago === "parcial" ? "◐ Partial" : "○ Pending"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-3">
                  {filtered.map((v) => (
                    <div
                      key={v.id}
                      className="bg-gradient-to-br from-white to-blue-50 rounded-xl p-4 border-2 border-blue-100 hover:border-blue-300 hover:shadow-lg cursor-pointer transition-all"
                      onClick={() => {
                        onSelectVenta(v);
                        onClose();
                      }}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-gray-900 mb-1">{getNombreCliente(v.cliente_id)}</div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <IconClock />
                            {dayjs(v.fecha).format("MM/DD/YYYY HH:mm")}
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${
                            v.estado_pago === "pagado"
                              ? "bg-green-500 text-white"
                              : v.estado_pago === "parcial"
                              ? "bg-blue-500 text-white"
                              : "bg-amber-500 text-white"
                          }`}
                        >
                          {v.estado_pago === "pagado" ? "✓" : v.estado_pago === "parcial" ? "◐" : "○"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-blue-600 text-white rounded-lg p-3">
                        <span className="font-semibold">Total</span>
                        <span className="text-xl font-bold">{fmtMoney(v.total || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-4 border-t">
          <button
            className="w-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white font-semibold py-3 px-4 rounded-lg transition-all"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Modal Detalle Venta ---------- */
function DetalleVentaModal({ venta, loading, productos, onClose, getNombreCliente }) {
  if (!venta) return null;

  const totalProductos = productos.reduce((sum, p) => {
    const unit = Number(p.precio_unit ?? p.precio_unitario ?? 0);
    const sub = p.subtotal != null ? Number(p.subtotal) : unit * Number(p.cantidad || 0);
    return sum + sub;
  }, 0);

  const pagoInfo = venta.pago || {};
  const metodosAplicados = pagoInfo.metodos || [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconShoppingCart />
            <h3 className="font-bold text-xl">Sale Details</h3>
          </div>
          <button
            className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={onClose}
          >
            ✖
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Info general en cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
              <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Sale ID</div>
              <div className="font-mono text-sm font-semibold text-gray-800">{venta.id?.slice(0, 12)}...</div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
              <div className="text-xs text-purple-600 font-semibold uppercase mb-1">Date</div>
              <div className="font-semibold text-gray-800">{dayjs(venta.fecha).format("MM/DD/YYYY HH:mm")}</div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
              <div className="text-xs text-green-600 font-semibold uppercase mb-1">Client</div>
              <div className="font-semibold text-gray-800">{getNombreCliente(venta.cliente_id) || "—"}</div>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
              <div className="text-xs text-amber-600 font-semibold uppercase mb-1">Payment Status</div>
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold ${
                  venta.estado_pago === "pagado"
                    ? "bg-green-500 text-white"
                    : venta.estado_pago === "parcial"
                    ? "bg-blue-500 text-white"
                    : "bg-amber-500 text-white"
                }`}
              >
                {venta.estado_pago === "pagado" ? "✓ Paid" : venta.estado_pago === "parcial" ? "◐ Partial" : "○ Pending"}
              </span>
            </div>
          </div>

          {/* Totales destacados */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <IconShoppingCart />
                  <div className="text-sm font-semibold opacity-90">Sale Total</div>
                </div>
                <div className="text-4xl font-bold">
                  {fmtMoney(venta.total || 0)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <IconDollar />
                  <div className="text-sm font-semibold opacity-90">Total Paid</div>
                </div>
                <div className="text-4xl font-bold text-green-300">
                  {fmtMoney(venta.total_pagado || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Métodos de pago */}
          {metodosAplicados.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <IconDollar />
                <h4 className="font-bold text-gray-800">Payment Methods</h4>
              </div>
              <div className="space-y-2">
                {metodosAplicados.map((m, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-white rounded-lg px-4 py-3 border border-gray-200">
                    <span className="capitalize font-semibold text-gray-700">{m.forma || "—"}</span>
                    <span className="font-bold text-lg text-blue-600">{dinero(m.monto || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Productos */}
          <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <IconPackage />
              <h4 className="font-bold text-gray-800">Products Sold</h4>
            </div>
            {loading ? (
              <div className="text-blue-600 text-sm text-center py-4">Loading products…</div>
            ) : productos.length === 0 ? (
              <div className="text-gray-400 text-sm text-center py-4">No products in this sale</div>
            ) : (
              <div className="space-y-3">
                {productos.map((p, idx) => {
                  const unit = Number(p.precio_unit ?? p.precio_unitario ?? 0);
                  const sub = p.subtotal != null ? Number(p.subtotal) : unit * Number(p.cantidad || 0);
                  return (
                    <div key={idx} className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-bold text-gray-900 text-lg">{p.nombre || p.producto_id}</div>
                          <div className="text-xs text-gray-500 font-mono mt-1">{p.codigo || p.producto_id}</div>
                          <div className="text-sm text-gray-600 mt-2">
                            Quantity: <span className="font-semibold">{p.cantidad}</span> × {dinero(unit)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500 mb-1">Subtotal</div>
                          <div className="font-bold text-xl text-gray-900">{dinero(sub)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Total de productos */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-4 flex justify-between items-center text-white shadow-lg">
                  <span className="font-bold text-lg">Products Subtotal:</span>
                  <span className="font-bold text-2xl">{dinero(totalProductos)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Notas */}
          {venta.notas && (
            <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
              <div className="text-sm text-amber-600 font-semibold uppercase mb-2">Notes</div>
              <div className="text-sm text-gray-700">{venta.notas}</div>
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <button
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Modal Gestión de Rutas ---------- */
function RutaBarberiaModal({ open, onClose, vanId, fechaSeleccionada, onRefresh }) {
  const [barberiaNombre, setBarberiaNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [horaVisita, setHoraVisita] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  
  // Estados para autocompletado
  const [barberiasExistentes, setBarberiasExistentes] = useState([]);
  const [sugerenciasNombre, setSugerenciasNombre] = useState([]);
  const [sugerenciasDireccion, setSugerenciasDireccion] = useState([]);
  const [mostrarSugerenciasNombre, setMostrarSugerenciasNombre] = useState(false);
  const [mostrarSugerenciasDireccion, setMostrarSugerenciasDireccion] = useState(false);
  const [autocompletado, setAutocompletado] = useState(false);

  // Cargar barberías existentes cuando se abre el modal
  useEffect(() => {
    if (open && vanId) {
      cargarBarberiasExistentes();
    }
    
    // Limpiar formulario cuando se cierra el modal
    if (!open) {
      setBarberiaNombre("");
      setDireccion("");
      setTelefono("");
      setHoraVisita("");
      setNotas("");
      setSugerenciasNombre([]);
      setSugerenciasDireccion([]);
      setMostrarSugerenciasNombre(false);
      setMostrarSugerenciasDireccion(false);
      setAutocompletado(false);
    }
  }, [open, vanId]);

  async function cargarBarberiasExistentes() {
    try {
      console.log("🔄 Cargando barberías existentes para van_id:", vanId);
      
      // 1. Cargar desde rutas_barberias (barberías ya visitadas)
      const { data: rutasData, error: rutasError } = await supabase
        .from("rutas_barberias")
        .select("barberia_nombre, direccion, telefono")
        .eq("van_id", vanId);

      if (rutasError) {
        console.error("⚠️ Error cargando rutas:", rutasError);
      }

      // 2. Cargar desde clientes (todos los clientes/barberías del sistema)
      const { data: clientesData, error: clientesError } = await supabase
        .from("clientes")
        .select("negocio, direccion, telefono")
        .not("negocio", "is", null) // ← Solo traer donde negocio NO es null
        .neq("negocio", ""); // ← Y tampoco string vacío

      if (clientesError) {
        console.error("⚠️ Error cargando clientes:", clientesError);
      }

      console.log("📦 Rutas cargadas:", rutasData?.length || 0);
      console.log("📦 Clientes cargados:", clientesData?.length || 0);

      // Combinar ambas fuentes y normalizar
      const todasLasBarberias = [];
      
      // Agregar desde rutas_barberias
      (rutasData || []).forEach(item => {
        if (item.barberia_nombre && item.barberia_nombre.trim()) {
          todasLasBarberias.push({
            barberia_nombre: item.barberia_nombre.trim(),
            direccion: item.direccion?.trim() || "",
            telefono: item.telefono?.trim() || "",
            fuente: "rutas"
          });
        }
      });

      // Agregar desde clientes
      (clientesData || []).forEach(item => {
        if (item.negocio && item.negocio.trim()) {
          todasLasBarberias.push({
            barberia_nombre: item.negocio.trim(),
            direccion: item.direccion?.trim() || "",
            telefono: item.telefono?.trim() || "",
            fuente: "clientes"
          });
        }
      });

      // Eliminar duplicados basados en nombre (case-insensitive)
      const uniques = [];
      const seen = new Set();
      
      todasLasBarberias.forEach(item => {
        try {
          const key = item.barberia_nombre.toLowerCase().trim();
          if (!seen.has(key) && key.length > 0) {
            seen.add(key);
            uniques.push(item);
          }
        } catch (error) {
          console.warn("⚠️ Error procesando item:", item, error);
        }
      });

      // Ordenar alfabéticamente
      uniques.sort((a, b) => {
        try {
          return a.barberia_nombre.localeCompare(b.barberia_nombre);
        } catch (error) {
          return 0;
        }
      });

      console.log("✅ Total de barberías únicas:", uniques.length);
      console.log("📋 Primeras 10:", uniques.slice(0, 10));
      
      setBarberiasExistentes(uniques);
    } catch (error) {
      console.error("💥 Error general al cargar barberías:", error);
      setBarberiasExistentes([]);
    }
  }

  // Filtrar sugerencias por nombre
  const handleNombreChange = (value) => {
    setBarberiaNombre(value);
    
    if (!value || value.trim().length < 1) {
      setSugerenciasNombre([]);
      setMostrarSugerenciasNombre(false);
      return;
    }

    try {
      const searchTerm = value.toLowerCase().trim();
      const filtradas = barberiasExistentes.filter(b => {
        try {
          return b.barberia_nombre && 
                 b.barberia_nombre.toLowerCase().includes(searchTerm);
        } catch (error) {
          console.warn("⚠️ Error filtrando barbería:", b, error);
          return false;
        }
      });

      console.log("🔍 Buscando:", value, "Encontradas:", filtradas.length, filtradas.slice(0, 5));
      setSugerenciasNombre(filtradas);
      setMostrarSugerenciasNombre(filtradas.length > 0);
    } catch (error) {
      console.error("💥 Error en handleNombreChange:", error);
      setSugerenciasNombre([]);
      setMostrarSugerenciasNombre(false);
    }
  };

  // Filtrar sugerencias por dirección
  const handleDireccionChange = (value) => {
    setDireccion(value);
    
    if (!value || value.trim().length < 1) {
      setSugerenciasDireccion([]);
      setMostrarSugerenciasDireccion(false);
      return;
    }

    try {
      const searchTerm = value.toLowerCase().trim();
      const filtradas = barberiasExistentes.filter(b => {
        try {
          return b.direccion && 
                 b.direccion.toLowerCase().includes(searchTerm);
        } catch (error) {
          console.warn("⚠️ Error filtrando dirección:", b, error);
          return false;
        }
      });

      console.log("🗺️ Buscando dirección:", value, "Encontradas:", filtradas.length);
      setSugerenciasDireccion(filtradas);
      setMostrarSugerenciasDireccion(filtradas.length > 0);
    } catch (error) {
      console.error("💥 Error en handleDireccionChange:", error);
      setSugerenciasDireccion([]);
      setMostrarSugerenciasDireccion(false);
    }
  };

  // Seleccionar sugerencia y autocompletar
  const seleccionarBarberia = (barberia) => {
    try {
      setBarberiaNombre(barberia.barberia_nombre || "");
      setDireccion(barberia.direccion || "");
      setTelefono(barberia.telefono || "");
      setMostrarSugerenciasNombre(false);
      setMostrarSugerenciasDireccion(false);
      
      // Mostrar feedback de autocompletado
      setAutocompletado(true);
      setTimeout(() => setAutocompletado(false), 2000);
      
      console.log("✅ Barbería seleccionada:", barberia);
    } catch (error) {
      console.error("💥 Error al seleccionar barbería:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!barberiaNombre.trim() || !vanId) return;

    setGuardando(true);
    try {
      const { error } = await supabase.from("rutas_barberias").insert({
        van_id: vanId,
        barberia_nombre: barberiaNombre.trim(),
        direccion: direccion.trim() || null,
        telefono: telefono.trim() || null,
        dia: fechaSeleccionada,
        hora_visita: horaVisita || null,
        notas: notas.trim() || null,
        visitada: false,
      });

      if (error) throw error;

      // Limpiar formulario
      setBarberiaNombre("");
      setDireccion("");
      setTelefono("");
      setHoraVisita("");
      setNotas("");
      setSugerenciasNombre([]);
      setSugerenciasDireccion([]);
      setMostrarSugerenciasNombre(false);
      setMostrarSugerenciasDireccion(false);
      setAutocompletado(false);
      
      onRefresh();
      onClose();
    } catch (error) {
      console.error("Error al guardar barbería:", error);
      alert("Error saving the barbershop");
    } finally {
      setGuardando(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90dvh]">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <IconMap />
            <h3 className="font-bold text-lg">Add Barbershop</h3>
          </div>
          <button
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={onClose}
          >
            ✖
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Mensaje informativo si no hay barberías guardadas */}
          {barberiasExistentes.length === 0 && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <div className="text-blue-600 mt-0.5">ℹ️</div>
                <div className="text-sm text-blue-800">
                  <strong>No barbershops found.</strong> Enter the details below to add your first one.
                </div>
              </div>
            </div>
          )}

          {/* Mensaje cuando hay barberías disponibles */}
          {barberiasExistentes.length > 0 && (
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <div className="text-purple-600 mt-0.5">✨</div>
                <div className="text-sm text-purple-800">
                  <strong>{barberiasExistentes.length} barbershop{barberiasExistentes.length !== 1 ? 's' : ''} available!</strong> Start typing to search and autofill.
                </div>
              </div>
            </div>
          )}

          <div className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
              <span>Barbershop Name *</span>
              {barberiasExistentes.length > 0 ? (
                <span className="text-xs bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-purple-300 font-bold">
                  <IconSearch />
                  {barberiasExistentes.length} in database
                </span>
              ) : (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                  ✍️ Add new
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                value={barberiaNombre}
                onChange={(e) => handleNombreChange(e.target.value)}
                onFocus={() => {
                  try {
                    if (barberiaNombre && barberiaNombre.length >= 1 && barberiasExistentes.length > 0) {
                      const searchTerm = barberiaNombre.toLowerCase().trim();
                      const filtradas = barberiasExistentes.filter(b => {
                        try {
                          return b.barberia_nombre && 
                                 b.barberia_nombre.toLowerCase().includes(searchTerm);
                        } catch (error) {
                          return false;
                        }
                      });
                      if (filtradas.length > 0) {
                        setSugerenciasNombre(filtradas);
                        setMostrarSugerenciasNombre(true);
                      }
                    }
                  } catch (error) {
                    console.error("Error en onFocus nombre:", error);
                  }
                }}
                onBlur={() => setTimeout(() => setMostrarSugerenciasNombre(false), 300)}
                className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg pl-10 pr-4 py-2.5 transition-colors"
                placeholder="Start typing to search..."
                required
                autoComplete="off"
              />
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                <IconSearch />
              </div>
            </div>
            
            {/* Dropdown de sugerencias por nombre */}
            {mostrarSugerenciasNombre && sugerenciasNombre.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border-2 border-purple-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-2 text-xs font-semibold flex items-center justify-between">
                  <span>📍 {sugerenciasNombre.length} match{sugerenciasNombre.length !== 1 ? 'es' : ''} found</span>
                  <span className="opacity-75">Click to autofill</span>
                </div>
                {sugerenciasNombre.map((barberia, idx) => (
                  <div
                    key={`${barberia.barberia_nombre || 'unknown'}-${idx}`}
                    onClick={() => seleccionarBarberia(barberia)}
                    className="px-4 py-3 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors">
                            {barberia.barberia_nombre || "Sin nombre"}
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                            barberia.fuente === 'clientes' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {barberia.fuente === 'clientes' ? '👥 Client' : '✓ Visited'}
                          </span>
                        </div>
                        {barberia.direccion && barberia.direccion.trim() && (
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <IconLocation />
                            {barberia.direccion}
                          </div>
                        )}
                        {barberia.telefono && barberia.telefono.trim() && (
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <IconPhone />
                            {barberia.telefono}
                          </div>
                        )}
                      </div>
                      <div className="text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Address
            </label>
            <div className="relative">
              <input
                type="text"
                value={direccion}
                onChange={(e) => handleDireccionChange(e.target.value)}
                onFocus={() => {
                  try {
                    if (direccion && direccion.length >= 1 && barberiasExistentes.length > 0) {
                      const searchTerm = direccion.toLowerCase().trim();
                      const filtradas = barberiasExistentes.filter(b => {
                        try {
                          return b.direccion && 
                                 b.direccion.toLowerCase().includes(searchTerm);
                        } catch (error) {
                          return false;
                        }
                      });
                      if (filtradas.length > 0) {
                        setSugerenciasDireccion(filtradas);
                        setMostrarSugerenciasDireccion(true);
                      }
                    }
                  } catch (error) {
                    console.error("Error en onFocus dirección:", error);
                  }
                }}
                onBlur={() => setTimeout(() => setMostrarSugerenciasDireccion(false), 300)}
                className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg pl-10 pr-4 py-2.5 transition-colors"
                placeholder="Start typing to search..."
                autoComplete="off"
              />
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                <IconLocation />
              </div>
            </div>
            
            {/* Dropdown de sugerencias por dirección */}
            {mostrarSugerenciasDireccion && sugerenciasDireccion.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border-2 border-purple-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-2 text-xs font-semibold flex items-center justify-between">
                  <span>🗺️ {sugerenciasDireccion.length} location{sugerenciasDireccion.length !== 1 ? 's' : ''} found</span>
                  <span className="opacity-75">Click to autofill</span>
                </div>
                {sugerenciasDireccion.map((barberia, idx) => (
                  <div
                    key={`${barberia.barberia_nombre || 'unknown'}-${idx}`}
                    onClick={() => seleccionarBarberia(barberia)}
                    className="px-4 py-3 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors">
                            {barberia.barberia_nombre || "Sin nombre"}
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                            barberia.fuente === 'clientes' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {barberia.fuente === 'clientes' ? '👥 Client' : '✓ Visited'}
                          </span>
                        </div>
                        {barberia.direccion && barberia.direccion.trim() && (
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <IconLocation />
                            {barberia.direccion}
                          </div>
                        )}
                      </div>
                      <div className="text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Phone
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-4 py-2.5 transition-colors"
              placeholder="e.g., (555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Visit Time
            </label>
            <input
              type="time"
              value={horaVisita}
              onChange={(e) => setHoraVisita(e.target.value)}
              className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-4 py-2.5 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-4 py-2.5 transition-colors resize-none"
              rows={3}
              placeholder="Special instructions, contact person, etc."
            />
          </div>

          <div className="text-xs text-gray-500 bg-purple-50 p-3 rounded-lg">
            <strong>Date:</strong> {dayjs(fechaSeleccionada).format("dddd, MMMM D, YYYY")}
          </div>

          {/* Mensaje de autocompletado */}
          {autocompletado && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-3 flex items-center gap-2 animate-pulse">
              <div className="bg-green-500 text-white rounded-full p-1">
                <IconCheck />
              </div>
              <span className="text-sm font-semibold text-green-700">
                ✨ Information autofilled successfully!
              </span>
            </div>
          )}

        </div>{/* end scrollable body */}
          <div className="p-4 border-t bg-white shrink-0 rounded-b-3xl sm:rounded-b-2xl">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={guardando || !barberiaNombre.trim()}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {guardando ? "Saving..." : "Add"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Tarjeta de Métrica Mejorada ---------- */
function MetricCard({ title, value, unit, trend, icon, gradientFrom, gradientTo, valuePrefix = "", subtitle = null, onClick = null }) {
  const isPositive = trend > 0;
  const isNeutral = trend === 0;

  return (
    <div
      className={`bg-gradient-to-br ${gradientFrom} ${gradientTo} rounded-2xl shadow-lg hover:shadow-xl transition-all p-5 text-white relative overflow-hidden ${onClick ? 'cursor-pointer hover:scale-[1.03] active:scale-[0.98]' : ''}`}
      onClick={onClick}
    >
      <div className="absolute top-0 right-0 opacity-10 transform translate-x-4 -translate-y-4">
        <div className="scale-[2]">{icon}</div>
      </div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold opacity-90">{title}</div>
          <div className="flex items-center gap-1.5">
            {onClick && (
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-semibold opacity-80">tap</span>
            )}
            {icon}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-4xl font-bold">
            {valuePrefix}{typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: value >= 1000 ? 0 : 1 }) : value}{unit}
          </div>
        </div>
        {trend !== null && trend !== undefined && (
          <div className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${isNeutral ? 'opacity-70' : ''}`}>
            <IconTrending up={isPositive} />
            <span>{isPositive ? '+' : ''}{trend.toFixed(1)}% vs previous</span>
          </div>
        )}
        {subtitle && !trend && (
          <div className="mt-2 text-xs font-medium opacity-80">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

/* ---------- KPI Detail Modal ---------- */
function KpiDetailModal({ type, ventas, ventasSerie, metricas, rangeDays, historialBackups, onClose, getNombreCliente }) {
  if (!type) return null;

  // --- Shared derived data ---
  const totalRevenue  = metricas.totalVentas;
  const totalOrders   = metricas.totalOrdenes;
  const avgTicketVal  = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Revenue per day with cumulative
  let cumulative = 0;
  const serieWithCumul = ventasSerie.map(d => {
    cumulative += d.total;
    return { ...d, cumulative };
  });

  // Best / worst selling day
  const daysWithSales = ventasSerie.filter(d => d.total > 0);
  const bestDay  = daysWithSales.length ? daysWithSales.reduce((b, d) => d.total > b.total ? d : b, daysWithSales[0]) : null;
  const worstDay = daysWithSales.length ? daysWithSales.reduce((b, d) => d.total < b.total ? d : b, daysWithSales[0]) : null;
  const zeroDays = ventasSerie.filter(d => d.total === 0).length;

  // Half-period comparison
  const mitad = Math.floor(rangeDays / 2);
  const fechaMitad = dayjs().subtract(mitad, "day");
  const primera = ventas.filter(v => dayjs(v.fecha).isBefore(fechaMitad));
  const segunda  = ventas.filter(v => !dayjs(v.fecha).isBefore(fechaMitad));
  const totalPrimera = primera.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalSegunda = segunda.reduce((s, v) => s + Number(v.total || 0), 0);

  // Weekly breakdown (group by week)
  const weekMap = new Map();
  ventasSerie.forEach(d => {
    const wk = dayjs(d.fecha).startOf("isoWeek").format("MM/DD");
    const e = weekMap.get(wk) || { week: wk, revenue: 0, orders: 0 };
    weekMap.set(wk, { week: wk, revenue: e.revenue + d.total, orders: e.orders + d.orders });
  });
  const weekData = [...weekMap.values()].slice(-4); // last 4 weeks

  // Debt breakdown from backup
  const backupResumen = historialBackups?.[0]?.resumen;
  const topDeudores   = backupResumen?.top_deudores || [];

  const configs = {
    "daily-avg": {
      title: "Daily Average",
      icon: "📊",
      color: "from-blue-600 to-cyan-500",
    },
    growth: {
      title: "Growth Analysis",
      icon: "📈",
      color: metricas.crecimiento >= 0 ? "from-green-600 to-emerald-500" : "from-red-600 to-orange-500",
    },
    debt: {
      title: "Total Debt",
      icon: "💳",
      color: metricas.totalDeuda > 0 ? "from-orange-600 to-red-500" : "from-green-600 to-emerald-500",
    },
    clients: {
      title: "Active Clients",
      icon: "👥",
      color: "from-purple-600 to-pink-500",
    },
  };
  const cfg = configs[type];

  const StatBubble = ({ label, value, sub }) => (
    <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 text-center">
      <div className="text-xl sm:text-2xl font-bold leading-tight">{value}</div>
      <div className="text-[11px] font-semibold opacity-90 mt-0.5 leading-tight">{label}</div>
      {sub && <div className="text-[10px] opacity-70 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/65 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92dvh]">

        {/* Gradient header */}
        <div className={`bg-gradient-to-r ${cfg.color} text-white px-6 py-5 rounded-t-3xl sm:rounded-t-3xl shrink-0`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{cfg.icon}</span>
              <div>
                <h3 className="font-bold text-xl leading-tight">{cfg.title}</h3>
                <p className="text-xs opacity-80">Last {rangeDays} days</p>
              </div>
            </div>
            <button
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors text-lg font-bold"
              onClick={onClose}
            >✕</button>
          </div>

          {/* KPI bubbles */}
          {type === "daily-avg" && (
            <div className="grid grid-cols-3 gap-3">
              <StatBubble label="Daily Average" value={fmtMoney(metricas.promedioDiario)} />
              <StatBubble label="Best Day" value={bestDay ? fmtMoney(bestDay.total) : "—"} sub={bestDay ? dayjs(bestDay.fecha).format("MMM D") : ""} />
              <StatBubble label="Zero-sale Days" value={zeroDays} sub={`of ${rangeDays}`} />
            </div>
          )}
          {type === "growth" && (
            <div className="grid grid-cols-3 gap-3">
              <StatBubble label="Growth" value={(metricas.crecimiento >= 0 ? "+" : "") + metricas.crecimiento.toFixed(1) + "%"} />
              <StatBubble label="First Half" value={fmtMoney(totalPrimera)} sub={`${primera.length} orders`} />
              <StatBubble label="Second Half" value={fmtMoney(totalSegunda)} sub={`${segunda.length} orders`} />
            </div>
          )}
          {type === "debt" && (
            <div className="grid grid-cols-3 gap-3">
              <StatBubble label="Total Debt" value={fmtMoney(metricas.totalDeuda)} />
              <StatBubble label="Clients w/ Debt" value={metricas.clientesConDeuda} />
              <StatBubble label="Avg Debt/Client" value={metricas.clientesConDeuda > 0 ? fmtMoney(metricas.totalDeuda / metricas.clientesConDeuda) : "—"} />
            </div>
          )}
          {type === "clients" && (
            <div className="grid grid-cols-3 gap-3">
              <StatBubble label="Active Clients" value={metricas.clientesUnicos} sub={`in ${rangeDays}d`} />
              <StatBubble label="Avg per Client" value={metricas.clientesUnicos > 0 ? fmtMoney(totalRevenue / metricas.clientesUnicos) : "—"} />
              <StatBubble label="Avg Orders" value={metricas.clientesUnicos > 0 ? (totalOrders / metricas.clientesUnicos).toFixed(1) : "—"} sub="per client" />
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* DAILY AVERAGE content */}
          {type === "daily-avg" && <>
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">📅 Daily Revenue</h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ventasSerie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="fecha" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} width={42} />
                    <Tooltip formatter={(v) => [fmtMoney(v), "Revenue"]} labelFormatter={(l) => dayjs(l).format("MMM D")} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <ReferenceLine y={metricas.promedioDiario} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'avg', position: 'insideTopRight', fill: '#f59e0b', fontSize: 10 }} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {ventasSerie.map((d, i) => (
                        <Cell key={i} fill={d.total >= metricas.promedioDiario ? '#3b82f6' : '#bfdbfe'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-400 mt-2">🔵 Above average &nbsp; 🔹 Below average &nbsp; — avg line in amber</p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">📈 Cumulative Revenue</h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serieWithCumul} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gCumul" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="fecha" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} width={42} />
                    <Tooltip formatter={(v) => [fmtMoney(v), "Cumulative"]} labelFormatter={(l) => dayjs(l).format("MMM D")} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Area type="monotone" dataKey="cumulative" stroke="#06b6d4" strokeWidth={2.5} fill="url(#gCumul)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {bestDay && worstDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-2xl p-4 border border-green-200">
                  <div className="text-xs text-green-600 font-bold uppercase mb-1">🏆 Best Day</div>
                  <div className="font-bold text-gray-900">{dayjs(bestDay.fecha).format("ddd, MMM D")}</div>
                  <div className="text-2xl font-bold text-green-700">{fmtMoney(bestDay.total)}</div>
                  <div className="text-xs text-gray-500">{bestDay.orders} orders</div>
                </div>
                <div className="bg-red-50 rounded-2xl p-4 border border-red-200">
                  <div className="text-xs text-red-600 font-bold uppercase mb-1">📉 Lowest Day</div>
                  <div className="font-bold text-gray-900">{dayjs(worstDay.fecha).format("ddd, MMM D")}</div>
                  <div className="text-2xl font-bold text-red-600">{fmtMoney(worstDay.total)}</div>
                  <div className="text-xs text-gray-500">{worstDay.orders} orders</div>
                </div>
              </div>
            )}
          </>}

          {/* GROWTH content */}
          {type === "growth" && <>
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">📊 Period Comparison</h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: `First ${mitad}d`, revenue: totalPrimera, orders: primera.length },
                      { name: `Last ${mitad}d`,  revenue: totalSegunda, orders: segunda.length },
                    ]}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} width={42} />
                    <Tooltip formatter={(v, n) => [n === "revenue" ? fmtMoney(v) : v + " orders", n === "revenue" ? "Revenue" : "Orders"]} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="revenue" fill={metricas.crecimiento >= 0 ? '#10b981' : '#ef4444'} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">📅 Weekly Revenue</h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} width={42} />
                    <Tooltip formatter={(v) => [fmtMoney(v), "Revenue"]} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="revenue" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`rounded-2xl p-5 text-white bg-gradient-to-r ${metricas.crecimiento >= 0 ? 'from-green-500 to-emerald-600' : 'from-red-500 to-orange-600'}`}>
              <div className="text-4xl font-bold mb-1">{metricas.crecimiento >= 0 ? "+" : ""}{metricas.crecimiento.toFixed(1)}%</div>
              <div className="text-sm opacity-90 font-medium">
                {metricas.crecimiento >= 0
                  ? `Revenue increased by ${fmtMoney(Math.abs(totalSegunda - totalPrimera))} in the second half`
                  : `Revenue decreased by ${fmtMoney(Math.abs(totalSegunda - totalPrimera))} in the second half`}
              </div>
            </div>
          </>}

          {/* DEBT content */}
          {type === "debt" && <>
            {metricas.totalDeuda === 0 ? (
              <div className="text-center py-10">
                <div className="text-6xl mb-3">🎉</div>
                <div className="font-bold text-gray-700 text-xl">No outstanding debt!</div>
                <div className="text-gray-500 text-sm mt-1">All clients are up to date with payments</div>
              </div>
            ) : (
              <>
                {topDeudores.length > 0 && (
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <h4 className="font-bold text-gray-700 mb-3 text-sm">🔴 Top Debtors</h4>
                    <div className="space-y-3">
                      {topDeudores.map((d, i) => {
                        const pct = metricas.totalDeuda > 0 ? (d.deuda / metricas.totalDeuda) * 100 : 0;
                        return (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold flex items-center justify-center">{i+1}</span>
                                <span className="text-sm font-semibold text-gray-800 truncate max-w-[140px]">{d.nombre}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-red-600">{fmtMoney(d.deuda)}</span>
                                <span className="text-xs text-gray-400 ml-1">{pct.toFixed(0)}%</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-orange-50 rounded-2xl p-4 border border-orange-200">
                    <div className="text-xs text-orange-600 font-bold uppercase mb-1">Total Owed</div>
                    <div className="text-2xl font-bold text-orange-700">{fmtMoney(metricas.totalDeuda)}</div>
                  </div>
                  <div className="bg-red-50 rounded-2xl p-4 border border-red-200">
                    <div className="text-xs text-red-600 font-bold uppercase mb-1">Clients w/ Debt</div>
                    <div className="text-2xl font-bold text-red-700">{metricas.clientesConDeuda}</div>
                  </div>
                </div>

                {topDeudores.length > 0 && (
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <h4 className="font-bold text-gray-700 mb-3 text-sm">📊 Debt Distribution</h4>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topDeudores.slice(0, 5)} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} layout="vertical">
                          <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} />
                          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={80} />
                          <Tooltip formatter={(v) => [fmtMoney(v), "Debt"]} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                          <Bar dataKey="deuda" fill="#f97316" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            )}
          </>}

          {/* CLIENTS content */}
          {type === "clients" && <>
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">📅 Daily Active Clients</h4>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ventasSerie.map(d => {
                      const clientsThisDay = new Set(
                        ventas
                          .filter(v => dayjs(v.fecha).format("YYYY-MM-DD") === d.fecha && v.cliente_id)
                          .map(v => v.cliente_id)
                      ).size;
                      return { ...d, clients: clientsThisDay };
                    })}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="fecha" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <Tooltip formatter={(v) => [v, "Clients"]} labelFormatter={(l) => dayjs(l).format("MMM D")} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="clients" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {(() => {
              // Top clients by revenue
              const clientMap = new Map();
              ventas.forEach(v => {
                if (!v.cliente_id) return;
                const e = clientMap.get(v.cliente_id) || { total: 0, count: 0 };
                clientMap.set(v.cliente_id, { total: e.total + Number(v.total || 0), count: e.count + 1 });
              });
              const topClients = [...clientMap.entries()]
                .map(([id, e]) => ({ id, nombre: getNombreCliente ? getNombreCliente(id) : id, total: e.total, count: e.count }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 5);

              if (!topClients.length) return null;
              const maxRev = topClients[0]?.total || 1;
              return (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <h4 className="font-bold text-gray-700 mb-3 text-sm">🥇 Top Clients by Revenue</h4>
                  <div className="space-y-3">
                    {topClients.map((c, i) => (
                      <div key={c.id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold flex items-center justify-center">{i+1}</span>
                            <span className="text-sm font-semibold text-gray-800 truncate max-w-[150px]">{c.nombre}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-purple-700">{fmtMoney(c.total)}</span>
                            <span className="text-xs text-gray-400 ml-1">{c.count} orders</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-400 to-pink-500 rounded-full" style={{ width: `${(c.total/maxRev)*100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-purple-50 rounded-2xl p-4 border border-purple-200">
                <div className="text-xs text-purple-600 font-bold uppercase mb-1">Revenue / Client</div>
                <div className="text-2xl font-bold text-purple-700">
                  {metricas.clientesUnicos > 0 ? fmtMoney(totalRevenue / metricas.clientesUnicos) : "—"}
                </div>
              </div>
              <div className="bg-pink-50 rounded-2xl p-4 border border-pink-200">
                <div className="text-xs text-pink-600 font-bold uppercase mb-1">Orders / Client</div>
                <div className="text-2xl font-bold text-pink-700">
                  {metricas.clientesUnicos > 0 ? (totalOrders / metricas.clientesUnicos).toFixed(1) : "—"}
                </div>
              </div>
            </div>
          </>}
        </div>

        {/* Footer */}
        <div className="p-4 border-t shrink-0">
          <button
            className="w-full bg-gradient-to-r from-gray-700 to-gray-900 hover:from-gray-800 hover:to-black text-white font-semibold py-3 rounded-2xl transition-all"
            onClick={onClose}
          >Close</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Mini Sparkline ---------- */
function MiniSparkline({ data, color = "#3b82f6" }) {
  const max = Math.max(...data.map(d => d.value));
  const min = Math.min(...data.map(d => d.value));
  const range = max - min || 1;
  
  return (
    <div className="h-12 flex items-end gap-0.5">
      {data.map((d, i) => {
        const height = ((d.value - min) / range) * 100;
        return (
          <div
            key={i}
            className="flex-1 rounded-t transition-all"
            style={{
              backgroundColor: color,
              height: `${Math.max(height, 5)}%`,
              opacity: 0.7 + (height / 100) * 0.3,
            }}
          />
        );
      })}
    </div>
  );
}

/* ==================== SALES DETAIL MODAL ==================== */
function SalesDetailModal({ type, ventas, ventasSerie, productosTop, metricas, rangeDays, onClose, getNombreCliente }) {
  if (!type) return null;

  // --- Compute analytics from ventas ---
  const totalRevenue = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalOrders  = ventas.length;
  const avgTicket    = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Best day
  const bestDay = ventasSerie.length > 0
    ? ventasSerie.reduce((best, d) => d.total > best.total ? d : best, ventasSerie[0])
    : null;

  // Unique clients
  const uniqueClients = new Set(ventas.map(v => v.cliente_id).filter(Boolean)).size;

  // Min / max sale
  const amounts = ventas.map(v => Number(v.total || 0));
  const minSale = amounts.length ? Math.min(...amounts) : 0;
  const maxSale = amounts.length ? Math.max(...amounts) : 0;

  // Payment breakdown
  const payBreakdown = [
    { name: "Paid",    value: ventas.filter(v => v.estado_pago === "pagado").length,  color: "#10b981" },
    { name: "Partial", value: ventas.filter(v => v.estado_pago === "parcial").length, color: "#3b82f6" },
    { name: "Pending", value: ventas.filter(v => v.estado_pago === "pendiente" || !v.estado_pago).length, color: "#f59e0b" },
  ].filter(p => p.value > 0);

  // Ticket distribution buckets
  const buckets = [
    { label: "<$50",     min: 0,   max: 50,  color: "#c7d2fe" },
    { label: "$50–100",  min: 50,  max: 100, color: "#818cf8" },
    { label: "$100–200", min: 100, max: 200, color: "#6366f1" },
    { label: "$200+",    min: 200, max: Infinity, color: "#4338ca" },
  ].map(b => ({
    ...b,
    count: ventas.filter(v => { const t = Number(v.total || 0); return t >= b.min && t < b.max; }).length,
  }));

  // Top 5 days by sales
  const top5Days = [...ventasSerie]
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Orders per day distribution
  const ordersDistrib = [
    { label: "1 item",   count: ventasSerie.filter(d => d.orders === 1).length },
    { label: "2–3 items", count: ventasSerie.filter(d => d.orders >= 2 && d.orders <= 3).length },
    { label: "4–6 items", count: ventasSerie.filter(d => d.orders >= 4 && d.orders <= 6).length },
    { label: "7+ items",  count: ventasSerie.filter(d => d.orders >= 7).length },
  ].filter(d => d.count > 0);

  const titles = {
    sales:  { label: "Total Sales Detail",   icon: "💰", color: "from-blue-600 to-indigo-600" },
    orders: { label: "Total Orders Detail",   icon: "🛒", color: "from-emerald-600 to-teal-600" },
    ticket: { label: "Average Ticket Detail", icon: "🎫", color: "from-purple-600 to-pink-600" },
  };
  const t = titles[type];

  const KpiPill = ({ label, value, sub }) => (
    <div className="bg-white/10 rounded-2xl p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-semibold opacity-90 mt-0.5">{label}</div>
      {sub && <div className="text-xs opacity-70 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className={`bg-gradient-to-r ${t.color} text-white px-6 py-5 rounded-t-3xl shrink-0`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{t.icon}</span>
              <div>
                <h3 className="font-bold text-xl">{t.label}</h3>
                <p className="text-xs opacity-80">Last {rangeDays} days · {totalOrders} orders</p>
              </div>
            </div>
            <button
              className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors text-lg"
              onClick={onClose}
            >✖</button>
          </div>

          {/* KPI row inside header */}
          <div className="grid grid-cols-3 gap-3">
            {type === "sales" && <>
              <KpiPill label="Total Revenue" value={fmtMoney(totalRevenue)} />
              <KpiPill label="Daily Avg" value={fmtMoney(metricas.promedioDiario)} />
              <KpiPill label="Best Day" value={bestDay ? fmtMoney(bestDay.total) : "—"} sub={bestDay ? dayjs(bestDay.fecha).format("MMM D") : ""} />
            </>}
            {type === "orders" && <>
              <KpiPill label="Total Orders" value={totalOrders} />
              <KpiPill label="Daily Avg" value={(totalOrders / rangeDays).toFixed(1)} sub="orders/day" />
              <KpiPill label="Unique Clients" value={uniqueClients} />
            </>}
            {type === "ticket" && <>
              <KpiPill label="Avg Ticket" value={fmtMoney(avgTicket)} />
              <KpiPill label="Min Sale" value={fmtMoney(minSale)} />
              <KpiPill label="Max Sale" value={fmtMoney(maxSale)} />
            </>}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ---- TYPE: SALES ---- */}
          {type === "sales" && <>
            {/* Revenue chart */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">Daily Revenue</h4>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ventasSerie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="fecha" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} width={40} />
                    <Tooltip formatter={(v) => [fmtMoney(v), "Revenue"]} labelFormatter={(l) => dayjs(l).format("MMM D")} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top 5 days */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">🏆 Top 5 Sales Days</h4>
              <div className="space-y-2">
                {top5Days.map((d, i) => {
                  const pct = maxSale > 0 ? (d.total / (top5Days[0]?.total || 1)) * 100 : 0;
                  return (
                    <div key={d.fecha} className="flex items-center gap-3">
                      <span className="w-5 text-xs font-bold text-gray-400">#{i+1}</span>
                      <span className="text-xs text-gray-600 w-20 shrink-0">{dayjs(d.fecha).format("ddd, MMM D")}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-800 w-20 text-right">{fmtMoney(d.total)}</span>
                      <span className="text-xs text-gray-400 w-14 text-right">{d.orders} orders</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment breakdown */}
            {payBreakdown.length > 0 && (
              <div className="bg-gray-50 rounded-2xl p-4">
                <h4 className="font-bold text-gray-700 mb-3 text-sm">💳 Payment Status Breakdown</h4>
                <div className="flex items-center gap-4">
                  <div className="w-32 h-32 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={payBreakdown} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3}>
                          {payBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v + " orders", n]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {payBreakdown.map((p) => (
                      <div key={p.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: p.color }}></div>
                          <span className="text-sm text-gray-700">{p.name}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-800">{p.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>}

          {/* ---- TYPE: ORDERS ---- */}
          {type === "orders" && <>
            {/* Orders per day chart */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">Daily Orders</h4>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ventasSerie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="fecha" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                    <Tooltip formatter={(v) => [v, "Orders"]} labelFormatter={(l) => dayjs(l).format("MMM D")} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="orders" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top 5 days by orders */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">🏆 Top 5 Busiest Days</h4>
              <div className="space-y-2">
                {[...ventasSerie].filter(d => d.orders > 0).sort((a, b) => b.orders - a.orders).slice(0, 5).map((d, i) => {
                  const maxO = Math.max(...ventasSerie.map(x => x.orders)) || 1;
                  return (
                    <div key={d.fecha} className="flex items-center gap-3">
                      <span className="w-5 text-xs font-bold text-gray-400">#{i+1}</span>
                      <span className="text-xs text-gray-600 w-20 shrink-0">{dayjs(d.fecha).format("ddd, MMM D")}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: `${(d.orders/maxO)*100}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-800 w-16 text-right">{d.orders} orders</span>
                      <span className="text-xs text-gray-400 w-20 text-right">{fmtMoney(d.total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Orders per day distribution */}
            {ordersDistrib.length > 0 && (
              <div className="bg-gray-50 rounded-2xl p-4">
                <h4 className="font-bold text-gray-700 mb-3 text-sm">📊 Orders/Day Distribution</h4>
                <div className="space-y-2">
                  {ordersDistrib.map((b) => {
                    const maxC = Math.max(...ordersDistrib.map(x => x.count)) || 1;
                    return (
                      <div key={b.label} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 w-16 shrink-0">{b.label}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full" style={{ width: `${(b.count/maxC)*100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-700 w-12 text-right">{b.count} days</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top products in period */}
            {productosTop.length > 0 && (
              <div className="bg-gray-50 rounded-2xl p-4">
                <h4 className="font-bold text-gray-700 mb-3 text-sm">📦 Top Products (units sold)</h4>
                <div className="space-y-2">
                  {productosTop.slice(0, 5).map((p, i) => {
                    const maxQ = productosTop[0]?.cantidad || 1;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-400 w-5">#{i+1}</span>
                        <span className="text-xs text-gray-700 flex-1 truncate">{p.nombre}</span>
                        <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: `${(p.cantidad/maxQ)*100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-800 w-10 text-right">{p.cantidad}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>}

          {/* ---- TYPE: TICKET ---- */}
          {type === "ticket" && <>
            {/* Average ticket trend */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">Avg Ticket Trend</h4>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={ventasSerie.map(d => ({
                      ...d,
                      avgTicket: d.orders > 0 ? d.total / d.orders : null,
                    }))}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="fecha" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} width={46} />
                    <Tooltip formatter={(v) => [fmtMoney(v), "Avg Ticket"]} labelFormatter={(l) => dayjs(l).format("MMM D")} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    {avgTicket > 0 && <ReferenceLine y={avgTicket} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'avg', position: 'insideTopRight', fill: '#f59e0b', fontSize: 10 }} />}
                    <Line type="monotone" dataKey="avgTicket" stroke="#8b5cf6" strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Ticket distribution */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">💵 Sale Amount Distribution</h4>
              <div className="space-y-3">
                {buckets.map((b) => {
                  const maxC = Math.max(...buckets.map(x => x.count)) || 1;
                  const pct  = totalOrders > 0 ? Math.round((b.count / totalOrders) * 100) : 0;
                  return (
                    <div key={b.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-600">{b.label}</span>
                        <span className="text-xs text-gray-500">{b.count} sales · {pct}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(b.count/maxC)*100}%`, background: b.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top clients by ticket avg */}
            {ventas.length > 0 && (() => {
              const clientMap = new Map();
              ventas.forEach(v => {
                if (!v.cliente_id) return;
                const e = clientMap.get(v.cliente_id) || { total: 0, count: 0 };
                clientMap.set(v.cliente_id, { total: e.total + Number(v.total || 0), count: e.count + 1 });
              });
              const topClients = [...clientMap.entries()]
                .map(([id, e]) => ({ id, nombre: getNombreCliente(id), avgTicket: e.total / e.count, count: e.count }))
                .sort((a, b) => b.avgTicket - a.avgTicket)
                .slice(0, 5);
              if (!topClients.length) return null;
              return (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <h4 className="font-bold text-gray-700 mb-3 text-sm">🥇 Top Clients by Avg Ticket</h4>
                  <div className="space-y-2">
                    {topClients.map((c, i) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <span className="w-5 text-xs font-bold text-gray-400">#{i+1}</span>
                        <span className="flex-1 text-xs text-gray-700 truncate">{c.nombre}</span>
                        <span className="text-xs text-gray-400">{c.count} orders</span>
                        <span className="text-xs font-bold text-purple-700 w-20 text-right">{fmtMoney(c.avgTicket)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>}

        </div>

        {/* Footer */}
        <div className="p-4 border-t shrink-0">
          <button
            className="w-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white font-semibold py-3 rounded-xl transition-all"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== DASHBOARD MEJORADO ==================== */
export default function Dashboard() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  const { syncing, lastSync, historialBackups, ventasPendientes, syncError, sincronizarAhora } = useSyncGlobal();

  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [rangeDays, setRangeDays] = useState(14);
  const [ventasSerie, setVentasSerie] = useState([]);
  const [productosTop, setProductosTop] = useState([]);
  const [topMode, setTopMode] = useState("units"); // 'units' | 'revenue'
  const [stockVan, setStockVan] = useState([]);

  const [showAllLow, setShowAllLow] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const LOW_STOCK_PREVIEW = 3;

  const [showRecentSales, setShowRecentSales] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(null); // 'sales' | 'orders' | 'ticket' | null
  const [showKpiModal, setShowKpiModal] = useState(null); // 'daily-avg' | 'growth' | 'debt' | 'clients' | null

  const [mostrarTodas, setMostrarTodas] = useState(false);
  const ventasMostrar = mostrarTodas ? ventas : ventas.slice(0, 8);

  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [detalleProductos, setDetalleProductos] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [clientes, setClientes] = useState([]);

  const [metricas, setMetricas] = useState({
    promedioDiario: 0,
    crecimiento: 0,
    conversion: 0,
    productosAgotados: 0,
    totalVentas: 0,
    totalOrdenes: 0,
  });

  // Estados para rutas de barberías
  const [rutasBarberias, setRutasBarberias] = useState([]);
  const [fechaRutaSeleccionada, setFechaRutaSeleccionada] = useState(dayjs().format("YYYY-MM-DD"));
  const [showAddBarberia, setShowAddBarberia] = useState(false);
  const [loadingRutas, setLoadingRutas] = useState(false);

  useEffect(() => {
    cargarClientes();
  }, []);

  useEffect(() => {
    if (van?.id) {
      cargarDatos(van.id, rangeDays);
      cargarStockVan(van.id);
      cargarRutasBarberias(van.id, fechaRutaSeleccionada);
    } else {
      setVentas([]);
      setVentasSerie([]);
      setProductosTop([]);
      setStockVan([]);
      setRutasBarberias([]);
      setLoading(false);
    }
  }, [van?.id, rangeDays, fechaRutaSeleccionada]);

  useEffect(() => {
    if (ventas.length > 0 || stockVan.length >= 0) {
      calcularMetricas();
    }
  }, [ventas, rangeDays, stockVan]);

  async function cargarClientes() {
    const { data } = await supabase.from("clientes").select("id, nombre");
    setClientes(data || []);
  }

  function getNombreCliente(id) {
    const c = clientes.find((x) => x.id === id);
    return c ? c.nombre : (id ? id.slice(0, 8) + "…" : "");
  }

  async function cargarDatos(vanId, days) {
    setLoading(true);
    const desde = dayjs().subtract(days - 1, "day").startOf("day").format("YYYY-MM-DD");

    const { data: ventasData, error: errVentas } = await supabase
      .from("ventas")
      .select("*")
      .eq("van_id", vanId)
      .gte("fecha", desde)
      .order("fecha", { ascending: false });

    if (errVentas) {
      setVentas([]);
      setVentasSerie([]);
    } else {
      setVentas(ventasData || []);

      const mapTotal = {};
      const mapCount = {};
      (ventasData || []).forEach((v) => {
        const f = dayjs(v.fecha).format("YYYY-MM-DD");
        mapTotal[f] = (mapTotal[f] || 0) + (Number(v.total) || 0);
        mapCount[f] = (mapCount[f] || 0) + 1;
      });

      const serie = rangeDaysArray(days).map((f) => ({
        fecha: f,
        total: mapTotal[f] || 0,
        orders: mapCount[f] || 0,
      }));
      setVentasSerie(serie);
    }

    // Top 10 productos
    const desde30 = dayjs().subtract(30, "day").startOf("day").format("YYYY-MM-DD");
    const { data: ventasIds } = await supabase
      .from("ventas")
      .select("id")
      .eq("van_id", vanId)
      .gte("fecha", desde30);

    const ids = (ventasIds || []).map((x) => x.id);
    let det = [];
    if (ids.length > 0) {
      const { data: det2 } = await supabase
        .from("detalle_ventas")
        .select("producto_id,cantidad,precio_unitario,subtotal")
        .in("venta_id", ids);
      det = det2 || [];
    }

    const qtyMap     = new Map();
    const revenueMap = new Map();
    (det || []).forEach((r) => {
      const pid = r.producto_id;
      const qty = Number(r.cantidad || 0);
      const rev = Number(r.subtotal || 0) || qty * Number(r.precio_unitario || 0);
      qtyMap.set(pid, (qtyMap.get(pid) || 0) + qty);
      revenueMap.set(pid, (revenueMap.get(pid) || 0) + rev);
    });

    let top = [];
    const idsProds = Array.from(qtyMap.keys()).slice(0, 50);
    if (idsProds.length > 0) {
      const { data: prods } = await supabase
        .from("productos")
        .select("id,nombre")
        .in("id", idsProds);
      const nameMap = new Map((prods || []).map((p) => [p.id, p.nombre]));
      top = Array.from(qtyMap.entries())
        .map(([producto_id, cantidad]) => ({
          producto_id,
          cantidad,
          revenue: revenueMap.get(producto_id) || 0,
          nombre: nameMap.get(producto_id) || producto_id,
        }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10);
    }
    setProductosTop(top);
    setLoading(false);
  }

  async function cargarStockVan(van_id) {
    try {
      // 1. Productos con stock bajo (< 10 unidades)
      const { data: stockBajo, error: errorStock } = await supabase
        .from("stock_van")
        .select("cantidad, producto_id, productos(nombre, codigo, precio)")
        .eq("van_id", van_id)
        .lt("cantidad", 10)
        .order("cantidad", { ascending: true });

      if (errorStock) console.error("❌ Error stock:", errorStock);
      if (!stockBajo?.length) { setStockVan([]); return; }

      // 2. Solo ventas de los últimos 60 días (filtro de productos "activos")
      const hace60d = dayjs().subtract(60, "day").toISOString();
      const hace30d = dayjs().subtract(30, "day").toISOString();

      const { data: ventasRecientes } = await supabase
        .from("ventas")
        .select("id")
        .eq("van_id", van_id)
        .gte("created_at", hace60d);

      // Fix: if no sales in 60d, still show low-stock items as 'sin_movimiento'
      if (!ventasRecientes?.length) {
        const stockSinMovimiento = stockBajo.map(item => ({
          nombre:       item.productos?.nombre || item.producto_id,
          codigo:       item.productos?.codigo || "",
          precio:       Number(item.productos?.precio || 0),
          cantidad:     item.cantidad,
          vendido30d:   0,
          velocidad:    0,
          diasRestantes: 999,
          ultimaVenta:  null,
          urgencia:     item.cantidad === 0 ? "critico" : "sin_movimiento",
        }));
        setStockVan(stockSinMovimiento);
        return;
      }

      const ids = ventasRecientes.map(v => v.id);

      // 3. detalle_ventas con fecha para calcular velocidad y última venta
      const { data: detalles } = await supabase
        .from("detalle_ventas")
        .select("producto_id, cantidad, created_at")
        .in("venta_id", ids);

      // 4. Calcular velocidad (últimos 30d) y última venta (últimos 60d) por producto
      const vendido30dMap  = new Map();
      const ultimaVentaMap = new Map();

      (detalles || []).forEach(d => {
        const pid = d.producto_id;
        // Velocidad: solo contar unidades de los últimos 30 días
        if (d.created_at >= hace30d) {
          vendido30dMap.set(pid, (vendido30dMap.get(pid) || 0) + Number(d.cantidad || 0));
        }
        // Última venta: máximo timestamp de los últimos 60d
        const actual = ultimaVentaMap.get(pid);
        if (!actual || d.created_at > actual) ultimaVentaMap.set(pid, d.created_at);
      });

      // 5. Filtrar solo productos vendidos en 60d y calcular urgencia
      const productosVendidos = new Set((detalles || []).map(d => d.producto_id));

      const stockFiltrado = stockBajo
        .filter(item => productosVendidos.has(item.producto_id))
        .map(item => {
          const v30 = vendido30dMap.get(item.producto_id) || 0;
          const velocidad = Number((v30 / 30).toFixed(2)); // unidades/día
          const diasRestantes = velocidad > 0
            ? Math.floor(item.cantidad / velocidad)
            : 999; // no se sabe cuándo se agota si no hubo ventas en 30d
          const urgencia = item.cantidad === 0 || diasRestantes < 7
            ? "critico"
            : diasRestantes < 14
            ? "bajo"
            : diasRestantes < 30
            ? "watch"
            : "sin_movimiento";
          return {
            nombre:        item.productos?.nombre || item.producto_id,
            codigo:        item.productos?.codigo || "",
            precio:        Number(item.productos?.precio || 0),
            cantidad:      item.cantidad,
            vendido30d:    v30,
            velocidad,
            diasRestantes,
            ultimaVenta:   ultimaVentaMap.get(item.producto_id) || null,
            urgencia,
          };
        })
        .sort((a, b) => a.diasRestantes - b.diasRestantes); // más urgentes primero

      setStockVan(stockFiltrado);

    } catch (error) {
      console.error("💥 Error cargarStockVan:", error);
      setStockVan([]);
    }
  }

  async function cargarRutasBarberias(vanId, fecha) {
    setLoadingRutas(true);
    try {
      const { data, error } = await supabase
        .from("rutas_barberias")
        .select("*")
        .eq("van_id", vanId)
        .eq("dia", fecha)
        .order("orden", { ascending: true })
        .order("hora_visita", { ascending: true });

      if (error) throw error;
      setRutasBarberias(data || []);
    } catch (error) {
      console.error("Error al cargar rutas:", error);
      setRutasBarberias([]);
    } finally {
      setLoadingRutas(false);
    }
  }

  async function toggleVisitada(id, visitada) {
    try {
      const { error } = await supabase
        .from("rutas_barberias")
        .update({ visitada: !visitada })
        .eq("id", id);

      if (error) throw error;
      cargarRutasBarberias(van.id, fechaRutaSeleccionada);
    } catch (error) {
      console.error("Error al actualizar:", error);
    }
  }

  async function eliminarBarberia(id) {
    if (!confirm("Remove this barbershop from the route?")) return;
    
    try {
      const { error } = await supabase
        .from("rutas_barberias")
        .delete()
        .eq("id", id);

      if (error) throw error;
      cargarRutasBarberias(van.id, fechaRutaSeleccionada);
    } catch (error) {
      console.error("Error al eliminar:", error);
    }
  }

  function normalizeDetalleRows(rows) {
    return (rows || []).map((r) => ({
      producto_id: r.producto_id ?? r.producto ?? r.id,
      cantidad: Number(r.cantidad || 1),
      precio_unit: r.precio_unit != null ? Number(r.precio_unit) : undefined,
      precio_unitario: r.precio_unitario != null ? Number(r.precio_unitario) : undefined,
      subtotal:
        r.subtotal != null
          ? Number(r.subtotal)
          : Number(r.cantidad || 0) *
            Number(
              r.precio_unit != null
                ? r.precio_unit
                : r.precio_unitario != null
                ? r.precio_unitario
                : 0
            ),
    }));
  }

  async function fetchDetalleFromVentaJSON(ventaId) {
    const { data: v } = await supabase
      .from("ventas")
      .select("productos")
      .eq("id", ventaId)
      .maybeSingle();

    const items = Array.isArray(v?.productos) ? v.productos : [];
    return normalizeDetalleRows(items);
  }

  async function abrirDetalleVenta(venta) {
    setVentaSeleccionada(venta);
    setCargandoDetalle(true);

    let det = [];

    try {
      const { data } = await supabase
        .from("detalle_ventas")
        .select("producto_id, cantidad, precio_unitario, subtotal")
        .eq("venta_id", venta.id);
      det = data || [];
    } catch {}

    if (!det.length) {
      try {
        det = await fetchDetalleFromVentaJSON(venta.id);
      } catch {
        det = [];
      }
    } else {
      det = normalizeDetalleRows(det);
    }

    let merged = det;
    const ids = Array.from(new Set(det.map((x) => x.producto_id))).filter(Boolean);
    if (ids.length > 0) {
      const { data: prods } = await supabase
        .from("productos")
        .select("id,nombre,codigo")
        .in("id", ids);
      const map = new Map((prods || []).map((p) => [p.id, p]));
      merged = det.map((r) => ({
        ...r,
        nombre: map.get(r.producto_id)?.nombre || r.producto_id,
        codigo: map.get(r.producto_id)?.codigo || r.producto_id,
      }));
    }

    setDetalleProductos(merged);
    setCargandoDetalle(false);
  }

  function cerrarDetalleVenta() {
    setVentaSeleccionada(null);
    setDetalleProductos([]);
    setCargandoDetalle(false);
  }

  const lowPreview = stockVan.slice(0, LOW_STOCK_PREVIEW);
  const chartData = withMA(ventasSerie, "total", 7);

  const calcularMetricas = () => {
    const totalVentas = ventas.reduce((sum, v) => sum + Number(v.total || 0), 0);
    const diasConVentas = new Set(ventas.map(v => dayjs(v.fecha).format("YYYY-MM-DD"))).size;
    const promedioDiario = diasConVentas > 0 ? totalVentas / diasConVentas : 0;

    const mitad = Math.floor(rangeDays / 2);
    const fechaMitad = dayjs().subtract(mitad, "day");
    const ventasPrimera = ventas.filter(v => dayjs(v.fecha).isBefore(fechaMitad));
    const ventasSegunda = ventas.filter(v => !dayjs(v.fecha).isBefore(fechaMitad));
    const totalPrimera = ventasPrimera.reduce((sum, v) => sum + Number(v.total || 0), 0);
    const totalSegunda = ventasSegunda.reduce((sum, v) => sum + Number(v.total || 0), 0);
    const crecimiento = totalPrimera > 0 ? ((totalSegunda - totalPrimera) / totalPrimera * 100) : 0;

    const clientesUnicos = new Set(ventas.map(v => v.cliente_id).filter(Boolean)).size;

    // Deuda total y clientes con deuda desde el backup/cache más reciente
    const backupResumen = historialBackups?.[0]?.resumen;
    const totalDeuda = backupResumen?.total_deuda || 0;
    const clientesConDeuda = backupResumen?.clientes_con_deuda || 0;

    // Productos urgentes (crítico = 0 stock o se agotan en < 7 días)
    const productosUrgentes = stockVan.filter(p => p.urgencia === "critico").length;

    setMetricas({
      promedioDiario,
      crecimiento,
      clientesUnicos,
      totalDeuda,
      clientesConDeuda,
      productosUrgentes,
      totalVentas,
      totalOrdenes: ventas.length,
    });
  };

  const sparklineData = ventasSerie.slice(-7).map(d => ({ value: d.total }));
  const maxProducto = productosTop.length > 0 ? productosTop[0].cantidad : 1;

  // Estadísticas de ruta
  const rutasCompletadas = rutasBarberias.filter(r => r.visitada).length;
  const rutasPendientes = rutasBarberias.length - rutasCompletadas;
  const progresoRuta = rutasBarberias.length > 0 ? (rutasCompletadas / rutasBarberias.length * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-3 sm:p-6">
      <div className="w-full max-w-[1600px] mx-auto space-y-6">
        
        {/* Header Mejorado */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                Dashboard
              </h1>
              <p className="text-gray-600 text-sm">
                {van?.nombre || van?.nombre_van ? (
                  <span className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full font-semibold">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                      <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                    </svg>
                    {van?.nombre || van?.nombre_van}
                  </span>
                ) : (
                  "Select a VAN"
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    rangeDays === d
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105"
                      : "bg-white text-gray-700 border-2 border-gray-200 hover:border-blue-400 hover:shadow-md"
                  }`}
                  onClick={() => setRangeDays(d)}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Daily Route */}
        <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800 leading-tight">Daily Route</h2>
              <p className="text-xs text-gray-500">Barbershops to visit today</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="date"
                value={fechaRutaSeleccionada}
                onChange={(e) => setFechaRutaSeleccionada(e.target.value)}
                className="border-2 border-gray-200 focus:border-purple-500 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors"
              />
              <button
                onClick={() => setShowAddBarberia(true)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-1.5 px-3 rounded-lg shadow-lg transition-all flex items-center gap-1.5 text-sm whitespace-nowrap"
              >
                <IconPlus />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Compact stats + progress */}
          {rutasBarberias.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">Total: {rutasBarberias.length}</span>
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">Done: {rutasCompletadas}</span>
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">Pending: {rutasPendientes}</span>
                <span className="ml-auto text-xs font-bold text-purple-600">{progresoRuta.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500 rounded-full"
                  style={{ width: `${progresoRuta}%` }}
                />
              </div>
            </div>
          )}

          {/* Lista de barberías */}
          {loadingRutas ? (
            <div className="text-center py-8">
              <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : rutasBarberias.length === 0 ? (
            <div className="text-center py-12 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl">
              <div className="text-6xl mb-3">🗺️</div>
              <div className="font-semibold text-gray-700 mb-2">No route planned</div>
              <div className="text-sm text-gray-500 mb-4">Add barbershops to your daily route</div>
              <button
                onClick={() => setShowAddBarberia(true)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all inline-flex items-center gap-2"
              >
                <IconPlus />
                Add First Barbershop
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rutasBarberias.map((barberia, idx) => (
                <div
                  key={barberia.id}
                  className={`rounded-xl p-4 border-2 transition-all ${
                    barberia.visitada
                      ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 opacity-75"
                      : "bg-white border-purple-200 hover:border-purple-400 hover:shadow-lg"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Número de orden */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                      barberia.visitada
                        ? "bg-green-500 text-white"
                        : "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
                    }`}>
                      {barberia.visitada ? "✓" : idx + 1}
                    </div>

                    {/* Información */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <h3 className={`font-bold text-lg ${barberia.visitada ? "line-through text-gray-500" : "text-gray-900"}`}>
                            {barberia.barberia_nombre}
                          </h3>
                          {barberia.hora_visita && (
                            <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                              <IconClock />
                              <span>{barberia.hora_visita}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Botones de acción */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleVisitada(barberia.id, barberia.visitada)}
                            className={`p-2 rounded-lg transition-all ${
                              barberia.visitada
                                ? "bg-green-500 hover:bg-green-600 text-white"
                                : "bg-purple-100 hover:bg-purple-200 text-purple-700"
                            }`}
                            title={barberia.visitada ? "Mark as pending" : "Mark as visited"}
                          >
                            <IconCheck />
                          </button>
                          <button
                            onClick={() => eliminarBarberia(barberia.id)}
                            className="p-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-all"
                            title="Delete"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </div>

                      {/* Detalles adicionales */}
                      <div className="space-y-1">
                        {barberia.direccion && (
                          <div className="flex items-start gap-2 text-sm text-gray-600">
                            <IconLocation className="flex-shrink-0 mt-0.5" />
                            <span>{barberia.direccion}</span>
                          </div>
                        )}
                        {barberia.telefono && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <IconPhone />
                            <a href={`tel:${barberia.telefono}`} className="hover:text-purple-600 transition-colors">
                              {barberia.telefono}
                            </a>
                          </div>
                        )}
                        {barberia.notas && (
                          <div className="mt-2 bg-amber-50 border-l-4 border-amber-400 rounded p-2">
                            <div className="text-xs text-amber-700 font-semibold mb-1">Notes:</div>
                            <div className="text-sm text-gray-700">{barberia.notas}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Métricas Clave */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <MetricCard
            title="Daily Average"
            value={metricas.promedioDiario}
            unit=""
            valuePrefix="$"
            trend={metricas.crecimiento}
            icon={<IconDollar />}
            gradientFrom="from-blue-500"
            gradientTo="to-cyan-500"
            onClick={() => setShowKpiModal("daily-avg")}
          />
          <MetricCard
            title="Growth"
            value={metricas.crecimiento}
            unit="%"
            trend={metricas.crecimiento}
            icon={<IconTrending up={metricas.crecimiento > 0} />}
            gradientFrom={metricas.crecimiento >= 0 ? "from-green-500" : "from-red-500"}
            gradientTo={metricas.crecimiento >= 0 ? "to-emerald-500" : "to-orange-500"}
            onClick={() => setShowKpiModal("growth")}
          />
          <MetricCard
            title="Total Debt"
            value={metricas.totalDeuda}
            unit=""
            valuePrefix="$"
            trend={null}
            subtitle={metricas.clientesConDeuda > 0 ? `${metricas.clientesConDeuda} clients` : "No debt"}
            icon={<IconUsers />}
            gradientFrom={metricas.totalDeuda > 0 ? "from-orange-500" : "from-green-500"}
            gradientTo={metricas.totalDeuda > 0 ? "to-red-500" : "to-emerald-500"}
            onClick={() => setShowKpiModal("debt")}
          />
          <MetricCard
            title="Active Clients"
            value={metricas.clientesUnicos}
            unit=""
            trend={null}
            subtitle={`in ${rangeDays} days`}
            icon={<IconAlert />}
            gradientFrom="from-purple-500"
            gradientTo="to-pink-500"
            onClick={() => setShowKpiModal("clients")}
          />
        </div>

        {/* Resumen Rápido con Sparklines — clickable detail modals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            className="bg-white rounded-2xl shadow-lg p-5 cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all group"
            onClick={() => setShowDetailModal("sales")}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-sm text-gray-500 font-semibold">Total Sales</div>
                <div className="text-3xl font-bold text-gray-900">{fmtMoney(metricas.totalVentas)}</div>
              </div>
              <div className="bg-blue-100 p-2 rounded-lg group-hover:bg-blue-200 transition-colors">
                <IconDollar />
              </div>
            </div>
            <MiniSparkline data={sparklineData} color="#3b82f6" />
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-gray-500">Last 7 days</div>
              <div className="text-xs text-blue-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View details →</div>
            </div>
          </div>

          <div
            className="bg-white rounded-2xl shadow-lg p-5 cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all group"
            onClick={() => setShowDetailModal("orders")}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-sm text-gray-500 font-semibold">Total Orders</div>
                <div className="text-3xl font-bold text-gray-900">{metricas.totalOrdenes}</div>
              </div>
              <div className="bg-green-100 p-2 rounded-lg group-hover:bg-green-200 transition-colors">
                <IconShoppingCart />
              </div>
            </div>
            <MiniSparkline data={ventasSerie.slice(-7).map(d => ({ value: d.orders }))} color="#10b981" />
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-gray-500">Last 7 days</div>
              <div className="text-xs text-emerald-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View details →</div>
            </div>
          </div>

          <div
            className="bg-white rounded-2xl shadow-lg p-5 cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all group"
            onClick={() => setShowDetailModal("ticket")}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-sm text-gray-500 font-semibold">Average Ticket</div>
                <div className="text-3xl font-bold text-gray-900">
                  {fmtMoney(metricas.totalOrdenes > 0 ? metricas.totalVentas / metricas.totalOrdenes : 0)}
                </div>
              </div>
              <div className="bg-purple-100 p-2 rounded-lg group-hover:bg-purple-200 transition-colors">
                <IconUsers />
              </div>
            </div>
            <div className="h-12 flex items-end">
              <div className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-t" style={{ height: '70%' }} />
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-gray-500">Per order</div>
              <div className="text-xs text-purple-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View details →</div>
            </div>
          </div>
        </div>

        {/* Sales Performance — Dark glassmorphism card */}
        {(() => {
          const mejorDia     = ventasSerie.length ? ventasSerie.reduce((b, d) => d.total > b.total ? d : b, ventasSerie[0]) : null;
          const sinVentasIdx = [...ventasSerie].reverse().findIndex(d => d.orders > 0);
          const diasSinVenta = sinVentasIdx === 0 ? 0 : sinVentasIdx === -1 ? ventasSerie.length : sinVentasIdx;
          const totalRevenue = metricas.totalVentas;
          const totalOrders  = metricas.totalOrdenes;
          return (
            <div className="relative rounded-3xl overflow-hidden shadow-2xl"
              style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>

              {/* Decorative blobs */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full opacity-20"
                  style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
                <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full opacity-15"
                  style={{ background: 'radial-gradient(circle, #06b6d4, transparent)' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 opacity-10"
                  style={{ background: 'radial-gradient(ellipse, #a78bfa, transparent)' }} />
              </div>

              {/* Header */}
              <div className="relative z-10 px-6 pt-6 pb-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-1">Performance</div>
                    <h2 className="text-2xl font-bold text-white">Sales Performance</h2>
                    <p className="text-slate-400 text-sm mt-0.5">Last {rangeDays} days · revenue & orders</p>
                  </div>

                  {/* Quick stats pills */}
                  <div className="flex flex-wrap gap-2">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 text-center min-w-[80px]">
                      <div className="text-lg font-bold text-white">{fmtMoney(totalRevenue)}</div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Revenue</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 text-center min-w-[60px]">
                      <div className="text-lg font-bold text-emerald-400">{totalOrders}</div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Orders</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 text-center min-w-[80px]">
                      <div className={`text-lg font-bold ${metricas.crecimiento >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {metricas.crecimiento >= 0 ? '+' : ''}{metricas.crecimiento.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Growth</div>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-4 mt-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-8 h-0.5 bg-gradient-to-r from-violet-400 to-cyan-400 rounded-full"></div>
                    <span className="text-slate-300 text-xs font-medium">Revenue</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-8 h-0.5 border-t-2 border-dashed border-amber-400 rounded-full"></div>
                    <span className="text-slate-300 text-xs font-medium">7-day Avg</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-emerald-500/70"></div>
                    <span className="text-slate-300 text-xs font-medium">Orders</span>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="relative z-10 px-2 pb-2 h-80 sm:h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gDarkRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.6} />
                        <stop offset="60%"  stopColor="#06b6d4" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor="#818cf8" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="fecha"
                      tickFormatter={shortDate}
                      minTickGap={28}
                      tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="revenue"
                      orientation="left"
                      tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
                      width={48}
                    />
                    <YAxis
                      yAxisId="orders"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15,23,42,0.92)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        borderRadius: '14px',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                        padding: '12px 16px',
                        backdropFilter: 'blur(12px)',
                      }}
                      labelStyle={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}
                      itemStyle={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}
                      cursor={{ stroke: 'rgba(139,92,246,0.3)', strokeWidth: 1 }}
                      formatter={(value, name) => {
                        if (name === "total")  return [fmtMoney(value), "💰 Revenue"];
                        if (name === "ma7")    return [fmtMoney(value), "📊 7-day avg"];
                        if (name === "orders") return [value + " orders", "🛒 Orders"];
                        return value;
                      }}
                      labelFormatter={(l) => dayjs(l).format("dddd, MMM D")}
                    />
                    {metricas.promedioDiario > 0 && (
                      <ReferenceLine
                        yAxisId="revenue"
                        y={metricas.promedioDiario}
                        stroke="#fbbf24"
                        strokeDasharray="5 3"
                        strokeWidth={1.5}
                        label={{ value: 'avg', position: 'insideTopRight', fill: '#fbbf24', fontSize: 10 }}
                      />
                    )}
                    {/* Revenue area — violet→cyan gradient */}
                    <Area
                      yAxisId="revenue"
                      type="monotone"
                      dataKey="total"
                      stroke="#818cf8"
                      strokeWidth={3}
                      fill="url(#gDarkRev)"
                      dot={false}
                      activeDot={{ r: 6, fill: '#818cf8', stroke: '#fff', strokeWidth: 2 }}
                      isAnimationActive={true}
                      animationDuration={900}
                    />
                    {/* 7-day moving avg */}
                    <Line
                      yAxisId="revenue"
                      type="monotone"
                      dataKey="ma7"
                      stroke="#fbbf24"
                      strokeWidth={1.5}
                      dot={false}
                      strokeDasharray="6 3"
                      isAnimationActive={true}
                      animationDuration={1100}
                    />
                    {/* Orders bars */}
                    <Bar
                      yAxisId="orders"
                      dataKey="orders"
                      fill="rgba(16,185,129,0.55)"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={18}
                      isAnimationActive={true}
                      animationDuration={800}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Insight pills at bottom */}
              <div className="relative z-10 px-6 pb-5">
                <div className="flex flex-wrap gap-2">
                  {mejorDia && mejorDia.total > 0 && (
                    <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-1.5 flex items-center gap-2">
                      <span>🏆</span>
                      <span className="text-white text-xs font-semibold">Best: {dayjs(mejorDia.fecha).format("MMM D")} — {fmtMoney(mejorDia.total)}</span>
                    </div>
                  )}
                  {diasSinVenta > 1 && (
                    <div className="bg-amber-500/20 border border-amber-500/30 rounded-xl px-3 py-1.5 flex items-center gap-2">
                      <span>⚠️</span>
                      <span className="text-amber-300 text-xs font-semibold">{diasSinVenta} days no sales</span>
                    </div>
                  )}
                  {metricas.crecimiento !== 0 && (
                    <div className={`rounded-xl px-3 py-1.5 flex items-center gap-2 border ${metricas.crecimiento > 0 ? 'bg-green-500/15 border-green-500/30' : 'bg-red-500/15 border-red-500/30'}`}>
                      <span>{metricas.crecimiento > 0 ? '📈' : '📉'}</span>
                      <span className={`text-xs font-semibold ${metricas.crecimiento > 0 ? 'text-green-300' : 'text-red-300'}`}>
                        {metricas.crecimiento > 0 ? '+' : ''}{metricas.crecimiento.toFixed(1)}% vs first half
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Sección de Productos y Alertas */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Top 10 Productos */}
          <div className="xl:col-span-2 bg-white rounded-3xl shadow-xl p-6">
            <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">Top 10 Products</h2>
                <p className="text-sm text-gray-500">Last 30 days</p>
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => setTopMode("units")}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${topMode === "units" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                >
                  📦 Units
                </button>
                <button
                  onClick={() => setTopMode("revenue")}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${topMode === "revenue" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                >
                  💰 Revenue
                </button>
              </div>
            </div>
            {productosTop.length === 0 ? (
              <div className="text-gray-400 text-center py-12">No product data available</div>
            ) : (
              <div className="space-y-3">
                {[...productosTop]
                  .sort((a, b) => topMode === "revenue" ? b.revenue - a.revenue : b.cantidad - a.cantidad)
                  .map((p, idx) => {
                  const maxVal = topMode === "revenue"
                    ? Math.max(...productosTop.map(x => x.revenue))
                    : Math.max(...productosTop.map(x => x.cantidad));
                  const val = topMode === "revenue" ? p.revenue : p.cantidad;
                  const percentage = maxVal > 0 ? (val / maxVal) * 100 : 0;
                  const colors = [
                    'from-yellow-400 to-orange-500',
                    'from-gray-400 to-gray-500',
                    'from-amber-600 to-yellow-700',
                    'from-blue-500 to-indigo-500',
                    'from-green-500 to-emerald-500',
                    'from-purple-500 to-pink-500',
                    'from-red-500 to-rose-500',
                    'from-cyan-500 to-blue-500',
                    'from-indigo-500 to-purple-500',
                    'from-teal-500 to-green-500',
                  ];
                  return (
                    <div key={idx} className="group hover:scale-[1.01] transition-transform">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors[idx]} text-white font-bold flex items-center justify-center text-sm shadow-md shrink-0`}>
                            #{idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{p.nombre}</div>
                            <div className="text-xs text-gray-400">
                              {topMode === "revenue"
                                ? `${p.cantidad} unidades`
                                : p.revenue > 0 ? fmtMoney(p.revenue) : ""}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="text-xl font-bold text-gray-900">
                            {topMode === "revenue" ? fmtMoney(p.revenue) : p.cantidad}
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${colors[idx]} transition-all duration-500 rounded-full`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stock Alert — Running Low */}
          <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-3xl shadow-xl p-6 border-2 border-red-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-red-900 mb-0.5">Running Low</h2>
                <p className="text-sm text-red-600">Active products · Ordered by urgency</p>
              </div>
              <div className={`text-white p-3 rounded-xl ${stockVan.some(p => p.urgencia === 'critico') ? 'bg-red-500 animate-pulse' : 'bg-orange-400'}`}>
                <IconAlert />
              </div>
            </div>

            {stockVan.length === 0 ? (
              <div className="text-center py-8">
                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="font-semibold text-gray-700">All good!</div>
                <div className="text-sm text-gray-500">No products running low</div>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  {lowPreview.map((p, idx) => {
                    const urgColor = p.urgencia === 'critico'
                      ? { border: 'border-red-500',    badge: 'bg-red-500',    bar: 'bg-red-500',    text: 'text-red-600'   }
                      : p.urgencia === 'bajo'
                      ? { border: 'border-orange-400', badge: 'bg-orange-400', bar: 'bg-orange-400', text: 'text-orange-600' }
                      : p.urgencia === 'sin_movimiento'
                      ? { border: 'border-gray-300',   badge: 'bg-gray-400',   bar: 'bg-gray-300',   text: 'text-gray-600'  }
                      : { border: 'border-yellow-400', badge: 'bg-yellow-400', bar: 'bg-yellow-400', text: 'text-yellow-600' };
                    const barWidth = p.urgencia === 'sin_movimiento' ? 30
                      : p.diasRestantes >= 999 ? 90
                      : Math.min(100, Math.max(4, (p.diasRestantes / 30) * 100));
                    const diasLabel = p.cantidad === 0
                      ? 'OUT OF STOCK'
                      : p.urgencia === 'sin_movimiento'
                      ? `${p.cantidad} u.`
                      : p.diasRestantes >= 999
                      ? `${p.cantidad} u.`
                      : `~${p.diasRestantes}d left`;
                    const ultimaLabel = p.ultimaVenta
                      ? `Last sale ${dayjs().diff(dayjs(p.ultimaVenta), 'day')}d ago`
                      : p.urgencia === 'sin_movimiento'
                      ? 'No recent sales'
                      : null;
                    return (
                      <div key={idx} className={`bg-white rounded-xl p-3.5 border-l-4 ${urgColor.border} hover:shadow-md transition-shadow`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 truncate text-sm">{p.nombre}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {p.codigo && <span className="text-xs text-gray-400 font-mono">{p.codigo}</span>}
                              {ultimaLabel && <span className="text-xs text-gray-400">{ultimaLabel}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs text-gray-400">Stock</div>
                              <div className={`text-2xl font-bold ${urgColor.text}`}>{p.cantidad}</div>
                            </div>
                            <div className={`${urgColor.badge} text-white text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap`}>
                              {diasLabel}
                            </div>
                          </div>
                        </div>
                        {/* Barra de días restantes */}
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full ${urgColor.bar} rounded-full transition-all`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        {p.vendido30d > 0 && (
                          <div className="text-xs text-gray-400 mt-1">
                            {p.vendido30d} units sold in 30d · {p.velocidad}/day
                          </div>
                        )}
                        {p.urgencia === 'sin_movimiento' && (
                          <div className="text-xs text-gray-400 mt-1 italic">No sales in 60 days</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {stockVan.length > LOW_STOCK_PREVIEW && (
                  <button
                    onClick={() => setShowAllLow(true)}
                    className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg"
                  >
                    View All ({stockVan.length})
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Recent Sales Card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">Recent Sales</h2>
                <p className="text-sm text-gray-500">{ventas.length} sales in the selected period</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-xl">
                <IconShoppingCart />
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <div className="mt-4 text-blue-700 font-semibold">Loading sales…</div>
              </div>
            ) : ventas.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-6xl mb-3">📭</div>
                <div className="font-semibold text-gray-700 mb-2">No sales recorded</div>
                <div className="text-sm text-gray-500">Start making sales to see them here</div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Preview de últimas 3 ventas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {ventas.slice(0, 3).map((v) => (
                    <div
                      key={v.id}
                      className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border-2 border-blue-200 hover:border-blue-400 hover:shadow-lg cursor-pointer transition-all"
                      onClick={() => abrirDetalleVenta(v)}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="font-bold text-gray-900 text-sm mb-1">
                            {getNombreCliente(v.cliente_id)}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <IconClock />
                            {dayjs(v.fecha).format("MM/DD HH:mm")}
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${
                            v.estado_pago === "pagado"
                              ? "bg-green-500 text-white"
                              : v.estado_pago === "parcial"
                              ? "bg-blue-500 text-white"
                              : "bg-amber-500 text-white"
                          }`}
                        >
                          {v.estado_pago === "pagado" ? "✓" : v.estado_pago === "parcial" ? "◐" : "○"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg p-3">
                        <span className="text-sm font-semibold">Total</span>
                        <span className="text-xl font-bold">{fmtMoney(v.total || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Botón para ver todas */}
                <button
                  onClick={() => setShowRecentSales(true)}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 group"
                >
                  <IconShoppingCart />
                  <span>View All Sales ({ventas.length})</span>
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Backup & Sync Status */}
        <SyncStatusWidget
          syncing={syncing}
          lastSync={lastSync}
          historialBackups={historialBackups}
          ventasPendientes={ventasPendientes}
          syncError={syncError}
          onSyncNow={sincronizarAhora}
          vanId={van?.id}
          onOpenBackupManager={() => setShowBackupModal(true)}
          backupCount={historialBackups?.length || 0}
        />

      </div>

      {/* Modals */}
      <KpiDetailModal
        type={showKpiModal}
        ventas={ventas}
        ventasSerie={ventasSerie}
        metricas={metricas}
        rangeDays={rangeDays}
        historialBackups={historialBackups}
        onClose={() => setShowKpiModal(null)}
        getNombreCliente={getNombreCliente}
      />
      <SalesDetailModal
        type={showDetailModal}
        ventas={ventas}
        ventasSerie={ventasSerie}
        productosTop={productosTop}
        metricas={metricas}
        rangeDays={rangeDays}
        onClose={() => setShowDetailModal(null)}
        getNombreCliente={getNombreCliente}
      />
      <LowStockModal open={showAllLow} items={stockVan} onClose={() => setShowAllLow(false)} />
      <RecentSalesModal
        open={showRecentSales}
        ventas={ventas}
        onClose={() => setShowRecentSales(false)}
        getNombreCliente={getNombreCliente}
        onSelectVenta={abrirDetalleVenta}
      />
      <DetalleVentaModal
        venta={ventaSeleccionada}
        productos={detalleProductos}
        loading={cargandoDetalle}
        onClose={cerrarDetalleVenta}
        getNombreCliente={getNombreCliente}
      />
      <RutaBarberiaModal
        open={showAddBarberia}
        onClose={() => setShowAddBarberia(false)}
        vanId={van?.id}
        fechaSeleccionada={fechaRutaSeleccionada}
        onRefresh={() => cargarRutasBarberias(van.id, fechaRutaSeleccionada)}
      />
      <BackupManagerModal
        open={showBackupModal}
        onClose={() => setShowBackupModal(false)}
        vanId={van?.id}
        vanNombre={van?.nombre || van?.nombre_van || `Van ${van?.id}`}
        usuarioId={usuario?.id}
      />
    </div>
  );
}