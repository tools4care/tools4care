import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer
} from "recharts";

// --- MODAL CREAR SUPLIDOR ---
function CrearSuplidor({ onCreate }) {
  const [form, setForm] = useState({
    nombre: "", contacto: "", telefono: "", direccion: "", email: ""
  });
  const [cargando, setCargando] = useState(false);

  async function guardarSuplidor(e) {
    e.preventDefault();
    setCargando(true);
    const { data, error } = await supabase
      .from("suplidores")
      .insert([form])
      .select()
      .maybeSingle();
    setCargando(false);
    if (!error) onCreate(data);
  }

  return (
    <form onSubmit={guardarSuplidor} className="p-2 bg-gray-50 rounded mt-2">
      {["nombre", "contacto", "telefono", "direccion", "email"].map(f => (
        <input
          key={f}
          className="border rounded p-2 w-full mb-1"
          placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
          value={form[f]}
          onChange={e => setForm(prev => ({ ...prev, [f]: e.target.value }))}
          required={f === "nombre"}
        />
      ))}
      <button className="bg-green-600 text-white rounded px-3 py-1 mt-1 w-full" disabled={cargando}>
        Guardar suplidor
      </button>
    </form>
  );
}

// --- MODAL BUSCADOR SUPLIDOR ---
function BuscadorSuplidor({ value, onChange }) {
  const [busqueda, setBusqueda] = useState("");
  const [suplidores, setSuplidores] = useState([]);
  const [showCrear, setShowCrear] = useState(false);

  useEffect(() => {
    if (!busqueda.trim()) {
      setSuplidores([]);
      return;
    }
    async function buscar() {
      const { data } = await supabase
        .from("suplidores")
        .select("*")
        .ilike("nombre", `%${busqueda}%`);
      setSuplidores(data || []);
    }
    buscar();
  }, [busqueda]);

  return (
    <div>
      <input
        className="border rounded p-2 w-full"
        value={busqueda}
        placeholder="Buscar suplidor..."
        onChange={e => setBusqueda(e.target.value)}
      />
      <div className="max-h-32 overflow-auto mt-1 border rounded bg-white">
        {suplidores.map(s => (
          <div
            key={s.id}
            className={`p-2 hover:bg-blue-100 cursor-pointer ${value === s.id ? "bg-blue-50" : ""}`}
            onClick={() => {
              onChange(s.id, s.nombre);
              setBusqueda(s.nombre);
            }}
          >
            {s.nombre} <span className="text-xs text-gray-500">{s.contacto}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-xs text-blue-700 mt-1"
        onClick={() => setShowCrear(!showCrear)}
      >
        {showCrear ? "Cancelar" : "+ Nuevo suplidor"}
      </button>
      {showCrear && (
        <CrearSuplidor
          onCreate={s => {
            onChange(s.id, s.nombre);
            setBusqueda(s.nombre);
            setShowCrear(false);
          }}
        />
      )}
    </div>
  );
}

const SIZES_COMUNES = [
  ".05L", ".100ML", "5.25 OZ", "PACK", "TUB", "UNIT", "500ML", "1L", "CAJA", "SACO", "BOLSA"
];

function ModalResumenFactura({ factura, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetalle() {
      if (!factura) return;
      const ventaID = factura.venta_id || factura.id || factura.id_venta;
      if (!ventaID) {
        setDetalle(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("ventas")
        .select("id, fecha, total, cliente:cliente_id (nombre, email, telefono), productos")
        .eq("id", ventaID)
        .single();
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

  // Size/Custom size
  const [sizeCustom, setSizeCustom] = useState("");
  const [isCustomSize, setIsCustomSize] = useState(false);

  // Suplidor
  const [suplidorId, setSuplidorId] = useState(null);
  const [suplidorNombre, setSuplidorNombre] = useState("");

  // Notas
  const [notaProducto, setNotaProducto] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);

  // Métricas
  const [ventasPorMes, setVentasPorMes] = useState([]);
  const [loadingMetricas, setLoadingMetricas] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState("");
  const [clientesVenta, setClientesVenta] = useState([]);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [mostrarModalFactura, setMostrarModalFactura] = useState(false);
  const [tipoGrafico, setTipoGrafico] = useState("cantidad");

  // Indicadores
  const [indicadores, setIndicadores] = useState({
    total: 0, mejorMes: "", peorMes: "", promedio: 0,
  });

  // --- FETCH PRODUCTOS ---
  useEffect(() => { cargarProductos(); }, [busqueda, pagina]);

  async function cargarProductos() {
    setLoading(true);
    let query = supabase
      .from("productos")
      .select("*, suplidor:suplidor_id(nombre)")
      .order("nombre", { ascending: true });

    if (busqueda.trim()) {
      query = query.or(
        `codigo.ilike.%${busqueda}%,nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,categoria.ilike.%${busqueda}%`
      );
    }

    const desde = (pagina - 1) * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;
    query = query.range(desde, hasta);

    const { data, count, error } = await query;
    if (error) setMensaje("Error cargando productos: " + error.message);
    if (data) {
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
    setTabActivo("editar");
    setVentasPorMes([]);
    setClientesVenta([]);
    setMesSeleccionado("");
    setFacturaSeleccionada(null);
    setNotaProducto(prod.notas || "");
    setSizeCustom("");
    setIsCustomSize(prod.size && !SIZES_COMUNES.includes(prod.size));
    setSuplidorId(prod.proveedor || "");
    setSuplidorNombre(prod.suplidor?.nombre || "");
    setModalAbierto(true);
  }
  function cerrarModal() {
    setModalAbierto(false);
    setProductoActual(null);
    setVentasPorMes([]);
    setClientesVenta([]);
    setMesSeleccionado("");
    setFacturaSeleccionada(null);
    setNotaProducto("");
    setIsCustomSize(false);
    setSizeCustom("");
    setSuplidorId(null);
    setSuplidorNombre("");
  }

  // --- AGREGAR NUEVO PRODUCTO ---
  function agregarProductoNuevo() {
    setProductoActual({
      id: null, codigo: "", nombre: "", marca: "", categoria: "",
      costo: "", precio: "", notas: "", size: "", proveedor: null,
    });
    setMensaje("");
    setTabActivo("editar");
    setVentasPorMes([]);
    setClientesVenta([]);
    setMesSeleccionado("");
    setFacturaSeleccionada(null);
    setNotaProducto("");
    setIsCustomSize(false);
    setSizeCustom("");
    setSuplidorId(null);
    setSuplidorNombre("");
    setModalAbierto(true);
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
      size: isCustomSize ? sizeCustom : productoActual.size,
      proveedor: suplidorId,
      notas: notaProducto,
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

  async function guardarNotaProducto() {
    setGuardandoNota(true);
    await supabase.from("productos").update({ notas: notaProducto }).eq("id", productoActual.id);
    setGuardandoNota(false);
    setMensaje("Nota guardada.");
  }

  // --- MÉTRICAS ---
  async function cargarMetricas() {
    if (!productoActual?.id) return;
    setLoadingMetricas(true);
    setVentasPorMes([]);
    setClientesVenta([]);
    setMesSeleccionado("");
    setFacturaSeleccionada(null);

    const { data } = await supabase.rpc("ventas_producto_por_mes", {
      producto_id_param: productoActual.id
    });
    setVentasPorMes(data || []);
    setLoadingMetricas(false);

    if (data && data.length > 0) {
      let total, mejorMes, peorMes, promedio;
      if (tipoGrafico === "cantidad") {
        total = data.reduce((acc, v) => acc + (v.cantidad_vendida || 0), 0);
        mejorMes = data.reduce((a, b) => (a.cantidad_vendida > b.cantidad_vendida ? a : b)).mes;
        peorMes = data.reduce((a, b) => (a.cantidad_vendida < b.cantidad_vendida ? a : b)).mes;
        promedio = total / data.length;
      } else {
        total = data.reduce((acc, v) => acc + (v.total_vendido || 0), 0);
        mejorMes = data.reduce((a, b) => (a.total_vendido > b.total_vendido ? a : b)).mes;
        peorMes = data.reduce((a, b) => (a.total_vendido < b.total_vendido ? a : b)).mes;
        promedio = total / data.length;
      }
      setIndicadores({
        total, mejorMes, peorMes, promedio,
      });
    } else {
      setIndicadores({ total: 0, mejorMes: "", peorMes: "", promedio: 0 });
    }
  }

  function cambiarTipoGrafico(tipo) {
    setTipoGrafico(tipo);
    cargarMetricas();
  }

  async function handleBarClick(data, index) {
    if (!data?.mes) return;
    setMesSeleccionado(data.mes);
    setClientesVenta([]);
    setFacturaSeleccionada(null);
    setLoadingMetricas(true);
    const { data: clientes } = await supabase.rpc("clientes_producto_mes", {
      producto_id_param: productoActual.id,
      mes_param: data.mes
    });
    setClientesVenta(clientes || []);
    setLoadingMetricas(false);
  }

  function seleccionarFactura(factura) {
    setFacturaSeleccionada(factura);
    setMostrarModalFactura(true);
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
                <th className="p-2">Tamaño</th>
                <th className="p-2">Suplidor</th>
                <th className="p-2">Costo</th>
                <th className="p-2">Precio</th>
              </tr>
            </thead>
            <tbody>
              {productos.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center text-gray-400 py-5">
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
                    <td className="p-2">{p.size}</td>
                    <td className="p-2">{p.suplidor?.nombre || ""}</td>
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
        <div
          className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/40 overflow-y-auto"
          onClick={cerrarModal}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-xl shadow-xl px-2 pt-3 pb-28 sm:pb-6 relative animate-modal-in overflow-y-auto"
            onClick={e => e.stopPropagation()}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            // --- SWIPE DOWN PARA MOBILE ---
            onTouchStart={e => { window.__swipeY = e.touches[0].clientY; }}
            onTouchMove={e => {
              if (window.__swipeY != null) {
                const delta = e.touches[0].clientY - window.__swipeY;
                if (delta > 60) {
                  cerrarModal();
                  window.__swipeY = null;
                }
              }
            }}
            onTouchEnd={() => { window.__swipeY = null; }}
          >
            {/* Drag bar visual solo en móvil */}
            <div className="w-12 h-1.5 rounded bg-gray-300 mx-auto mb-2 sm:hidden" />
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
              <form onSubmit={guardarProducto} autoComplete="off">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold">Código/UPC*</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={productoActual.codigo}
                      inputMode="numeric"
                      autoComplete="off"
                      pattern="[0-9]*"
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
                      autoComplete="off"
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
                      autoComplete="off"
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
                      autoComplete="off"
                      onChange={e =>
                        setProductoActual({ ...productoActual, categoria: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="font-bold">Tamaño/Size</label>
                    <select
                      className="border rounded p-2 w-full"
                      value={isCustomSize ? "custom" : (productoActual.size || "")}
                      onChange={e => {
                        if (e.target.value === "custom") {
                          setIsCustomSize(true);
                        } else {
                          setIsCustomSize(false);
                          setProductoActual(prev => ({
                            ...prev,
                            size: e.target.value,
                          }));
                        }
                      }}
                    >
                      <option value="">Selecciona tamaño</option>
                      {SIZES_COMUNES.map(sz => (
                        <option value={sz} key={sz}>{sz}</option>
                      ))}
                      <option value="custom">Agregar otro tamaño...</option>
                    </select>
                    {isCustomSize && (
                      <input
                        className="border rounded p-2 mt-1 w-full"
                        value={sizeCustom}
                        placeholder="Escribe el tamaño personalizado"
                        onChange={e => setSizeCustom(e.target.value)}
                      />
                    )}
                  </div>
                  <div>
                    <label className="font-bold">Suplidor</label>
                    <BuscadorSuplidor
                      value={suplidorId}
                      onChange={(id, nombre) => {
                        setSuplidorId(id);
                        setSuplidorNombre(nombre);
                        setProductoActual(prev => ({
                          ...prev,
                          proveedor: id, // guarda en el campo proveedor
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <label className="font-bold">Costo</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={productoActual.costo}
                      type="number"
                      step="0.01"
                      inputMode="numeric"
                      min="0"
                      autoComplete="off"
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
                      inputMode="numeric"
                      min="0"
                      autoComplete="off"
                      onChange={e =>
                        setProductoActual({ ...productoActual, precio: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="font-bold">Notas del producto</label>
                    <textarea
                      className="border rounded p-2 w-full min-h-[60px]"
                      value={notaProducto}
                      placeholder="Observaciones especiales, detalles importantes, etc."
                      onChange={e => setNotaProducto(e.target.value)}
                    />
                    {productoActual.id && (
                      <button
                        type="button"
                        className="bg-blue-600 text-white px-3 py-1 rounded mt-2 text-xs"
                        onClick={guardarNotaProducto}
                        disabled={guardandoNota}
                      >
                        Guardar nota
                      </button>
                    )}
                  </div>
                </div>
                {mensaje && (
                  <div className="text-blue-700 text-center mt-2">{mensaje}</div>
                )}
                {/* Sticky botones */}
                <div className="flex gap-2 mt-4 sticky bottom-0 bg-white py-3 z-10">
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
                <div className="mb-2 flex gap-2">
                  <button
                    className={`px-3 py-1 rounded text-xs font-bold ${
                      tipoGrafico === "cantidad" ? "bg-blue-700 text-white" : "bg-gray-200"
                    }`}
                    onClick={() => cambiarTipoGrafico("cantidad")}
                  >
                    Cantidad vendida
                  </button>
                  <button
                    className={`px-3 py-1 rounded text-xs font-bold ${
                      tipoGrafico === "valor" ? "bg-blue-700 text-white" : "bg-gray-200"
                    }`}
                    onClick={() => cambiarTipoGrafico("valor")}
                  >
                    Ventas en $
                  </button>
                </div>
                <div className="my-2">
                  <span className="inline-block bg-blue-50 rounded p-2 border">
                    <b>Margen de ganancia:</b>{" "}
                    {productoActual.costo && productoActual.precio
                      ? (
                        ((productoActual.precio - productoActual.costo) /
                        productoActual.precio * 100
                        ).toFixed(2) + " %"
                      ) : "—"
                    }
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 my-4 text-xs text-center">
                  <div className="p-2 bg-green-50 rounded shadow">
                    <b>Total vendido:</b>
                    <div className="text-lg font-bold">{indicadores.total?.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-blue-50 rounded shadow">
                    <b>Mejor mes:</b>
                    <div className="font-bold">{indicadores.mejorMes || "-"}</div>
                  </div>
                  <div className="p-2 bg-red-50 rounded shadow">
                    <b>Peor mes:</b>
                    <div className="font-bold">{indicadores.peorMes || "-"}</div>
                  </div>
                  <div className="p-2 bg-yellow-50 rounded shadow">
                    <b>Promedio mensual:</b>
                    <div className="font-bold">{Number(indicadores.promedio).toFixed(1)}</div>
                  </div>
                </div>
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
                      onClick={state => {
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
                      <Bar
                        dataKey={tipoGrafico === "valor" ? "total_vendido" : "cantidad_vendida"}
                        fill={tipoGrafico === "valor" ? "#22c55e" : "#3b82f6"}
                      />
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
