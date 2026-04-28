import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { useLocation, useNavigate } from "react-router-dom";
import { usePermisos } from "./hooks/usePermisos";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { BarcodeScanner } from "./BarcodeScanner";
import { useToast } from "./hooks/useToast";

// Generate a unique in-store product code (12-digit, starts with 2 = internal UPC-A range)
function generateProductCode() {
  const digits = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join("");
  const raw = "2" + digits;
  // UPC-A check digit
  const odd  = [0,2,4,6,8,10].reduce((s, i) => s + Number(raw[i]), 0);
  const even = [1,3,5,7,9].reduce((s, i)    => s + Number(raw[i]), 0);
  const check = (10 - ((odd * 3 + even) % 10)) % 10;
  return raw + check;
}

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
    // Debounce 300ms — evita llamadas API en cada tecla
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("suplidores")
        .select("id,nombre")            // solo columnas necesarias
        .ilike("nombre", `%${busqueda}%`)
        .limit(10);                     // máximo 10 resultados para el picker
      setSuplidores(data || []);
    }, 300);
    return () => clearTimeout(timer);  // cancela si el usuario sigue escribiendo
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

function PestañaVentas({ productoId }) {
  const [allRows, setAllRows] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState("");
  const [loading, setLoading] = useState(false);

  const fmtMes = (ym) => {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };
  const fmtDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const fmtCur = (n) => `$${Number(n || 0).toFixed(2)}`;

  useEffect(() => {
    if (!productoId) return;
    (async () => {
      setLoading(true);
      setAllRows([]);
      setMesSeleccionado("");

      const { data: det } = await supabase
        .from("detalle_ventas")
        .select("venta_id, cantidad, precio_unitario, subtotal")
        .eq("producto_id", productoId);

      if (!det || det.length === 0) { setLoading(false); return; }

      const ventaIds = [...new Set(det.map((d) => d.venta_id).filter(Boolean))];
      const { data: ventas } = await supabase
        .from("ventas")
        .select("id, created_at, fecha, cliente_id, clientes:cliente_id(nombre)")
        .in("id", ventaIds);

      const mapV = new Map((ventas || []).map((v) => [v.id, v]));

      const rows = det.map((d) => {
        const v = mapV.get(d.venta_id);
        if (!v) return null;
        const fecha = v.fecha || v.created_at || "";
        const qty = Number(d.cantidad || 0);
        const unitPrice = Number(d.precio_unitario || 0);
        const total = Number(d.subtotal || qty * unitPrice || 0);
        return {
          venta_id: d.venta_id,
          qty,
          unitPrice,
          total,
          fecha,
          mes: fecha.slice(0, 7),
          cliente: v.clientes?.nombre || "Walk-in",
        };
      }).filter(Boolean).sort((a, b) => b.fecha.localeCompare(a.fecha));

      setAllRows(rows);
      setMesSeleccionado(rows[0]?.mes || "");
      setLoading(false);
    })();
  }, [productoId]);

  const porMes = useMemo(() => {
    const agg = {};
    allRows.forEach((r) => {
      if (!agg[r.mes]) agg[r.mes] = { mes: r.mes, qty: 0, revenue: 0 };
      agg[r.mes].qty += r.qty;
      agg[r.mes].revenue += r.total;
    });
    return Object.values(agg).sort((a, b) => b.mes.localeCompare(a.mes));
  }, [allRows]);

  const filasMes = useMemo(
    () => allRows.filter((r) => r.mes === mesSeleccionado),
    [allRows, mesSeleccionado]
  );

  const totalUnits = allRows.reduce((s, r) => s + r.qty, 0);
  const totalRevenue = allRows.reduce((s, r) => s + r.total, 0);
  const mesQty = filasMes.reduce((s, r) => s + r.qty, 0);
  const mesRevenue = filasMes.reduce((s, r) => s + r.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (allRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="text-4xl mb-2">📦</div>
        <p className="text-sm font-medium">No sales recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* All-time stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wide">Total Units Sold</p>
          <p className="text-2xl font-bold text-blue-800">{totalUnits}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wide">Total Revenue</p>
          <p className="text-xl font-bold text-emerald-800">{fmtCur(totalRevenue)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...porMes].reverse()} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="mes"
              fontSize={10}
              tickFormatter={(v) => {
                const [, m] = v.split("-");
                return new Date(2000, Number(m) - 1).toLocaleString("en-US", { month: "short" });
              }}
            />
            <YAxis fontSize={10} />
            <Tooltip
              formatter={(v, name) => [name === "qty" ? `${v} units` : fmtCur(v), name === "qty" ? "Units" : "Revenue"]}
              labelFormatter={fmtMes}
            />
            <Bar dataKey="qty" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-semibold whitespace-nowrap">Month:</span>
        <select
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          value={mesSeleccionado}
          onChange={(e) => setMesSeleccionado(e.target.value)}
        >
          {porMes.map((m) => (
            <option key={m.mes} value={m.mes}>
              {fmtMes(m.mes)} — {m.qty} units · {fmtCur(m.revenue)}
            </option>
          ))}
        </select>
      </div>

      {/* Month summary bar */}
      <div className="flex gap-2">
        <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-gray-500">Units</span>
          <span className="text-sm font-bold text-gray-800">{mesQty}</span>
        </div>
        <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-gray-500">Revenue</span>
          <span className="text-sm font-bold text-emerald-700">{fmtCur(mesRevenue)}</span>
        </div>
      </div>

      {/* Sales rows for selected month */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          {fmtMes(mesSeleccionado)} · {filasMes.length} sale{filasMes.length !== 1 ? "s" : ""}
        </p>
        {filasMes.map((f, i) => (
          <div key={f.venta_id + i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{f.cliente}</p>
              <p className="text-xs text-gray-400">{fmtDate(f.fecha)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-gray-900">{fmtCur(f.total)}</p>
              <p className="text-xs text-gray-400">
                {f.qty} × {fmtCur(f.unitPrice)}
              </p>
            </div>
          </div>
        ))}
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
  const { puedeCrearProductos, puedeEditarProductos, puedeEliminarProductos } = usePermisos();
  const { toast, confirm } = useToast();
  const PAGE_SIZE = 20; // Reducido para móviles
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 🆕 AÑADIR ESTE ESTADO PARA EL BOTÓN "ADD PRODUCT"
  const [guardandoProducto, setGuardandoProducto] = useState(false);
  const [codigoVerificando, setCodigoVerificando] = useState(false);
  const [codigoExisteInfo, setCodigoExisteInfo] = useState(null); // { nombre, id } si ya existe

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

    // Variantes para buscar: con ceros, sin ceros, texto completo
    // Ej: "0722195001326" → también busca "722195001326" y viceversa
    const digitsStripped = digitsOnly.replace(/^0+/, '') || digitsOnly;

    const baseSelect = "*, suplidor:suplidor_id(nombre)";
    const desde = (pagina - 1) * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;

    try {
      if (isBarcode) {
        // Busca exacto con TODAS las variantes (con ceros y sin ceros)
        const needles = Array.from(new Set([
          termNoSpaces,   // tal como se escribió/escaneó (con ceros si los tiene)
          digitsOnly,     // solo dígitos del input
          digitsStripped, // sin ceros al inicio
        ].filter(Boolean)));

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
          // Fallback ilike: busca prefijo con y sin ceros
          query = query.or(
            `codigo.ilike.${termNoSpaces}%,codigo.ilike.${digitsStripped}%`
          );
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

  // 🆕 HANDLER DE ESCÁNER — preserva ceros a la izquierda exactamente como los tiene el código
  const handleBarcodeScanned = (code) => {
    const cleanedCode = (code || '').trim(); // sin tocar los ceros
    if (!cleanedCode) return;

    setShowScanner(false);

    setTimeout(() => {
      const searchInput = document.querySelector('input[placeholder="Search by code, name, brand, category..."]');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }, 300);

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
    setCodigoExisteInfo(null);
    setCodigoVerificando(false);
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

  async function checkCodigoExiste(codigo) {
    if (!codigo || codigo.trim() === "") { setCodigoExisteInfo(null); return; }
    setCodigoVerificando(true);
    setCodigoExisteInfo(null);
    const { data } = await supabase
      .from("productos")
      .select("id, nombre")
      .eq("codigo", codigo.trim())
      .maybeSingle();
    setCodigoVerificando(false);
    if (data && (!productoActual?.id || data.id !== productoActual.id)) {
      setCodigoExisteInfo({ nombre: data.nombre, id: data.id });
    } else {
      setCodigoExisteInfo(null);
    }
  }

  async function guardarProducto(e) {
    e.preventDefault();
    setMensaje("");
    setGuardandoProducto(true); // 🆕 MARCAR COMO GUARDANDO

    if (!productoActual.codigo || !productoActual.nombre || !productoActual.precio) {
      setMensaje("Complete all required fields.");
      setGuardandoProducto(false); // 🆕 RESTABLECER ESTADO
      return;
    }

    const { data: existentes, error: errorExistente } = await supabase.from("productos").select("id").eq("codigo", productoActual.codigo);
    if (errorExistente) {
      setMensaje("Error checking for duplicate code: " + errorExistente.message);
      setGuardandoProducto(false); // 🆕 RESTABLECER ESTADO
      return;
    }
    if (existentes && existentes.length > 0 && (!productoActual.id || existentes[0].id !== productoActual.id)) {
      setMensaje("Error: There is already a product with this code/UPC.");
      setGuardandoProducto(false); // 🆕 RESTABLECER ESTADO
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
      const ok = await confirm("The bulk unit price is below cost. Save anyway?", { confirmLabel: "Save Anyway", danger: true });
      if (!ok) {
        setGuardandoProducto(false);
        return;
      }
    }

    let productoId = productoActual.id;
    let savedMessage = "";

    if (productoActual.id) {
      const { error } = await supabase.from("productos").update(dataProducto).eq("id", productoActual.id);
      if (error) {
        setMensaje(error.message?.toLowerCase().includes("unique") ? "Error: This code/UPC is already in use. Please use another one." : "Error: " + error.message);
        setGuardandoProducto(false); // 🆕 RESTABLECER ESTADO
        return;
      }
      savedMessage = "Product updated successfully.";
    } else {
      const { data, error } = await supabase.from("productos").insert([dataProducto]).select().maybeSingle();
      if (error) {
        setMensaje(error.message?.toLowerCase().includes("unique") ? "Error: This code/UPC is already in use. Please use another one." : "Error: " + error.message);
        setGuardandoProducto(false); // 🆕 RESTABLECER ESTADO
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
    setMensaje("✓ " + savedMessage);
    setTimeout(() => {
      cerrarModal();
      setGuardandoProducto(false);
    }, 1200);
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
      toast.warning(`Cannot delete: this product is used in ${ventasCount} sale(s).`);
      return;
    }

    const ok = await confirm("Permanently delete this product?", { confirmLabel: "Delete", danger: true });
    if (!ok) return;

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
      toast.warning("Este producto no tiene código/UPC. Usa 'Generate Code' para asignar uno.");
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
      toast.warning("Habilita los pop-ups del navegador para imprimir la etiqueta.");
      return;
    }
    w.document.open("text/html", "replace");
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  // disabled = not in editMode, OR user doesn't have product edit permission
  const disabled = !editMode || !puedeEditarProductos;
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
        {puedeCrearProductos && (
          <button
            onClick={() => agregarProductoNuevo()}
            className="bg-green-700 text-white font-bold rounded px-5 py-2 whitespace-nowrap flex items-center justify-center gap-2"
            disabled={guardandoProducto}
          >
            <span>+</span>
            <span>{guardandoProducto ? "Saving..." : "Add product"}</span>
          </button>
        )}
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
                    className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3.5 cursor-pointer transition-all active:scale-[0.99] ${
                      idx === hl ? "ring-2 ring-blue-500 bg-blue-50 border-blue-200" : "active:bg-gray-50"
                    }`}
                    onMouseEnter={() => setHl(idx)}
                    onClick={() => abrirModal(p)}
                  >
                    {/* Row 1: Name + Price */}
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-bold text-gray-900 text-sm leading-tight flex-1 min-w-0 pr-1 line-clamp-2">
                        {p.nombre}
                      </h3>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-base font-bold text-emerald-600 leading-tight">
                          ${Number(p.precio || 0).toFixed(2)}
                        </div>
                        {p.costo > 0 && (
                          (() => {
                            const margin = ((Number(p.precio) - Number(p.costo)) / Number(p.precio) * 100);
                            const color = margin >= 30 ? "text-emerald-600" : margin >= 15 ? "text-amber-500" : "text-red-500";
                            return <div className={`text-[10px] font-semibold ${color}`}>{margin.toFixed(0)}% margin</div>;
                          })()
                        )}
                      </div>
                    </div>

                    {/* Row 2: Brand · Code */}
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
                      {p.marca && <span className="font-medium text-gray-500">{p.marca}</span>}
                      {p.marca && p.codigo && <span>·</span>}
                      {p.codigo && <span className="font-mono">{p.codigo}</span>}
                    </div>

                    {/* Row 3: Tags */}
                    {(p.size || p.categoria) && (
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {p.size && (
                          <span className="bg-blue-50 text-blue-600 text-[10px] font-medium px-1.5 py-0.5 rounded">
                            {p.size}
                          </span>
                        )}
                        {p.categoria && (
                          <span className="bg-purple-50 text-purple-600 text-[10px] px-1.5 py-0.5 rounded truncate max-w-[140px]">
                            {p.categoria}
                          </span>
                        )}
                        {p.costo > 0 && (
                          <span className="text-[10px] text-gray-400 ml-auto">
                            cost ${Number(p.costo).toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
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
        <div className="fixed inset-x-0 top-0 bg-black/50 flex justify-center items-end sm:items-center z-50 p-0 sm:p-4" style={{bottom:'64px'}}>
          <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:rounded-2xl shadow-2xl max-w-lg flex flex-col" style={{overflow:'hidden'}}>

            {/* ── Sticky Header ── */}
            <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 sm:px-5 pt-4 pb-0 z-20">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 pr-3">
                  {productoActual.id ? (
                    <>
                      <h2 className="text-base font-bold text-gray-900 leading-tight truncate">
                        {productoActual.nombre || "Product"}
                      </h2>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {productoActual.codigo && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono tracking-wide">
                            {productoActual.codigo}
                          </span>
                        )}
                        {productoActual.marca && (
                          <span className="text-xs text-gray-400 font-medium">{productoActual.marca}</span>
                        )}
                        {productoActual.size && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium">{productoActual.size}</span>
                        )}
                        {productoActual.categoria && (
                          <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded">{productoActual.categoria}</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <h2 className="text-base font-bold text-gray-900">New Product</h2>
                  )}
                </div>
                <button
                  type="button"
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
                  onClick={cerrarModal}
                >
                  ×
                </button>
              </div>

              {/* KPIs — only for existing products */}
              {productoActual.id && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                    <div className="text-[10px] text-blue-500 font-bold uppercase tracking-wide">On Hand</div>
                    <div className="text-xl font-bold text-blue-800 leading-tight">{stockResumen.unidades}</div>
                    <div className="text-[10px] text-blue-400">units</div>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                    <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-wide">Stock Value</div>
                    <div className="text-base font-bold text-emerald-800 leading-tight">${Number(stockResumen.valor || 0).toFixed(2)}</div>
                    <div className="text-[10px] text-emerald-400">@ cost</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Last Sold</div>
                    <div className="text-sm font-bold text-gray-700 leading-tight">
                      {ultimaVenta ? new Date(ultimaVenta).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </div>
                    {ultimaVenta && (
                      <div className="text-[10px] text-gray-400">{new Date(ultimaVenta).getFullYear()}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex -mx-0 border-b border-gray-100">
                <button
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tabActivo === "editar" ? "border-blue-600 text-blue-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
                  onClick={() => setTabActivo("editar")}
                >
                  Edit Product
                </button>
                <button
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tabActivo === "ventas" ? "border-blue-600 text-blue-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
                  onClick={() => setTabActivo("ventas")}
                >
                  Sales History
                </button>
                {!editMode && productoActual?.id && tabActivo === "editar" && puedeEditarProductos && (
                  <button className="ml-auto mb-1 bg-blue-600 text-white rounded-lg px-3 py-1 text-xs font-semibold" onClick={() => setEditMode(true)}>
                    Edit
                  </button>
                )}
                {!puedeEditarProductos && productoActual?.id && tabActivo === "editar" && (
                  <span className="ml-auto mb-1 text-xs text-slate-400 flex items-center gap-1">
                    🔒 View only
                  </span>
                )}
              </div>
            </div>

            {/* ── Scrollable Content ── */}
            <div className="flex-1 overflow-y-auto">
              {tabActivo === "editar" ? (
                <form id="producto-form" onSubmit={guardarProducto} className="px-4 sm:px-5 py-4 space-y-5">

                  {/* SECTION: Product Info */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Product Info</p>

                    {/* Code / UPC — full width, prominente */}
                    <div className="mb-2.5">
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">
                        Code / UPC *
                        <span className="ml-1.5 text-[10px] font-normal text-gray-400 normal-case">(leading zeros are preserved)</span>
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base select-none">▌▌▌</span>
                          <input
                            className={`border-2 rounded-lg pl-9 pr-3 py-2.5 w-full font-mono text-sm tracking-widest focus:ring-2 outline-none bg-gray-50 uppercase ${codigoExisteInfo ? "border-amber-400 focus:ring-amber-400 focus:border-amber-400" : "border-gray-200 focus:ring-blue-500 focus:border-blue-400"}`}
                            value={productoActual.codigo ?? ""}
                            onChange={(e) => { setProductoActual({ ...productoActual, codigo: e.target.value.toUpperCase() }); setCodigoExisteInfo(null); }}
                            onBlur={(e) => checkCodigoExiste(e.target.value)}
                            placeholder="Scan or type barcode..."
                            required autoFocus disabled={disabled || guardandoProducto}
                          />
                          {codigoVerificando && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs animate-pulse">checking...</span>
                          )}
                        </div>
                        {!disabled && !productoActual.codigo && (
                          <button
                            type="button"
                            title="Generar código interno automático"
                            className="flex-shrink-0 px-3 py-2.5 text-xs font-bold rounded-lg border-2 border-dashed border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors whitespace-nowrap"
                            onClick={() => {
                              const newCode = generateProductCode();
                              setProductoActual((p) => ({ ...p, codigo: newCode }));
                              setCodigoExisteInfo(null);
                              toast.info("Código generado — guarda el producto para confirmar");
                            }}
                          >
                            ⚡ Generate
                          </button>
                        )}
                      </div>
                      {codigoExisteInfo && (
                        <div className="mt-1.5 flex items-start gap-1.5 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
                          <span className="text-amber-500 text-sm leading-none mt-0.5">⚠️</span>
                          <div>
                            <p className="text-xs font-semibold text-amber-700">This code already exists</p>
                            <p className="text-xs text-amber-600">{codigoExisteInfo.nombre}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Name *</label>
                        <input
                          className="border border-gray-200 rounded-lg p-2.5 w-full uppercase text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          value={productoActual.nombre ?? ""}
                          onChange={(e) => setProductoActual({ ...productoActual, nombre: toUpper(e.target.value) })}
                          required disabled={disabled}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Brand</label>
                        <input
                          className="border border-gray-200 rounded-lg p-2.5 w-full uppercase text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          value={productoActual.marca ?? ""}
                          onChange={(e) => setProductoActual({ ...productoActual, marca: toUpper(e.target.value) })}
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Category</label>
                        <input
                          className="border border-gray-200 rounded-lg p-2.5 w-full uppercase text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          value={productoActual.categoria ?? ""}
                          onChange={(e) => setProductoActual({ ...productoActual, categoria: toUpper(e.target.value) })}
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Size</label>
                        <select
                          className="border border-gray-200 rounded-lg p-2.5 w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          value={isCustomSize ? "custom" : productoActual.size || ""}
                          onChange={(e) => {
                            if (disabled) return;
                            if (e.target.value === "custom") setIsCustomSize(true);
                            else { setIsCustomSize(false); setProductoActual((prev) => ({ ...prev, size: e.target.value })); }
                          }}
                          disabled={disabled}
                        >
                          <option value="">Select size</option>
                          {SIZES_COMUNES.map((sz) => <option value={sz} key={sz}>{sz}</option>)}
                          <option value="custom">Custom...</option>
                        </select>
                        {isCustomSize && (
                          <input
                            className="border border-gray-200 rounded-lg p-2.5 mt-1.5 w-full uppercase text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={sizeCustom}
                            placeholder="Enter custom size"
                            onChange={(e) => setSizeCustom(toUpper(e.target.value))}
                            disabled={disabled}
                          />
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Supplier</label>
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
                    </div>
                  </div>

                  {/* SECTION: Pricing */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Pricing</p>
                    <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Cost</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">$</span>
                          <input
                            className="border border-gray-200 rounded-lg pl-6 pr-3 py-2.5 w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            value={productoActual.costo ?? ""}
                            type="number" step="0.01" min="0"
                            onChange={(e) => setProductoActual({ ...productoActual, costo: e.target.value })}
                            disabled={disabled}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Sale Price *</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">$</span>
                          <input
                            className="border border-gray-200 rounded-lg pl-6 pr-3 py-2.5 w-full text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            value={productoActual.precio ?? ""}
                            type="number" step="0.01" min="0"
                            onChange={(e) => setProductoActual({ ...productoActual, precio: e.target.value })}
                            required disabled={disabled}
                          />
                        </div>
                      </div>
                    </div>
                    {/* Live profit/margin card */}
                    {(() => {
                      const c = Number(productoActual?.costo || 0);
                      const p = Number(productoActual?.precio || 0);
                      if (p === 0) return null;
                      const profit = p - c;
                      const margin = ((p - c) / p) * 100;
                      const markup = c > 0 ? ((p - c) / c) * 100 : null;
                      const isGood = margin >= 30;
                      const isMid = margin >= 15 && margin < 30;
                      const bgClass = isGood ? "bg-emerald-50 border-emerald-200" : isMid ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
                      const valClass = isGood ? "text-emerald-700" : isMid ? "text-amber-600" : "text-red-600";
                      return (
                        <div className={`border rounded-xl p-3 flex items-center gap-3 ${bgClass}`}>
                          <div className="flex-1">
                            <p className="text-[10px] text-gray-500 uppercase font-semibold">Profit / unit</p>
                            <p className={`text-xl font-bold leading-tight ${valClass}`}>${profit.toFixed(2)}</p>
                          </div>
                          <div className="text-center border-l border-gray-200 pl-3">
                            <p className="text-[10px] text-gray-500 uppercase font-semibold">Margin</p>
                            <p className={`text-lg font-bold ${valClass}`}>{margin.toFixed(1)}%</p>
                          </div>
                          {markup !== null && (
                            <div className="text-center border-l border-gray-200 pl-3">
                              <p className="text-[10px] text-gray-500 uppercase font-semibold">Markup</p>
                              <p className="text-lg font-bold text-gray-600">{markup.toFixed(1)}%</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* SECTION: Special Pricing */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Special Pricing</p>

                    {/* Default Discount */}
                    <div className="border border-gray-200 rounded-xl p-3.5 mb-2.5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-700">Default Discount</p>
                          <p className="text-xs text-gray-400 mt-0.5">Applies at checkout when bulk pricing doesn't apply</p>
                        </div>
                        {Number(productoActual.descuento_pct) > 0 && Number(productoActual.precio) > 0 && (
                          <div className="text-right ml-3 flex-shrink-0">
                            <p className="text-[10px] text-gray-400 uppercase font-semibold">Promo price</p>
                            <p className="text-base font-bold text-orange-500">
                              ${(Number(productoActual.precio) * (1 - Number(productoActual.descuento_pct) / 100)).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative w-24">
                          <input
                            className="border border-gray-200 rounded-lg py-2 pl-3 pr-7 w-full text-sm font-semibold text-center focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none"
                            type="number" step="0.01" min="0" max="100"
                            value={productoActual.descuento_pct ?? ""}
                            onChange={(e) => setProductoActual({ ...productoActual, descuento_pct: e.target.value })}
                            placeholder="0"
                            disabled={disabled}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold select-none">%</span>
                        </div>
                        {Number(productoActual.descuento_pct) > 0 && Number(productoActual.precio) > 0 && (
                          <p className="text-xs text-gray-400">
                            off ${Number(productoActual.precio).toFixed(2)} = saves ${(Number(productoActual.precio) * Number(productoActual.descuento_pct) / 100).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Bulk Pricing */}
                    <div className="border border-gray-200 rounded-xl p-3.5">
                      <p className="text-sm font-semibold text-gray-700 mb-0.5">Bulk Pricing</p>
                      <p className="text-xs text-gray-400 mb-3">Overrides base price & discount when quantity reaches the minimum</p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Min. Qty (≥)</label>
                          <input
                            className="border border-gray-200 rounded-lg p-2.5 w-full text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none"
                            type="number" min="1"
                            value={productoActual.bulk_min_qty ?? ""}
                            onChange={(e) => setProductoActual((prev) => ({ ...prev, bulk_min_qty: e.target.value }))}
                            placeholder="e.g. 10"
                            disabled={disabled}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Price per Unit</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">$</span>
                            <input
                              className="border border-gray-200 rounded-lg pl-6 pr-3 py-2.5 w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              type="number" step="0.01" min="0"
                              value={productoActual.bulk_unit_price ?? ""}
                              onChange={(e) => setProductoActual((prev) => ({ ...prev, bulk_unit_price: e.target.value }))}
                              placeholder="e.g. 9.60"
                              disabled={disabled}
                            />
                          </div>
                        </div>
                      </div>
                      {Number(productoActual.bulk_min_qty) > 0 && Number(productoActual.bulk_unit_price) > 0 && (
                        <p className="text-xs text-blue-600 font-medium mt-2">
                          Buy {productoActual.bulk_min_qty}+ → ${Number(productoActual.bulk_unit_price).toFixed(2)}/unit
                          {Number(productoActual.precio) > 0 && (
                            <span className="text-gray-400 font-normal ml-1">
                              (saves ${(Number(productoActual.precio) - Number(productoActual.bulk_unit_price)).toFixed(2)}/unit)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* SECTION: Add Stock */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Add Stock</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Quantity</label>
                        <input
                          className="border border-gray-200 rounded-lg p-2.5 w-full text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none"
                          type="number" min="0"
                          value={productoActual.cantidad_inicial || ""}
                          onChange={(e) => setProductoActual({ ...productoActual, cantidad_inicial: e.target.value })}
                          placeholder="0"
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Location</label>
                        <select
                          className="border border-gray-200 rounded-lg p-2.5 w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          value={productoActual.ubicacion_inicial}
                          onChange={(e) => {
                            if (disabled) return;
                            const value = e.target.value;
                            setProductoActual((prev) => ({
                              ...prev,
                              ubicacion_inicial: value,
                              van_id_inicial: value.startsWith("van_") ? ubicaciones.find((u) => u.key === value)?.van_id : null,
                            }));
                          }}
                          disabled={disabled}
                        >
                          {ubicaciones.map((u) => <option key={u.key} value={u.key}>{u.nombre}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">Leave at 0 to save without adding stock.</p>
                  </div>

                  {/* SECTION: Notes */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Notes</label>
                    <textarea
                      className="border border-gray-200 rounded-xl p-3 w-full min-h-[70px] uppercase text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                      value={productoActual.notas || ""}
                      placeholder="Special notes, important details, etc."
                      onChange={(e) => setProductoActual({ ...productoActual, notas: toUpper(e.target.value) })}
                      disabled={disabled}
                    />
                  </div>

                  {mensaje && (
                    <p className={`text-center text-sm font-medium py-1 px-3 rounded-lg ${mensaje.startsWith("✓") ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
                      {mensaje}
                    </p>
                  )}

                </form>
              ) : (
                <div className="px-4 sm:px-5 py-4">
                  <PestañaVentas productoId={productoActual.id} nombre={productoActual.nombre} />
                </div>
              )}
            </div>

            {/* ── Action Buttons — always visible, outside scroll ── */}
            {tabActivo === "editar" && (
              <div className="flex-shrink-0 flex gap-2 bg-white border-t border-gray-100 px-4 sm:px-5 pt-3 pb-4" style={{paddingBottom:'max(1rem, env(safe-area-inset-bottom))'}}>
                {puedeEditarProductos && (
                  <button
                    type="submit"
                    form="producto-form"
                    className="flex-1 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-bold rounded-xl py-3 text-sm transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    disabled={disabled || guardandoProducto}
                  >
                    {guardandoProducto ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      productoActual.id ? "Save Changes" : "Add Product"
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl px-4 py-3 text-sm transition-colors"
                  onClick={() => imprimirEtiqueta(productoActual)}
                >
                  🖨️
                </button>
                {productoActual.id && puedeEliminarProductos && (
                  <button
                    type="button"
                    className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl px-4 py-3 text-sm transition-colors"
                    onClick={eliminarProducto}
                    disabled={disabled}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}