import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useLocation, useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { BarcodeScanner } from "./BarcodeScanner";

/* ============================================================
   ===============  Crear / Buscar SUPLIDORES  ================
   ============================================================ */

function CrearSuplidor({ onCreate }) {
  const [form, setForm] = useState({ nombre: "", contacto: "", telefono: "", direccion: "", email: "" });
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState("");

  const [finanzasOpen, setFinanzasOpen] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);

  const [cxpMonto, setCxpMonto] = useState("");
  const [cxpFecha, setCxpFecha] = useState(hoy);
  const [cxpNotas, setCxpNotas] = useState("");

  const [ocMonto, setOcMonto] = useState("");
  const [ocFecha, setOcFecha] = useState(hoy);
  const [ocNotas, setOcNotas] = useState("");

  const preventEnterSubmit = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  async function guardarSuplidor() {
    setErr("");
    if (!form.nombre.trim()) {
      setErr("El nombre es obligatorio.");
      return;
    }

    setCargando(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        contacto: form.contacto || null,
        telefono: form.telefono || null,
        direccion: form.direccion || null,
        email: form.email || null,
      };

      const { data, error } = await supabase
        .from("suplidores")
        .insert([payload])
        .select()
        .maybeSingle();

      if (error) {
        setErr(error.message || "Error al guardar el suplidor.");
        return;
      }

      try {
        const monto = Number(cxpMonto);
        if (finanzasOpen && monto > 0) {
          await supabase.from("cuentas_por_pagar").insert([
            { suplidor_id: data.id, monto, estado: "pendiente", fecha: cxpFecha || hoy, notas: cxpNotas || null },
          ]);
        }
      } catch {}
      try {
        const total = Number(ocMonto);
        if (finanzasOpen && total > 0) {
          await supabase.from("ordenes_compra").insert([
            { suplidor_id: data.id, total, estado: "abierta", fecha: ocFecha || hoy, notas: ocNotas || null },
          ]);
        }
      } catch {}

      onCreate?.(data);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="p-2 sm:p-4 bg-gray-50 rounded mt-2" onKeyDown={preventEnterSubmit}>
      {["nombre", "contacto", "telefono", "direccion", "email"].map((f) => (
        <input
          key={f}
          className="border rounded p-2 w-full mb-2 sm:mb-1"
          placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
          value={form[f]}
          onChange={(e) => setForm((prev) => ({ ...prev, [f]: e.target.value }))}
          required={f === "nombre"}
        />
      ))}

      <div className="mt-2 sm:mt-3">
        <button 
          type="button" 
          className="text-xs sm:text-sm text-blue-700 w-full text-left sm:text-center" 
          onClick={() => setFinanzasOpen((v) => !v)}
        >
          {finanzasOpen ? "Ocultar" : "+ Deuda u Orden con este suplidor (opcional)"}
        </button>

        {finanzasOpen && (
          <div className="mt-2 sm:mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
            <div className="border rounded p-2 sm:p-3">
              <b className="text-sm sm:text-base">Deuda / CXP</b>
              <div className="mt-1 sm:mt-2">
                <label className="text-xs sm:text-sm">Monto</label>
                <input className="border rounded p-2 w-full" type="number" step="0.01" min="0" value={cxpMonto} onChange={(e) => setCxpMonto(e.target.value)} />
              </div>
              <div className="mt-1 sm:mt-2">
                <label className="text-xs sm:text-sm">Fecha</label>
                <input className="border rounded p-2 w-full" type="date" value={cxpFecha} onChange={(e) => setCxpFecha(e.target.value)} />
              </div>
              <div className="mt-1 sm:mt-2">
                <label className="text-xs sm:text-sm">Notas</label>
                <input className="border rounded p-2 w-full" value={cxpNotas} onChange={(e) => setCxpNotas(e.target.value)} />
              </div>
            </div>

            <div className="border rounded p-2 sm:p-3">
              <b className="text-sm sm:text-base">Orden de compra</b>
              <div className="mt-1 sm:mt-2">
                <label className="text-xs sm:text-sm">Total</label>
                <input className="border rounded p-2 w-full" type="number" step="0.01" min="0" value={ocMonto} onChange={(e) => setOcMonto(e.target.value)} />
              </div>
              <div className="mt-1 sm:mt-2">
                <label className="text-xs sm:text-sm">Fecha</label>
                <input className="border rounded p-2 w-full" type="date" value={ocFecha} onChange={(e) => setOcFecha(e.target.value)} />
              </div>
              <div className="mt-1 sm:mt-2">
                <label className="text-xs sm:text-sm">Notas</label>
                <input className="border rounded p-2 w-full" value={ocNotas} onChange={(e) => setOcNotas(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {err && <div className="text-red-600 text-xs sm:text-sm mt-2 sm:mt-1">{err}</div>}

      <button 
        type="button" 
        className="bg-green-600 text-white rounded px-3 py-2 sm:py-1 mt-2 sm:mt-3 w-full sm:w-auto sm:px-5 disabled:opacity-50 text-sm sm:text-base" 
        onClick={guardarSuplidor} 
        disabled={cargando}
      >
        {cargando ? "Guardando..." : "Save supplier"}
      </button>
    </div>
  );
}

function BuscadorSuplidor({ value, name, onChange, disabled }) {
  const [busqueda, setBusqueda] = useState(name || "");
  const [suplidores, setSuplidores] = useState([]);
  const [showCrear, setShowCrear] = useState(false);

  const [hl, setHl] = useState(-1);
  useEffect(() => setHl(-1), [busqueda, suplidores.length]);
  useEffect(() => {
    if (hl >= 0) document.getElementById(`sup-opt-${hl}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hl]);

  useEffect(() => {
    if (name && name !== busqueda) {
      setBusqueda(name);
      return;
    }
    if (value && !name) {
      (async () => {
        const { data } = await supabase
          .from("suplidores")
          .select("nombre")
          .eq("id", value)
          .maybeSingle();
        if (data?.nombre) setBusqueda(data.nombre);
      })();
    }
  }, [value, name]);

  useEffect(() => {
    if (!busqueda.trim()) {
      setSuplidores([]);
      return;
    }
    (async () => {
      const { data } = await supabase.from("suplidores").select("*").ilike("nombre", `%${busqueda}%`);
      setSuplidores(data || []);
    })();
  }, [busqueda]);

  function pickSupplier(idx) {
    const s = suplidores[idx];
    if (!s) return;
    onChange(s.id, s.nombre);
    setBusqueda(s.nombre);
  }

  return (
    <div className={`${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      <input
        className="border rounded p-2 w-full"
        value={busqueda}
        placeholder="Search supplier..."
        onChange={(e) => setBusqueda(e.target.value)}
        disabled={disabled}
        onKeyDown={(e) => {
          const list = suplidores || [];
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHl((i) => Math.min(i < 0 ? 0 : i + 1, list.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHl((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (hl >= 0 && list[hl]) pickSupplier(hl);
            else if (list.length > 0) pickSupplier(0);
          } else if (e.key === "Escape") {
            setHl(-1);
          }
        }}
      />
      <div className="max-h-32 overflow-auto mt-1 border rounded bg-white">
        {suplidores.map((s, idx) => (
          <div
            id={`sup-opt-${idx}`}
            key={s.id}
            className={`p-2 cursor-pointer ${value === s.id ? "bg-blue-50" : ""} ${idx === hl ? "bg-blue-100 ring-1 ring-blue-300" : "hover:bg-blue-100"}`}
            onMouseEnter={() => setHl(idx)}
            onClick={() => pickSupplier(idx)}
          >
            {s.nombre} <span className="text-xs text-gray-500">{s.contacto}</span>
          </div>
        ))}
      </div>
      <button 
        type="button" 
        className="text-xs sm:text-sm text-blue-700 mt-1 w-full text-left sm:text-center" 
        onClick={() => setShowCrear(!showCrear)} 
        disabled={disabled}
      >
        {showCrear ? "Cancel" : "+ New supplier"}
      </button>
      {showCrear && (
        <CrearSuplidor
          onCreate={(s) => {
            onChange(s.id, s.nombre);
            setBusqueda(s.nombre);
            setShowCrear(false);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   ===================  PESTAÑA DE VENTAS  ====================
   ============================================================ */

const SIZES_COMUNES = [
  // Volúmenes pequeños
  "15ML", "30ML", "50ML", "60ML", "75ML", "100ML", "125ML", "150ML", "200ML", "250ML",
  // Volúmenes medianos
  "300ML", "350ML", "400ML", "500ML", "600ML", "750ML", "800ML", "1L", "1.5L", "2L",
  // Onzas
  "1 OZ", "2 OZ", "3 OZ", "4 OZ", "5 OZ", "5.25 OZ", "6 OZ", "8 OZ", "10 OZ", "12 OZ", "16 OZ", "32 OZ",
  // Gramos
  "50G", "100G", "150G", "200G", "250G", "300G", "500G", "1KG",
  // Libras
  "1 LB", "2 LB", "5 LB", "10 LB",
  // Unidades y empaques
  "UNIT", "PACK", "PAIR", "SET", "KIT", "BOX", "CASE", "DOZEN",
  // Contenedores
  "TUB", "JAR", "BOTTLE", "CAN", "BAG", "SACK", "POUCH", "TUBE",
  // Otros
  "SAMPLE", "TRAVEL SIZE", "PROFESSIONAL SIZE", "GALLON", "QUART", "PINT"
];

function PestañaVentas({ productoId, nombre }) {
  const [ventasMes, setVentasMes] = useState([]);
  const [meses, setMeses] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState("");
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [porDia, setPorDia] = useState([]);

  const yyyymm = (d) => (d ? (typeof d === "string" ? d : new Date(d).toISOString()).slice(0, 7) : "");

  useEffect(() => {
    if (!productoId) return;
    (async () => {
      setLoading(true);
      const { data: det, error: errDet } = await supabase.from("detalle_ventas").select("venta_id,cantidad").eq("producto_id", productoId);

      if (errDet || !det || det.length === 0) {
        setVentasMes([]); setMeses([]); setMesSeleccionado(""); setFacturas([]); setPorDia([]); setLoading(false); return;
      }

      const ventaIds = Array.from(new Set(det.map((d) => d.venta_id).filter(Boolean)));
      const { data: ventasRows } = await supabase.from("ventas").select("id,fecha,cliente_id").in("id", ventaIds);

      const mapVenta = new Map((ventasRows || []).map((v) => [v.id, v]));
      const enriquecido = det
        .map((d) => {
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
      const lista = Object.keys(agg).sort((a, b) => b.localeCompare(a)).map((m) => ({ mes: m, cantidad: agg[m] }));
      setVentasMes(lista);
      setMeses(lista.map((x) => x.mes));
      setMesSeleccionado(lista[0]?.mes || "");

      if (lista[0]) await cargarFacturasMes(enriquecido, lista[0].mes);
      else setFacturas([]);

      const byDay = {};
      (ventasRows || []).forEach((v) => {
        const d = (v.fecha || "").slice(0, 10);
        const cant = (det || []).filter((x) => x.venta_id === v.id).reduce((t, x) => t + Number(x.cantidad || 0), 0);
        byDay[d] = (byDay[d] || 0) + cant;
      });
      const rows = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30).map(([dia, qty]) => ({ dia, qty }));
      setPorDia(rows);

      setLoading(false);
    })();
  }, [productoId]);

  async function cargarFacturasMes(detallesEnriquecidos, mes) {
    const filtrado = (detallesEnriquecidos || []).filter((d) => yyyymm(d.fecha) === mes);
    const idsClientes = Array.from(new Set(filtrado.map((f) => f.cliente_id).filter(Boolean)));
    const nombres = {};
    if (idsClientes.length > 0) {
      const { data: clientesData } = await supabase.from("clientes").select("id,nombre").in("id", idsClientes);
      (clientesData || []).forEach((c) => (nombres[c.id] = c.nombre));
    }
    const lista = filtrado.map((f) => ({ venta_id: f.venta_id, cantidad: f.cantidad, fecha: f.fecha, cliente: nombres[f.cliente_id] || f.cliente_id || "" }));
    setFacturas(lista);
  }

  useEffect(() => {
    if (!productoId || !mesSeleccionado) return;
    (async () => {
      setLoading(true);
      const { data: det } = await supabase.from("detalle_ventas").select("venta_id,cantidad").eq("producto_id", productoId);
      const ventaIds = Array.from(new Set((det || []).map((d) => d.venta_id).filter(Boolean)));
      const { data: ventasRows } = await supabase.from("ventas").select("id,fecha,cliente_id").in("id", ventaIds);

      const mapVenta = new Map((ventasRows || []).map((v) => [v.id, v]));
      const enriquecido = (det || [])
        .map((d) => {
          const v = mapVenta.get(d.venta_id);
          if (!v) return null;
          return { venta_id: d.venta_id, cantidad: d.cantidad || 0, fecha: v.fecha, cliente_id: v.cliente_id };
        })
        .filter(Boolean);

      await cargarFacturasMes(enriquecido, mesSeleccionado);
      setLoading(false);
    })();
  }, [mesSeleccionado, productoId]);

  return (
    <div>
      <h3 className="font-bold text-blue-900 mb-4 text-sm sm:text-base">Sales for "{nombre}"</h3>

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
                <Tooltip formatter={(v) => `${v} units`} />
                <Bar dataKey="cantidad" fill="#1976D2" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="my-4">
        <label className="font-bold text-sm sm:text-base">Select month:</label>
        <select className="border rounded p-2 ml-2 w-full sm:w-auto" value={mesSeleccionado} onChange={(e) => setMesSeleccionado(e.target.value)}>
          {meses.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="border rounded-lg">
        <div className="px-3 py-2 font-bold bg-gray-50 border-b text-sm sm:text-base">Invoices for {mesSeleccionado}</div>
        {loading ? (
          <div className="p-3 text-blue-600">Loading...</div>
        ) : facturas.length === 0 ? (
          <div className="p-3 text-gray-500">No invoices for this month.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-blue-100">
                  <th className="border px-2 py-1 sm:px-3 sm:py-2">Invoice ID</th>
                  <th className="border px-2 py-1 sm:px-3 sm:py-2">Date</th>
                  <th className="border px-2 py-1 sm:px-3 sm:py-2">Client</th>
                  <th className="border px-2 py-1 sm:px-3 sm:py-2">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.venta_id + "-" + (f.fecha || "")} className="border-b">
                    <td className="border px-2 py-1 sm:px-3 sm:py-2 font-mono">{f.venta_id}</td>
                    <td className="border px-2 py-1 sm:px-3 sm:py-2">{(f.fecha || "").slice(0, 10)}</td>
                    <td className="border px-2 py-1 sm:px-3 sm:py-2">{f.cliente}</td>
                    <td className="border px-2 py-1 sm:px-3 sm:py-2">{f.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 border rounded-lg">
        <div className="px-3 py-2 font-bold bg-gray-50 border-b text-sm sm:text-base">Daily sales (last 30 days)</div>
        {porDia.length === 0 ? (
          <div className="p-3 text-gray-500">No daily sales.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 sm:px-3 sm:py-2 text-left">Date</th>
                  <th className="border px-2 py-1 sm:px-3 sm:py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((r) => (
                  <tr key={r.dia} className="border-b">
                    <td className="border px-2 py-1 sm:px-3 sm:py-2">{r.dia}</td>
                    <td className="border px-2 py-1 sm:px-3 sm:py-2 text-right">{r.qty}</td>
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

/* ============================================================
   ====================  HELPERS DE STOCK  ====================
   ============================================================ */

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
      await supabase.from("stock_almacen").update({ cantidad: Number(existente.cantidad || 0) + qty }).eq("id", existente.id);
    } else {
      await supabase.from("stock_almacen").insert([{ producto_id: productoId, cantidad: qty }]);
    }

    try {
      await supabase.from("movimientos_stock").insert([
        { producto_id: productoId, tipo: "AJUSTE_POSITIVO", cantidad: qty, ubicacion: "almacen", van_id: null, motivo: "Alta desde formulario de producto", fecha: new Date().toISOString() },
      ]);
    } catch {}
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
      await supabase.from("stock_van").update({ cantidad: Number(existente.cantidad || 0) + qty }).eq("id", existente.id);
    } else {
      await supabase.from("stock_van").insert([{ producto_id: productoId, van_id: vanId, cantidad: qty }]);
    }

    try {
      await supabase.from("movimientos_stock").insert([
        { producto_id: productoId, tipo: "AJUSTE_POSITIVO", cantidad: qty, ubicacion: "van", van_id: vanId, motivo: "Alta desde formulario de producto", fecha: new Date().toISOString() },
      ]);
    } catch {}
  }
}

/* ============================================================
   ===================  COMPONENTE PRINCIPAL  =================
   ============================================================ */

export default function Productos() {
  const PAGE_SIZE = 20; // Reducido para móviles
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoActual, setProductoActual] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [tabActivo, setTabActivo] = useState("editar");

  const [editMode, setEditMode] = useState(true);

  const [stockResumen, setStockResumen] = useState({ unidades: 0, valor: 0 });
  const [ultimaVenta, setUltimaVenta] = useState(null);

  const [sizeCustom, setSizeCustom] = useState("");
  const [isCustomSize, setIsCustomSize] = useState(false);

  const [suplidorId, setSuplidorId] = useState(null);
  const [suplidorNombre, setSuplidorNombre] = useState("");

  const [ubicaciones, setUbicaciones] = useState([{ key: "almacen", nombre: "Central warehouse" }]);

  // 🆕 ESCÁNER MEJORADO
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();
  const modalAutoOpenRef = useRef(false);

  const [hl, setHl] = useState(-1);
  useEffect(() => setHl(-1), [productos.length, pagina, busqueda]);
  useEffect(() => {
    if (hl >= 0) document.getElementById(`prod-row-${hl}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hl]);

  const [debounced, setDebounced] = useState("");
  const searchSeq = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(busqueda), 120);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    (async () => {
      const { data: vansData } = await supabase.from("vans").select("id, nombre_van");
      const vans = (vansData || []).map((v) => ({ key: `van_${v.id}`, nombre: v.nombre_van, van_id: v.id }));
      setUbicaciones([{ key: "almacen", nombre: "Central warehouse" }, ...vans]);
    })();
  }, []);

  useEffect(() => {
    cargarProductos();
  }, [debounced, pagina]);

  async function cargarProductos() {
    setLoading(true);
    const mySeq = ++searchSeq.current;

    const termRaw = debounced ?? "";
    const term = termRaw.trim();
    const termNoSpaces = term.replace(/\s+/g, "");
    const digitsOnly = term.replace(/\D/g, "");
    const isBarcode = digitsOnly.length >= 8;

    const baseSelect = "*, suplidor:suplidor_id(nombre)";
    const desde = (pagina - 1) * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;

    try {
      if (isBarcode) {
        const needles = Array.from(new Set([digitsOnly, termNoSpaces].filter(Boolean)));
        if (needles.length > 0) {
          const { data: exactData, count: exactCount, error: exactErr } = await supabase
            .from("productos")
            .select(baseSelect, { count: "exact" })
            .in("codigo", needles)
            .limit(1);

          if (exactErr) throw exactErr;
          if (mySeq !== searchSeq.current) return;

          if ((exactData?.length || 0) > 0) {
            setProductos(exactData || []);
            setTotal(exactCount || exactData.length || 0);
            setLoading(false);
            return;
          }
        }
      }

      let query = supabase.from("productos").select(baseSelect, { count: "exact" }).order("nombre", { ascending: true });

      if (term) {
        if (isBarcode) {
          query = query.ilike("codigo", `${digitsOnly || termNoSpaces}%`);
        } else if (/^\d+$/.test(termNoSpaces)) {
          query = query.or(`codigo.ilike.${termNoSpaces}%,nombre.ilike.%${term}%,marca.ilike.%${term}%,categoria.ilike.%${term}%`);
        } else {
          query = query.or(`codigo.ilike.%${term}%,nombre.ilike.%${term}%,marca.ilike.%${term}%,categoria.ilike.%${term}%`);
        }
      }

      const { data, count, error } = await query.range(desde, hasta);
      if (error) throw error;

      if (mySeq !== searchSeq.current) return;
      setProductos(data || []);
      setTotal(count || 0);
    } catch (err) {
      if (mySeq !== searchSeq.current) return;
      setProductos([]);
      setTotal(0);
      setMensaje("Error loading products: " + (err?.message || err));
    } finally {
      if (mySeq === searchSeq.current) setLoading(false);
    }
  }

  // 🆕 HANDLER DE ESCÁNER MEJORADO
  const handleBarcodeScanned = (code) => {
    let cleanedCode = code.replace(/^0+/, '');
    if (cleanedCode === '') cleanedCode = '0';
    
    // Cerrar el escáner automáticamente
    setShowScanner(false);
    
    // Enfocar el campo de búsqueda para facilitar la edición si es necesario
    setTimeout(() => {
      const searchInput = document.querySelector('input[placeholder="Search by code, name, brand, category..."]');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }, 300);
    
    // Realizar la búsqueda
    setPagina(1);
    setBusqueda(cleanedCode);
  };

  function handleBuscar(e) {
    setPagina(1);
    setBusqueda((e.target.value || "").replace(/\s+/g, ""));
    setHl(-1);
  }
  
  const handleSiguiente = () => { if (pagina * PAGE_SIZE < total) setPagina(pagina + 1); };
  const handleAnterior = () => { if (pagina > 1) setPagina(pagina - 1); };

  async function cargarKpisProducto(prodId, costoUnit = 0) {
    try {
      const { data: sa } = await supabase.from("stock_almacen").select("cantidad").eq("producto_id", prodId);
      const sumAlmacen = (sa || []).reduce((t, r) => t + Number(r.cantidad || 0), 0);
      const { data: sv } = await supabase.from("stock_van").select("cantidad").eq("producto_id", prodId);
      const sumVans = (sv || []).reduce((t, r) => t + Number(r.cantidad || 0), 0);
      const total = sumAlmacen + sumVans;
      setStockResumen({ unidades: total, valor: total * Number(costoUnit || 0) });

      const { data: dv } = await supabase.from("detalle_ventas").select("venta_id").eq("producto_id", prodId);
      const ventaIds = Array.from(new Set((dv || []).map((d) => d.venta_id).filter(Boolean)));
      if (ventaIds.length > 0) {
        const { data: v } = await supabase.from("ventas").select("fecha").in("id", ventaIds).order("fecha", { ascending: false }).limit(1);
        setUltimaVenta(v?.[0]?.fecha || null);
      } else {
        setUltimaVenta(null);
      }
    } catch {
      setStockResumen({ unidades: 0, valor: 0 });
      setUltimaVenta(null);
    }
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

    setEditMode(!prod?.id ? true : false);

    setTabActivo("editar");
    setMensaje("");
    setIsCustomSize(prod.size && !SIZES_COMUNES.includes(prod.size));
    setSizeCustom("");
    setSuplidorId(prod.suplidor_id ?? null);
    setSuplidorNombre(prod.suplidor?.nombre || "");
    setModalAbierto(true);

    if (prod?.id) {
      setTimeout(() => cargarKpisProducto(prod.id, Number(prod.costo || 0)), 0);
    } else {
      setStockResumen({ unidades: 0, valor: 0 });
      setUltimaVenta(null);
    }
  }

  function cerrarModal() {
    if (location.pathname.endsWith("/productos/nuevo")) navigate("/productos");
    setModalAbierto(false);
    setProductoActual(null);
    setMensaje("");
    setIsCustomSize(false);
    setSizeCustom("");
    setSuplidorId(null);
    setSuplidorNombre("");
    setStockResumen({ unidades: 0, valor: 0 });
    setUltimaVenta(null);
    setEditMode(true);
  }

  function agregarProductoNuevo(codigoForzado = "") {
    let codigoInicial = codigoForzado;
    if (location.pathname.endsWith("/productos/nuevo")) {
      const params = new URLSearchParams(location.search);
      codigoInicial = params.get("codigo") || "";
    }
    setProductoActual({
      id: null,
      codigo: codigoInicial,
      nombre: "",
      marca: "",
      categoria: "",
      costo: "",
      precio: "",
      notas: "",
      size: "",
      suplidor_id: null,
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
    setStockResumen({ unidades: 0, valor: 0 });
    setUltimaVenta(null);
    setEditMode(true);
  }

  useEffect(() => {
    if (location.pathname.endsWith("/productos/nuevo") && !modalAbierto && !modalAutoOpenRef.current) {
      modalAutoOpenRef.current = true;
      agregarProductoNuevo();
    }
    if (!location.pathname.endsWith("/productos/nuevo")) modalAutoOpenRef.current = false;
  }, [location.pathname, modalAbierto]);

  async function guardarProducto(e) {
    e.preventDefault();
    setMensaje("");

    if (!productoActual.codigo || !productoActual.nombre || !productoActual.precio) {
      setMensaje("Complete all required fields.");
      return;
    }

    const { data: existentes, error: errorExistente } = await supabase.from("productos").select("id").eq("codigo", productoActual.codigo);
    if (errorExistente) {
      setMensaje("Error checking for duplicate code: " + errorExistente.message);
      return;
    }
    if (existentes && existentes.length > 0 && (!productoActual.id || existentes[0].id !== productoActual.id)) {
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
      suplidor_id: (productoActual.suplidor_id ?? suplidorId) || null,
      notas: productoActual.notas || "",
      descuento_pct: productoActual.descuento_pct !== "" ? Number(productoActual.descuento_pct) : null,
      bulk_min_qty: productoActual.bulk_min_qty !== "" ? Number(productoActual.bulk_min_qty) : null,
      bulk_unit_price: productoActual.bulk_unit_price !== "" ? Number(productoActual.bulk_unit_price) : null,
    };

    if (dataProducto.bulk_unit_price != null && dataProducto.costo != null && dataProducto.bulk_unit_price < dataProducto.costo) {
      const ok = window.confirm("⚠️ The bulk unit price is below cost. Do you still want to save?");
      if (!ok) return;
    }

    let productoId = productoActual.id;
    let savedMessage = "";

    if (productoActual.id) {
      const { error } = await supabase.from("productos").update(dataProducto).eq("id", productoActual.id);
      if (error) {
        setMensaje(error.message?.toLowerCase().includes("unique") ? "Error: This code/UPC is already in use. Please use another one." : "Error: " + error.message);
        return;
      }
      savedMessage = "Product updated successfully.";
    } else {
      const { data, error } = await supabase.from("productos").insert([dataProducto]).select().maybeSingle();
      if (error) {
        setMensaje(error.message?.toLowerCase().includes("unique") ? "Error: This code/UPC is already in use. Please use another one." : "Error: " + error.message);
        return;
      }
      productoId = data.id;
      savedMessage = "Product added successfully.";
    }

    try {
      await addStockSeleccionado(productoId, productoActual);
    } catch (e2) {
      setMensaje((prev) => (prev ? prev + " " : "") + "Error adding stock: " + (e2?.message || e2));
    }

    setProductoActual((prev) =>
      prev
        ? { ...prev, id: productoId, cantidad_inicial: "", ubicacion_inicial: "almacen", van_id_inicial: null }
        : prev
    );

    await cargarProductos();
    window.alert(savedMessage);
    cerrarModal();
  }

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

  function imprimirEtiqueta(prod, opts = {}) {
    if (!prod) return;

    const LABEL_W = opts.widthMm || "100mm";
    const LABEL_H = opts.heightMm || "60mm";
    const MARGIN = opts.marginMm || "6mm";

    const fmtMoney = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const name = String(prod.nombre || "").toUpperCase();
    const brand = String(prod.marca || "").toUpperCase();
    const size = String(prod.size || "").toUpperCase();
    const price = fmtMoney(prod.precio);
    const code = String(prod.codigo ?? "").trim();

    if (!code) {
      alert("Este producto no tiene código/UPC para generar el código de barras.");
      return;
    }

    let format = "CODE128";
    if (/^\d{12}$/.test(code)) format = "UPC";
    else if (/^\d{13}$/.test(code)) format = "EAN13";
    else if (/^[0-9A-Z.\- $/+%]+$/.test(code.toUpperCase())) format = "CODE39";

    const safe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Label - ${safe(name)}</title>
  <style>
    @page { size: ${LABEL_W} ${LABEL_H}; margin: ${MARGIN}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; }
    .label { width: ${LABEL_W}; height: calc(${LABEL_H} - 0mm); display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
    .name { font-weight: 800; font-size: 18px; line-height: 1.1; }
    .meta { font-size: 11px; color: #555; margin-top: 2px; }
    .price { font-weight: 900; font-size: 30px; line-height: 1; white-space: nowrap; }
    .barcode-wrap { display: flex; justify-content: center; align-items: center; margin-top: 4px; }
    #barcode { width: 100%; max-width: 100%; }
    .upc { font-family: ui-monospace; font-size: 12px; text-align: center; margin-top: 2px; }
    .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 2px; font-size: 10px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="label">
    <div class="row">
      <div>
        <div class="name">${safe(name)}</div>
        <div class="meta">${safe([brand, size].filter(Boolean).join(" - "))}</div>
      </div>
      <div class="price">${safe(price)}</div>
    </div>

    <div class="barcode-wrap"><svg id="barcode"></svg></div>
    <div class="upc">${safe(code)}</div>

    <div class="footer"><div>Printed: ${safe(new Date().toLocaleString())}</div><div>${safe(brand || "")}</div></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <script>
    (function () {
      const value  = ${JSON.stringify(code)};
      const format = ${JSON.stringify(format)};
      const svg = document.getElementById('barcode');
      JsBarcode(svg, value, { format, displayValue: false, lineColor: "#111", margin: 0, marginTop: 0, marginBottom: 0, width: 2, height: 46 });
      setTimeout(() => { try { window.print(); } catch(e) {} }, 150);
    })();
  </script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) {
      alert("Habilita los pop-ups del navegador para imprimir la etiqueta.");
      return;
    }
    w.document.open("text/html", "replace");
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  const disabled = !editMode;
  const toUpper = (v) => (v ?? "").toString().toUpperCase();

  return (
    <div className="px-2 sm:px-4 pb-20 sm:pb-0">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 text-center">Product Inventory</h2>

      {/* BARRA DE BÚSQUEDA Y ACCIONES */}
      <div className="max-w-5xl mx-auto mb-4 flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 w-full">
          <input
            type="text"
            placeholder="Search by code, name, brand, category..."
            value={busqueda}
            onChange={handleBuscar}
            onKeyDown={(e) => {
              const list = productos || [];
              if (e.key === "ArrowDown") { e.preventDefault(); setHl((i) => Math.min(i < 0 ? 0 : i + 1, list.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHl((i) => Math.max(i - 1, 0)); }
              else if (e.key === "PageDown") { e.preventDefault(); if (pagina * 20 < total) setPagina(pagina + 1); }
              else if (e.key === "PageUp") { e.preventDefault(); if (pagina > 1) setPagina(pagina - 1); }
              else if (e.key === "Enter") { if (hl >= 0 && list[hl]) abrirModal(list[hl]); else if (list.length > 0) abrirModal(list[0]); }
              else if (e.key === "Escape") { setHl(-1); }
            }}
            className="border rounded p-2 flex-1"
          />
          {/* 🆕 BOTÓN ESCÁNER MEJORADO */}
          <button
            onClick={() => setShowScanner(true)}
            className="bg-gradient-to-r from-purple-600 to-violet-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap flex items-center gap-2"
            title="Scan barcode"
          >
            <span className="text-lg">📷</span>
            <span className="hidden sm:inline">Scan</span>
          </button>
        </div>
        <button 
          onClick={() => agregarProductoNuevo()} 
          className="bg-green-700 text-white font-bold rounded px-5 py-2 whitespace-nowrap flex items-center justify-center gap-2"
        >
          <span>+</span>
          <span>Add product</span>
        </button>
      </div>

      {/* 🆕 ESCÁNER MEJORADO */}
      {showScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
          <div className="p-4 bg-black text-white flex justify-between items-center">
            <h3 className="text-lg font-bold">Scan Barcode</h3>
            <button 
              onClick={() => setShowScanner(false)}
              className="text-white text-2xl"
            >
              ×
            </button>
          </div>
          
          <div className="flex-1 relative overflow-hidden">
            <BarcodeScanner
              onScan={handleBarcodeScanned}
              onClose={() => setShowScanner(false)}
              isActive={showScanner}
              ref={scannerRef}
            />
            
            {/* MENSAJES DE INSTRUCCIONES */}
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white p-4 text-center">
              <p className="text-sm mb-2">Position the barcode within the frame</p>
              <p className="text-xs opacity-75">Hold your device steady and ensure good lighting</p>
            </div>
          </div>
        </div>
      )}

      {/* LISTA DE PRODUCTOS */}
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center py-6 text-blue-700 font-bold">Loading...</div>
        ) : (
          <>
            {/* VISTA MÓVIL - TARJETAS */}
            <div className="lg:hidden space-y-3">
              {productos.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
                  {busqueda ? "No results found for your search." : "No products."}
                </div>
              ) : (
                productos.map((p, idx) => (
                  <div
                    key={p.id}
                    id={`prod-row-${idx}`}
                    className={`bg-white rounded-lg shadow-md p-4 cursor-pointer transition-all ${
                      idx === hl ? "ring-2 ring-blue-500 bg-blue-50" : "active:bg-blue-50"
                    }`}
                    onMouseEnter={() => setHl(idx)}
                    onClick={() => abrirModal(p)}
                  >
                    {/* Header con precio destacado */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0 pr-3">
                        <h3 className="font-bold text-gray-900 text-base leading-tight mb-1">
                          {p.nombre}
                        </h3>
                        {p.marca && (
                          <p className="text-sm text-gray-600">{p.marca}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xl sm:text-2xl font-bold text-green-600">
                          ${Number(p.precio || 0).toFixed(2)}
                        </div>
                        {p.costo && (
                          <div className="text-xs text-gray-500">
                            Cost: ${Number(p.costo).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Info adicional en grid */}
                    <div className="grid grid-cols-2 gap-2 text-sm border-t pt-3">
                      <div>
                        <span className="text-gray-500 text-xs">Code:</span>
                        <p className="font-mono text-gray-900 truncate text-xs">{p.codigo}</p>
                      </div>
                      {p.size && (
                        <div>
                          <span className="text-gray-500 text-xs">Size:</span>
                          <p className="text-gray-900 text-xs">{p.size}</p>
                        </div>
                      )}
                      {p.categoria && (
                        <div>
                          <span className="text-gray-500 text-xs">Category:</span>
                          <p className="text-gray-900 truncate text-xs">{p.categoria}</p>
                        </div>
                      )}
                      {p.suplidor?.nombre && (
                        <div>
                          <span className="text-gray-500 text-xs">Supplier:</span>
                          <p className="text-gray-900 truncate text-xs">{p.suplidor.nombre}</p>
                        </div>
                      )}
                    </div>

                    {/* Indicador visual de tap */}
                    <div className="mt-3 pt-3 border-t text-center text-xs text-blue-600 font-semibold">
                      Tap to view details →
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* VISTA DESKTOP - TABLA */}
            <div className="hidden lg:block overflow-x-auto rounded shadow bg-white">
              <table className="min-w-[780px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left">Code/UPC</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Brand</th>
                    <th className="p-2 text-left">Category</th>
                    <th className="p-2 text-left">Size</th>
                    <th className="p-2 text-left">Supplier</th>
                    <th className="p-2 text-right">Cost</th>
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
                    productos.map((p, idx) => (
                      <tr
                        id={`prod-row-${idx}`}
                        key={p.id}
                        className={`cursor-pointer border-t ${
                          idx === hl ? "bg-blue-50 ring-2 ring-blue-200" : "hover:bg-blue-50"
                        }`}
                        onMouseEnter={() => setHl(idx)}
                        onClick={() => abrirModal(p)}
                      >
                        <td className="p-2 font-mono truncate max-w-[140px]">{p.codigo}</td>
                        <td className="p-2 truncate">{p.nombre}</td>
                        <td className="p-2 truncate">{p.marca}</td>
                        <td className="p-2 truncate">{p.categoria}</td>
                        <td className="p-2">{p.size}</td>
                        <td className="p-2 truncate">{p.suplidor?.nombre || ""}</td>
                        <td className="p-2 text-right">{p.costo}</td>
                        <td className="p-2 text-right font-semibold">{p.precio}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* PAGINACIÓN */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-between items-center mt-4">
          <button 
            className="px-4 py-2 bg-gray-200 rounded w-full sm:w-auto disabled:opacity-50" 
            onClick={handleAnterior} 
            disabled={pagina === 1}
          >
            ← Previous
          </button>
          <span className="text-sm">
            Page {pagina} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button 
            className="px-4 py-2 bg-gray-200 rounded w-full sm:w-auto disabled:opacity-50" 
            onClick={handleSiguiente} 
            disabled={pagina * PAGE_SIZE >= total}
          >
            Next →
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-2 text-center mb-10">
          Showing {productos.length} of {total} products.
        </div>
      </div>

      {/* MODAL */}
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

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-xs sm:text-sm text-blue-700 uppercase font-semibold">On Hand</div>
                <div className="text-lg sm:text-xl font-bold text-blue-900">{stockResumen.unidades}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-xs sm:text-sm text-emerald-700 uppercase font-semibold">On Hand $</div>
                <div className="text-lg sm:text-xl font-bold text-emerald-900">${Number(stockResumen.valor || 0).toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-xs sm:text-sm text-gray-600 uppercase font-semibold">Last Sold</div>
                <div className="text-sm sm:text-base font-bold text-gray-800">{ultimaVenta ? new Date(ultimaVenta).toLocaleDateString() : "—"}</div>
              </div>
            </div>

            <div className="flex mb-4 border-b mt-6 sm:mt-2 items-center">
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

              {!editMode && productoActual?.id && tabActivo === "editar" && (
                <button className="ml-auto bg-blue-600 text-white rounded px-3 py-1.5 sm:px-4 text-sm sm:text-base" onClick={() => setEditMode(true)}>
                  Edit
                </button>
              )}
            </div>

            {tabActivo === "editar" ? (
              <form onSubmit={guardarProducto}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="font-bold text-sm sm:text-base">Code/UPC*</label>
                    <input
                      className="border rounded p-2 w-full uppercase text-sm sm:text-base"
                      value={productoActual.codigo ?? ""}
                      onChange={(e) => setProductoActual({ ...productoActual, codigo: toUpper(e.target.value) })}
                      required
                      autoFocus
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-sm sm:text-base">Name*</label>
                    <input
                      className="border rounded p-2 w-full uppercase text-sm sm:text-base"
                      value={productoActual.nombre ?? ""}
                      onChange={(e) => setProductoActual({ ...productoActual, nombre: toUpper(e.target.value) })}
                      required
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-sm sm:text-base">Brand</label>
                    <input
                      className="border rounded p-2 w-full uppercase text-sm sm:text-base"
                      value={productoActual.marca ?? ""}
                      onChange={(e) => setProductoActual({ ...productoActual, marca: toUpper(e.target.value) })}
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-sm sm:text-base">Category</label>
                    <input
                      className="border rounded p-2 w-full uppercase text-sm sm:text-base"
                      value={productoActual.categoria ?? ""}
                      onChange={(e) => setProductoActual({ ...productoActual, categoria: toUpper(e.target.value) })}
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-sm sm:text-base">Size</label>
                    <select
                      className="border rounded p-2 w-full text-sm sm:text-base"
                      value={isCustomSize ? "custom" : productoActual.size || ""}
                      onChange={(e) => {
                        if (disabled) return;
                        if (e.target.value === "custom") setIsCustomSize(true);
                        else {
                          setIsCustomSize(false);
                          setProductoActual((prev) => ({ ...prev, size: e.target.value }));
                        }
                      }}
                      disabled={disabled}
                    >
                      <option value="">Select size</option>
                      {SIZES_COMUNES.map((sz) => (
                        <option value={sz} key={sz}>
                          {sz}
                        </option>
                      ))}
                      <option value="custom">Add custom size...</option>
                    </select>
                    {isCustomSize && (
                      <input
                        className="border rounded p-2 mt-1 w-full uppercase text-sm sm:text-base"
                        value={sizeCustom}
                        placeholder="Enter custom size"
                        onChange={(e) => setSizeCustom(toUpper(e.target.value))}
                        disabled={disabled}
                      />
                    )}
                  </div>

                  <div>
                    <label className="font-bold text-sm sm:text-base">Supplier</label>
                    <BuscadorSuplidor
                      value={suplidorId}
                      name={suplidorNombre}
                      disabled={disabled}
                      onChange={(id, nombre) => {
                        setSuplidorId(id);
                        setSuplidorNombre(nombre);
                        setProductoActual((prev) => ({ ...prev, suplidor_id: id }));
                      }}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-sm sm:text-base">Cost</label>
                    <input
                      className="border rounded p-2 w-full text-sm sm:text-base"
                      value={productoActual.costo ?? ""}
                      type="number"
                      step="0.01"
                      min="0"
                      onChange={(e) => setProductoActual({ ...productoActual, costo: e.target.value })}
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-sm sm:text-base">Price*</label>
                    <input
                      className="border rounded p-2 w-full text-sm sm:text-base"
                      value={productoActual.precio ?? ""}
                      type="number"
                      step="0.01"
                      min="0"
                      onChange={(e) => setProductoActual({ ...productoActual, precio: e.target.value })}
                      required
                      disabled={disabled}
                    />
                  </div>

                  <div className="md:col-span-2">
                    {(() => {
                      const c = Number(productoActual?.costo || 0);
                      const p = Number(productoActual?.precio || 0);
                      const margin = p > 0 ? ((p - c) / p) * 100 : 0;
                      const markup = c > 0 ? ((p - c) / c) * 100 : 0;
                      return (
                        <div className="mt-1 sm:mt-2 flex flex-wrap gap-2 text-sm">
                          <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-800 px-3 py-1 text-xs sm:text-sm">
                            Margin: <b className="ml-1">{margin.toFixed(1)}%</b>
                          </span>
                          <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-800 px-3 py-1 text-xs sm:text-sm">
                            Markup: <b className="ml-1">{markup.toFixed(1)}%</b>
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="font-bold text-sm sm:text-base">% Off (auto-applied)</label>
                    <input
                      className="border rounded p-2 w-full text-sm sm:text-base"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={productoActual.descuento_pct ?? ""}
                      onChange={(e) => setProductoActual({ ...productoActual, descuento_pct: e.target.value })}
                      placeholder="e.g. 10"
                      disabled={disabled}
                    />
                    <p className="text-xs text-gray-500 mt-1">It automatically applies in sales if bulk pricing does not apply.</p>
                  </div>

                  <div className="md:col-span-2 border rounded p-3 sm:p-4">
                    <b className="text-sm sm:text-base">Bulk pricing (optional)</b>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-2 sm:mt-3">
                      <div>
                        <label className="font-bold text-sm sm:text-base">Min. qty (≥)</label>
                        <input
                          className="border rounded p-2 w-full text-sm sm:text-base"
                          type="number"
                          min="1"
                          value={productoActual.bulk_min_qty ?? ""}
                          onChange={(e) => setProductoActual((prev) => ({ ...prev, bulk_min_qty: e.target.value }))}
                          placeholder="e.g. 10"
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <label className="font-bold text-sm sm:text-base">Unit price at that qty</label>
                        <input
                          className="border rounded p-2 w-full text-sm sm:text-base"
                          type="number"
                          step="0.01"
                          min="0"
                          value={productoActual.bulk_unit_price ?? ""}
                          onChange={(e) => setProductoActual((prev) => ({ ...prev, bulk_unit_price: e.target.value }))}
                          placeholder="e.g. 9.60"
                          disabled={disabled}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 sm:mt-2">If qty ≥ Min. qty, this unit price overrides base/% off in Sales.</p>
                  </div>

                  <div className="md:col-span-2 border-t pt-2 sm:pt-3 mt-2 sm:mt-3">
                    <b className="text-sm sm:text-base">Add stock now (optional)</b>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div>
                        <label className="font-bold text-sm sm:text-base">Quantity</label>
                        <input
                          className="border rounded p-2 w-full text-sm sm:text-base"
                          type="number"
                          min="0"
                          value={productoActual.cantidad_inicial || ""}
                          onChange={(e) => setProductoActual({ ...productoActual, cantidad_inicial: e.target.value })}
                          placeholder="0"
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <label className="font-bold text-sm sm:text-base">Location</label>
                        <select
                          className="border rounded p-2 w-full text-sm sm:text-base"
                          value={productoActual.ubicacion_inicial}
                          onChange={(e) => {
                            if (disabled) return;
                            const value = e.target.value;
                            setProductoActual((prev) => ({
                              ...prev,
                              ubicacion_inicial: value,
                              van_id_inicial: value.startsWith("van_")
                                ? ubicaciones.find((u) => u.key === value)?.van_id
                                : null,
                            }));
                          }}
                          disabled={disabled}
                        >
                          {ubicaciones.map((u) => (
                            <option key={u.key} value={u.key}>
                              {u.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 sm:mt-2">If you set a quantity & location, stock will be added when you save.</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-bold text-sm sm:text-base">Product notes</label>
                    <textarea
                      className="border rounded p-2 w-full min-h-[60px] uppercase text-sm sm:text-base"
                      value={productoActual.notas || ""}
                      placeholder="Special notes, important details, etc."
                      onChange={(e) => setProductoActual({ ...productoActual, notas: toUpper(e.target.value) })}
                      disabled={disabled}
                    />
                  </div>
                </div>

                {mensaje && <div className="text-blue-700 text-center mt-2 sm:mt-3 text-sm sm:text-base">{mensaje}</div>}

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4 sm:mt-6 sticky bottom-0 bg-white py-3 z-10">
                  <button type="submit" className="sm:flex-1 bg-blue-700 text-white font-bold rounded px-5 py-2 text-sm sm:text-base" disabled={disabled}>
                    {productoActual.id ? "Save changes" : "Add product"}
                  </button>
                  <button type="button" className="sm:flex-1 bg-gray-200 text-gray-800 rounded px-5 py-2 text-sm sm:text-base" onClick={() => imprimirEtiqueta(productoActual)}>
                    🖨️ Print label
                  </button>
                  {productoActual.id && (
                    <button type="button" className="sm:flex-1 bg-red-600 text-white rounded px-5 py-2 text-sm sm:text-base" onClick={eliminarProducto} disabled={disabled}>
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