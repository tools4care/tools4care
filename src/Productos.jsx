import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useLocation, useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// --- Suplidor Modal & Buscador ---
function CrearSuplidor({ onCreate }) {
  const [form, setForm] = useState({ nombre: "", contacto: "", telefono: "", direccion: "", email: "" });
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

  // Ubicaciones
  const [ubicaciones, setUbicaciones] = useState([{ key: "almacen", nombre: "Central warehouse" }]);
  const [ubicacionInicial, setUbicacionInicial] = useState("almacen");

  // --- NUEVO para ventas del producto seleccionado ---
  const [ventasMes, setVentasMes] = useState([]); // [{mes, cantidad}]
  const [mesesVentas, setMesesVentas] = useState([]); // ['2024-07', ...]
  const [mesSeleccionado, setMesSeleccionado] = useState("");
  const [facturasMes, setFacturasMes] = useState([]); // [{venta_id, fecha, cliente, cantidad}]

  // --- Hooks para leer la URL ---
  const location = useLocation();
  const navigate = useNavigate();
  const modalAutoOpenRef = useRef(false);

  useEffect(() => { cargarUbicaciones(); }, []);

  async function cargarUbicaciones() {
    const { data: vansData } = await supabase.from("vans").select("id, nombre_van");
    const vans = (vansData || []).map(v => ({
      key: `van_${v.id}`,
      nombre: v.nombre_van,
      van_id: v.id,
    }));
    setUbicaciones([{ key: "almacen", nombre: "Central warehouse" }, ...vans]);
  }

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

  // --- ABRIR MODAL ---
  function abrirModal(prod) {
    setProductoActual({ ...prod });
    setTabActivo("editar");
    setMensaje("");
    setIsCustomSize(prod.size && !SIZES_COMUNES.includes(prod.size));
    setSizeCustom("");
    setSuplidorId(prod.proveedor || "");
    setSuplidorNombre(prod.suplidor?.nombre || "");
    setModalAbierto(true);

    // ---- NUEVO: cargar ventas mensuales del producto
    cargarVentasPorMes(prod.id);
  }
  function cerrarModal() {
    if (location.pathname.endsWith("/productos/nuevo")) {
      navigate("/productos");
    }
    setModalAbierto(false);
    setProductoActual(null);
    setMensaje("");
    setIsCustomSize(false);
    setSizeCustom("");
    setSuplidorId(null);
    setSuplidorNombre("");
    setUbicacionInicial("almacen");
    setVentasMes([]);
    setMesSeleccionado("");
    setFacturasMes([]);
  }

  // --- NUEVO: Cargar ventas por mes de producto ---
  async function cargarVentasPorMes(productoId) {
    // RPC recomendada en supabase (ventas_por_mes_producto)
    // Si no tienes RPC, puedes hacer un query agrupado desde ventas_detalle si tienes fechas ahí
    const { data, error } = await supabase
      .from("ventas_detalle")
      .select("fecha, cantidad")
      .eq("producto_id", productoId);

    if (!error && data) {
      // Agrupa por mes
      const agrupado = {};
      data.forEach(v => {
        if (!v.fecha || !v.cantidad) return;
        const mes = v.fecha.slice(0, 7); // "YYYY-MM"
        agrupado[mes] = (agrupado[mes] || 0) + Number(v.cantidad);
      });
      const result = Object.keys(agrupado)
        .sort((a, b) => b.localeCompare(a))
        .map(mes => ({ mes, cantidad: agrupado[mes] }));
      setVentasMes(result);
      setMesesVentas(result.map(x => x.mes));
      setMesSeleccionado(result.length > 0 ? result[0].mes : "");
      if (result.length > 0) cargarFacturasMes(productoId, result[0].mes);
      else setFacturasMes([]);
    } else {
      setVentasMes([]);
      setMesesVentas([]);
      setMesSeleccionado("");
      setFacturasMes([]);
    }
  }

  async function cargarFacturasMes(productoId, mes) {
    // Obtiene facturas/ventas donde ese producto se vendió en ese mes
    // Ajusta si tu tabla de ventas_detalle o ventas cambia (join cliente)
    const desde = mes + "-01";
    const hasta = mes + "-31";
    const { data, error } = await supabase
      .from("ventas_detalle")
      .select(
        `
        venta_id,
        cantidad,
        fecha,
        ventas (
          fecha,
          cliente_id,
          clientes (
            nombre
          )
        )
        `
      )
      .eq("producto_id", productoId)
      .gte("fecha", desde)
      .lte("fecha", hasta);
    if (!error && data) {
      const facturas = data.map(f => ({
        venta_id: f.venta_id,
        cantidad: f.cantidad,
        fecha: f.ventas?.fecha || f.fecha,
        cliente:
          f.ventas?.clientes?.nombre ||
          f.ventas?.cliente_id ||
          "",
      }));
      setFacturasMes(facturas);
    } else {
      setFacturasMes([]);
    }
  }

  // Cuando cambias de mes en la gráfica
  useEffect(() => {
    if (productoActual && mesSeleccionado) {
      cargarFacturasMes(productoActual.id, mesSeleccionado);
    }
    // eslint-disable-next-line
  }, [mesSeleccionado, productoActual?.id]);

  // --- AGREGAR NUEVO PRODUCTO (igual que antes) ---
  function agregarProductoNuevo(codigoForzado = "") {
    let codigoInicial = codigoForzado;
    if (location.pathname.endsWith("/productos/nuevo")) {
      const params = new URLSearchParams(location.search);
      codigoInicial = params.get("codigo") || "";
    }
    setProductoActual({
      id: null, codigo: codigoInicial, nombre: "", marca: "", categoria: "",
      costo: "", precio: "", notas: "", size: "", proveedor: null,
      cantidad_inicial: "",
      ubicacion_inicial: "almacen",
      van_id_inicial: null,
    });
    setIsCustomSize(false);
    setSizeCustom("");
    setSuplidorId(null);
    setSuplidorNombre("");
    setMensaje("");
    setTabActivo("editar");
    setModalAbierto(true);
  }

  async function guardarProducto(e) {
    e.preventDefault();
    setMensaje("");
    if (!productoActual.codigo || !productoActual.nombre || !productoActual.precio) {
      setMensaje("Complete all required fields.");
      return;
    }
    const { data: existentes, error: errorExistente } = await supabase
      .from("productos")
      .select("id")
      .eq("codigo", productoActual.codigo);
    if (errorExistente) {
      setMensaje("Error checking for duplicate code: " + errorExistente.message);
      return;
    }
    if (
      existentes &&
      existentes.length > 0 &&
      (!productoActual.id || existentes[0].id !== productoActual.id)
    ) {
      setMensaje("Error: There is already a product with this code/UPC.");
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
      notas: productoActual.notas || "",
    };
    let resultado;
    let nuevoId = productoActual.id;
    if (productoActual.id) {
      resultado = await supabase.from("productos").update(dataProducto).eq("id", productoActual.id);
      if (resultado?.error) {
        if (
          resultado.error.message &&
          resultado.error.message.toLowerCase().includes("unique")
        ) {
          setMensaje("Error: This code/UPC is already in use. Please use another one.");
        } else {
          setMensaje("Error: " + resultado.error.message);
        }
        return;
      }
      if (!resultado.error) setMensaje("Product updated.");
    } else {
      const { data, error } = await supabase.from("productos").insert([dataProducto]).select().maybeSingle();
      if (error) {
        if (
          error.message &&
          error.message.toLowerCase().includes("unique")
        ) {
          setMensaje("Error: This code/UPC is already in use. Please use another one.");
        } else {
          setMensaje("Error: " + error.message);
        }
        return;
      }
      if (data) {
        setMensaje("Product added.");
        nuevoId = data.id;
        if (productoActual.cantidad_inicial && Number(productoActual.cantidad_inicial) > 0) {
          let tabla = productoActual.ubicacion_inicial === "almacen" ? "stock_almacen" : "stock_van";
          let payload = {
            producto_id: data.id,
            cantidad: Number(productoActual.cantidad_inicial)
          };
          if (tabla === "stock_van") {
            payload.van_id = productoActual.van_id_inicial;
          }
          const { error: errorStock } = await supabase.from(tabla).insert([payload]);
          if (errorStock) setMensaje("Product saved, error in initial stock: " + errorStock.message);
        }
      }
    }
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
          onClick={() => agregarProductoNuevo()}
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
      {modalAbierto && productoActual && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl relative p-8">
            <button
              type="button"
              className="absolute top-3 right-3 text-2xl text-gray-400 hover:text-black"
              onClick={cerrarModal}
              title="Close"
              style={{ zIndex: 100 }}
            >
              ×
            </button>
            <div className="flex mb-4 border-b mt-2">
              <button
                className={`px-6 py-2 font-bold ${tabActivo === "editar" ? "border-b-2 border-blue-700 text-blue-700" : "text-gray-500"}`}
                onClick={() => setTabActivo("editar")}
              >
                Edit product
              </button>
              <button
                className={`px-6 py-2 font-bold ${tabActivo === "ventas" ? "border-b-2 border-blue-700 text-blue-700" : "text-gray-500"}`}
                onClick={() => setTabActivo("ventas")}
              >
                Sales
              </button>
            </div>

            {tabActivo === "editar" ? (
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
                      value={productoActual.notas || ""}
                      placeholder="Special notes, important details, etc."
                      onChange={e => setProductoActual({ ...productoActual, notas: e.target.value })}
                    />
                  </div>
                </div>
                {!productoActual.id && (
                  <div className="md:col-span-2 border-t pt-2 mt-2">
                    <b>Initial stock (optional)</b>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-bold">Quantity</label>
                        <input
                          className="border rounded p-2 w-full"
                          type="number"
                          min="0"
                          value={productoActual.cantidad_inicial || ""}
                          onChange={e =>
                            setProductoActual({ ...productoActual, cantidad_inicial: e.target.value })
                          }
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="font-bold">Location</label>
                        <select
                          className="border rounded p-2 w-full"
                          value={productoActual.ubicacion_inicial}
                          onChange={e => {
                            const value = e.target.value;
                            setProductoActual(prev => ({
                              ...prev,
                              ubicacion_inicial: value,
                              van_id_inicial: value.startsWith("van_")
                                ? ubicaciones.find(u => u.key === value)?.van_id
                                : null,
                            }));
                          }}
                        >
                          {ubicaciones.map(u => (
                            <option key={u.key} value={u.key}>
                              {u.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
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
            ) : (
              <div>
                <h3 className="font-bold text-blue-900 mb-4">Sales for "{productoActual.nombre}"</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ventasMes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={v => `${v} units`} />
                    <Bar dataKey="cantidad" fill="#1976D2" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="my-4">
                  <label className="font-bold">Select month:</label>
                  <select
                    className="border rounded p-2 ml-2"
                    value={mesSeleccionado}
                    onChange={e => setMesSeleccionado(e.target.value)}
                  >
                    {mesesVentas.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <h4 className="font-bold mb-2">Invoices for {mesSeleccionado || "..."}</h4>
                  {facturasMes.length === 0 ? (
                    <div className="text-gray-500">No invoices for this month.</div>
                  ) : (
                    <table className="min-w-full text-sm border border-gray-300 rounded">
                      <thead>
                        <tr className="bg-blue-100">
                          <th className="border px-2 py-1">Invoice ID</th>
                          <th className="border px-2 py-1">Date</th>
                          <th className="border px-2 py-1">Client</th>
                          <th className="border px-2 py-1">Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {facturasMes.map(f => (
                          <tr key={f.venta_id + "-" + f.fecha} className="border-b">
                            <td className="border px-2 py-1 font-mono">{f.venta_id}</td>
                            <td className="border px-2 py-1">{f.fecha?.slice(0, 10)}</td>
                            <td className="border px-2 py-1">{f.cliente}</td>
                            <td className="border px-2 py-1">{f.cantidad}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
