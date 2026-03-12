// src/CierreVan.jsx - Cierre de múltiples días con Eastern Time
// ✅ CORREGIDO: Evita duplicación de pagos usando SOLO el RPC

import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  DollarSign,
  FileText,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Calculator,
  Calendar,
  TrendingUp,
  AlertTriangle,
  X,
  Plus,
  Minus,
  Send,
  MoreHorizontal,
  CreditCard,
  Printer,
} from "lucide-react";

/* ========================= Gastos Conductor ========================= */
const EXPENSE_CATEGORIES_VAN = [
  { value: "combustible",     label: "Combustible",     icon: "⛽" },
  { value: "comida",          label: "Comida",          icon: "🍔" },
  { value: "peaje",           label: "Peaje / Toll",    icon: "🛣️" },
  { value: "estacionamiento", label: "Estacionamiento", icon: "🅿️" },
  { value: "mantenimiento",   label: "Mantenimiento",   icon: "🔧" },
  { value: "materiales",      label: "Materiales",      icon: "📦" },
  { value: "otro",            label: "Otro",            icon: "💸" },
];

/* ========================= Constants ========================= */
const PAYMENT_METHODS = {
  efectivo: { label: "Cash", color: "#4CAF50", icon: "💵" },
  tarjeta: { label: "Card", color: "#2196F3", icon: "💳" },
  transferencia: { label: "Transfer", color: "#9C27B0", icon: "🏦" },
  otro: { label: "Other", color: "#FF9800", icon: "💰" },
};

const TRANSFER_TYPES = [
  { value: "zelle", label: "Zelle", color: "#0066CC" },
  { value: "cashapp", label: "Cash App", color: "#00C244" },
  { value: "venmo", label: "Venmo", color: "#3D95CE" },
  { value: "applepay", label: "Apple Pay", color: "#000000" },
];

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

// Formato US MM/DD/YYYY a partir de 'YYYY-MM-DD'
function formatUS(isoDay) {
  if (!isoDay) return "—";
  const [y, m, d] = String(isoDay).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// Función para obtener rangos de tiempo en Eastern Time
function easternDayBounds(isoDay) {
  if (!isoDay) return { start: "", end: "" };
  
  const date = new Date(isoDay + "T00:00:00");
  const easternStart = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  easternStart.setHours(0, 0, 0, 0);
  
  const easternEnd = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  easternEnd.setHours(23, 59, 59, 999);
  
  return { 
    start: easternStart.toISOString(), 
    end: easternEnd.toISOString() 
  };
}


/* ========================= Main Component ========================= */
export default function CierreVan() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const navigate = useNavigate();
  // ============================
  // Cargar transacciones reales
  // ============================
  async function loadTransaccionesDelDia(fecha) {
    const { start, end } = easternDayBounds(fecha);

    // Probe column name for payment method (varies by schema)
    for (const col of ["metodo_pago", "metodo", "forma_pago"]) {
      const { data, error } = await supabase
        .from("pagos")
        .select(`id, monto, ${col}, created_at, cliente_id, clientes:cliente_id(nombre)`)
        .eq("van_id", van.id)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      if (!error) {
        return (data || []).map((r) => ({ ...r, metodo_pago: r[col] || "transferencia" }));
      }
    }
    // Fallback: fetch without method column
    const { data } = await supabase
      .from("pagos")
      .select("id, monto, created_at, cliente_id, clientes:cliente_id(nombre)")
      .eq("van_id", van.id)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });
    return (data || []).map((r) => ({ ...r, metodo_pago: "transferencia" }));
  }

  // Estados principales
  const [fechasSeleccionadas, setFechasSeleccionadas] = useState([]);
  const [ventasPorFecha, setVentasPorFecha] = useState({}); // Solo para mostrar lista
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [observaciones, setObservaciones] = useState("");

  // ── Gastos del conductor (multi-día) ──
  const [gastos, setGastos] = useState([]);
  const [gastosLoading, setGastosLoading] = useState(false);

  // Cargar gastos existentes cuando cambian las fechas
  useEffect(() => {
    if (!van?.id || !fechasSeleccionadas.length) return;
    setGastosLoading(true);
    (async () => {
      const { data } = await supabase
        .from("gastos_conductor")
        .select("id, fecha, categoria, descripcion, monto")
        .eq("van_id", van.id)
        .in("fecha", fechasSeleccionadas)
        .order("fecha", { ascending: true });
      setGastos(
        (data || []).map((g) => ({ ...g, _key: g.id, _saved: true }))
      );
      setGastosLoading(false);
    })();
  }, [van?.id, fechasSeleccionadas]);

  function addGasto() {
    const defaultFecha = fechasSeleccionadas[0] || new Date().toISOString().slice(0, 10);
    setGastos((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        _saved: false,
        fecha: defaultFecha,
        categoria: "combustible",
        descripcion: "",
        monto: "",
      },
    ]);
  }

  function removeGasto(key) {
    setGastos((prev) => prev.filter((g) => g._key !== key));
  }

  function updateGasto(key, field, value) {
    setGastos((prev) =>
      prev.map((g) => (g._key === key ? { ...g, [field]: value } : g))
    );
  }

  const totalGastos = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);

  // ✅ FUENTE DE VERDAD: Totales del RPC (sin duplicación)
  const [resumenPorFecha, setResumenPorFecha] = useState({});

  // Payment method input states
  const [cashInput, setCashInput] = useState("");
  const [cardInput, setCardInput] = useState("");
  const [transferInput, setTransferInput] = useState("");
  const [otherInput, setOtherInput] = useState("");

  // Payment method real values
  const [cashReal, setCashReal] = useState(0);
  const [cardReal, setCardReal] = useState(0);
  const [transferReal, setTransferReal] = useState(0);
  const [otherReal, setOtherReal] = useState(0);

  // States for breakdown modals
  const [showCashBreakdownModal, setShowCashBreakdownModal] = useState(false);
  const [showCardBreakdownModal, setShowCardBreakdownModal] = useState(false);
  const [showTransferBreakdownModal, setShowTransferBreakdownModal] = useState(false);
  const [showOtherBreakdownModal, setShowOtherBreakdownModal] = useState(false);

  const [cashCounts, setCashCounts] = useState({});
  const [cardCounts, setCardCounts] = useState({});
  const [transferCounts, setTransferCounts] = useState({});
  const [otherCounts, setOtherCounts] = useState({});

  const [cashTotal, setCashTotal] = useState(0);
  const [cardTotal, setCardTotal] = useState(0);
  const [transferTotal, setTransferTotal] = useState(0);
  const [otherTotal, setOtherTotal] = useState(0);

  // US denominations only
  const DENOMINATIONS = [
    { value: 100, label: "$100 Bill" },
    { value: 50, label: "$50 Bill" },
    { value: 20, label: "$20 Bill" },
    { value: 10, label: "$10 Bill" },
    { value: 5, label: "$5 Bill" },
    { value: 1, label: "$1 Bill" },
  ];

  /* ========================= Data Loading ========================= */

  // Cargar fechas seleccionadas del localStorage al montar
  useEffect(() => {
    try {
      const savedFechas = JSON.parse(
        localStorage.getItem("pre_cierre_fechas") || "[]"
      );
      console.log("📅 Fechas cargadas del localStorage:", savedFechas);

      if (Array.isArray(savedFechas) && savedFechas.length > 0) {
        setFechasSeleccionadas(savedFechas);
      } else {
        setMensaje("No dates selected. Please go back to Pre-Closure.");
        setTipoMensaje("warning");
      }
    } catch (e) {
      console.error("Error loading selected dates", e);
      setMensaje("Error loading selected dates");
      setTipoMensaje("error");
    }
  }, []);

  // Cargar datos cuando cambian las fechas o el van
  useEffect(() => {
    if (fechasSeleccionadas.length > 0 && van?.id) {
      cargarDatosMultiplesFechas();
    }
  }, [fechasSeleccionadas, van?.id]);

  // ✅ SOLUCIÓN: Usar SOLO el RPC para los totales esperados
  useEffect(() => {
    if (!van?.id || fechasSeleccionadas.length === 0) return;

    const loadResumen = async () => {
      try {
        const p_from = fechasSeleccionadas.reduce(
          (min, d) => (d < min ? d : min),
          fechasSeleccionadas[0]
        );
        const p_to = fechasSeleccionadas.reduce(
          (max, d) => (d > max ? d : max),
          fechasSeleccionadas[0]
        );

        console.log('📊 Cargando totales desde RPC para:', { p_from, p_to });

        // 🎯 CLAVE: Este RPC calcula correctamente sin duplicar
        const { data, error } = await supabase.rpc(
          "closeout_pre_resumen_filtrado",
          {
            p_van_id: van.id,
            p_from,
            p_to,
          }
        );

        if (error) {
          console.error("❌ RPC error:", error);
          throw error;
        }

        console.log('✅ Datos del RPC recibidos:', data);

        const map = {};
        (data || []).forEach((r) => {
          const iso = (r.dia ?? r.fecha ?? r.day ?? r.f ?? "").slice(0, 10);
          if (!iso || !fechasSeleccionadas.includes(iso)) return;

          // ✅ Estos son los totales CORRECTOS (sin duplicación)
          map[iso] = {
            cash: Number(r.cash_expected ?? 0),
            card: Number(r.card_expected ?? 0),
            transfer: Number(r.transfer_expected ?? 0),
          };

          console.log(`💰 Totales para ${iso}:`, map[iso]);
        });

        console.log("✅ Resumen completo por fecha:", map);
        setResumenPorFecha(map);
      } catch (err) {
        console.error("❌ Error loading expected totals:", err);
        setMensaje("Error loading expected totals: " + err.message);
        setTipoMensaje("error");
      }
    };

    loadResumen();
  }, [van?.id, fechasSeleccionadas]);

  // Sync input states with real values
  useEffect(() => {
    setCashReal(cashInput === "" ? 0 : Number(cashInput));
  }, [cashInput]);

  useEffect(() => {
    setCardReal(cardInput === "" ? 0 : Number(cardInput));
  }, [cardInput]);

  useEffect(() => {
    setTransferReal(transferInput === "" ? 0 : Number(transferInput));
  }, [transferInput]);

  useEffect(() => {
    setOtherReal(otherInput === "" ? 0 : Number(otherInput));
  }, [otherInput]);

  const [transacciones, setTransacciones] = useState([]);

useEffect(() => {
  if (!fechasSeleccionadas.length || !van?.id) return;

  const cargarTodas = async () => {
    let temp = [];
    for (const fecha of fechasSeleccionadas) {
      const t = await loadTransaccionesDelDia(fecha);
      temp = [...temp, ...t];
    }
    setTransacciones(
      temp.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    );
  };

  cargarTodas();
}, [fechasSeleccionadas, van?.id]);

  // ✅ Cargar ventas SOLO para mostrar la lista (NO para calcular totales)
  const cargarDatosMultiplesFechas = async () => {
    if (!van?.id || fechasSeleccionadas.length === 0) return;

    setCargando(true);
    setMensaje("Loading data for selected dates...");
    setTipoMensaje("info");

    try {
      const ventasTemp = {};

      // Cargar datos para cada fecha
      for (const fecha of fechasSeleccionadas) {
        console.log(`📅 Cargando datos para ${fecha}`);

        // Usar Eastern Time para los rangos
        const { start, end } = easternDayBounds(fecha);

        // Cargar ventas del día (solo para mostrar)
        const { data: ventas, error: ventasError } = await supabase
          .from("ventas")
          .select(`
            id, created_at, total_venta, total_pagado, estado_pago,
            cliente_id, clientes:cliente_id (id, nombre),
            pago, metodo_pago
          `)
          .eq("van_id", van.id)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });

        if (ventasError) throw ventasError;
        ventasTemp[fecha] = ventas || [];
        console.log(`✅ ${ventas?.length || 0} ventas cargadas para ${fecha}`);
      }

      setVentasPorFecha(ventasTemp);

      const totalVentas = Object.values(ventasTemp).reduce(
        (sum, v) => sum + v.length,
        0
      );

      setMensaje(
        `Loaded ${totalVentas} sales for ${fechasSeleccionadas.length} dates`
      );
      setTipoMensaje("success");
    } catch (err) {
      console.error("❌ Error loading data:", err);
      setMensaje("Error loading data: " + err.message);
      setTipoMensaje("error");
    } finally {
      setCargando(false);
    }
  };

  /* ========================= Closure Functions ========================= */

  const handleCierreVan = async () => {
    if (!van?.id || !usuario?.id) {
      setMensaje("You must select a VAN and be logged in");
      setTipoMensaje("error");
      return;
    }

    if (fechasSeleccionadas.length === 0) {
      setMensaje("No dates selected to close");
      setTipoMensaje("warning");
      return;
    }

    if (totales.diferencia > 0 && !observaciones.trim()) {
      setMensaje("You must provide a note for the discrepancy");
      setTipoMensaje("warning");
      return;
    }

    const totalReal = cashReal + cardReal + transferReal + otherReal;

    if (isNaN(totalReal) || !isFinite(totalReal)) {
      setMensaje("Invalid real amount calculated. Please check your inputs.");
      setTipoMensaje("error");
      return;
    }

    setCargando(true);
    setMensaje("Processing closure for multiple dates...");

    try {
      const detallesReales = `\n\n--- Real Amounts ---\nCash: ${fmtCurrency(
        cashReal
      )}\nCard: ${fmtCurrency(cardReal)}\nTransfer: ${fmtCurrency(
        transferReal
      )}\nOther: ${fmtCurrency(otherReal)}\nTotal Real: ${fmtCurrency(
        totalReal
      )}`;

      let observacionesCompletas = `Multi-day closure (${fechasSeleccionadas.length} dates)\nDates: ${fechasSeleccionadas.join(
        ", "
      )}\n\n${observaciones.trim()}${detallesReales}`;

      const maxObservacionesLength = 1000;
      if (observacionesCompletas.length > maxObservacionesLength) {
        observacionesCompletas =
          observacionesCompletas.substring(0, maxObservacionesLength) + "...";
      }

      // Guardar gastos del conductor
      const gastosValidos = gastos.filter((g) => Number(g.monto) > 0);
      if (gastosValidos.length) {
        await supabase
          .from("gastos_conductor")
          .delete()
          .eq("van_id", van.id)
          .in("fecha", fechasSeleccionadas);
        await supabase.from("gastos_conductor").insert(
          gastosValidos.map((g) => ({
            van_id: van.id,
            fecha: g.fecha || fechasSeleccionadas[0],
            categoria: g.categoria,
            descripcion: g.descripcion || "",
            monto: Number(g.monto) || 0,
          }))
        );
      }

      // Crear un cierre por cada fecha seleccionada
      const cierresPromises = fechasSeleccionadas.map(async (fecha) => {
        const r = resumenPorFecha[fecha] || {};
        
        // Usar los totales del RPC (sin duplicación)
        const totalEfectivo = Number(r.cash || 0);
        const totalTarjeta = Number(r.card || 0);
        const totalTransferencia = Number(r.transfer || 0);
        const totalCaja = totalEfectivo + totalTarjeta + totalTransferencia;

        // Distribución simple del real: igual para cada día
        const cajaRealFecha = totalReal / fechasSeleccionadas.length;
        const discrepanciaFecha = totalCaja - cajaRealFecha;

        // Total de ventas (solo para registro)
        const ventasFecha = ventasPorFecha[fecha] || [];
        const totalVentas = ventasFecha.reduce(
          (sum, v) => sum + Number(v.total_venta || 0),
          0
        );

        return supabase.from("cierres_dia").upsert([
          {
            van_id: van.id,
            fecha: fecha,
            usuario_id: usuario.id,
            total_ventas: totalVentas,
            total_efectivo: totalEfectivo,
            total_tarjeta: totalTarjeta,
            total_transferencia: totalTransferencia,
            total_otros: 0,
            caja_real: cajaRealFecha,
            discrepancia: discrepanciaFecha,
            observaciones: observacionesCompletas,
            cerrado: true,
            created_at: new Date().toISOString(),
          },
        ]);
      });

      const results = await Promise.all(cierresPromises);

      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        throw new Error(`Failed to close ${errors.length} dates`);
      }

      setMensaje(`Successfully closed ${fechasSeleccionadas.length} dates`);
      setTipoMensaje("success");

      // Limpiar localStorage
      localStorage.removeItem("pre_cierre_fechas");
      localStorage.removeItem("pre_cierre_fecha");

      // Redirigir después de 2 segundos
      setTimeout(() => {
        navigate("/cierres");
      }, 2000);
    } catch (err) {
      console.error("❌ Error closing dates:", err);
      setMensaje("Error registering closure: " + err.message);
      setTipoMensaje("error");
    } finally {
      setCargando(false);
    }
  };

  /* ========================= PDF Generation ========================= */
  const handleGenerarPDF = () => {
    const totalVentas = Object.values(ventasPorFecha).reduce(
      (sum, arr) =>
        sum +
        arr.reduce((s, v) => s + Number(v.total_venta || 0), 0),
      0
    );

    if (totalVentas === 0 && totales.totalCaja === 0) {
      setMensaje("No sales or payments to generate report");
      setTipoMensaje("warning");
      return;
    }

    try {
      const doc = new jsPDF();
      const businessName = "Tools4Care";
      const reportTitle = "Van Multi-Day Closure Report";

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
      doc.rect(14, 35, 182, 30, "F");
      doc.setFontSize(10);
      doc.text(
        `Dates: ${fechasSeleccionadas
          .map((f) => formatUS(f))
          .join(", ")}`,
        14,
        45
      );
      doc.text(
        `VAN: ${van?.nombre || van?.alias || "No name"}`,
        14,
        52
      );
      doc.text(`User: ${usuario?.nombre || "No name"}`, 14, 59);

      // Executive Summary
      doc.setFillColor(25, 118, 210);
      doc.rect(14, 70, 182, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Executive Summary", 14, 78);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      const summaryData = [
        ["Metric", "Value"],
        ["Number of Dates", fechasSeleccionadas.length],
        [
          "Total Sales",
          totales.totalVentas > 0
            ? fmtCurrency(totales.totalVentas)
            : "$0.00",
        ],
        [
          "Total in System",
          totales.totalCaja > 0
            ? fmtCurrency(totales.totalCaja)
            : "$0.00",
        ],
        [
          "Total Real",
          fmtCurrency(
            cashReal + cardReal + transferReal + otherReal
          ),
        ],
        [
          "Discrepancy",
          totales.diferencia > 0
            ? fmtCurrency(totales.diferencia)
            : "$0.00",
        ],
      ];

      autoTable(doc, {
        startY: 83,
        head: [summaryData[0]],
        body: summaryData.slice(1),
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: {
          fillColor: [25, 118, 210],
          textColor: 255,
          fontStyle: "bold",
        },
      });

      // Payment Methods
      const paymentY = doc.lastAutoTable.finalY + 10;
      doc.setFillColor(25, 118, 210);
      doc.rect(14, paymentY, 182, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Payment Methods Breakdown", 14, paymentY + 8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      const paymentData = [
        [
          "Method",
          "System Amount",
          "Real Amount",
          "Difference",
          "Percentage",
        ],
        [
          "Cash",
          fmtCurrency(totales.totalEfectivo),
          fmtCurrency(cashReal),
          fmtCurrency(
            Math.abs(totales.totalEfectivo - cashReal)
          ),
          `${
            totales.totalCaja > 0
              ? ((totales.totalEfectivo / totales.totalCaja) *
                  100
                ).toFixed(1)
              : "0.0"
          }%`,
        ],
        [
          "Card",
          fmtCurrency(totales.totalTarjeta),
          fmtCurrency(cardReal),
          fmtCurrency(
            Math.abs(totales.totalTarjeta - cardReal)
          ),
          `${
            totales.totalCaja > 0
              ? ((totales.totalTarjeta / totales.totalCaja) *
                  100
                ).toFixed(1)
              : "0.0"
          }%`,
        ],
        [
          "Transfer",
          fmtCurrency(totales.totalTransferencia),
          fmtCurrency(transferReal),
          fmtCurrency(
            Math.abs(
              totales.totalTransferencia - transferReal
            )
          ),
          `${
            totales.totalCaja > 0
              ? (
                  (totales.totalTransferencia /
                    totales.totalCaja) *
                  100
                ).toFixed(1)
              : "0.0"
          }%`,
        ],
        [
          "Other",
          fmtCurrency(totales.totalOtros),
          fmtCurrency(otherReal),
          fmtCurrency(
            Math.abs(totales.totalOtros - otherReal)
          ),
          `${
            totales.totalCaja > 0
              ? ((totales.totalOtros / totales.totalCaja) *
                  100
                ).toFixed(1)
              : "0.0"
          }%`,
        ],
        ["", "", "", "", ""],
        [
          "Total",
          fmtCurrency(totales.totalCaja),
          fmtCurrency(
            cashReal + cardReal + transferReal + otherReal
          ),
          fmtCurrency(totales.diferencia),
          "100%",
        ],
      ];

      autoTable(doc, {
        startY: paymentY + 12,
        head: [paymentData[0]],
        body: paymentData.slice(1),
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: {
          fillColor: [25, 118, 210],
          textColor: 255,
          fontStyle: "bold",
        },
      });

      // Notes
      if (observaciones) {
        const notesY = doc.lastAutoTable.finalY + 10;
        doc.setFillColor(25, 118, 210);
        doc.rect(14, notesY, 182, 10, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Notes", 14, notesY + 8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(observaciones, 14, notesY + 18, {
          maxWidth: 180,
        });
      }

      // Footer
      const footerY = 270;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Generated on ${new Date().toLocaleString()}`,
        14,
        footerY
      );
      doc.text(`Tools4Care Financial System`, 14, footerY + 6);

      doc.save(
        `VanClosure_${fechasSeleccionadas[0]}_${
          van?.nombre || "VAN"
        }.pdf`
      );
      setMensaje("PDF report generated successfully");
      setTipoMensaje("success");
    } catch (error) {
      setMensaje("Error generating PDF: " + error.message);
      setTipoMensaje("error");
    }
  };

  /* ========================= Cash Breakdown Functions ========================= */
  const openCashBreakdownModal = () => {
    const initialCounts = {};
    DENOMINATIONS.forEach((denom) => {
      initialCounts[denom.value] = 0;
    });
    setCashCounts(initialCounts);
    calculateCashTotal(initialCounts);
    setShowCashBreakdownModal(true);
  };

  const updateCashCount = (value, count) => {
    const numericCount = parseInt(count) || 0;
    const newCounts = { ...cashCounts, [value]: numericCount };
    setCashCounts(newCounts);
    calculateCashTotal(newCounts);
  };

  const calculateCashTotal = (counts) => {
    let total = 0;
    Object.entries(counts).forEach(([value, count]) => {
      total += Number(value) * Number(count);
    });
    setCashTotal(total);
  };

  const applyCashBreakdown = () => {
    const formattedValue = cashTotal.toFixed(2);
    setCashInput(formattedValue);
    setShowCashBreakdownModal(false);
    setMensaje(`Cash updated to ${fmtCurrency(cashTotal)}`);
    setTipoMensaje("success");
  };

  const addCashCount = (value) => {
    const newCounts = {
      ...cashCounts,
      [value]: (cashCounts[value] || 0) + 1,
    };
    setCashCounts(newCounts);
    calculateCashTotal(newCounts);
  };

  const subtractCashCount = (value) => {
    const currentCount = cashCounts[value] || 0;
    if (currentCount > 0) {
      const newCounts = {
        ...cashCounts,
        [value]: currentCount - 1,
      };
      setCashCounts(newCounts);
      calculateCashTotal(newCounts);
    }
  };

  /* ========================= Card Breakdown Functions ========================= */
  const openCardBreakdownModal = () => {
    const initialCounts = {};
    DENOMINATIONS.forEach((denom) => {
      initialCounts[denom.value] = 0;
    });
    setCardCounts(initialCounts);
    calculateCardTotal(initialCounts);
    setShowCardBreakdownModal(true);
  };

  const updateCardCount = (value, count) => {
    const numericCount = parseInt(count) || 0;
    const newCounts = { ...cardCounts, [value]: numericCount };
    setCardCounts(newCounts);
    calculateCardTotal(newCounts);
  };

  const calculateCardTotal = (counts) => {
    let total = 0;
    Object.entries(counts).forEach(([value, count]) => {
      total += Number(value) * Number(count);
    });
    setCardTotal(total);
  };

  const applyCardBreakdown = () => {
    const formattedValue = cardTotal.toFixed(2);
    setCardInput(formattedValue);
    setShowCardBreakdownModal(false);
    setMensaje(`Card payments updated to ${fmtCurrency(cardTotal)}`);
    setTipoMensaje("success");
  };

  const addCardCount = (value) => {
    const newCounts = {
      ...cardCounts,
      [value]: (cardCounts[value] || 0) + 1,
    };
    setCardCounts(newCounts);
    calculateCardTotal(newCounts);
  };

  const subtractCardCount = (value) => {
    const currentCount = cardCounts[value] || 0;
    if (currentCount > 0) {
      const newCounts = {
        ...cardCounts,
        [value]: currentCount - 1,
      };
      setCardCounts(newCounts);
      calculateCardTotal(newCounts);
    }
  };

  /* ========================= Transfer Breakdown Functions ========================= */
  const openTransferBreakdownModal = () => {
    const initialCounts = {};
    TRANSFER_TYPES.forEach((type) => {
      initialCounts[type.value] = 0;
    });
    setTransferCounts(initialCounts);
    setTransferTotal(0);
    setShowTransferBreakdownModal(true);
  };

  const updateTransferCount = (type, count) => {
    const numericCount = parseFloat(count) || 0;
    const newCounts = { ...transferCounts, [type]: numericCount };
    setTransferCounts(newCounts);
    calculateTransferTotal(newCounts);
  };

  const calculateTransferTotal = (counts) => {
    let total = 0;
    Object.entries(counts).forEach(([type, count]) => {
      total += Number(count);
    });
    setTransferTotal(total);
  };

  const applyTransferBreakdown = () => {
    const formattedValue = transferTotal.toFixed(2);
    setTransferInput(formattedValue);
    setShowTransferBreakdownModal(false);
    setMensaje(
      `Transfer payments updated to ${fmtCurrency(transferTotal)}`
    );
    setTipoMensaje("success");
  };

  const addTransferCount = (type) => {
    const newCounts = {
      ...transferCounts,
      [type]: (transferCounts[type] || 0) + 1,
    };
    setTransferCounts(newCounts);
    calculateTransferTotal(newCounts);
  };

  const subtractTransferCount = (type) => {
    const currentCount = transferCounts[type] || 0;
    if (currentCount > 0) {
      const newCounts = {
        ...transferCounts,
        [type]: currentCount - 1,
      };
      setTransferCounts(newCounts);
      calculateTransferTotal(newCounts);
    }
  };

  /* ========================= Other Breakdown Functions ========================= */
  const openOtherBreakdownModal = () => {
    const initialCounts = {};
    DENOMINATIONS.forEach((denom) => {
      initialCounts[denom.value] = 0;
    });
    setOtherCounts(initialCounts);
    calculateOtherTotal(initialCounts);
    setShowOtherBreakdownModal(true);
  };

  const updateOtherCount = (value, count) => {
    const numericCount = parseInt(count) || 0;
    const newCounts = { ...otherCounts, [value]: numericCount };
    setOtherCounts(newCounts);
    calculateOtherTotal(newCounts);
  };

  const calculateOtherTotal = (counts) => {
    let total = 0;
    Object.entries(counts).forEach(([value, count]) => {
      total += Number(value) * Number(count);
    });
    setOtherTotal(total);
  };

  const applyOtherBreakdown = () => {
    const formattedValue = otherTotal.toFixed(2);
    setOtherInput(formattedValue);
    setShowOtherBreakdownModal(false);
    setMensaje(
      `Other payments updated to ${fmtCurrency(otherTotal)}`
    );
    setTipoMensaje("success");
  };

  const addOtherCount = (value) => {
    const newCounts = {
      ...otherCounts,
      [value]: (otherCounts[value] || 0) + 1,
    };
    setOtherCounts(newCounts);
    calculateOtherTotal(newCounts);
  };

  const subtractOtherCount = (value) => {
    const currentCount = otherCounts[value] || 0;
    if (currentCount > 0) {
      const newCounts = {
        ...otherCounts,
        [value]: currentCount - 1,
      };
      setOtherCounts(newCounts);
      calculateOtherTotal(newCounts);
    }
  };

  /* ========================= Calculated Totals ========================= */
  
  // ✅ CORRECCIÓN PRINCIPAL: Usar SOLO resumenPorFecha del RPC
  const totales = useMemo(() => {
    // Total de ventas (solo para display)
    const todasLasVentas = Object.values(ventasPorFecha).flat();
    let totalVentas = 0;
    todasLasVentas.forEach((venta) => {
      totalVentas += Number(venta.total_venta || 0);
    });

    // 🎯 TOTALES DE COBRADO: usar SOLO el RPC (sin duplicación)
    let totalEfectivo = 0;
    let totalTarjeta = 0;
    let totalTransferencia = 0;

    fechasSeleccionadas.forEach((fecha) => {
      const r = resumenPorFecha[fecha];
      if (!r) return;
      
      totalEfectivo += Number(r.cash || 0);
      totalTarjeta += Number(r.card || 0);
      totalTransferencia += Number(r.transfer || 0);
      
      console.log(`📊 Sumando ${fecha}:`, {
        cash: r.cash,
        card: r.card,
        transfer: r.transfer
      });
    });

    const totalCaja = totalEfectivo + totalTarjeta + totalTransferencia;
    const gastosTotal = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
    // Cash neto = efectivo esperado - gastos del conductor
    const efectivoNeto = totalEfectivo - gastosTotal;
    const totalCajaNeto = efectivoNeto + totalTarjeta + totalTransferencia;
    const totalReal = cashReal + cardReal + transferReal + otherReal;
    const diferencia = Math.abs(totalCajaNeto - totalReal);

    console.log('💰 TOTALES FINALES:', {
      totalEfectivo,
      totalTarjeta,
      totalTransferencia,
      totalCaja,
      totalReal,
      diferencia
    });

    return {
      totalVentas,        // Solo para display
      totalEfectivo,      // Del RPC ✅
      totalTarjeta,       // Del RPC ✅
      totalTransferencia, // Del RPC ✅
      totalOtros: 0,
      totalCaja,
      gastosTotal,
      efectivoNeto,
      totalCajaNeto,
      diferencia,
    };
  }, [
    ventasPorFecha,     // Solo para total de ventas (display)
    resumenPorFecha,    // ✅ FUENTE DE VERDAD
    fechasSeleccionadas,
    cashReal,
    cardReal,
    transferReal,
    otherReal,
    gastos,
  ]);

  /* ========================= Combined Transactions List ========================= */
  const transaccionesCompletas = useMemo(() => {
    const TRANSFER_LABEL = { zelle: "Zelle", cashapp: "Cash App", venmo: "Venmo", applepay: "Apple Pay" };
    const TRANSFER_COLOR = { zelle: "#0066CC", cashapp: "#00C244", venmo: "#3D95CE", applepay: "#000000" };

    // Sales from ventasPorFecha
    const ventas = Object.values(ventasPorFecha).flat().map((v) => {
      const metodo = v.metodo_pago || "efectivo";
      // Find transfer sub-type
      let subMetodo = null;
      let subColor = null;
      if (metodo === "transferencia" || metodo === "mix") {
        const det = v.pago?.transferencia_detalle;
        if (det) {
          // pick the sub-type with the highest amount
          const max = Object.entries(det)
            .filter(([k]) => k !== "other")
            .sort(([, a], [, b]) => b - a)[0];
          if (max && Number(max[1]) > 0) {
            subMetodo = TRANSFER_LABEL[max[0]] || null;
            subColor = TRANSFER_COLOR[max[0]] || null;
          }
        } else if (v.pago?.metodos) {
          const tm = v.pago.metodos.find((m) => m.forma === "transferencia" && m.subMetodo);
          if (tm) {
            subMetodo = TRANSFER_LABEL[tm.subMetodo] || tm.subMetodo;
            subColor = TRANSFER_COLOR[tm.subMetodo] || null;
          }
        }
      }
      return {
        id: v.id,
        created_at: v.created_at,
        tipo: "sale",
        cliente: v.clientes?.nombre || "Walk-in",
        metodo,
        subMetodo,
        subColor,
        monto: Number(v.total_pagado || v.total_venta || 0),
        estado: v.estado_pago,
      };
    });

    // Payments (abonos) from transacciones
    const pagos = transacciones.map((t) => ({
      id: "p-" + t.id,
      created_at: t.created_at,
      tipo: "payment",
      cliente: t.clientes?.nombre || "Walk-in",
      metodo: t.metodo_pago || "efectivo",
      subMetodo: null,
      subColor: null,
      monto: Number(t.monto || 0),
      estado: null,
    }));

    return [...ventas, ...pagos].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
  }, [ventasPorFecha, transacciones]);

  /* ========================= Transfer Sub-type Breakdown from Sales ========================= */
  const transferDesgloseSistema = useMemo(() => {
    const result = { zelle: 0, cashapp: 0, venmo: 0, applepay: 0, other: 0 };
    Object.values(ventasPorFecha).flat().forEach((venta) => {
      const pago = venta.pago;
      if (!pago) return;
      const detalle = pago.transferencia_detalle;
      if (detalle) {
        result.zelle += Number(detalle.zelle || 0);
        result.cashapp += Number(detalle.cashapp || 0);
        result.venmo += Number(detalle.venmo || 0);
        result.applepay += Number(detalle.applepay || 0);
        result.other += Number(detalle.other || 0);
      } else if (pago.metodos) {
        pago.metodos.forEach((m) => {
          if (m.forma === "transferencia") {
            const sub = m.subMetodo;
            const key = ["zelle", "cashapp", "venmo", "applepay"].includes(sub) ? sub : "other";
            result[key] += Number(m.monto || 0);
          }
        });
      }
    });
    return result;
  }, [ventasPorFecha]);

  /* ========================= Chart Data ========================= */
  const datosMetodosPago = useMemo(() => {
    return [
      {
        name: "Cash",
        value: totales.totalEfectivo,
        color: getPaymentMethodColor("efectivo"),
      },
      {
        name: "Card",
        value: totales.totalTarjeta,
        color: getPaymentMethodColor("tarjeta"),
      },
      {
        name: "Transfer",
        value: totales.totalTransferencia,
        color: getPaymentMethodColor("transferencia"),
      },
    ].filter((item) => item.value > 0);
  }, [totales]);

  // Datos por fecha para gráfico y tabla
  const datosPorFecha = useMemo(() => {
    return fechasSeleccionadas.map((fecha) => {
      const r = resumenPorFecha[fecha] || {
        cash: 0,
        card: 0,
        transfer: 0,
      };
      const total =
        Number(r.cash || 0) +
        Number(r.card || 0) +
        Number(r.transfer || 0);

      return {
        fecha: formatUS(fecha),
        cash: Number(r.cash || 0),
        card: Number(r.card || 0),
        transfer: Number(r.transfer || 0),
        total,
      };
    });
  }, [fechasSeleccionadas, resumenPorFecha]);

  /* ========================= Rendering ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Van Multi-Day Closure
              </h1>
              <p className="text-gray-600 mt-1 sm:mt-2 text-xs sm:text-sm md:text-base">
                Closing {fechasSeleccionadas.length} selected date
                {fechasSeleccionadas.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => navigate("/cierres/pre")}
                className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-sm text-sm sm:text-base"
              >
                ← Back
              </button>
              <button
                onClick={handleGenerarPDF}
                disabled={cargando || fechasSeleccionadas.length === 0}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer size={18} />
                <span>Generate PDF</span>
              </button>
              <button
                onClick={cargarDatosMultiplesFechas}
                disabled={cargando}
                className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-sm text-sm sm:text-base"
              >
                <RefreshCw
                  size={18}
                  className={cargando ? "animate-spin" : ""}
                />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {mensaje && (
          <div
            className={`mb-6 p-4 rounded-xl shadow-lg transition-all duration-300 ${
              tipoMensaje === "error"
                ? "bg-red-50 border border-red-200 text-red-700"
                : tipoMensaje === "warning"
                ? "bg-yellow-50 border border-yellow-200 text-yellow-700"
                : tipoMensaje === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-blue-50 border border-blue-200 text-blue-700"
            }`}
          >
            <div className="flex items-center gap-2">
              {tipoMensaje === "error" ? (
                <AlertCircle size={20} />
              ) : tipoMensaje === "warning" ? (
                <AlertTriangle size={20} />
              ) : tipoMensaje === "success" ? (
                <CheckCircle size={20} />
              ) : (
                <FileText size={20} />
              )}
              {mensaje}
            </div>
          </div>
        )}

        {/* Selected Dates Panel */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={20} />
            Selected Dates ({fechasSeleccionadas.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {fechasSeleccionadas.map((fecha) => (
              <div
                key={fecha}
                className="bg-blue-100 text-blue-800 px-3 py-1 rounded-lg font-medium text-sm"
              >
                {formatUS(fecha)}
              </div>
            ))}
          </div>
        </div>

        {/* Payment Methods Panel */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            Payment Methods Count (Combined Total)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Cash */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-green-600">
                    <DollarSign size={20} />
                  </div>
                  <span className="font-medium text-gray-700">
                    Cash
                  </span>
                </div>
                <button
                  onClick={openCashBreakdownModal}
                  className="bg-green-100 hover:bg-green-200 text-green-700 p-2 rounded-lg transition-colors"
                  title="Quick cash count"
                >
                  <Calculator size={16} />
                </button>
              </div>

              <div className="mb-2">
                <p className="text-sm text-gray-600">System Total (from RPC)</p>
                <p className="text-lg font-bold text-green-800">
                  {totales.totalEfectivo > 0
                    ? fmtCurrency(totales.totalEfectivo)
                    : "$0.00"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ✅ No duplications
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600">
                  What I Have
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <input
                    type="text"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-blue-600">
                    <CreditCard size={20} />
                  </div>
                  <span className="font-medium text-gray-700">
                    Card
                  </span>
                </div>
                <button
                  onClick={openCardBreakdownModal}
                  className="bg-blue-100 hover:bg-blue-200 text-blue-700 p-2 rounded-lg transition-colors"
                  title="Quick card count"
                >
                  <Calculator size={16} />
                </button>
              </div>

              <div className="mb-2">
                <p className="text-sm text-gray-600">System Total (from RPC)</p>
                <p className="text-lg font-bold text-blue-800">
                  {totales.totalTarjeta > 0
                    ? fmtCurrency(totales.totalTarjeta)
                    : "$0.00"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ✅ No duplications
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600">
                  What I Have
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <input
                    type="text"
                    value={cardInput}
                    onChange={(e) => setCardInput(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Transfer */}
            <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-purple-600">
                    <Send size={20} />
                  </div>
                  <span className="font-medium text-gray-700">
                    Transfer
                  </span>
                </div>
                <button
                  onClick={openTransferBreakdownModal}
                  className="bg-purple-100 hover:bg-purple-200 text-purple-700 p-2 rounded-lg transition-colors"
                  title="Quick transfer count"
                >
                  <Calculator size={16} />
                </button>
              </div>

              <div className="mb-2">
                <p className="text-sm text-gray-600">System Total (from RPC)</p>
                <p className="text-lg font-bold text-purple-800">
                  {totales.totalTransferencia > 0
                    ? fmtCurrency(totales.totalTransferencia)
                    : "$0.00"}
                </p>
                {totales.totalTransferencia > 0 && (
                  <div className="mt-2 space-y-1 border-t border-purple-200 pt-2">
                    {TRANSFER_TYPES.map((type) => {
                      const amt = transferDesgloseSistema[type.value] || 0;
                      if (amt === 0) return null;
                      return (
                        <div key={type.value} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-gray-600">
                            <span
                              className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                              style={{ backgroundColor: type.color }}
                            />
                            {type.label}
                          </span>
                          <span className="font-semibold text-purple-700">{fmtCurrency(amt)}</span>
                        </div>
                      );
                    })}
                    {transferDesgloseSistema.other > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-gray-600">
                          <span className="w-2 h-2 rounded-full inline-block flex-shrink-0 bg-gray-400" />
                          Other
                        </span>
                        <span className="font-semibold text-purple-700">{fmtCurrency(transferDesgloseSistema.other)}</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  ✅ No duplications
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600">
                  What I Have
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <input
                    type="text"
                    value={transferInput}
                    onChange={(e) =>
                      setTransferInput(e.target.value)
                    }
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Other */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-amber-600">
                    <MoreHorizontal size={20} />
                  </div>
                  <span className="font-medium text-gray-700">
                    Other
                  </span>
                </div>
                <button
                  onClick={openOtherBreakdownModal}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-700 p-2 rounded-lg transition-colors"
                  title="Quick other count"
                >
                  <Calculator size={16} />
                </button>
              </div>

              <div className="mb-2">
                <p className="text-sm text-gray-600">System Total</p>
                <p className="text-lg font-bold text-amber-800">
                  {totales.totalOtros > 0
                    ? fmtCurrency(totales.totalOtros)
                    : "$0.00"}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600">
                  What I Have
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <input
                    type="text"
                    value={otherInput}
                    onChange={(e) => setOtherInput(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Control panel */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="flex flex-col gap-4">

            {/* ── Gastos del Conductor ── */}
            <div className="border-2 border-orange-200 rounded-xl overflow-hidden">
              <div className="bg-orange-50 px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-orange-900 text-sm">⛽ Gastos del Conductor</div>
                  <div className="text-xs text-orange-600 mt-0.5">
                    Se descuentan del efectivo en mano antes del cierre
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-orange-500 font-semibold uppercase">Total</div>
                  <div className="text-xl font-extrabold text-orange-700">
                    {fmtCurrency(totalGastos)}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-white space-y-2">
                {gastosLoading ? (
                  <div className="text-sm text-gray-400 py-2 text-center">Cargando gastos…</div>
                ) : gastos.length === 0 ? (
                  <div className="text-sm text-gray-400 py-2 text-center">
                    Sin gastos registrados
                  </div>
                ) : (
                  gastos.map((g) => (
                    <div key={g._key} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      {fechasSeleccionadas.length > 1 && (
                        <select
                          value={g.fecha}
                          onChange={(e) => updateGasto(g._key, "fecha", e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-xs bg-white w-32 shrink-0"
                        >
                          {fechasSeleccionadas.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      )}
                      <select
                        value={g.categoria}
                        onChange={(e) => updateGasto(g._key, "categoria", e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm bg-white shrink-0 w-40"
                      >
                        {EXPENSE_CATEGORIES_VAN.map((c) => (
                          <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Descripción"
                        value={g.descripcion}
                        onChange={(e) => updateGasto(g._key, "descripcion", e.target.value)}
                        className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-0"
                      />
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={g.monto}
                          onChange={(e) => updateGasto(g._key, "monto", e.target.value)}
                          className="border rounded-lg pl-6 pr-2 py-1.5 text-sm w-full font-semibold"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGasto(g._key)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}

                <button
                  type="button"
                  onClick={addGasto}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 text-sm font-medium transition-colors"
                >
                  <Plus size={14} />
                  Agregar gasto
                </button>

                {totales.gastosTotal > 0 && (
                  <div className="bg-orange-50 rounded-lg p-3 border border-orange-200 text-sm space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Efectivo bruto esperado:</span>
                      <span className="font-medium">{fmtCurrency(totales.totalEfectivo)}</span>
                    </div>
                    <div className="flex justify-between text-orange-700">
                      <span>– Gastos del conductor:</span>
                      <span className="font-medium">–{fmtCurrency(totales.gastosTotal)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-orange-200">
                      <span>= Efectivo neto a entregar:</span>
                      <span className="text-green-700">{fmtCurrency(totales.efectivoNeto)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes {totales.diferencia > 0 && "(required)"}
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={2}
                placeholder="Indicate reason for discrepancy (if applicable)"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={handleGenerarPDF}
              disabled={cargando || fechasSeleccionadas.length === 0}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={18} />
              <span>Generate PDF Report</span>
            </button>

            <button
              onClick={handleCierreVan}
              disabled={
                cargando ||
                (totales.diferencia > 0 &&
                  !observaciones.trim())
              }
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cargando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Closing...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  <span>Close All Dates</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium">
                  Total Sales
                </p>
                <p className="text-2xl font-bold text-blue-800">
                  {totales.totalVentas > 0
                    ? fmtCurrency(totales.totalVentas)
                    : "$0.00"}
                </p>
              </div>
              <DollarSign className="text-blue-600" size={24} />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 text-sm font-medium">
                  Total in System
                </p>
                <p className="text-2xl font-bold text-green-800">
                  {totales.totalCaja > 0
                    ? fmtCurrency(totales.totalCaja)
                    : "$0.00"}
                </p>
              </div>
              <Calculator
                className="text-green-600"
                size={24}
              />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-600 text-sm font-medium">
                  Total Real
                </p>
                <p className="text-2xl font-bold text-purple-800">
                  {fmtCurrency(
                    cashReal +
                      cardReal +
                      transferReal +
                      otherReal
                  )}
                </p>
              </div>
              <TrendingUp
                className="text-purple-600"
                size={24}
              />
            </div>
          </div>

          <div
            className={`bg-gradient-to-br rounded-xl p-4 border ${
              totales.diferencia === 0
                ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200"
                : "bg-gradient-to-br from-red-50 to-rose-50 border-red-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className={`text-sm font-medium ${
                    totales.diferencia === 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  Discrepancy
                </p>
                <p
                  className={`text-2xl font-bold ${
                    totales.diferencia === 0
                      ? "text-green-800"
                      : "text-red-800"
                  }`}
                >
                  {totales.diferencia > 0
                    ? fmtCurrency(totales.diferencia)
                    : "$0.00"}
                </p>
              </div>
              {totales.diferencia === 0 ? (
                <CheckCircle
                  className="text-green-600"
                  size={24}
                />
              ) : (
                <AlertTriangle
                  className="text-red-600"
                  size={24}
                />
              )}
            </div>
          </div>
        </div>

        {/* Loading indicator */}
        {cargando && (
          <div className="flex justify-center items-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">
              Loading data...
            </span>
          </div>
        )}

        {/* Charts and Transactions */}
        {!cargando && fechasSeleccionadas.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Payment methods */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign size={20} />
                Payment Methods
              </h3>
              <div className="h-64">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>
                    <Pie
                      data={datosMetodosPago}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name}: ${(percent * 100).toFixed(
                          0
                        )}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {datosMetodosPago.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) =>
                        fmtCurrency(value)
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>


{/* Recent Transactions List */}
<div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
      <FileText size={20} />
      Recent Transactions
    </h3>
    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
      {transaccionesCompletas.length} total
    </span>
  </div>

  {transaccionesCompletas.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
      <FileText size={36} className="mb-2 opacity-30" />
      <p className="text-sm">No transactions for selected dates</p>
    </div>
  ) : (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {transaccionesCompletas.map((t) => {
        const isTransfer = t.metodo === "transferencia" || t.metodo === "mix";
        const methodColor =
          t.metodo === "efectivo" ? "bg-green-100 text-green-800"
          : t.metodo === "tarjeta" ? "bg-blue-100 text-blue-800"
          : isTransfer ? "bg-purple-100 text-purple-800"
          : "bg-amber-100 text-amber-800";
        const methodLabel =
          t.metodo === "efectivo" ? "Cash"
          : t.metodo === "tarjeta" ? "Card"
          : t.metodo === "mix" ? "Mix"
          : isTransfer ? "Transfer"
          : t.metodo || "Other";
        return (
          <div
            key={t.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {t.cliente}
                </p>
                <span className={`px-1.5 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${
                  t.tipo === "sale" ? "bg-sky-100 text-sky-700" : "bg-orange-100 text-orange-700"
                }`}>
                  {t.tipo === "sale" ? "Sale" : "Payment"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${methodColor}`}>
                  {methodLabel}
                </span>
                {isTransfer && t.subMetodo && (
                  <span
                    className="px-2 py-0.5 text-xs font-semibold rounded-full text-white"
                    style={{ backgroundColor: t.subColor || "#9C27B0" }}
                  >
                    {t.subMetodo}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(t.created_at).toLocaleDateString("en-US", {
                    month: "short", day: "numeric",
                  })}{" "}
                  {new Date(t.created_at).toLocaleTimeString("en-US", {
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
            <div className="ml-3 flex-shrink-0 text-right">
              <p className="text-sm font-bold text-gray-900">
                {fmtCurrency(t.monto)}
              </p>
              {t.estado && t.estado !== "pagado" && (
                <p className="text-xs text-amber-600 font-medium capitalize">{t.estado}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>
          </div>
        )}

        {/* Breakdown by date table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FileText size={20} />
              Breakdown by Date
            </h3>
          </div>

          {cargando ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : fechasSeleccionadas.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gray-100 rounded-full p-3 w-12 h-12 mx-auto mb-3 flex items-center justify-center">
                <Calendar className="text-gray-400" size={24} />
              </div>
              <p className="text-gray-500 font-medium">
                No dates selected
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Please go back and select dates to close
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sales
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
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {datosPorFecha.map((dato, idx) => {
                    const fechaISO =
                      fechasSeleccionadas[idx];
                    return (
                      <tr
                        key={dato.fecha}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {dato.fecha}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {(ventasPorFecha[fechaISO] ||
                            []).length}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">
                          {fmtCurrency(dato.cash)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">
                          {fmtCurrency(dato.card)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-purple-600 font-semibold">
                          {fmtCurrency(dato.transfer)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                          {fmtCurrency(dato.total)}
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
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            Final Multi-Day Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">
                Total Dates
              </div>
              <div className="text-2xl font-bold text-blue-800">
                {fechasSeleccionadas.length}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">
                Total Money in System
              </div>
              <div className="text-2xl font-bold text-green-800">
                {totales.totalCaja > 0
                  ? fmtCurrency(totales.totalCaja)
                  : "$0.00"}
              </div>
            </div>
            <div
              className={`bg-white rounded-lg p-4 shadow-sm ${
                totales.diferencia === 0
                  ? "border-green-200"
                  : "border-red-200"
              }`}
            >
              <div className="text-sm text-gray-600 mb-1">
                Closure Status
              </div>
              <div
                className={`text-2xl font-bold ${
                  totales.diferencia === 0
                    ? "text-green-800"
                    : "text-red-800"
                }`}
              >
                {totales.diferencia === 0
                  ? "Balanced"
                  : "Discrepancy"}
              </div>
            </div>
          </div>
       </div>
      </div>

      

      {/* Cash breakdown modal */}

      {showCashBreakdownModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                Quick Cash Count
              </h3>
              <button
                onClick={() =>
                  setShowCashBreakdownModal(false)
                }
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-grow">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-gray-700">
                    Enter the count for each denomination:
                  </p>
                  <div className="text-xl font-bold text-green-700">
                    Total: {fmtCurrency(cashTotal)}
                  </div>
                </div>
                <div className="space-y-3">
                  {DENOMINATIONS.map((denom) => (
                    <div
                      key={denom.value}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="font-medium text-gray-700">
                        {denom.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            subtractCashCount(denom.value)
                          }
                          className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="text"
                          value={String(
                            cashCounts[denom.value] || 0
                          ).padStart(1, "0")}
                          onChange={(e) =>
                            updateCashCount(
                              denom.value,
                              e.target.value
                            )
                          }
                          className="w-16 text-center border border-gray-300 rounded-lg py-1 px-2"
                        />
                        <button
                          onClick={() =>
                            addCashCount(denom.value)
                          }
                          className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="font-medium text-gray-900">
                        {fmtCurrency(
                          (cashCounts[denom.value] || 0) *
                            denom.value
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between">
              <button
                onClick={() =>
                  setShowCashBreakdownModal(false)
                }
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyCashBreakdown}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <CheckCircle size={18} />
                Apply to Cash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card breakdown modal */}
      {showCardBreakdownModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                Quick Card Count
              </h3>
              <button
                onClick={() =>
                  setShowCardBreakdownModal(false)
                }
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-grow">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-gray-700">
                    Enter the count for each denomination:
                  </p>
                  <div className="text-xl font-bold text-blue-700">
                    Total: {fmtCurrency(cardTotal)}
                  </div>
                </div>
                <div className="space-y-3">
                  {DENOMINATIONS.map((denom) => (
                    <div
                      key={denom.value}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="font-medium text-gray-700">
                        {denom.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            subtractCardCount(denom.value)
                          }
                          className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="text"
                          value={String(
                            cardCounts[denom.value] || 0
                          ).padStart(1, "0")}
                          onChange={(e) =>
                            updateCardCount(
                              denom.value,
                              e.target.value
                            )
                          }
                          className="w-16 text-center border border-gray-300 rounded-lg py-1 px-2"
                        />
                        <button
                          onClick={() =>
                            addCardCount(denom.value)
                          }
                          className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="font-medium text-gray-900">
                        {fmtCurrency(
                          (cardCounts[denom.value] || 0) *
                            denom.value
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between">
              <button
                onClick={() =>
                  setShowCardBreakdownModal(false)
                }
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyCardBreakdown}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <CheckCircle size={18} />
                Apply to Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer breakdown modal */}
      {showTransferBreakdownModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                Transfer Breakdown
              </h3>
              <button
                onClick={() => setShowTransferBreakdownModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-grow">
              {/* System breakdown from sales */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
                  From Sales (System)
                </p>
                <div className="space-y-1">
                  {TRANSFER_TYPES.map((type) => {
                    const sysAmt = transferDesgloseSistema[type.value] || 0;
                    return (
                      <div key={type.value} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-gray-600">
                          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: type.color }} />
                          {type.label}
                        </span>
                        <span className={`font-semibold ${sysAmt > 0 ? "text-purple-700" : "text-gray-400"}`}>
                          {fmtCurrency(sysAmt)}
                        </span>
                      </div>
                    );
                  })}
                  {transferDesgloseSistema.other > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-gray-600">
                        <span className="w-3 h-3 rounded-full inline-block bg-gray-400" />
                        Other
                      </span>
                      <span className="font-semibold text-purple-700">{fmtCurrency(transferDesgloseSistema.other)}</span>
                    </div>
                  )}
                  <div className="border-t border-purple-200 pt-1 mt-1 flex justify-between text-sm font-bold text-purple-800">
                    <span>Total Expected</span>
                    <span>{fmtCurrency(totales.totalTransferencia)}</span>
                  </div>
                </div>
              </div>

              {/* Manual "What I Have" per type */}
              <p className="text-sm font-semibold text-gray-700 mb-3">
                What I Have (enter dollar amounts):
              </p>
              <div className="space-y-3">
                {TRANSFER_TYPES.map((type) => {
                  const sysAmt = transferDesgloseSistema[type.value] || 0;
                  const myAmt = Number(transferCounts[type.value] || 0);
                  const diff = myAmt - sysAmt;
                  return (
                    <div key={type.value} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: type.color }} />
                          <span className="font-medium text-gray-700">{type.label}</span>
                        </div>
                        {sysAmt > 0 && (
                          <span className="text-xs text-gray-500">
                            Expected: {fmtCurrency(sysAmt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => subtractTransferCount(type.value)}
                          className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors flex-shrink-0"
                        >
                          <Minus size={16} />
                        </button>
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={transferCounts[type.value] || 0}
                            onChange={(e) => updateTransferCount(type.value, e.target.value)}
                            className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                        <button
                          onClick={() => addTransferCount(type.value)}
                          className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors flex-shrink-0"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      {myAmt > 0 && sysAmt > 0 && diff !== 0 && (
                        <p className={`text-xs mt-1 ${diff > 0 ? "text-green-600" : "text-red-500"}`}>
                          {diff > 0 ? "+" : ""}{fmtCurrency(diff)} vs expected
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between items-center">
              <div className="text-lg font-bold text-purple-700">
                Total: {fmtCurrency(transferTotal)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTransferBreakdownModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={applyTransferBreakdown}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <CheckCircle size={18} />
                  Apply to Transfer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other breakdown modal */}
      {showOtherBreakdownModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                Quick Other Count
              </h3>
              <button
                onClick={() =>
                  setShowOtherBreakdownModal(false)
                }
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-grow">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-gray-700">
                    Enter the count for each denomination:
                  </p>
                  <div className="text-xl font-bold text-amber-700">
                    Total: {fmtCurrency(otherTotal)}
                  </div>
                </div>
                <div className="space-y-3">
                  {DENOMINATIONS.map((denom) => (
                    <div
                      key={denom.value}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="font-medium text-gray-700">
                        {denom.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            subtractOtherCount(denom.value)
                          }
                          className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="text"
                          value={String(
                            otherCounts[denom.value] || 0
                          ).padStart(1, "0")}
                          onChange={(e) =>
                            updateOtherCount(
                              denom.value,
                              e.target.value
                            )
                          }
                          className="w-16 text-center border border-gray-300 rounded-lg py-1 px-2"
                        />
                        <button
                          onClick={() =>
                            addOtherCount(denom.value)
                          }
                          className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="font-medium text-gray-900">
                        {fmtCurrency(
                          (otherCounts[denom.value] || 0) *
                            denom.value
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between">
              <button
                onClick={() =>
                  setShowOtherBreakdownModal(false)
                }
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyOtherBreakdown}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <CheckCircle size={18} />
                Apply to Other
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}