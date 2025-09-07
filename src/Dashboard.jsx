// src/Dashboard.jsx
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
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
          <h3 className="font-bold text-lg">Low stock — All items</h3>
          <button
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            ✖️
          </button>
        </div>
        <div className="p-4">
          <input
            className="w-full border rounded-lg px-3 py-2 mb-3"
            placeholder="Search by code or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-[60vh] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-gray-500 text-sm">No results.</div>
            ) : (
              <ul className="divide-y">
                {filtered.map((p, idx) => (
                  <li key={`${p.codigo}-${idx}`} className="py-2 flex items-baseline gap-3">
                    <span className="font-mono text-gray-500 min-w-[120px]">{p.codigo}</span>
                    <span className="flex-1">{p.nombre}</span>
                    <span className="text-red-600 font-semibold">{p.cantidad}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="p-4 pt-0">
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

/* ---------- Modal Detalle Venta ---------- */
function DetalleVentaModal({ venta, loading, productos, onClose, getNombreCliente }) {
  if (!venta) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-lg tracking-tight">Sale details</h3>
          <button
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"
            onClick={onClose}
          >
            ✖️
          </button>
        </div>

        {/* Body */}
        <div className="p-5 text-sm text-gray-700 space-y-2">
          <div>
            <b>ID:</b> <span className="font-mono">{venta.id}</span>
          </div>
          <div><b>Date:</b> {dayjs(venta.fecha).format("YYYY-MM-DD HH:mm")}</div>
          <div><b>Client:</b> {getNombreCliente(venta.cliente_id) || "—"}</div>
          <div><b>Total:</b> {venta.total_venta != null ? fmtMoney(venta.total_venta) : "--"}</div>
          <div>
            <b>Payment status:</b>{" "}
            <span className={venta.estado_pago === "pendiente" ? "text-red-600" : "text-green-600"}>
              {venta.estado_pago === "pendiente" ? "Pending" : "Paid"}
            </span>
          </div>

          <div className="mt-3">
            <b>Sold products:</b>
            {loading ? (
              <div className="text-blue-700 text-xs">Loading products…</div>
            ) : (
              <ul className="text-sm mt-1 list-disc ml-6 space-y-1">
                {productos.length === 0 ? (
                  <li className="text-gray-400">No products in this sale</li>
                ) : (
                  productos.map((p, idx) => (
                    <li key={idx}>
                      <span className="font-mono text-gray-500">{p.productos?.codigo || p.producto_id}</span>
                      <span className="ml-2">{p.productos?.nombre || p.producto_id}</span>
                      <span className="ml-2">
                        x <b>{p.cantidad}</b>
                      </span>
                      <span className="ml-2 text-gray-500">
                        {p.precio_unitario != null ? fmtMoney(p.precio_unitario) : ""}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-0">
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

/* ==================== DASHBOARD ==================== */
export default function Dashboard() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [rangeDays, setRangeDays] = useState(14);
  const [ventasSerie, setVentasSerie] = useState([]); // [{fecha, total, orders}]
  const [productosTop, setProductosTop] = useState([]);
  const [stockVan, setStockVan] = useState([]);

  // Low stock UI
  const [showAllLow, setShowAllLow] = useState(false);
  const LOW_STOCK_PREVIEW = 5;

  // Mostrar más/menos ventas (tabla)
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const ventasMostrar = mostrarTodas ? ventas : ventas.slice(0, 5);

  // Modal venta
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [detalleProductos, setDetalleProductos] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Clientes (para traducir id->nombre)
  const [clientes, setClientes] = useState([]);

  /* --------- Efectos --------- */
  useEffect(() => {
    cargarClientes();
    // eslint-disable-next-line
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
    // eslint-disable-next-line
  }, [van?.id, rangeDays]);

  /* --------- Cargas --------- */
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

    // Ventas por VAN y rango
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

      // Serie por día: total y conteo
      const mapTotal = {};
      const mapCount = {};
      (ventasData || []).forEach((v) => {
        const f = dayjs(v.fecha).format("YYYY-MM-DD");
        mapTotal[f] = (mapTotal[f] || 0) + (Number(v.total_venta) || 0);
        mapCount[f] = (mapCount[f] || 0) + 1;
      });

      const serie = rangeDaysArray(days).map((f) => ({
        fecha: f,
        total: mapTotal[f] || 0,
        orders: mapCount[f] || 0,
      }));
      setVentasSerie(serie);
    }

    // Top productos vendidos de la VAN (últimos 30 días) — sin joins ambiguos
    const desde30 = dayjs().subtract(30, "day").startOf("day").format("YYYY-MM-DD");
    // 1) IDs de ventas de la VAN
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
        .select("producto_id,cantidad,productos(nombre)")
        .in("venta_id", ids);
      det = det2 || [];
    }

    const vendidos = {};
    (det || []).forEach((it) => {
      if (!it.producto_id) return;
      if (!vendidos[it.producto_id]) {
        vendidos[it.producto_id] = { cantidad: 0, nombre: it.productos?.nombre || it.producto_id };
      }
      vendidos[it.producto_id].cantidad += Number(it.cantidad || 0);
    });

    const top = Object.entries(vendidos)
      .map(([producto_id, v]) => ({ producto_id, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
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

  async function abrirDetalleVenta(venta) {
    setVentaSeleccionada(venta);
    setCargandoDetalle(true);

    // Consulta principal
    const try1 = await supabase
      .from("detalle_ventas")
      .select("producto_id, cantidad, precio_unitario, productos(nombre, codigo)")
      .eq("venta_id", venta.id);

    let prods = try1.data || [];

    // Fallbacks por si el FK/columna tiene otro nombre en el esquema
    if (prods.length === 0) {
      try {
        const tryAlt = await supabase
          .from("detalle_ventas")
          .select("producto_id, cantidad, precio_unitario, productos(nombre, codigo)")
          .eq("venta", venta.id); // algunas bases usan "venta" como FK
        prods = tryAlt.data || [];
      } catch {}
    }
    if (prods.length === 0) {
      try {
        const tryView = await supabase
          .from("detalle_ventas_view")
          .select("producto_id, cantidad, precio_unitario, productos(nombre, codigo)")
          .eq("venta_id", venta.id);
        prods = tryView.data || [];
      } catch {}
    }

    setDetalleProductos(prods);
    setCargandoDetalle(false);
  }
  function cerrarDetalleVenta() {
    setVentaSeleccionada(null);
    setDetalleProductos([]);
    setCargandoDetalle(false);
  }

  /* --------- Render --------- */
  const lowPreview = stockVan.slice(0, LOW_STOCK_PREVIEW);
  const remainingLow = Math.max(0, stockVan.length - LOW_STOCK_PREVIEW);

  return (
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header card */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">📊 Dashboard</h1>
            <div className="flex items-center gap-3 text-sm">
              <div className="text-gray-500">
                Last {rangeDays} days · {van?.nombre || van?.nombre_van ? `VAN: ${van.nombre || van.nombre_van}` : "Select a VAN"}
              </div>
              <div className="flex items-center gap-1">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    className={`px-2.5 py-1 rounded-lg border text-xs ${
                      rangeDays === d ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300"
                    }`}
                    onClick={() => setRangeDays(d)}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sales chart */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <h2 className="font-bold text-gray-800 mb-2 flex items-center gap-2">📈 Sales last {rangeDays} days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ventasSerie}>
                <defs>
                  <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="fecha"
                  tickFormatter={shortDate}
                  minTickGap={20}
                />
                <YAxis />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "total") return [fmtMoney(value), "Revenue"];
                    if (name === "orders") return [value, "Orders"];
                    return value;
                  }}
                  labelFormatter={(l) => dayjs(l).format("YYYY-MM-DD")}
                  contentStyle={{ borderRadius: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#2563eb"
                  fill="url(#totalFill)"
                  strokeWidth={3}
                  activeDot={{ r: 5 }}
                  animationDuration={600}
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-1">Blue = revenue, green line = orders count</p>
        </div>

        {/* Top selling products */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <h2 className="font-bold text-gray-800 mb-2 flex items-center gap-2">🥇 Top selling products</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productosTop}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nombre" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="cantidad" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low stock (preview + modal) */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800 mb-2 flex items-center gap-2">🧯 Low stock (Your VAN)</h2>
            {stockVan.length > LOW_STOCK_PREVIEW && (
              <button
                onClick={() => setShowAllLow(true)}
                className="text-sm px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                View all ({stockVan.length})
              </button>
            )}
          </div>
          {stockVan.length === 0 ? (
            <div className="text-gray-400">No low-stock products in your van</div>
          ) : (
            <>
              <ul className="list-disc pl-6">
                {lowPreview.map((p, idx) => (
                  <li key={idx} className="text-gray-800">
                    <span className="font-mono text-gray-500">{p.codigo}</span>
                    <span className="ml-2 font-semibold">{p.nombre}</span>
                    {" — "}
                    <span className="text-red-600 font-bold">{p.cantidad}</span> in stock
                  </li>
                ))}
              </ul>
              {remainingLow > 0 && (
                <div className="text-xs text-gray-500 mt-2">
                  And <b>{remainingLow}</b> more item{remainingLow > 1 ? "s" : ""}…
                </div>
              )}
            </>
          )}
        </div>

        {/* Recent sales table */}
        <div className="bg-white rounded-xl shadow-lg p-0 overflow-hidden">
          <div className="px-4 sm:px-6 pt-4">
            <h2 className="text-lg font-bold text-gray-800 mb-2">🧾 Recent sales</h2>
          </div>
          {loading ? (
            <div className="p-6 text-blue-700 font-semibold">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100/80 text-gray-700">
                    <th className="p-3 text-left">ID</th>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Client</th>
                    <th className="p-3 text-left">Total</th>
                    <th className="p-3 text-left">Payment status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ventasMostrar.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => abrirDetalleVenta(v)}
                    >
                      <td className="p-3 font-mono text-gray-800">{v.id.slice(0, 8)}…</td>
                      <td className="p-3 text-gray-800">{dayjs(v.fecha).format("YYYY-MM-DD")}</td>
                      <td className="p-3 text-gray-800">{getNombreCliente(v.cliente_id)}</td>
                      <td className="p-3 text-gray-900 font-semibold">
                        {v.total_venta != null ? fmtMoney(v.total_venta) : "--"}
                      </td>
                      <td className={`p-3 ${v.estado_pago === "pendiente" ? "text-red-600" : "text-green-600"}`}>
                        {v.estado_pago === "pendiente" ? "Pending" : "Paid"}
                      </td>
                    </tr>
                  ))}
                  {ventas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-gray-400 py-8">
                        No sales registered.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && ventas.length > 5 && (
            <div className="p-4 sm:p-6 pt-3 text-right">
              <button
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow hover:shadow-md"
                onClick={() => setMostrarTodas((m) => !m)}
              >
                {mostrarTodas ? "Show less" : "Show more"}
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
