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

  // NUEVO: Para ver más/menos ventas
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const ventasMostrar = mostrarTodas ? ventas : ventas.slice(0, 5);

  // NUEVO: Modal de detalle de venta
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [detalleProductos, setDetalleProductos] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  useEffect(() => {
    cargarDatos();
    cargarClientes();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    // LOGS CRÍTICOS: usuario y van_id en uso
    // console.log("USUARIO ACTUAL EN DASHBOARD:", usuario);
    // console.log("VAN SELECCIONADA CONTEXTO:", van);

    if (van && van.id) {
      cargarStockVan(van.id);
    } else {
      setStockVan([]);
    }
    // eslint-disable-next-line
  }, [van, usuario]);

  // Cargar ventas y top productos
  async function cargarDatos() {
    setLoading(true);

    // Ventas últimos 14 días
    const { data: ventasData } = await supabase
      .from("ventas")
      .select("*")
      .gte("fecha", dayjs().subtract(14, "day").format("YYYY-MM-DD"))
      .order("fecha", { ascending: false });

    setVentas(ventasData || []);

    // Gráfica: ventas por día
    const ventasPorDiaMap = {};
    (ventasData || []).forEach(v => {
      const fecha = dayjs(v.fecha).format("YYYY-MM-DD");
      ventasPorDiaMap[fecha] = (ventasPorDiaMap[fecha] || 0) + (v.total_venta || 0);
    });
    const ventasPorDiaArr = Object.entries(ventasPorDiaMap)
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
    setVentasPorDia(ventasPorDiaArr);

    // Top productos más vendidos (requiere tabla detalle_ventas)
    const { data: detalle } = await supabase
      .from("detalle_ventas")
      .select("producto_id, cantidad, productos(nombre)")
      .order("cantidad", { ascending: false });

    // Agrupa por producto_id
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

    // Solo los 5 más vendidos
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

  // Trae stock bajo (<5) de la VAN seleccionada y con el nombre real
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

  // NUEVO: Cargar detalles de una venta para el modal
  async function abrirDetalleVenta(venta) {
    setVentaSeleccionada(venta);
    setCargandoDetalle(true);
    // Detalle de productos vendidos
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
      {/* Gráfica de ventas por día */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <h2 className="font-bold mb-2">Ventas últimos 14 días</h2>
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
      {/* Top productos más vendidos */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <h2 className="font-bold mb-2">Top productos más vendidos</h2>
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
      {/* Stock bajo de la VAN */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <h2 className="font-bold mb-2">Stock bajo (Tu VAN)</h2>
        <ul className="list-disc pl-6">
          {stockVan.map((p, idx) => (
            <li key={idx}>
              <span className="font-mono text-gray-500">{p.codigo}</span>
              <span className="ml-2 font-semibold">{p.nombre}</span>
              — <span className="text-red-600 font-bold">{p.cantidad}</span> en stock
            </li>
          ))}
          {stockVan.length === 0 && (
            <li className="text-gray-400">No hay productos en stock bajo en tu van</li>
          )}
        </ul>
      </div>
      {/* Tabla de ventas recientes */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-bold mb-2">Ventas recientes</h2>
        {loading ? (
          <div>Cargando...</div>
        ) : (
          <>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-2 text-left">ID</th>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Total</th>
                  <th className="p-2 text-left">Estado pago</th>
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
                      {v.estado_pago}
                    </td>
                  </tr>
                ))}
                {ventas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-400 py-4">
                      No hay ventas registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {/* Botón mostrar más/menos */}
            {ventas.length > 5 && (
              <div className="mt-3 text-right">
                <button
                  className="px-3 py-1 rounded bg-blue-100 text-blue-700 font-semibold text-xs hover:bg-blue-200"
                  onClick={() => setMostrarTodas((m) => !m)}
                >
                  {mostrarTodas ? "Ver menos" : "Ver más"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de detalle de venta */}
      {ventaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button
              className="absolute top-3 right-3 text-gray-700 text-xl font-bold"
              onClick={cerrarDetalleVenta}
            >×</button>
            <h3 className="text-xl font-bold mb-2">Detalle de venta</h3>
            <div className="mb-2 text-sm text-gray-700">
              <b>ID:</b> <span className="font-mono">{ventaSeleccionada.id}</span><br />
              <b>Fecha:</b> {dayjs(ventaSeleccionada.fecha).format("YYYY-MM-DD HH:mm")}<br />
              <b>Cliente:</b> {getNombreCliente(ventaSeleccionada.cliente_id) || "—"}<br />
              <b>Total:</b> ${ventaSeleccionada.total_venta?.toFixed(2) || "--"}<br />
              <b>Estado de pago:</b> <span className={ventaSeleccionada.estado_pago === "pendiente" ? "text-red-600" : "text-green-600"}>{ventaSeleccionada.estado_pago}</span>
            </div>
            <div className="mb-2">
              <b>Productos vendidos:</b>
              {cargandoDetalle ? (
                <div className="text-blue-700 text-xs">Cargando productos…</div>
              ) : (
                <ul className="text-sm mt-1">
                  {detalleProductos.length === 0
                    ? <li className="text-gray-400">No hay productos en esta venta</li>
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
            >Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
