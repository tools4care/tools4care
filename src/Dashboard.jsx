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
        <div className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
          <h3 className="font-bold text-lg">Low stock — All items</h3>
          <button
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"
            onClick={onClose}
          >
            ✖
          </button>
        </div>
        <div className="p-4 flex-1 overflow-hidden flex flex-col">
          <input
            className="w-full border rounded-lg px-3 py-2 mb-3"
            placeholder="Search by code or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-gray-500 text-sm">No results.</div>
            ) : (
              <ul className="divide-y">
                {filtered.map((p, idx) => (
                  <li key={`${p.codigo}-${idx}`} className="py-2 flex items-baseline gap-3">
                    <span className="font-mono text-gray-500 text-sm">{p.codigo}</span>
                    <span className="flex-1 text-sm">{p.nombre}</span>
                    <span className="text-red-600 font-semibold">{p.cantidad}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="p-4">
          <button
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2.5 px-4 rounded-lg"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Modal Detalle Venta MEJORADO ---------- */
function DetalleVentaModal({ venta, loading, productos, onClose, getNombreCliente }) {
  if (!venta) return null;

  const totalProductos = productos.reduce((sum, p) => {
    const unit = Number(p.precio_unit ?? p.precio_unitario ?? 0);
    const sub = p.subtotal != null ? Number(p.subtotal) : unit * Number(p.cantidad || 0);
    return sum + sub;
  }, 0);

  // Desglose de pagos desde venta.pago JSON
  const pagoInfo = venta.pago || {};
  const metodosAplicados = pagoInfo.metodos || [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-lg">Sale Details</h3>
          <button
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"
            onClick={onClose}
          >
            ✖
          </button>
        </div>

        {/* Body */}
        <div className="p-5 text-sm text-gray-700 space-y-3 overflow-y-auto flex-1">
          {/* Info general */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Sale ID</div>
              <div className="font-mono text-sm">{venta.id?.slice(0, 8)}...</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Date</div>
              <div>{dayjs(venta.fecha).format("YYYY-MM-DD HH:mm")}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Client</div>
              <div>{getNombreCliente(venta.cliente_id) || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Payment Status</div>
              <span
                className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                  venta.estado_pago === "pagado"
                    ? "bg-green-100 text-green-700"
                    : venta.estado_pago === "parcial"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {venta.estado_pago === "pagado" ? "Paid" : venta.estado_pago === "parcial" ? "Partial" : "Pending"}
              </span>
            </div>
          </div>

          {/* Totales */}
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-blue-600 font-semibold">Total Sale</div>
                <div className="text-lg font-bold text-blue-800">
                  {fmtMoney(venta.total || 0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-blue-600 font-semibold">Total Paid</div>
                <div className="text-lg font-bold text-green-700">
                  {fmtMoney(venta.total_pagado || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Métodos de pago */}
          {metodosAplicados.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Payment Methods</div>
              <div className="space-y-1">
                {metodosAplicados.map((m, idx) => (
                  <div key={idx} className="flex justify-between text-sm bg-gray-50 rounded px-3 py-2">
                    <span className="capitalize">{m.forma || "—"}</span>
                    <span className="font-semibold">{dinero(m.monto || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Productos */}
          <div>
            <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Products Sold</div>
            {loading ? (
              <div className="text-blue-700 text-xs">Loading products…</div>
            ) : productos.length === 0 ? (
              <div className="text-gray-400 text-sm">No products in this sale</div>
            ) : (
              <div className="space-y-2">
                {productos.map((p, idx) => {
                  const unit = Number(p.precio_unit ?? p.precio_unitario ?? 0);
                  const sub = p.subtotal != null ? Number(p.subtotal) : unit * Number(p.cantidad || 0);
                  return (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 border">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">{p.nombre || p.producto_id}</div>
                          <div className="text-xs text-gray-500 font-mono">{p.codigo || p.producto_id}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">
                            {p.cantidad} x {dinero(unit)}
                          </div>
                          <div className="font-bold text-gray-900">{dinero(sub)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Total de productos */}
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 flex justify-between items-center">
                  <span className="font-semibold text-blue-800">Subtotal Products:</span>
                  <span className="font-bold text-blue-900 text-lg">{dinero(totalProductos)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Notas si existen */}
          {venta.notas && (
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Notes</div>
              <div className="text-sm bg-gray-50 rounded p-3 border">{venta.notas}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <button
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-2.5 px-4 rounded-lg"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== DASHBOARD ==================== */
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
  const LOW_STOCK_PREVIEW = 5;

  const [mostrarTodas, setMostrarTodas] = useState(false);
  const ventasMostrar = mostrarTodas ? ventas : ventas.slice(0, 5);

  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [detalleProductos, setDetalleProductos] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    cargarClientes();
  }, []);

  useEffect(() => {
    if (van?.id) {
      cargarDatos(van.id, rangeDays);
      cargarStockVan(van.id);
    } else {
      setVentas([]);
      setVentasSerie([]);
      setProductosTop([]);
      setStockVan([]);
      setLoading(false);
    }
  }, [van?.id, rangeDays]);

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

    // ✅ CORRECCIÓN: usar 'total' en lugar de 'total_venta'
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
        mapTotal[f] = (mapTotal[f] || 0) + (Number(v.total) || 0); // ✅ Cambiado
        mapCount[f] = (mapCount[f] || 0) + 1;
      });

      const serie = rangeDaysArray(days).map((f) => ({
        fecha: f,
        total: mapTotal[f] || 0,
        orders: mapCount[f] || 0,
      }));
      setVentasSerie(serie);
    }

    // Top productos
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
        .slice(0, 5);
    }
    setProductosTop(top);
    setLoading(false);
  }

  async function cargarStockVan(van_id) {
    const { data } = await supabase
      .from("stock_van")
      .select("cantidad, producto_id, productos(nombre, codigo)")
      .eq("van_id", van_id)
      .lt("cantidad", 5)
      .order("cantidad", { ascending: true });

    setStockVan(
      (data || []).map((item) => ({
        nombre: item.productos?.nombre || item.producto_id,
        codigo: item.productos?.codigo || item.producto_id,
        cantidad: item.cantidad,
      }))
    );
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
  const remainingLow = Math.max(0, stockVan.length - LOW_STOCK_PREVIEW);
  const chartData = withMA(ventasSerie, "total", 7);

  // ✅ Estadísticas generales
  const totalVentas = ventas.reduce((sum, v) => sum + Number(v.total || 0), 0);
  const totalPagado = ventas.reduce((sum, v) => sum + Number(v.total_pagado || 0), 0);
  const totalPendiente = totalVentas - totalPagado;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
              <div className="text-sm text-gray-600">
                {van?.nombre || van?.nombre_van ? `VAN: ${van?.nombre || van?.nombre_van}` : "Select a VAN"}
              </div>
              <div className="flex items-center gap-1">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      rangeDays === d
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-white text-gray-700 border border-gray-300 hover:border-blue-400"
                    }`}
                    onClick={() => setRangeDays(d)}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
              <div className="text-xs text-blue-600 font-semibold uppercase">Total Sales</div>
              <div className="text-2xl font-bold text-blue-800">{fmtMoney(totalVentas)}</div>
            </div>
            <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-3 border border-green-200">
              <div className="text-xs text-green-600 font-semibold uppercase">Collected</div>
              <div className="text-2xl font-bold text-green-800">{fmtMoney(totalPagado)}</div>
            </div>
            <div className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg p-3 border border-amber-200">
              <div className="text-xs text-amber-600 font-semibold uppercase">Pending</div>
              <div className="text-2xl font-bold text-amber-800">{fmtMoney(totalPendiente)}</div>
            </div>
          </div>
        </div>

        {/* Gráfica */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <h2 className="font-bold text-gray-800 mb-3">Sales Trends</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" tickFormatter={shortDate} minTickGap={20} />
                <YAxis />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "total") return [fmtMoney(value), "Revenue"];
                    if (name === "ma7") return [fmtMoney(value), "7-day avg"];
                    if (name === "orders") return [value, "Orders"];
                    return value;
                  }}
                  labelFormatter={(l) => dayjs(l).format("YYYY-MM-DD")}
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="ma7" stroke="#1f2937" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Blue bars = daily sales · Dark line = 7-day moving average · Green line = # of orders
          </p>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <h2 className="font-bold text-gray-800 mb-3">Top Selling Products</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productosTop}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nombre" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="cantidad" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">Low Stock Alert</h2>
            {stockVan.length > LOW_STOCK_PREVIEW && (
              <button
                onClick={() => setShowAllLow(true)}
                className="text-sm px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold"
              >
                View All ({stockVan.length})
              </button>
            )}
          </div>
          {stockVan.length === 0 ? (
            <div className="text-gray-400">No low-stock products</div>
          ) : (
            <>
              <ul className="space-y-2">
                {lowPreview.map((p, idx) => (
                  <li key={idx} className="flex items-center justify-between bg-red-50 rounded-lg p-3 border border-red-200">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{p.nombre}</div>
                      <div className="text-xs text-gray-500 font-mono">{p.codigo}</div>
                    </div>
                    <div className="text-red-600 font-bold text-lg">{p.cantidad}</div>
                  </li>
                ))}
              </ul>
              {remainingLow > 0 && (
                <div className="text-xs text-gray-500 mt-2">
                  And <b>{remainingLow}</b> more…
                </div>
              )}
            </>
          )}
        </div>

        {/* Recent Sales */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 sm:p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Recent Sales</h2>
          </div>
          {loading ? (
            <div className="p-6 text-blue-700 font-semibold">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100/80 text-gray-700">
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Client</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ventasMostrar.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => abrirDetalleVenta(v)}
                    >
                      <td className="p-3 text-gray-800">{dayjs(v.fecha).format("MM-DD HH:mm")}</td>
                      <td className="p-3 text-gray-800">{getNombreCliente(v.cliente_id)}</td>
                      <td className="p-3 text-right text-gray-900 font-semibold">
                        {fmtMoney(v.total || 0)}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                            v.estado_pago === "pagado"
                              ? "bg-green-100 text-green-700"
                              : v.estado_pago === "parcial"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {v.estado_pago === "pagado" ? "Paid" : v.estado_pago === "parcial" ? "Partial" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {ventas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-gray-400 py-8">
                        No sales registered
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && ventas.length > 5 && (
            <div className="p-4 sm:p-6 pt-3 flex justify-center">
              <button
                className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-md hover:shadow-lg transition-all"
                onClick={() => setMostrarTodas((m) => !m)}
              >
                {mostrarTodas ? "Show Less" : "Show More"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <LowStockModal open={showAllLow} items={stockVan} onClose={() => setShowAllLow(false)} />
      <DetalleVentaModal
        venta={ventaSeleccionada}
        productos={detalleProductos}
        loading={cargandoDetalle}
        onClose={cerrarDetalleVenta}
        getNombreCliente={getNombreCliente}
      />
    </div>
  );
}