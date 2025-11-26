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
} from "recharts";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";

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

/* ---------- Modal Low Stock ---------- */
function LowStockModal({ open, items, onClose }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) =>
        String(i.codigo).toLowerCase().includes(s) ||
        String(i.nombre).toLowerCase().includes(s)
    );
  }, [q, items]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlert />
            <h3 className="font-bold text-lg">Low Stock Alert</h3>
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
            className="w-full border-2 border-gray-200 focus:border-red-500 rounded-lg px-4 py-2.5 mb-3 transition-colors"
            placeholder="Search by code or name..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-8">No results found.</div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((p, idx) => (
                  <li key={`${p.codigo}-${idx}`} className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-4 border-l-4 border-red-500 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{p.nombre}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">{p.codigo}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Stock</div>
                          <div className="text-2xl font-bold text-red-600">{p.cantidad}</div>
                        </div>
                        <IconAlert className="text-red-600" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
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
      
      onRefresh();
      onClose();
    } catch (error) {
      console.error("Error al guardar barbería:", error);
      alert("Error al guardar la barbería");
    } finally {
      setGuardando(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 flex items-center justify-between">
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Barbershop Name *
            </label>
            <input
              type="text"
              value={barberiaNombre}
              onChange={(e) => setBarberiaNombre(e.target.value)}
              className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-4 py-2.5 transition-colors"
              placeholder="e.g., Classic Cuts Barbershop"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Address
            </label>
            <input
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-4 py-2.5 transition-colors"
              placeholder="e.g., 123 Main St, City"
            />
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
        </form>
      </div>
    </div>
  );
}

/* ---------- Tarjeta de Métrica Mejorada ---------- */
function MetricCard({ title, value, unit, trend, icon, gradientFrom, gradientTo, valuePrefix = "" }) {
  const isPositive = trend > 0;
  const isNeutral = trend === 0;
  
  return (
    <div className={`bg-gradient-to-br ${gradientFrom} ${gradientTo} rounded-2xl shadow-lg hover:shadow-xl transition-all p-5 text-white relative overflow-hidden`}>
      <div className="absolute top-0 right-0 opacity-10 transform translate-x-4 -translate-y-4">
        <div className="scale-[2]">{icon}</div>
      </div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold opacity-90">{title}</div>
          {icon}
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-4xl font-bold">
            {valuePrefix}{typeof value === 'number' ? value.toFixed(value >= 100 ? 0 : 1) : value}{unit}
          </div>
        </div>
        {trend !== null && trend !== undefined && (
          <div className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${
            isNeutral ? 'opacity-70' : ''
          }`}>
            <IconTrending up={isPositive} />
            <span>
              {isPositive ? '+' : ''}{trend.toFixed(1)}% vs previous
            </span>
          </div>
        )}
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

/* ==================== DASHBOARD MEJORADO ==================== */
export default function Dashboard() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [rangeDays, setRangeDays] = useState(14);
  const [ventasSerie, setVentasSerie] = useState([]);
  const [productosTop, setProductosTop] = useState([]);
  const [stockVan, setStockVan] = useState([]);

  const [showAllLow, setShowAllLow] = useState(false);
  const LOW_STOCK_PREVIEW = 3;

  const [showRecentSales, setShowRecentSales] = useState(false);

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
        .select("producto_id,cantidad")
        .in("venta_id", ids);
      det = det2 || [];
    }

    const qtyMap = new Map();
    (det || []).forEach((r) => {
      const pid = r.producto_id;
      qtyMap.set(pid, (qtyMap.get(pid) || 0) + Number(r.cantidad || 0));
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
      const { data: stockBajo, error: errorStock } = await supabase
        .from("stock_van")
        .select(`
          cantidad, 
          producto_id, 
          productos(nombre, codigo)
        `)
        .eq("van_id", van_id)
        .lt("cantidad", 5)
        .order("cantidad", { ascending: true });

      if (errorStock) console.error("❌ Error stock:", errorStock);

      if (!stockBajo || stockBajo.length === 0) {
        setStockVan([]);
        return;
      }

      const { data: ventasVan, error: errorVentas } = await supabase
        .from("ventas")
        .select("id")
        .eq("van_id", van_id);

      if (errorVentas) console.error("❌ Error ventas:", errorVentas);

      if (!ventasVan || ventasVan.length === 0) {
        setStockVan([]);
        return;
      }

      const ventasIds = ventasVan.map(v => v.id);

      const { data: detalleVentas, error: errorDetalle } = await supabase
        .from("detalle_ventas")
        .select("producto_id")
        .in("venta_id", ventasIds);

      if (errorDetalle) console.error("❌ Error detalle:", errorDetalle);

      let productosVendidos = new Set();
      
      if (!detalleVentas || detalleVentas.length === 0) {
        const { data: ventasConProductos } = await supabase
          .from("ventas")
          .select("productos")
          .eq("van_id", van_id)
          .not("productos", "is", null);

        if (ventasConProductos && ventasConProductos.length > 0) {
          ventasConProductos.forEach(v => {
            if (Array.isArray(v.productos)) {
              v.productos.forEach(p => {
                if (p.producto_id || p.producto || p.id) {
                  productosVendidos.add(p.producto_id || p.producto || p.id);
                }
              });
            }
          });
        }
      } else {
        productosVendidos = new Set(detalleVentas.map(d => d.producto_id));
      }

      const stockFiltrado = stockBajo
        .filter(item => productosVendidos.has(item.producto_id))
        .map((item) => ({
          nombre: item.productos?.nombre || item.producto_id,
          codigo: item.productos?.codigo || item.producto_id,
          cantidad: item.cantidad,
        }));

      setStockVan(stockFiltrado);
      
    } catch (error) {
      console.error("💥 Error general en cargarStockVan:", error);
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
    if (!confirm("¿Eliminar esta barbería de la ruta?")) return;
    
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
    const conversion = clientesUnicos > 0 ? (ventas.length / clientesUnicos) : 0;
    
    const productosAgotados = stockVan.filter(p => p.cantidad === 0).length;
    
    setMetricas({
      promedioDiario,
      crecimiento,
      conversion,
      productosAgotados,
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

        {/* NUEVA SECCIÓN: Ruta de Barberías del Día */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">Daily Route</h2>
              <p className="text-sm text-gray-500">Barbershops to visit today</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={fechaRutaSeleccionada}
                onChange={(e) => setFechaRutaSeleccionada(e.target.value)}
                className="border-2 border-gray-200 focus:border-purple-500 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              />
              <button
                onClick={() => setShowAddBarberia(true)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition-all flex items-center gap-2"
              >
                <IconPlus />
                <span className="hidden sm:inline">Add</span>
              </button>
            </div>
          </div>

          {/* Estadísticas de progreso */}
          {rutasBarberias.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Total</div>
                <div className="text-3xl font-bold text-gray-900">{rutasBarberias.length}</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                <div className="text-xs text-green-600 font-semibold uppercase mb-1">Completed</div>
                <div className="text-3xl font-bold text-gray-900">{rutasCompletadas}</div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
                <div className="text-xs text-amber-600 font-semibold uppercase mb-1">Pending</div>
                <div className="text-3xl font-bold text-gray-900">{rutasPendientes}</div>
              </div>
            </div>
          )}

          {/* Barra de progreso */}
          {rutasBarberias.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-700">Progress</span>
                <span className="text-sm font-bold text-purple-600">{progresoRuta.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
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
          />
          <MetricCard
            title="Growth"
            value={metricas.crecimiento}
            unit="%"
            trend={metricas.crecimiento}
            icon={<IconTrending up={metricas.crecimiento > 0} />}
            gradientFrom={metricas.crecimiento >= 0 ? "from-green-500" : "from-red-500"}
            gradientTo={metricas.crecimiento >= 0 ? "to-emerald-500" : "to-orange-500"}
          />
          <MetricCard
            title="Conversion Rate"
            value={metricas.conversion}
            unit="x"
            trend={null}
            icon={<IconUsers />}
            gradientFrom="from-purple-500"
            gradientTo="to-pink-500"
          />
          <MetricCard
            title="Out of Stock"
            value={metricas.productosAgotados}
            unit=""
            trend={null}
            icon={<IconAlert />}
            gradientFrom="from-orange-500"
            gradientTo="to-red-500"
          />
        </div>

        {/* Resumen Rápido con Sparklines */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-sm text-gray-500 font-semibold">Total Sales</div>
                <div className="text-3xl font-bold text-gray-900">{fmtMoney(metricas.totalVentas)}</div>
              </div>
              <div className="bg-blue-100 p-2 rounded-lg">
                <IconDollar />
              </div>
            </div>
            <MiniSparkline data={sparklineData} color="#3b82f6" />
            <div className="text-xs text-gray-500 mt-2">Last 7 days</div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-sm text-gray-500 font-semibold">Total Orders</div>
                <div className="text-3xl font-bold text-gray-900">{metricas.totalOrdenes}</div>
              </div>
              <div className="bg-green-100 p-2 rounded-lg">
                <IconShoppingCart />
              </div>
            </div>
            <MiniSparkline data={ventasSerie.slice(-7).map(d => ({ value: d.orders }))} color="#10b981" />
            <div className="text-xs text-gray-500 mt-2">Last 7 days</div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-sm text-gray-500 font-semibold">Average Ticket</div>
                <div className="text-3xl font-bold text-gray-900">
                  {fmtMoney(metricas.totalOrdenes > 0 ? metricas.totalVentas / metricas.totalOrdenes : 0)}
                </div>
              </div>
              <div className="bg-purple-100 p-2 rounded-lg">
                <IconUsers />
              </div>
            </div>
            <div className="h-12 flex items-end">
              <div className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-t" style={{ height: '70%' }} />
            </div>
            <div className="text-xs text-gray-500 mt-2">Per order</div>
          </div>
        </div>

        {/* Gráfica Principal Mejorada */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">Sales Performance</h2>
              <p className="text-sm text-gray-500">Trends and orders analysis</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="font-medium">Sales</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-800 rounded"></div>
                <span className="font-medium">7-day Avg</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="font-medium">Orders</span>
              </div>
            </div>
          </div>
          <div className="h-80 sm:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="fecha" 
                  tickFormatter={shortDate} 
                  minTickGap={30}
                  style={{ fontSize: '12px', fontWeight: '500' }}
                />
                <YAxis style={{ fontSize: '12px', fontWeight: '500' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                    padding: '12px',
                  }}
                  formatter={(value, name) => {
                    if (name === "total") return [fmtMoney(value), "Revenue"];
                    if (name === "ma7") return [fmtMoney(value), "7-day avg"];
                    if (name === "orders") return [value, "Orders"];
                    return value;
                  }}
                  labelFormatter={(l) => dayjs(l).format("MM/DD/YYYY")}
                />
                <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="url(#colorTotal)" strokeWidth={2} />
                <Line type="monotone" dataKey="ma7" stroke="#1f2937" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: '#10b981' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sección de Productos y Alertas */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Top 10 Productos */}
          <div className="xl:col-span-2 bg-white rounded-3xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">Top 10 Products</h2>
                <p className="text-sm text-gray-500">Last 30 days</p>
              </div>
              <div className="bg-green-100 p-3 rounded-xl">
                <IconPackage />
              </div>
            </div>
            {productosTop.length === 0 ? (
              <div className="text-gray-400 text-center py-12">No product data available</div>
            ) : (
              <div className="space-y-3">
                {productosTop.map((p, idx) => {
                  const percentage = (p.cantidad / maxProducto) * 100;
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
                    <div key={idx} className="group hover:scale-[1.02] transition-transform">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors[idx]} text-white font-bold flex items-center justify-center text-sm shadow-md`}>
                            #{idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{p.nombre}</div>
                            <div className="text-xs text-gray-500">Units sold</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">{p.cantidad}</div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div 
                          className={`h-full bg-gradient-to-r ${colors[idx]} transition-all duration-500 rounded-full shadow-inner`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Alerta de Stock Bajo */}
          <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-3xl shadow-xl p-6 border-2 border-red-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-red-900 mb-1">Stock Alert</h2>
                <p className="text-sm text-red-600">Low inventory items</p>
              </div>
              <div className="bg-red-500 text-white p-3 rounded-xl animate-pulse">
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
                <div className="text-sm text-gray-500">No low stock items</div>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  {lowPreview.map((p, idx) => (
                    <div key={idx} className="bg-white rounded-xl p-4 border-l-4 border-red-500 hover:shadow-lg transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="font-bold text-gray-900 truncate">{p.nombre}</div>
                          <div className="text-xs text-gray-500 font-mono">{p.codigo}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="text-xs text-gray-500">Stock</div>
                            <div className="text-3xl font-bold text-red-600">{p.cantidad}</div>
                          </div>
                          {p.cantidad === 0 && (
                            <div className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                              OUT
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
      </div>

      {/* Modals */}
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
    </div>
  );
}