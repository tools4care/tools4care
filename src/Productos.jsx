// src/Productos.jsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useLocation, useNavigate } from "react-router-dom";
// ⚠️ Eliminado: import PricingRulesEditor from "./components/PricingRulesEditor";
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

// --------------- COMPONENTE DE PESTAÑA DE VENTAS --------------
function PestañaVentas({ productoId, nombre }) {
  const [ventasMes, setVentasMes] = useState([]);
  const [meses, setMeses] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState("");
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(false);

  function yyyymm(d) {
    if (!d) return "";
    const s = typeof d === "string" ? d : new Date(d).toISOString();
    return s.slice(0, 7);
  }

  useEffect(() => {
    if (!productoId) return;
    (async () => {
      setLoading(true);
      const { data: det, error: errDet } = await supabase
        .from("detalle_ventas")
        .select("venta_id,cantidad")
        .eq("producto_id", productoId);

      if (errDet || !det || det.length === 0) {
        setVentasMes([]);
        setMeses([]);
        setMesSeleccionado("");
        setFacturas([]);
        setLoading(false);
        return;
      }

      const ventaIds = Array.from(new Set(det.map(d => d.venta_id).filter(Boolean)));
      const { data: ventasRows } = await supabase
        .from("ventas")
        .select("id,fecha,cliente_id")
        .in("id", ventaIds);

      const mapVenta = new Map((ventasRows || []).map(v => [v.id, v]));
      const enriquecido = det
        .map(d => {
          const v = mapVenta.get(d.venta_id);
          if (!v) return null;
          return { venta_id: d.venta_id, cantidad: d.cantidad || 0, fecha: v.fecha, cliente_id: v.cliente_id };
        })
        .filter(Boolean);

      const agg = {};
      for (const r of enriquecido) {
        const key = yyyymm(r.fecha);
        if (!key) continue;
        agg[key] = (agg[key] || 0) + Number(r.cantidad || 0);
      }
      const lista = Object.keys(agg)
        .sort((a, b) => b.localeCompare(a))
        .map(m => ({ mes: m, cantidad: agg[m] }));

      setVentasMes(lista);
      setMeses(lista.map(x => x.mes));
      setMesSeleccionado(lista[0]?.mes || "");

      if (lista[0]) {
        await cargarFacturasMes(enriquecido, lista[0].mes);
      } else {
        setFacturas([]);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  async function cargarFacturasMes(detallesEnriquecidos, mes) {
    const filtrado = (detallesEnriquecidos || []).filter(d => yyyymm(d.fecha) === mes);

    const idsClientes = Array.from(new Set(filtrado.map(f => f.cliente_id).filter(Boolean)));
    const nombres = {};
    if (idsClientes.length > 0) {
      const { data: clientesData } = await supabase
        .from("clientes")
        .select("id,nombre")
        .in("id", idsClientes);
      (clientesData || []).forEach(c => { nombres[c.id] = c.nombre; });
    }

    const lista = filtrado.map(f => ({
      venta_id: f.venta_id,
      cantidad: f.cantidad,
      fecha: f.fecha,
      cliente: nombres[f.cliente_id] || f.cliente_id || "",
    }));
    setFacturas(lista);
  }

  useEffect(() => {
    if (!productoId || !mesSeleccionado) return;
    (async () => {
      setLoading(true);
      const { data: det } = await supabase
        .from("detalle_ventas")
        .select("venta_id,cantidad")
        .eq("producto_id", productoId);

      const ventaIds = Array.from(new Set((det || []).map(d => d.venta_id).filter(Boolean)));
      const { data: ventasRows } = await supabase
        .from("ventas")
        .select("id,fecha,cliente_id")
        .in("id", ventaIds);

      const mapVenta = new Map((ventasRows || []).map(v => [v.id, v]));
      const enriquecido = (det || [])
        .map(d => {
          const v = mapVenta.get(d.venta_id);
          if (!v) return null;
          return { venta_id: d.venta_id, cantidad: d.cantidad || 0, fecha: v.fecha, cliente_id: v.cliente_id };
        })
        .filter(Boolean);

      await cargarFacturasMes(enriquecido, mesSeleccionado);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesSeleccionado, productoId]);

  return (
    <div>
      <h3 className="font-bold text-blue-900 mb-4">Sales for "{nombre}"</h3>

      <div className="border-2 border-dashed border-blue-200 rounded-lg p-3 min-h-[160px] flex items-center justify-center">
        {ventasMes.length === 0 ? (
          <div className="text-blue-600 text-sm">No sales yet.</div>
        ) : (
          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ventasMes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={v => `${v} units`} />
                <Bar dataKey="cantidad" fill="#1976D2" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="my-4">
        <label className="font-bold">Select month:</label>
        <select
          className="border rounded p-2 ml-2"
          value={mesSeleccionado}
          onChange={e => setMesSeleccionado(e.target.value)}
        >
          {meses.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="border rounded-lg">
        <div className="px-3 py-2 font-bold bg-gray-50 border-b">Invoices for …</div>
        {loading ? (
          <div className="p-3 text-blue-600">Loading...</div>
        ) : facturas.length === 0 ? (
          <div className="p-3 text-gray-500">No invoices for this month.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-blue-100">
                  <th className="border px-2 py-1">Invoice ID</th>
                  <th className="border px-2 py-1">Date</th>
                  <th className="border px-2 py-1">Client</th>
                  <th className="border px-2 py-1">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map(f => (
                  <tr key={f.venta_id + "-" + (f.fecha || "")} className="border-b">
                    <td className="border px-2 py-1 font-mono">{f.venta_id}</td>
                    <td className="border px-2 py-1">{(f.fecha || "").slice(0, 10)}</td>
                    <td className="border px-2 py-1">{f.cliente}</td>
                    <td className="border px-2 py-1">{f.cantidad}</td>
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

// --------- HELPER: sumar stock en ubicación seleccionada (incremental) ---------
async function addStockSeleccionado(productoId, productoActual) {
  const qty = Number(productoActual.cantidad_inicial || 0);
  if (!qty || qty <= 0) return;

  const esAlmacen = productoActual.ubicacion_inicial === "almacen";

  if (esAlmacen) {
    const { data: existente } = await supabase
      .from("stock_almacen")
      .select("id, cantidad")
      .eq("producto_id", productoId)
      .maybeSingle();

    if (existente?.id) {
      await supabase
        .from("stock_almacen")
        .update({ cantidad: Number(existente.cantidad || 0) + qty })
        .eq("id", existente.id);
    } else {
      await supabase.from("stock_almacen").insert([
        { producto_id: productoId, cantidad: qty },
      ]);
    }

    try {
      await supabase.from("movimientos_stock").insert([
        {
          producto_id: productoId,
          tipo: "AJUSTE_POSITIVO",
          cantidad: qty,
          ubicacion: "almacen",
          van_id: null,
          motivo: "Alta desde formulario de producto",
          fecha: new Date().toISOString(),
        },
      ]);
    } catch (_) {}
  } else {
    const vanId = productoActual.van_id_inicial;
    if (!vanId) return;

    const { data: existente } = await supabase
      .from("stock_van")
      .select("id, cantidad")
      .eq("producto_id", productoId)
      .eq("van_id", vanId)
      .maybeSingle();

    if (existente?.id) {
      await supabase
        .from("stock_van")
        .update({ cantidad: Number(existente.cantidad || 0) + qty })
        .eq("id", existente.id);
    } else {
      await supabase.from("stock_van").insert([
        { producto_id: productoId, van_id: vanId, cantidad: qty },
      ]);
    }

    try {
      await supabase.from("movimientos_stock").insert([
        {
          producto_id: productoId,
          tipo: "AJUSTE_POSITIVO",
          cantidad: qty,
          ubicacion: "van",
          van_id: vanId,
          motivo: "Alta desde formulario de producto",
          fecha: new Date().toISOString(),
        },
      ]);
    } catch (_) {}
  }
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

  // Ubicaciones
  const [ubicaciones, setUbicaciones] = useState([{ key: "almacen", nombre: "Central warehouse" }]);
  const [ubicacionInicial, setUbicacionInicial] = useState("almacen");

  // URL helpers
  const location = useLocation();
  const navigate = useNavigate();
  const modalAutoOpenRef = useRef(false);

  useEffect(() => {
    cargarUbicaciones();
  }, []);

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
      .select("*, suplidor:suplidor_id(nombre)", { count: "exact" })
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
    setProductos(data || []);
    setTotal(count || 0);
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

  function abrirModal(prod) {
    setProductoActual({
      ...prod,
      cantidad_inicial: "",
      ubicacion_inicial: "almacen",
      van_id_inicial: null,
      descuento_pct: prod.descuento_pct ?? "",
      bulk_min_qty: prod.bulk_min_qty ?? "",
      bulk_unit_price: prod.bulk_unit_price ?? "",
    });
    setTabActivo("editar");
    setMensaje("");
    setIsCustomSize(prod.size && !SIZES_COMUNES.includes(prod.size));
    setSizeCustom("");
    setSuplidorId(prod.proveedor || "");
    setSuplidorNombre(prod.suplidor?.nombre || "");
    setModalAbierto(true);
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
  }

  function agregarProductoNuevo(codigoForzado = "") {
    let codigoInicial = codigoForzado;
    if (location.pathname.endsWith("/productos/nuevo")) {
      const params = new URLSearchParams(location.search);
      codigoInicial = params.get("codigo") || "";
    }
    setProductoActual({
      id: null, codigo: codigoInicial, nombre: "", marca: "", categoria: "",
      costo: "", precio: "", notas: "", size: "", proveedor: null,
      descuento_pct: "",
      bulk_min_qty: "",
      bulk_unit_price: "",
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

  useEffect(() => {
    if (
      location.pathname.endsWith("/productos/nuevo") &&
      !modalAbierto &&
      !modalAutoOpenRef.current
    ) {
      modalAutoOpenRef.current = true;
      agregarProductoNuevo();
    }
    if (!location.pathname.endsWith("/productos/nuevo")) {
      modalAutoOpenRef.current = false;
    }
  }, [location.pathname, modalAbierto]);

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
      descuento_pct: productoActual.descuento_pct !== "" ? Number(productoActual.descuento_pct) : null,
      bulk_min_qty: productoActual.bulk_min_qty !== "" ? Number(productoActual.bulk_min_qty) : null,
      bulk_unit_price: productoActual.bulk_unit_price !== "" ? Number(productoActual.bulk_unit_price) : null,
    };

    if (
      dataProducto.bulk_unit_price != null &&
      dataProducto.costo != null &&
      dataProducto.bulk_unit_price < dataProducto.costo
    ) {
      const ok = window.confirm(
        "⚠️ The bulk unit price is below cost. Do you still want to save?"
      );
      if (!ok) return;
    }

    let productoId = productoActual.id;

    if (productoActual.id) {
      const { error } = await supabase.from("productos").update(dataProducto).eq("id", productoActual.id);
      if (error) {
        setMensaje(error.message?.toLowerCase().includes("unique")
          ? "Error: This code/UPC is already in use. Please use another one."
          : "Error: " + error.message);
        return;
      }
      setMensaje("Product updated.");
    } else {
      const { data, error } = await supabase.from("productos").insert([dataProducto]).select().maybeSingle();
      if (error) {
        setMensaje(error.message?.toLowerCase().includes("unique")
          ? "Error: This code/UPC is already in use. Please use another one."
          : "Error: " + error.message);
        return;
      }
      productoId = data.id;
      setMensaje("Product added.");
    }

    try {
      await addStockSeleccionado(productoId, productoActual);
    } catch (e2) {
      setMensaje(prev => (prev ? prev + " " : "") + "Error adding stock: " + (e2?.message || e2));
    }

    setProductoActual(prev => prev ? {
      ...prev,
      id: productoId,
      cantidad_inicial: "",
      ubicacion_inicial: "almacen",
      van_id_inicial: null
    } : prev);

    await cargarProductos();
    cerrarModal();
  }

  // Borrado seguro sin 409
  async function eliminarProducto() {
    if (!productoActual?.id) return;
    const id = productoActual.id;

    const { count: ventasCount, error: errDet } = await supabase
      .from("detalle_ventas")
      .select("*", { count: "exact", head: true })
      .eq("producto_id", id);

    if (errDet) {
      setMensaje("Error checking dependencies: " + errDet.message);
      return;
    }

    if ((ventasCount ?? 0) > 0) {
      setMensaje(`Cannot delete: this product is used in ${ventasCount} sale(s).`);
      alert(`No se puede borrar: este producto aparece en ${ventasCount} venta(s).`);
      return;
    }

    if (!window.confirm("This will permanently delete the product. Continue?")) return;

    await Promise.allSettled([
      supabase.from("movimientos_stock").delete().eq("producto_id", id),
      supabase.from("stock_almacen").delete().eq("producto_id", id),
      supabase.from("stock_van").delete().eq("producto_id", id),
    ]);

    const { error } = await supabase.from("productos").delete().eq("id", id);
    if (error) {
      setMensaje("Error: " + error.message);
      console.error(error);
      return;
    }

    setMensaje("Product deleted.");
    await cargarProductos();
    cerrarModal();
  }

  // ------ RENDER ---------
  return (
    <div className="px-2 sm:px-4">
      <h2 className="text-2xl font-bold mb-4 text-center">Product Inventory</h2>

      <div className="max-w-5xl mx-auto mb-4 flex flex-col sm:flex-row gap-2">
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

      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center py-6 text-blue-700 font-bold">Loading...</div>
        ) : (
          <div className="overflow-x-auto rounded shadow bg-white">
            <table className="min-w-[780px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Code/UPC</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left hidden md:table-cell">Brand</th>
                  <th className="p-2 text-left hidden lg:table-cell">Category</th>
                  <th className="p-2 text-left hidden lg:table-cell">Size</th>
                  <th className="p-2 text-left hidden xl:table-cell">Supplier</th>
                  <th className="p-2 text-right hidden md:table-cell">Cost</th>
                  <th className="p-2 text-right">Price</th>
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
                      className="hover:bg-blue-50 cursor-pointer border-t"
                      onClick={() => abrirModal(p)}
                    >
                      <td className="p-2 font-mono truncate max-w-[140px]">{p.codigo}</td>
                      <td className="p-2 truncate">{p.nombre}</td>
                      <td className="p-2 hidden md:table-cell truncate">{p.marca}</td>
                      <td className="p-2 hidden lg:table-cell truncate">{p.categoria}</td>
                      <td className="p-2 hidden lg:table-cell">{p.size}</td>
                      <td className="p-2 hidden xl:table-cell truncate">{p.suplidor?.nombre || ""}</td>
                      <td className="p-2 text-right hidden md:table-cell">{p.costo}</td>
                      <td className="p-2 text-right font-semibold">{p.precio}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-between items-center mt-4">
          <button
            className="px-4 py-2 bg-gray-200 rounded w-full sm:w-auto disabled:opacity-50"
            onClick={handleAnterior}
            disabled={pagina === 1}
          >
            Previous
          </button>
          <span className="text-sm">
            Page {pagina} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            className="px-4 py-2 bg-gray-200 rounded w-full sm:w-auto disabled:opacity-50"
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

      {modalAbierto && productoActual && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-end sm:items-center z-50 p-0 sm:p-6">
          <div className="bg-white w-full h-[100vh] sm:h-auto sm:max-h-[90vh] sm:rounded-xl shadow-xl max-w-2xl relative p-4 sm:p-8 overflow-y-auto">
            <button
              type="button"
              className="absolute top-3 right-3 text-2xl text-gray-400 hover:text-black"
              onClick={cerrarModal}
              title="Close"
              style={{ zIndex: 100 }}
            >
              ×
            </button>

            <div className="flex mb-4 border-b mt-6 sm:mt-2">
              <button
                className={`px-4 sm:px-6 py-2 font-bold ${tabActivo === "editar" ? "border-b-2 border-blue-700 text-blue-700" : "text-gray-500"}`}
                onClick={() => setTabActivo("editar")}
              >
                Edit product
              </button>
              <button
                className={`px-4 sm:px-6 py-2 font-bold ${tabActivo === "ventas" ? "border-b-2 border-blue-700 text-blue-700" : "text-gray-500"}`}
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

                  <div>
                    <label className="font-bold">% Off (auto-applied)</label>
                    <input
                      className="border rounded p-2 w-full"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={productoActual.descuento_pct ?? ""}
                      onChange={e =>
                        setProductoActual({ ...productoActual, descuento_pct: e.target.value })
                      }
                      placeholder="e.g. 10"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      It automatically applies in sales if bulk pricing does not apply.
                    </p>
                  </div>

                  <div className="md:col-span-2 border rounded p-3">
                    <b>Bulk pricing (optional)</b>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="font-bold">Min. qty (≥)</label>
                        <input
                          className="border rounded p-2 w-full"
                          type="number"
                          min="1"
                          value={productoActual.bulk_min_qty ?? ""}
                          onChange={e =>
                            setProductoActual(prev => ({ ...prev, bulk_min_qty: e.target.value }))
                          }
                          placeholder="e.g. 10"
                        />
                      </div>
                      <div>
                        <label className="font-bold">Unit price at that qty</label>
                        <input
                          className="border rounded p-2 w-full"
                          type="number"
                          step="0.01"
                          min="0"
                          value={productoActual.bulk_unit_price ?? ""}
                          onChange={e =>
                            setProductoActual(prev => ({ ...prev, bulk_unit_price: e.target.value }))
                          }
                          placeholder="e.g. 9.60"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      If qty ≥ Min. qty, this unit price overrides base/% off in Sales.
                    </p>
                  </div>

                  <div className="md:col-span-2 border-t pt-2 mt-2">
                    <b>Add stock now (optional)</b>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    <p className="text-xs text-gray-500 mt-1">
                      If you set a quantity & location, stock will be added when you save.
                    </p>
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

                {mensaje && (
                  <div className="text-blue-700 text-center mt-2">{mensaje}</div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 mt-4 sticky bottom-0 bg-white py-3 z-10">
                  <button
                    type="submit"
                    className="sm:flex-1 bg-blue-700 text-white font-bold rounded px-5 py-2"
                  >
                    {productoActual.id ? "Save changes" : "Add product"}
                  </button>
                  {productoActual.id && (
                    <button
                      type="button"
                      className="sm:flex-1 bg-red-600 text-white rounded px-5 py-2"
                      onClick={eliminarProducto}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <PestañaVentas productoId={productoActual.id} nombre={productoActual.nombre} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
