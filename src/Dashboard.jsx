import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import dayjs from "dayjs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";

export default function Dashboard() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [ventasPorDia, setVentasPorDia] = useState([]);
  const [productosTop, setProductosTop] = useState([]);
  const [stockVan, setStockVan] = useState([]);
  const [clientes, setClientes] = useState([]);

  // For show more/less sales
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const ventasMostrar = mostrarTodas ? ventas : ventas.slice(0, 5);

  // Modal for sale details
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [detalleProductos, setDetalleProductos] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  useEffect(() => {
    cargarDatos();
    cargarClientes();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (van && van.id) {
      cargarStockVan(van.id);
    } else {
      setStockVan([]);
    }
    // eslint-disable-next-line
  }, [van, usuario]);

  // Load sales and top products
  async function cargarDatos() {
    setLoading(true);

    // Last 14 days sales
    const { data: ventasData } = await supabase
      .from("ventas")
      .select("*")
      .gte("fecha", dayjs().subtract(14, "day").format("YYYY-MM-DD"))
      .order("fecha", { ascending: false });

    setVentas(ventasData || []);

    // Sales per day chart
    const ventasPorDiaMap = {};
    (ventasData || []).forEach(v => {
      const fecha = dayjs(v.fecha).format("YYYY-MM-DD");
      ventasPorDiaMap[fecha] = (ventasPorDiaMap[fecha] || 0) + (v.total_venta || 0);
    });
    const ventasPorDiaArr = Object.entries(ventasPorDiaMap)
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
    setVentasPorDia(ventasPorDiaArr);

    // Top sold products
    const { data: detalle } = await supabase
      .from("detalle_ventas")
      .select("producto_id, cantidad, productos(nombre)")
      .order("cantidad", { ascending: false });

    // Group by producto_id
    const productosVendidos = {};
    (detalle || []).forEach(item => {
      if (!item.producto_id) return;
      if (!productosVendidos[item.producto_id]) {
        productosVendidos[item.producto_id] = {
          cantidad: 0,
          nombre: item.productos?.nombre || item.producto_id,
        };
      }
      productosVendidos[item.producto_id].cantidad += (item.cantidad || 0);
    });

    // Only top 5
    const top = Object.entries(productosVendidos)
      .map(([producto_id, v]) => ({ producto_id, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
    setProductosTop(top);

    setLoading(false);
  }

  async function cargarClientes() {
    const { data } = await supabase.from("clientes").select("id, nombre");
    setClientes(data || []);
  }

  function getNombreCliente(id) {
    const cliente = clientes.find(c => c.id === id);
    return cliente ? cliente.nombre : (id ? id.slice(0, 8) + "…" : "");
  }

  // Get low stock (<5) for selected VAN with real product name
  async function cargarStockVan(van_id) {
    const { data, error } = await supabase
      .from("stock_van")
      .select("cantidad, producto_id, productos(nombre, codigo)")
      .eq("van_id", van_id)
      .lt("cantidad", 5)
      .order("cantidad", { ascending: true });

    setStockVan((data || []).map(item => ({
      nombre: item.productos?.nombre || item.producto_id,
      codigo: item.productos?.codigo || item.producto_id,
      cantidad: item.cantidad,
    })));
  }

  // Load sale details for modal
  async function abrirDetalleVenta(venta) {
    setVentaSeleccionada(venta);
    setCargandoDetalle(true);
    const { data: productos } = await supabase
      .from("detalle_ventas")
      .select("producto_id, cantidad, precio_unitario, productos(nombre, codigo)")
      .eq("venta_id", venta.id);
    setDetalleProductos(productos || []);
    setCargandoDetalle(false);
  }

  function cerrarDetalleVenta() {
    setVentaSeleccionada(null);
    setDetalleProductos([]);
    setCargandoDetalle(false);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      {/* Sales by day chart */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <h2 className="font-bold mb-2">Sales last 14 days</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={ventasPorDia}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fecha" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Top selling products */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <h2 className="font-bold mb-2">Top selling products</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={productosTop}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="nombre" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="cantidad" fill="#22c55e" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Low stock VAN */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <h2 className="font-bold mb-2">Low stock (Your VAN)</h2>
        <ul className="list-disc pl-6">
          {stockVan.map((p, idx) => (
            <li key={idx}>
              <span className="font-mono text-gray-500">{p.codigo}</span>
              <span className="ml-2 font-semibold">{p.nombre}</span>
              — <span className="text-red-600 font-bold">{p.cantidad}</span> in stock
            </li>
          ))}
          {stockVan.length === 0 && (
            <li className="text-gray-400">No low-stock products in your van</li>
          )}
        </ul>
      </div>
      {/* Recent sales table */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-bold mb-2">Recent sales</h2>
        {loading ? (
          <div>Loading…</div>
        ) : (
          <>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-2 text-left">ID</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Client</th>
                  <th className="p-2 text-left">Total</th>
                  <th className="p-2 text-left">Payment status</th>
                </tr>
              </thead>
              <tbody>
                {ventasMostrar.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-blue-50 cursor-pointer"
                    onClick={() => abrirDetalleVenta(v)}
                  >
                    <td className="p-2 font-mono">{v.id.slice(0, 8)}…</td>
                    <td className="p-2">{dayjs(v.fecha).format("YYYY-MM-DD")}</td>
                    <td className="p-2">{getNombreCliente(v.cliente_id)}</td>
                    <td className="p-2">
                      {v.total_venta
                        ? "$" + v.total_venta.toLocaleString("en-US", { minimumFractionDigits: 2 })
                        : "--"}
                    </td>
                    <td className={`p-2 ${v.estado_pago === "pendiente" ? "text-red-600" : "text-green-600"}`}>
                      {v.estado_pago === "pendiente" ? "Pending" : "Paid"}
                    </td>
                  </tr>
                ))}
                {ventas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-400 py-4">
                      No sales registered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {/* Show more/less button */}
            {ventas.length > 5 && (
              <div className="mt-3 text-right">
                <button
                  className="px-3 py-1 rounded bg-blue-100 text-blue-700 font-semibold text-xs hover:bg-blue-200"
                  onClick={() => setMostrarTodas((m) => !m)}
                >
                  {mostrarTodas ? "Show less" : "Show more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sale detail modal */}
      {ventaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button
              className="absolute top-3 right-3 text-gray-700 text-xl font-bold"
              onClick={cerrarDetalleVenta}
            >×</button>
            <h3 className="text-xl font-bold mb-2">Sale details</h3>
            <div className="mb-2 text-sm text-gray-700">
              <b>ID:</b> <span className="font-mono">{ventaSeleccionada.id}</span><br />
              <b>Date:</b> {dayjs(ventaSeleccionada.fecha).format("YYYY-MM-DD HH:mm")}<br />
              <b>Client:</b> {getNombreCliente(ventaSeleccionada.cliente_id) || "—"}<br />
              <b>Total:</b> ${ventaSeleccionada.total_venta?.toFixed(2) || "--"}<br />
              <b>Payment status:</b> <span className={ventaSeleccionada.estado_pago === "pendiente" ? "text-red-600" : "text-green-600"}>
                {ventaSeleccionada.estado_pago === "pendiente" ? "Pending" : "Paid"}
              </span>
            </div>
            <div className="mb-2">
              <b>Sold products:</b>
              {cargandoDetalle ? (
                <div className="text-blue-700 text-xs">Loading products…</div>
              ) : (
                <ul className="text-sm mt-1">
                  {detalleProductos.length === 0
                    ? <li className="text-gray-400">No products in this sale</li>
                    : detalleProductos.map((p, idx) => (
                      <li key={idx}>
                        <span className="font-mono text-gray-500">{p.productos?.codigo || p.producto_id}</span>
                        <span className="ml-2">{p.productos?.nombre || p.producto_id}</span>
                        <span className="ml-2">x <b>{p.cantidad}</b></span>
                        <span className="ml-2 text-gray-500">${p.precio_unitario?.toFixed(2) || "--"}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <button
              className="mt-4 px-4 py-2 rounded bg-blue-600 text-white font-bold hover:bg-blue-700"
              onClick={cerrarDetalleVenta}
            >Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
