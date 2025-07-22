import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer
} from "recharts";

// --- Safe Area Padding para iOS/Android ---
function getSafeTop() {
  if (typeof window !== "undefined" && window.visualViewport) {
    return window.visualViewport.offsetTop || 0;
  }
  return 0;
}

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
        Save supplier
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
        placeholder="Search supplier..."
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
        {showCrear ? "Cancel" : "+ New supplier"}
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
  ".05L", ".100ML", "5.25 OZ", "PACK", "TUB", "UNIT", "500ML", "1L", "BOX", "SACK", "BAG"
];

// --- MODAL RESUMEN DE FACTURA ---
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
          title="Close"
        >
          ×
        </button>
        <h3 className="text-xl font-bold mb-3">Invoice summary</h3>
        {loading ? (
          <div className="text-blue-700">Loading...</div>
        ) : !detalle ? (
          <div className="text-red-700">
            Invoice not found.<br />
            <span className="text-xs text-gray-500">
              Check the "factura" object and ID in the browser console (F12).
            </span>
          </div>
        ) : (
          <div>
            <div className="mb-3">
              <b>Invoice ID:</b> {detalle.id}
              <br />
              <b>Client:</b> {detalle.cliente?.nombre || "-"}
              <br />
              <b>Date:</b> {detalle.fecha ? new Date(detalle.fecha).toLocaleDateString("en-US") : "-"}
              <br />
              <b>Total:</b> <span className="text-green-700 font-bold">${detalle.total?.toFixed(2) ?? "-"}</span>
            </div>
            <b>Products sold:</b>
            <table className="min-w-full mt-2 text-xs">
              <thead>
                <tr>
                  <th className="p-1 border-b">Product</th>
                  <th className="p-1 border-b">Quantity</th>
                  <th className="p-1 border-b">Price</th>
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

// --- MODAL DE PRODUCTO: Safe area, swipe down ---
function ModalProducto({ children, onClose, modalAbierto, safeTop = 28 }) {
  const ref = useRef();
  // --- Swipe Down para cerrar ---
  useEffect(() => {
    if (!modalAbierto) return;
    let touchStartY = null;
    let deltaY = 0;
    function handleTouchStart(e) {
      touchStartY = e.touches[0].clientY;
    }
    function handleTouchMove(e) {
      if (touchStartY == null) return;
      deltaY = e.touches[0].clientY - touchStartY;
      if (deltaY > 50) {
        onClose();
      }
    }
    const el = ref.current;
    if (el) {
      el.addEventListener("touchstart", handleTouchStart);
      el.addEventListener("touchmove", handleTouchMove);
    }
    return () => {
      if (el) {
        el.removeEventListener("touchstart", handleTouchStart);
        el.removeEventListener("touchmove", handleTouchMove);
      }
    };
  }, [modalAbierto, onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
      <div
        ref={ref}
        className="bg-white rounded-t-xl shadow-xl w-full max-w-2xl relative flex flex-col h-[90dvh] overflow-y-auto"
        style={{
          paddingTop: `calc(${safeTop}px + env(safe-area-inset-top, 0px))`
        }}
      >
        {children}
      </div>
    </div>
  );
}

// --------- MAIN COMPONENT ---------
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
    if (error) setMensaje("Error loading products: " + error.message);
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
      setMensaje("Complete all required fields.");
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
      if (!resultado.error) setMensaje("Product updated.");
    } else {
      resultado = await supabase.from("productos").insert([dataProducto]);
      if (!resultado.error) setMensaje("Product added.");
    }
    if (resultado.error) setMensaje("Error: " + resultado.error.message);
    await cargarProductos();
    cerrarModal();
  }

  async function eliminarProducto() {
    if (!productoActual?.id) return;
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    const { error } = await supabase.from("productos").delete().eq("id", productoActual.id);
    if (!error) setMensaje("Product deleted.");
    else setMensaje("Error: " + error.message);
    await cargarProductos();
    cerrarModal();
  }

  async function guardarNotaProducto() {
    setGuardandoNota(true);
    await supabase.from("productos").update({ notas: notaProducto }).eq("id", productoActual.id);
    setGuardandoNota(false);
    setMensaje("Note saved.");
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

  // ------ RENDER ---------
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Product Inventory</h2>
      <div className="max-w-2xl mx-auto mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Search by code, name, brand, category..."
          value={busqueda}
          onChange={handleBuscar}
          className="border rounded p-2 w-full"
        />
        <button
          onClick={agregarProductoNuevo}
          className="bg-green-700 text-white font-bold rounded px-5 py-2 whitespace-nowrap"
        >
          + Add product
        </button>
      </div>
      <div className="max-w-4xl mx-auto">
        {loading ? (
          <div className="text-center py-6 text-blue-700 font-bold">Loading...</div>
        ) : (
          <table className="min-w-full text-sm bg-white rounded shadow">
            <thead>
              <tr>
                <th className="p-2">Code/UPC</th>
                <th className="p-2">Name</th>
                <th className="p-2">Brand</th>
                <th className="p-2">Category</th>
                <th className="p-2">Size</th>
                <th className="p-2">Supplier</th>
                <th className="p-2">Cost</th>
                <th className="p-2">Price</th>
              </tr>
            </thead>
            <tbody>
              {productos.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center text-gray-400 py-5">
                    {busqueda ? "No results found for your search." : "No products."}
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
        {/* PAGINATION */}
        <div className="flex justify-between items-center mt-4">
          <button
            className="px-4 py-2 bg-gray-200 rounded"
            onClick={handleAnterior}
            disabled={pagina === 1}
          >
            Previous
          </button>
          <span>
            Page {pagina} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            className="px-4 py-2 bg-gray-200 rounded"
            onClick={handleSiguiente}
            disabled={pagina * PAGE_SIZE >= total}
          >
            Next
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-2 text-center mb-10">
          Showing {productos.length} of {total} products.
        </div>
      </div>

      {/* --- MODAL EDIT / METRICS --- */}
      {modalAbierto && (
        <ModalProducto
          onClose={cerrarModal}
          modalAbierto={modalAbierto}
          safeTop={getSafeTop()}
        >
          <button
            type="button"
            className="absolute top-3 right-3 text-2xl text-gray-400 hover:text-black"
            onClick={cerrarModal}
            title="Close"
            style={{ zIndex: 100 }}
          >
            ×
          </button>
          {/* Tabs: Edit / Metrics */}
          <div className="flex mb-4 border-b mt-2">
            <button
              className={`px-6 py-2 font-bold ${tabActivo === "editar" ? "border-b-2 border-blue-700 text-blue-700" : "text-gray-500"}`}
              onClick={() => setTabActivo("editar")}
            >
              Edit product
            </button>
            {productoActual.id && (
              <button
                className={`px-6 py-2 font-bold ${tabActivo === "metricas" ? "border-b-2 border-blue-700 text-blue-700" : "text-gray-500"}`}
                onClick={() => {
                  setTabActivo("metricas");
                  cargarMetricas();
                }}
              >
                Metrics
              </button>
            )}
          </div>
          {/* TAB EDIT */}
          {tabActivo === "editar" && (
            <form onSubmit={guardarProducto}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="font-bold">Code/UPC*</label>
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
                  <label className="font-bold">Name*</label>
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
                  <label className="font-bold">Brand</label>
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
                  <label className="font-bold">Category</label>
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
                  <label className="font-bold">Size</label>
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
                    <option value="">Select size</option>
                    {SIZES_COMUNES.map(sz => (
                      <option value={sz} key={sz}>{sz}</option>
                    ))}
                    <option value="custom">Add custom size...</option>
                  </select>
                  {isCustomSize && (
                    <input
                      className="border rounded p-2 mt-1 w-full"
                      value={sizeCustom}
                      placeholder="Enter custom size"
                      onChange={e => setSizeCustom(e.target.value)}
                    />
                  )}
                </div>
                <div>
                  <label className="font-bold">Supplier</label>
                  <BuscadorSuplidor
                    value={suplidorId}
                    onChange={(id, nombre) => {
                      setSuplidorId(id);
                      setSuplidorNombre(nombre);
                      setProductoActual(prev => ({
                        ...prev,
                        proveedor: id,
                      }));
                    }}
                  />
                </div>
                <div>
                  <label className="font-bold">Cost</label>
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
                  <label className="font-bold">Price*</label>
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
                  <label className="font-bold">Product notes</label>
                  <textarea
                    className="border rounded p-2 w-full min-h-[60px]"
                    value={notaProducto}
                    placeholder="Special notes, important details, etc."
                    onChange={e => setNotaProducto(e.target.value)}
                  />
                  {productoActual.id && (
                    <button
                      type="button"
                      className="bg-blue-600 text-white px-3 py-1 rounded mt-2 text-xs"
                      onClick={guardarNotaProducto}
                      disabled={guardandoNota}
                    >
                      Save note
                    </button>
                  )}
                </div>
              </div>
              {mensaje && (
                <div className="text-blue-700 text-center mt-2">{mensaje}</div>
              )}
              <div className="flex gap-2 mt-4 sticky bottom-0 bg-white py-3 z-10">
                <button
                  type="submit"
                  className="flex-1 bg-blue-700 text-white font-bold rounded px-5 py-2"
                >
                  {productoActual.id ? "Save changes" : "Add product"}
                </button>
                {productoActual.id && (
                  <button
                    type="button"
                    className="flex-1 bg-red-600 text-white rounded px-5 py-2"
                    onClick={eliminarProducto}
                  >
                    Delete
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
                  Quantity sold
                </button>
                <button
                  className={`px-3 py-1 rounded text-xs font-bold ${
                    tipoGrafico === "valor" ? "bg-blue-700 text-white" : "bg-gray-200"
                  }`}
                  onClick={() => cambiarTipoGrafico("valor")}
                >
                  Sales in $
                </button>
              </div>
              <div className="my-2">
                <span className="inline-block bg-blue-50 rounded p-2 border">
                  <b>Profit margin:</b>{" "}
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
                  <b>Total sold:</b>
                  <div className="text-lg font-bold">{indicadores.total?.toLocaleString()}</div>
                </div>
                <div className="p-2 bg-blue-50 rounded shadow">
                  <b>Best month:</b>
                  <div className="font-bold">{indicadores.mejorMes || "-"}</div>
                </div>
                <div className="p-2 bg-red-50 rounded shadow">
                  <b>Worst month:</b>
                  <div className="font-bold">{indicadores.peorMes || "-"}</div>
                </div>
                <div className="p-2 bg-yellow-50 rounded shadow">
                  <b>Monthly average:</b>
                  <div className="font-bold">{Number(indicadores.promedio).toFixed(1)}</div>
                </div>
              </div>
              <h3 className="text-lg font-bold mb-2">Sales per month (last 12 months):</h3>
              {loadingMetricas ? (
                <div className="text-blue-700 mt-2">Loading...</div>
              ) : ventasPorMes.length === 0 ? (
                <div className="text-gray-400 mt-2">No sales registered.</div>
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
                  <h4 className="font-bold mb-1">Clients/invoices - {mesSeleccionado}:</h4>
                  {loadingMetricas ? (
                    <div className="text-blue-700 mt-2">Searching...</div>
                  ) : clientesVenta.length === 0 ? (
                    <div className="text-gray-400">No sales in this month.</div>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr>
                          <th className="p-1 border-b">Client</th>
                          <th className="p-1 border-b">Quantity</th>
                          <th className="p-1 border-b">Date</th>
                          <th className="p-1 border-b">Select</th>
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
                              {c.fecha ? new Date(c.fecha).toLocaleDateString("en-US") : ""}
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
                                  ? "Selected"
                                  : "Select"}
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
        </ModalProducto>
      )}

      {/* --- MODAL INVOICE SUMMARY --- */}
      {mostrarModalFactura && facturaSeleccionada && (
        <ModalResumenFactura
          factura={facturaSeleccionada}
          onClose={() => setMostrarModalFactura(false)}
        />
      )}
    </div>
  );
}
