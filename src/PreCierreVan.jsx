// src/PreCierreVan.jsx - Corregido con Eastern Time y sin duplicación
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  DollarSign, FileText, Download, RefreshCw, CheckCircle, AlertCircle, 
  Calculator, Calendar, TrendingUp, AlertTriangle, X, Plus, Minus, Send, MoreHorizontal, CreditCard
} from "lucide-react";

/* ========================= Constants ========================= */
const PAYMENT_METHODS = {
  efectivo: { label: "Cash", color: "#4CAF50", icon: "💵" },
  tarjeta: { label: "Card", color: "#2196F3", icon: "💳" },
  transferencia: { label: "Transfer", color: "#9C27B0", icon: "🏦" },
  otro: { label: "Other", color: "#FF9800", icon: "💰" },
};

/* ========================= Helpers de fecha / formato (Eastern Time) ==================== */

// Función para obtener fecha actual en Eastern Time
function getEasternDate(date = new Date()) {
  return new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

// Función para formatear fecha como YYYY-MM-DD en Eastern Time
function easternToYMD(date) {
  const eastern = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const y = eastern.getFullYear();
  const m = String(eastern.getMonth() + 1).padStart(2, "0");
  const d = String(eastern.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Función para obtener inicio y fin del día en Eastern Time
function easternDayBounds(isoDay) {
  if (!isoDay) return { start: "", end: "" };
  
  // Crear un objeto Date para la fecha en Eastern Time
  const date = new Date(isoDay + "T00:00:00");
  
  // Obtener el inicio del día en Eastern Time (00:00:00)
  const easternStart = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  easternStart.setHours(0, 0, 0, 0);
  
  // Obtener el fin del día en Eastern Time (23:59:59.999)
  const easternEnd = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  easternEnd.setHours(23, 59, 59, 999);
  
  // Convertir a UTC para la consulta
  const start = easternStart.toISOString();
  const end = easternEnd.toISOString();
  
  return { start, end };
}

// Formato US MM/DD/YYYY a partir de 'YYYY-MM-DD'
function formatUS(isoDay) {
  if (!isoDay) return "—";
  const [y, m, d] = String(isoDay).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  const dt = new Date(y, m - 1, d); // local
  return dt.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// 'YYYY-MM-DD' del día local actual (Eastern Time)
function localTodayISO() {
  return easternToYMD(new Date());
}

/* ========================= Custom Hook ========================= */

function usePrecloseRows(vanId, diasAtras = 21) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!vanId) {
      setRows([]);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const hoy = new Date();
        const desde = new Date(hoy);
        desde.setDate(hoy.getDate() - (diasAtras - 1));

        const p_from = desde.toISOString().slice(0, 10);
        const p_to = hoy.toISOString().slice(0, 10);

        console.log("📅 Fetching pre-close rows for van:", vanId, "from:", p_from, "to:", p_to);

        // Obtener las fechas que ya tienen cierres
        const { data: cierres, error: cierresError } = await supabase
          .from('cierres_dia')
          .select('fecha')
          .eq('van_id', vanId)
          .gte('fecha', p_from)
          .lte('fecha', p_to);

        if (cierresError) {
          console.error("❌ Error fetching closures", cierresError);
          throw new Error(cierresError.message);
        }

        const fechasConCierre = new Set(cierres?.map(c => c.fecha) || []);
        console.log("🔒 Fechas con cierre:", Array.from(fechasConCierre));

        // ✅ Llamar al RPC que calcula correctamente sin duplicación
        const { data, error: rpcError } = await supabase.rpc(
          "closeout_pre_resumen_filtrado",
          {
            p_van_id: vanId,
            p_from,
            p_to,
          }
        );

        if (rpcError) {
          console.error("❌ RPC error:", rpcError);
          throw new Error(rpcError.message);
        }

        console.log("✅ RPC data received:", data);

        // Procesar y normalizar los datos
        const normalized = (data ?? [])
          .map((r) => {
            const iso = r.dia ?? r.fecha ?? r.day ?? r.f ?? null;
            return {
              dia: typeof iso === "string" ? iso.slice(0, 10) : null,
              cash_expected: Number(r.cash_expected ?? r.cash ?? 0),
              card_expected: Number(r.card_expected ?? r.card ?? 0),
              transfer_expected: Number(r.transfer_expected ?? r.transfer ?? 0),
              mix_unallocated: Number(r.mix_unallocated ?? r.mix ?? 0),
            };
          })
          // Filtrar días sin transacciones o que ya tienen cierre
          .filter((r) => {
            const total = r.cash_expected + r.card_expected + r.transfer_expected + r.mix_unallocated;
            const isValid = r.dia && /^\d{4}-\d{2}-\d{2}$/.test(r.dia);
            const hasCierre = fechasConCierre.has(r.dia);
            const hasTransactions = total > 0;
            
            if (isValid && !hasCierre && hasTransactions) {
              console.log(`✅ Día válido: ${r.dia} - Total: $${total.toFixed(2)}`);
              return true;
            }
            
            if (isValid && hasCierre) {
              console.log(`🔒 Día omitido (ya cerrado): ${r.dia}`);
            }
            
            return false;
          });

        // Ordenar por fecha descendente (más reciente primero)
        normalized.sort((a, b) => (a.dia < b.dia ? 1 : -1));
        
        console.log(`📊 Total de días pendientes: ${normalized.length}`);
        setRows(normalized);
      } catch (err) {
        console.error("❌ Error in fetchData:", err);
        setError(err.message);
        setRows([]);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      alive = false;
    };
  }, [vanId, diasAtras]);

  return { rows, loading, error };
}

/* ========================= Helper Functions ========================= */
const fmtCurrency = (n) => {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getPaymentMethodColor = (method) => {
  return PAYMENT_METHODS[method]?.color || "#9E9E9E";
};

const getPaymentMethodLabel = (method) => {
  return PAYMENT_METHODS[method]?.label || method;
};

/* ========================= Main Component ========================= */
export default function PreCierreVan() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const navigate = useNavigate();
  
  // Estados principales
  const [invoices, setInvoices] = useState({});
  const [selected, setSelected] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  
  // Fechas
  const todayISO = useMemo(localTodayISO, []);

  // Cargar filas pendientes usando el hook personalizado
  const { rows: pendingRows, loading, error } = usePrecloseRows(van?.id, 21);
  
  // Sincronizar filas pendientes con el estado principal
  const [rows, setRows] = useState([]);
  
  useEffect(() => {
    if (pendingRows.length !== rows.length) {
      setRows(pendingRows);
    }
  }, [pendingRows, rows.length]);

  // Cargar datos iniciales
  useEffect(() => {
    if (!van?.id) return;
    
    // Cargar fechas seleccionadas del localStorage
    try {
      const saved = JSON.parse(localStorage.getItem("pre_cierre_fechas") || "[]");
      if (Array.isArray(saved)) {
        setSelected(saved);
        console.log("📅 Fechas cargadas del localStorage:", saved);
      }
    } catch (e) {
      console.error("❌ Error loading selected dates", e);
    }
  }, [van?.id]);

  // Cargar conteo de facturas
  useEffect(() => {
    if (!van?.id || rows.length === 0) return;
    
    let alive = true;
    const faltan = rows.filter((r) => invoices[r.dia] == null);
    if (faltan.length === 0) return;

    const cargarInvoices = async () => {
      const out = {};
      await Promise.all(
        faltan.map(async (r) => {
          const c = await countVentasDia(van.id, r.dia);
          out[r.dia] = c;
        })
      );

      if (alive) {
        setInvoices((prev) => ({ ...prev, ...out }));
        console.log("📋 Conteo de facturas actualizado:", out);
      }
    };

    cargarInvoices();

    return () => {
      alive = false;
    };
  }, [van?.id, rows, invoices]);

  // Asegurar que las fechas seleccionadas estén visibles
  useEffect(() => {
    if (selected.length === 0) return;
    const visible = new Set(rows.map(r => r.dia));
    const cleaned = selected.filter((d) => visible.has(d));
    if (cleaned.length !== selected.length) {
      setSelected(cleaned);
      console.log("🧹 Fechas seleccionadas limpiadas:", cleaned);
    }
  }, [rows, selected]);

  // Actualizar localStorage cuando cambian las selecciones
  useEffect(() => {
    try {
      localStorage.setItem("pre_cierre_fechas", JSON.stringify(selected));
      if (selected.length > 0) {
        localStorage.setItem("pre_cierre_fecha", selected[0]);
      }
      console.log("💾 Fechas guardadas en localStorage:", selected);
    } catch (e) {
      console.error("❌ Error saving selected dates", e);
    }
  }, [selected]);

  // Función para contar ventas por día (usa easternDayBounds)
  const countVentasDia = useCallback(async (van_id, diaISO) => {
    if (!van_id || !diaISO) return 0;

    // Usar Eastern Time para el rango del día
    const { start, end } = easternDayBounds(diaISO);

    console.log(`📊 Contando ventas para ${diaISO} (${start} - ${end})`);

    // Probamos varias columnas de fecha, según tu esquema real
    const dateCols = ["created_at", "fecha", "fecha_venta"];

    for (const col of dateCols) {
      const { count, error, status } = await supabase
        .from("ventas")
        .select("id", { count: "exact", head: true })
        .eq("van_id", van_id)
        .gte(col, start)
        .lte(col, end)
        .is("cierre_id", null);

      // status 200 y count numérico ⇒ lo tomamos como bueno
      if (!error && typeof count === "number") {
        console.log(`✅ ${count} ventas encontradas usando columna '${col}'`);
        return count;
      }

      // Si es 400 por columna inválida, intenta la siguiente
      if (status !== 400 && error) {
        console.warn(`⚠️ countVentasDia(${col}) error:`, error.message || error);
      }
    }

    // Si todas fallan, devolvemos 0
    console.log(`⚠️ No se pudieron contar ventas para ${diaISO}`);
    return 0;
  }, []);

  // Toggle individual de fechas
  const toggleOne = useCallback((day) => {
    setSelected((prev) => {
      const has = prev.includes(day);
      const next = has ? prev.filter((d) => d !== day) : [day, ...prev];
      console.log(`${has ? '❌ Deseleccionado' : '✅ Seleccionado'}: ${day}`);
      return next;
    });
  }, []);

  // Toggle todas las fechas
  const allSelected = selected.length > 0 && selected.length === rows.length;
  const onToggleAll = useCallback(() => {
    const next = allSelected ? [] : [...rows.map(r => r.dia)];
    setSelected(next);
    console.log(allSelected ? '❌ Todas deseleccionadas' : '✅ Todas seleccionadas');
  }, [rows, allSelected]);

  // Sumas del panel (sobre fechas seleccionadas)
  const sum = useMemo(() => {
    const result = selected.reduce(
      (acc, d) => {
        const r = rows.find((x) => x.dia === d);
        if (!r) return acc;
        
        // Sumar correctamente los métodos de pago del RPC
        acc.cash += Number(r.cash_expected || 0);
        acc.card += Number(r.card_expected || 0);
        acc.transfer += Number(r.transfer_expected || 0);
        acc.mix += Number(r.mix_unallocated || 0);
        acc.invoices += Number(invoices[d] || 0);
        
        return acc;
      },
      { cash: 0, card: 0, transfer: 0, mix: 0, invoices: 0 }
    );

    console.log('💰 Totales calculados para fechas seleccionadas:', result);
    return result;
  }, [selected, rows, invoices]);

  const totalExpected = sum.cash + sum.card + sum.transfer + sum.mix;
  const canProcess = selected.length > 0 && totalExpected > 0;

  // Procesar cierre
  const onProcess = useCallback(() => {
    if (!canProcess) {
      setMensaje("Please select at least one date to process");
      setTipoMensaje("warning");
      return;
    }
    
    try {
      localStorage.setItem("pre_cierre_fechas", JSON.stringify(selected));
      localStorage.setItem("pre_cierre_fecha", selected[0] || "");
      localStorage.setItem("pre_cierre_refresh", String(Date.now()));
      
      console.log("✅ Navegando a cierre con fechas:", selected);
      navigate("/cierres/van");
    } catch (e) {
      console.error("❌ Error saving selected dates", e);
      setMensaje("Error saving selected dates");
      setTipoMensaje("error");
    }
  }, [selected, canProcess, navigate]);

  // Generar PDF
  const handleGenerarPDF = useCallback(() => {
    if (!selected.length) {
      setMensaje("No dates selected to generate report");
      setTipoMensaje("warning");
      return;
    }

    try {
      const doc = new jsPDF();
      const businessName = "Tools4Care";
      const reportTitle = "Pre-Closure Report";
      
      // Header
      doc.setFillColor(25, 118, 210);
      doc.rect(0, 0, 210, 30, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.text(businessName, 14, 20);
      doc.setFontSize(16);
      doc.text(reportTitle, 14, 30);
      doc.setTextColor(0, 0, 0);

      // Business information
      doc.setFillColor(240, 240, 240);
      doc.rect(14, 35, 182, 20, "F");
      doc.setFontSize(10);
      doc.text(`VAN: ${van?.nombre || van?.alias || 'No name'}`, 14, 45);
      doc.text(`User: ${usuario?.nombre || 'No name'}`, 14, 52);
      
      // Summary
      doc.setFontSize(14);
      doc.text("Selected Days Summary", 14, 66);
      doc.setFontSize(10);
      
      const totalesData = [
        ["Date", "Cash", "Card", "Transfer", "Mix", "Total", "Invoices"],
        ...selected.map(d => {
          const r = rows.find(x => x.dia === d);
          const dayTotal = (r?.cash_expected || 0) + (r?.card_expected || 0) + 
                          (r?.transfer_expected || 0) + (r?.mix_unallocated || 0);
          return [
            formatUS(d),
            fmtCurrency(r?.cash_expected || 0),
            fmtCurrency(r?.card_expected || 0),
            fmtCurrency(r?.transfer_expected || 0),
            fmtCurrency(r?.mix_unallocated || 0),
            fmtCurrency(dayTotal),
            invoices[d] || 0
          ];
        }),
        ["", "", "", "", "", "", ""],
        [
          "Totals", 
          fmtCurrency(sum.cash), 
          fmtCurrency(sum.card), 
          fmtCurrency(sum.transfer), 
          fmtCurrency(sum.mix),
          fmtCurrency(totalExpected),
          sum.invoices
        ]
      ];
      
      autoTable(doc, {
        startY: 72,
        head: [totalesData[0]],
        body: totalesData.slice(1),
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { 
          fillColor: [25, 118, 210],
          textColor: 255,
          fontStyle: "bold"
        }
      });

      // Footer
      const footerY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on ${new Date().toLocaleString()}`, 14, footerY);
      doc.text(`Tools4Care Financial System`, 14, footerY + 6);
      
      doc.save(`PreClosure_${van?.nombre || 'VAN'}_${new Date().toISOString().slice(0, 10)}.pdf`);
      setMensaje("PDF report generated successfully");
      setTipoMensaje("success");
      
      console.log("✅ PDF generado exitosamente");
    } catch (error) {
      console.error("❌ Error generating PDF:", error);
      setMensaje("Error generating PDF: " + error.message);
      setTipoMensaje("error");
    }
  }, [selected, rows, invoices, sum, totalExpected, van, usuario]);

  // Datos para gráficos
  const datosMetodosPago = useMemo(() => {
    return [
      { name: "Cash", value: sum.cash, color: getPaymentMethodColor("efectivo") },
      { name: "Card", value: sum.card, color: getPaymentMethodColor("tarjeta") },
      { name: "Transfer", value: sum.transfer, color: getPaymentMethodColor("transferencia") },
      { name: "Mix", value: sum.mix, color: getPaymentMethodColor("otro") },
    ].filter(item => item.value > 0);
  }, [sum]);

  // Datos para el gráfico de barras por fecha
  const datosPorFecha = useMemo(() => {
    return selected
      .slice()
      .sort((a, b) => (a < b ? -1 : 1)) // Ordenar cronológicamente
      .map(d => {
        const r = rows.find(x => x.dia === d);
        return {
          date: formatUS(d),
          cash: r?.cash_expected || 0,
          card: r?.card_expected || 0,
          transfer: r?.transfer_expected || 0,
          mix: r?.mix_unallocated || 0,
          invoices: invoices[d] || 0
        };
      });
  }, [selected, rows, invoices]);

  // Verificar si el componente está montado
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  if (!isMounted) {
    return null; // Evitar renderizado antes de montar
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Pre-Closure Register
              </h1>
              <p className="text-gray-600 mt-1 sm:mt-2 text-xs sm:text-sm md:text-base">
                Select dates to process pre-closure
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => navigate("/")}
                className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-sm text-sm sm:text-base"
              >
                ← Back
              </button>
              <button
                onClick={handleGenerarPDF}
                disabled={!selected.length}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={18} />
                <span>Generate PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {mensaje && (
          <div className={`mb-6 p-4 rounded-xl shadow-lg transition-all duration-300 ${
            tipoMensaje === "error" ? "bg-red-50 border border-red-200 text-red-700" :
            tipoMensaje === "warning" ? "bg-yellow-50 border border-yellow-200 text-yellow-700" :
            tipoMensaje === "success" ? "bg-green-50 border border-green-200 text-green-700" :
            "bg-blue-50 border border-blue-200 text-blue-700"
          }`}>
            <div className="flex items-center gap-2">
              {tipoMensaje === "error" ? <AlertCircle size={20} /> :
               tipoMensaje === "warning" ? <AlertTriangle size={20} /> :
               tipoMensaje === "success" ? <CheckCircle size={20} /> :
               <FileText size={20} />}
              {mensaje}
            </div>
          </div>
        )}

        {/* Summary Panel */}
        {selected.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Selected Days Summary</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Totals */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-blue-600 text-sm font-medium">Total Expected</p>
                    <p className="text-2xl font-bold text-blue-800">{fmtCurrency(totalExpected)}</p>
                    <p className="text-xs text-gray-500 mt-1">✅ No duplications</p>
                  </div>
                  <DollarSign className="text-blue-600" size={24} />
                </div>
                
                <div className="space-y-2 mt-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cash:</span>
                    <span className="font-medium text-green-700">{fmtCurrency(sum.cash)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Card:</span>
                    <span className="font-medium text-blue-700">{fmtCurrency(sum.card)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Transfer:</span>
                    <span className="font-medium text-purple-700">{fmtCurrency(sum.transfer)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mix:</span>
                    <span className="font-medium text-amber-700">{fmtCurrency(sum.mix)}</span>
                  </div>
                </div>
              </div>
              
              {/* Selected dates */}
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-purple-600 text-sm font-medium">Selected Dates</p>
                    <p className="text-2xl font-bold text-purple-800">{selected.length}</p>
                  </div>
                  <Calendar className="text-purple-600" size={24} />
                </div>
                
                <div className="max-h-32 overflow-y-auto mt-3">
                  {selected
                    .slice()
                    .sort((a, b) => (a < b ? 1 : -1))
                    .map((d) => (
                      <div key={d} className="flex justify-between items-center py-1 border-b border-purple-100 last:border-0">
                        <span className="text-sm font-medium text-gray-700">
                          {formatUS(d)}
                          {d === todayISO && " (Today)"}
                        </span>
                        <span className="text-sm text-gray-600">
                          {invoices[d] || 0} invoices
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
            
            {/* Action button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={onProcess}
                disabled={!canProcess}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle size={18} />
                <span>Process Pre-Closure ({selected.length} {selected.length === 1 ? 'date' : 'dates'})</span>
              </button>
            </div>
          </div>
        )}

        {/* Charts */}
        {selected.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Payment methods distribution */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign size={20} />
                Payment Methods Distribution
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={datosMetodosPago}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {datosMetodosPago.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmtCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Selected dates chart */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Calendar size={20} />
                Totals by Date
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosPorFecha}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(value) => `$${value}`} />
                    <Tooltip formatter={(value) => fmtCurrency(value)} />
                    <Bar dataKey="cash" fill="#4CAF50" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="card" fill="#2196F3" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="transfer" fill="#9C27B0" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="mix" fill="#FF9800" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Dates table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Calendar size={20} />
              Pending Days ({rows.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleAll}
                disabled={rows.length === 0}
                className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {allSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Loading pending days...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="bg-red-100 rounded-full p-3 w-12 h-12 mx-auto mb-3 flex items-center justify-center">
                <AlertCircle className="text-red-500" size={24} />
              </div>
              <p className="text-red-600 font-medium">Error loading data</p>
              <p className="text-red-500 text-sm mt-1">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gray-100 rounded-full p-3 w-12 h-12 mx-auto mb-3 flex items-center justify-center">
                <CheckCircle className="text-gray-400" size={24} />
              </div>
              <p className="text-gray-500 font-medium">No pending days to close</p>
              <p className="text-gray-400 text-sm mt-1">All days have been closed or there are no transactions</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Select
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cash
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Card
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transfer
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mix
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoices
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row) => {
                    const total = row.cash_expected + row.card_expected + row.transfer_expected + row.mix_unallocated;
                    const isSelected = selected.includes(row.dia);
                    
                    return (
                      <tr 
                        key={row.dia} 
                        className={`hover:bg-blue-50 cursor-pointer ${isSelected ? "bg-blue-50" : ""}`}
                        onClick={() => toggleOne(row.dia)}
                      >
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(row.dia)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatUS(row.dia)}
                          {row.dia === todayISO && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                              Today
                            </span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">
                          {fmtCurrency(row.cash_expected)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">
                          {fmtCurrency(row.card_expected)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-purple-600 font-semibold">
                          {fmtCurrency(row.transfer_expected)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-amber-600 font-semibold">
                          {fmtCurrency(row.mix_unallocated)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                          {fmtCurrency(total)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                          {invoices[row.dia] || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Final summary */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Pre-Closure Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Available Days</div>
              <div className="text-2xl font-bold text-gray-800">{rows.length}</div>
              <div className="text-xs text-gray-500 mt-1">Pending closure</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Selected Days</div>
              <div className="text-2xl font-bold text-blue-800">{selected.length}</div>
              <div className="text-xs text-gray-500 mt-1">Total: {fmtCurrency(totalExpected)}</div>
            </div>
            <div className={`bg-white rounded-lg p-4 shadow-sm ${canProcess ? 'border-2 border-green-200' : ''}`}>
              <div className="text-sm text-gray-600 mb-1">Status</div>
              <div className={`text-2xl font-bold ${canProcess ? 'text-green-800' : 'text-gray-800'}`}>
                {canProcess ? "Ready" : "Select Dates"}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {canProcess ? `${sum.invoices} total invoices` : "Choose dates to process"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}