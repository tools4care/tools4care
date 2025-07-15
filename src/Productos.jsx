import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

// --- MODAL RESUMEN DE FACTURA ---
function ModalResumenFactura({ factura, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetalle() {
      if (!factura) return;
      setLoading(true);
      const ventaID = factura.venta_id || factura.id || factura.id_venta;
      console.log("Factura seleccionada:", factura);
      console.log("Buscando venta con ID:", ventaID);

      if (!ventaID) {
        setDetalle(null);
        setLoading(false);
        return;
      }

      // Consulta con campo productos (jsonb)
      const { data, error } = await supabase
        .from("ventas")
        .select(
          "id, fecha, total, cliente:cliente_id (nombre, email, telefono), productos"
        )
        .eq("id", ventaID)
        .single();

      if (error) {
        console.error("Error consultando venta:", error.message);
      }
      setDetalle(data || null);
      setLoading(false);
    }
    fetchDetalle();
  }, [factura]);

  if (!factura) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-lg relative">
        <button
          type="button"
          className="absolute top-3 right-3 text-2xl text-gray-400 hover:text-black"
          onClick={onClose}
          title="Cerrar"
        >
          ×
        </button>
        <h3 className="text-xl font-bold mb-3">Resumen de Factura</h3>
        {loading ? (
          <div className="text-blue-700">Cargando...</div>
        ) : !detalle ? (
          <div className="text-red-700">
            No se encontró la factura.<br />
            <span className="text-xs text-gray-500">
              Revisa en consola (F12) el objeto factura y el ID buscado. 
              Puede que necesites ajustar el campo ID en el código.
            </span>
          </div>
        ) : (
          <div>
            <div className="mb-3">
              <b>Factura ID:</b> {detalle.id}
              <br />
              <b>Cliente:</b> {detalle.cliente?.nombre || "-"}
              <br />
              <b>Fecha:</b> {detalle.fecha ? new Date(detalle.fecha).toLocaleDateString("es-DO") : "-"}
              <br />
              <b>Total:</b> <span className="text-green-700 font-bold">${detalle.total?.toFixed(2) ?? "-"}</span>
            </div>
            <b>Productos vendidos:</b>
            <table className="min-w-full mt-2 text-xs">
              <thead>
                <tr>
                  <th className="p-1 border-b">Producto</th>
                  <th className="p-1 border-b">Cantidad</th>
                  <th className="p-1 border-b">Precio</th>
                  <th className="p-1 border-b">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(detalle.productos || []).map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-1 border-b">{item.producto_nombre || item.nombre || "-"}</td>
                    <td className="p-1 border-b">{item.cantidad}</td>
                    <td className="p-1 border-b">${item.precio_unitario?.toFixed(2) ?? "-"}</td>
                    <td className="p-1 border-b">${((item.cantidad || 0) * (item.precio_unitario || 0)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- COMPONENTE PRINCIPAL ---
export default function Productos() {
  const PAGE_SIZE = 50;
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modal edición/métricas
  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoActual, setProductoActual] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [tabActivo, setTabActivo] = useState("editar");

  // Métricas
  const [ventasPorMes, setVentasPorMes] = useState([]);
  const [loadingMetricas, setLoadingMetricas] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState("");
  const [clientesVenta, setClientesVenta] = useState([]);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);

  // Modal resumen factura
  const [mostrarModalFactura, setMostrarModalFactura] = useState(false);

  // --- FETCH PRODUCTOS ---
  useEffect(() => {
    cargarProductos();
    // eslint-disable-next-line
  }, [busqueda, pagina]);

  async function cargarProductos() {
    setLoading(true);
    let query = supabase
      .from("productos")
      .select("*", { count: "exact" })
      .order("nombre", { ascending: true });

    if (busqueda.trim()) {
      query = query.or(
        `codigo.ilike.%${busqueda}%,nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,categoria.ilike.%${busqueda}%`
      );
    }

    const desde = (pagina - 1) * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;
    query = query.range(desde, hasta);

    const { data, error, count } = await query;
    if (!error) {
      setProductos(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }

  function handleBuscar(e) {
    setPagina(1);
    setBusqueda(e.target.value);
  }

  function handleSiguiente() {
    if (pagina * PAGE_SIZE < total) setPagina(pagina + 1);
  }
  function handleAnterior() {
    if (pagina > 1) setPagina(pagina - 1);
  }

  // --- MODAL EDITAR / MÉTRICAS ---
  function abrirModal(prod) {
    setProductoActual({ ...prod });
    setMensaje("");
    setTabActivo("editar");
    setVentasPorMes([]);
    setClientesVenta([]);
    setMesSeleccionado("");
    setFacturaSeleccionada(null);
    setModalAbierto(true);
  }
  function cerrarModal() {
    setModalAbierto(false);
    setProductoActual(null);
    setVentasPorMes([]);
    setClientesVenta([]);
    setMesSeleccionado("");
    setFacturaSeleccionada(null);
  }

  // --- GUARDAR/ELIMINAR ---
  async function guardarProducto(e) {
    e.preventDefault();
    setMensaje("");
    if (!productoActual.codigo || !productoActual.nombre || !productoActual.precio) {
      setMensaje("Completa todos los campos obligatorios.");
      return;
    }
    const dataProducto = {
      codigo: productoActual.codigo,
      nombre: productoActual.nombre,
      marca: productoActual.marca,
      categoria: productoActual.categoria,
      costo: productoActual.costo ? Number(productoActual.costo) : null,
      precio: Number(productoActual.precio),
    };

    let resultado;
    if (productoActual.id) {
      resultado = await supabase.from("productos").update(dataProducto).eq("id", productoActual.id);
      if (!resultado.error) setMensaje("Producto actualizado.");
    } else {
      resultado = await supabase.from("productos").insert([dataProducto]);
      if (!resultado.error) setMensaje("Producto agregado.");
    }
    if (resultado.error) setMensaje("Error: " + resultado.error.message);
    await cargarProductos();
    cerrarModal();
  }

  async function eliminarProducto() {
    if (!productoActual?.id) return;
    if (!window.confirm("¿Seguro que quieres eliminar este producto?")) return;
    const { error } = await supabase.from("productos").delete().eq("id", productoActual.id);
    if (!error) setMensaje("Producto eliminado.");
    else setMensaje("Error: " + error.message);
    await cargarProductos();
    cerrarModal();
  }

  // --- MÉTRICAS ---
  async function cargarMetricas() {
    if (!productoActual?.id) return;
    setLoadingMetricas(true);
    setVentasPorMes([]);
    setClientesVenta([]);
    setMesSeleccionado("");
    setFacturaSeleccionada(null);

    const { data, error } = await supabase.rpc("ventas_producto_por_mes", {
      producto_id_param: productoActual.id
    });
    setVentasPorMes(data || []);
    setLoadingMetricas(false);
  }

  // --- CLICK EN UNA BARRA DEL GRÁFICO ---
  async function handleBarClick(data, index) {
    if (!data?.mes) return;
    setMesSeleccionado(data.mes);
    setClientesVenta([]);
    setFacturaSeleccionada(null);
    setLoadingMetricas(true);
    const { data: clientes, error } = await supabase.rpc("clientes_producto_mes", {
      producto_id_param: productoActual.id,
      mes_param: data.mes
    });
    setClientesVenta(clientes || []);
    setLoadingMetricas(false);
  }

  // --- SELECCIONAR FACTURA ---
  function seleccionarFactura(factura) {
    setFacturaSeleccionada(factura);
    setMostrarModalFactura(true);
  }

  // --- AGREGAR NUEVO PRODUCTO ---
  function agregarProductoNuevo() {
    setProductoActual({
      id: null,
      codigo: "",
      nombre: "",
      marca: "",
      categoria: "",
      costo: "",
      precio: ""
    });
    setMensaje("");
    setTabActivo("editar");
    setVentasPorMes([]);
    setClientesVenta([]);
    setMesSeleccionado("");
    setFacturaSeleccionada(null);
    setModalAbierto(true);
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Inventario de Productos</h2>

      <div className="max-w-2xl mx-auto mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Buscar por código, nombre, marca, categoría..."
          value={busqueda}
          onChange={handleBuscar}
          className="border rounded p-2 w-full"
        />
        <button
          onClick={agregarProductoNuevo}
          className="bg-green-700 text-white font-bold rounded px-5 py-2 whitespace-nowrap"
        >
          + Agregar producto
        </button>
      </div>

      <div className="max-w-4xl mx-auto">
        {loading ? (
          <div className="text-center py-6 text-blue-700 font-bold">Cargando...</div>
        ) : (
          <table className="min-w-full text-sm bg-white rounded shadow">
            <thead>
              <tr>
                <th className="p-2">Código/UPC</th>
                <th className="p-2">Nombre</th>
                <th className="p-2">Marca</th>
                <th className="p-2">Categoría</th>
                <th className="p-2">Costo</th>
                <th className="p-2">Precio</th>
              </tr>
            </thead>
            <tbody>
              {productos.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center text-gray-400 py-5">
                    {busqueda ? "Sin resultados para la búsqueda." : "No hay productos."}
                  </td>
                </tr>
              ) : (
                productos.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-blue-100 cursor-pointer"
                    onClick={() => abrirModal(p)}
                  >
                    <td className="p-2">{p.codigo}</td>
                    <td className="p-2">{p.nombre}</td>
                    <td className="p-2">{p.marca}</td>
                    <td className="p-2">{p.categoria}</td>
                    <td className="p-2">{p.costo}</td>
                    <td className="p-2">{p.precio}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* PAGINACIÓN */}
        <div className="flex justify-between items-center mt-4">
          <button
            className="px-4 py-2 bg-gray-200 rounded"
            onClick={handleAnterior}
            disabled={pagina === 1}
          >
            Anterior
          </button>
          <span>
            Página {pagina} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            className="px-4 py-2 bg-gray-200 rounded"
            onClick={handleSiguiente}
            disabled={pagina * PAGE_SIZE >= total}
          >
            Siguiente
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-2 text-center mb-10">
          Mostrando {productos.length} de {total} productos.
        </div>
      </div>

      {/* --- MODAL EDICIÓN / MÉTRICAS --- */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30">
          <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-2xl relative">
            <button
              type="button"
              className="absolute top-3 right-3 text-2xl text-gray-400 hover:text-black"
              onClick={cerrarModal}
              title="Cerrar"
            >
              ×
            </button>
            {/* Tabs: Editar / Métricas */}
            <div className="flex mb-4 border-b">
              <button
                className={`px-6 py-2 font-bold ${tabActivo === "editar" ? "border-b-2 border-blue-700 text-blue-700" : "text-gray-500"}`}
                onClick={() => setTabActivo("editar")}
              >
                Editar producto
              </button>
              {productoActual.id && (
                <button
                  className={`px-6 py-2 font-bold ${tabActivo === "metricas" ? "border-b-2 border-blue-700 text-blue-700" : "text-gray-500"}`}
                  onClick={() => {
                    setTabActivo("metricas");
                    cargarMetricas();
                  }}
                >
                  Métricas
                </button>
              )}
            </div>
            {/* TAB EDITAR */}
            {tabActivo === "editar" && (
              <form onSubmit={guardarProducto}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold">Código/UPC*</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={productoActual.codigo}
                      onChange={e =>
                        setProductoActual({ ...productoActual, codigo: e.target.value })
                      }
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="font-bold">Nombre*</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={productoActual.nombre}
                      onChange={e =>
                        setProductoActual({ ...productoActual, nombre: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="font-bold">Marca</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={productoActual.marca}
                      onChange={e =>
                        setProductoActual({ ...productoActual, marca: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="font-bold">Categoría</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={productoActual.categoria}
                      onChange={e =>
                        setProductoActual({ ...productoActual, categoria: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="font-bold">Costo</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={productoActual.costo}
                      type="number"
                      step="0.01"
                      onChange={e =>
                        setProductoActual({ ...productoActual, costo: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="font-bold">Precio*</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={productoActual.precio}
                      type="number"
                      step="0.01"
                      onChange={e =>
                        setProductoActual({ ...productoActual, precio: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                {mensaje && (
                  <div className="text-blue-700 text-center mt-2">{mensaje}</div>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-700 text-white font-bold rounded px-5 py-2"
                  >
                    {productoActual.id ? "Guardar Cambios" : "Agregar producto"}
                  </button>
                  {productoActual.id && (
                    <button
                      type="button"
                      className="flex-1 bg-red-600 text-white rounded px-5 py-2"
                      onClick={eliminarProducto}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </form>
            )}
            {/* TAB MÉTRICAS */}
            {tabActivo === "metricas" && (
              <div>
                <h3 className="text-lg font-bold mb-2">Ventas por mes (últimos 12 meses):</h3>
                {loadingMetricas ? (
                  <div className="text-blue-700 mt-2">Cargando...</div>
                ) : ventasPorMes.length === 0 ? (
                  <div className="text-gray-400 mt-2">No hay ventas registradas.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={ventasPorMes}
                      margin={{ top: 15, right: 30, left: 0, bottom: 5 }}
                      onClick={(state) => {
                        if (state && state.activeLabel) {
                          handleBarClick(
                            ventasPorMes[state.activeTooltipIndex],
                            state.activeTooltipIndex
                          );
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="cantidad_vendida" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {/* CLIENTES DE UN MES SELECCIONADO */}
                {mesSeleccionado && (
                  <div className="mt-5">
                    <h4 className="font-bold mb-1">Clientes/facturas - {mesSeleccionado}:</h4>
                    {loadingMetricas ? (
                      <div className="text-blue-700 mt-2">Buscando...</div>
                    ) : clientesVenta.length === 0 ? (
                      <div className="text-gray-400">No hay ventas en este mes.</div>
                    ) : (
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr>
                            <th className="p-1 border-b">Cliente</th>
                            <th className="p-1 border-b">Cantidad</th>
                            <th className="p-1 border-b">Fecha</th>
                            <th className="p-1 border-b">Seleccionar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientesVenta.map(c => (
                            <tr
                              key={c.venta_id + c.cliente_id}
                              className={facturaSeleccionada?.venta_id === c.venta_id ? "bg-blue-100" : ""}
                            >
                              <td className="p-1 border-b">{c.cliente_nombre || c.nombre || "-"}</td>
                              <td className="p-1 border-b">{c.cantidad}</td>
                              <td className="p-1 border-b">
                                {c.fecha ? new Date(c.fecha).toLocaleDateString("es-DO") : ""}
                              </td>
                              <td className="p-1 border-b">
                                <button
                                  className={`px-2 py-1 rounded text-xs ${
                                    facturaSeleccionada?.venta_id === c.venta_id
                                      ? "bg-blue-600 text-white"
                                      : "bg-gray-200"
                                  }`}
                                  onClick={() => seleccionarFactura(c)}
                                >
                                  {facturaSeleccionada?.venta_id === c.venta_id
                                    ? "Seleccionado"
                                    : "Seleccionar"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* --- MODAL RESUMEN DE FACTURA --- */}
      {mostrarModalFactura && facturaSeleccionada && (
        <ModalResumenFactura
          factura={facturaSeleccionada}
          onClose={() => setMostrarModalFactura(false)}
        />
      )}
    </div>
  );
}
