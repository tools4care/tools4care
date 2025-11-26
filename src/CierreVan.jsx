// src/CierreVan.jsx - Cierre de múltiples días con Eastern Time

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

/* ========================= Main Component ========================= */
export default function CierreVan() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const navigate = useNavigate();

  // Estados principales
  const [fechasSeleccionadas, setFechasSeleccionadas] = useState([]);
  const [ventasPorFecha, setVentasPorFecha] = useState({}); // { "2025-11-22": [...ventas] }
  const [pagosPorFecha, setPagosPorFecha] = useState({}); // { "2025-11-22": [...pagos] }
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [observaciones, setObservaciones] = useState("");

  // Totales "esperados" por fecha (mismas cifras que PreCierre / RPC)
  // { "2025-11-23": { cash, card, transfer, mix } }
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

  // Cargar datos cuando cambien las fechas o el van
  useEffect(() => {
    if (fechasSeleccionadas.length > 0 && van?.id) {
      cargarDatosMultiplesFechas();
    }
  }, [fechasSeleccionadas, van?.id]);

  // ✅ Cargar TOTALES ESPERADOS usando el MISMO RPC que PreCierre
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

      const { data, error } = await supabase.rpc(
        "closeout_pre_resumen_filtrado",
        {
          p_van_id: van.id,
          p_from,
          p_to,
        }
      );

      if (error) {
        console.error("RPC error en CierreVan:", error);
        throw error;
      }

      const map = {};
      (data || []).forEach((r) => {
        const iso = (r.dia ?? r.fecha ?? r.day ?? r.f ?? "").slice(0, 10);
        if (!iso) return;
        if (!fechasSeleccionadas.includes(iso)) return;

        // ✅ SOLO 3 CAMPOS AHORA (sin mix)
        map[iso] = {
          cash: Number(r.cash_expected ?? 0),
          card: Number(r.card_expected ?? 0),
          transfer: Number(r.transfer_expected ?? 0),
        };
      });

      console.log("✅ Resumen esperado por fecha (Cierre):", map);
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

  // ✅ Cargar ventas y pagos para MÚLTIPLES FECHAS con Eastern Time
  const cargarDatosMultiplesFechas = async () => {
    if (!van?.id || fechasSeleccionadas.length === 0) return;

    setCargando(true);
    setMensaje("Loading data for selected dates...");
    setTipoMensaje("info");

    try {
      const ventasTemp = {};
      const pagosTemp = {};

      // Cargar datos para cada fecha
      for (const fecha of fechasSeleccionadas) {
        console.log(`📅 Cargando datos para ${fecha}`);

        // Usar Eastern Time para los rangos
        const inicioDia = `${fecha}T00:00:00-05:00`; // Medianoche ET
        const finDia = `${fecha}T23:59:59-05:00`; // 11:59 PM ET

        // Cargar ventas
        const { data: ventas, error: ventasError } = await supabase
          .from("ventas")
          .select(
            `
            id, created_at, total_venta, total_pagado, estado_pago,
            cliente_id, clientes:cliente_id (id, nombre), pago, van_id, usuario_id
          `
          )
          .eq("van_id", van.id)
          .gte("created_at", inicioDia)
          .lte("created_at", finDia)
          .order("created_at", { ascending: false });

        if (ventasError) throw ventasError;
        ventasTemp[fecha] = ventas || [];
        console.log(`✅ ${ventas?.length || 0} ventas cargadas para ${fecha}`);

        // Cargar pagos directos
        const { data: pagos, error: pagosError } = await supabase
          .from("pagos")
          .select(
            `
            id, fecha_pago, monto, metodo_pago,
            cliente_id, clientes:cliente_id (id, nombre), van_id, usuario_id
          `
          )
          .eq("van_id", van.id)
          .gte("fecha_pago", inicioDia)
          .lte("fecha_pago", finDia)
          .order("fecha_pago", { ascending: false });

        if (pagosError) throw pagosError;
        pagosTemp[fecha] = pagos || [];
        console.log(`✅ ${pagos?.length || 0} pagos cargados para ${fecha}`);
      }

      setVentasPorFecha(ventasTemp);
      setPagosPorFecha(pagosTemp);

      const totalVentas = Object.values(ventasTemp).reduce(
        (sum, v) => sum + v.length,
        0
      );
      const totalPagos = Object.values(pagosTemp).reduce(
        (sum, p) => sum + p.length,
        0
      );

      setMensaje(
        `Loaded ${totalVentas} sales and ${totalPagos} payments for ${fechasSeleccionadas.length} dates`
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

      // Crear un cierre por cada fecha seleccionada
      const cierresPromises = fechasSeleccionadas.map(async (fecha) => {
        const ventasFecha = ventasPorFecha[fecha] || [];
        const totalesFecha = calcularTotalesPorFecha(fecha, ventasFecha);

        // Distribución simple del real: igual para cada día
        const cajaRealFecha = totalReal / fechasSeleccionadas.length;
        const discrepanciaFecha = totalesFecha.totalCaja - cajaRealFecha;

        return supabase.from("cierres_dia").upsert([
          {
            van_id: van.id,
            fecha: fecha,
            usuario_id: usuario.id,
            total_ventas: totalesFecha.totalVentas,
            total_efectivo: totalesFecha.totalEfectivo,
            total_tarjeta: totalesFecha.totalTarjeta,
            total_transferencia: totalesFecha.totalTransferencia,
            total_otros: totalesFecha.totalOtros,
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

  // ⚙️ Función auxiliar: totales por fecha usando RESUMEN (RPC) + total_venta
const calcularTotalesPorFecha = (fecha, ventas) => {
  let totalVentas = 0;
  (ventas || []).forEach((venta) => {
    totalVentas += Number(venta.total_venta || 0);
  });

  const r = resumenPorFecha[fecha] || {};
  const totalEfectivo = Number(r.cash || 0);
  const totalTarjeta = Number(r.card || 0);
  const totalTransferencia = Number(r.transfer || 0);
  // ✅ ELIMINADO: const totalOtros = Number(r.mix || 0);

  const totalCaja = totalEfectivo + totalTarjeta + totalTransferencia;

  return {
    totalVentas,
    totalEfectivo,
    totalTarjeta,
    totalTransferencia,
    totalOtros: 0, // ✅ Siempre 0, ya no usamos "mix"
    totalCaja,
    diferencia: 0,
  };
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
    calculateTransferTotal(initialCounts);
    setShowTransferBreakdownModal(true);
  };

  const updateTransferCount = (type, count) => {
    const numericCount = parseInt(count) || 0;
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
const totales = useMemo(() => {
  const todasLasVentas = Object.values(ventasPorFecha).flat();
  let totalVentas = 0;
  todasLasVentas.forEach((venta) => {
    totalVentas += Number(venta.total_venta || 0);
  });

  let totalEfectivo = 0;
  let totalTarjeta = 0;
  let totalTransferencia = 0;
  // ✅ ELIMINADO: let totalOtros = 0;

  fechasSeleccionadas.forEach((fecha) => {
    const r = resumenPorFecha[fecha];
    if (!r) return;
    totalEfectivo += Number(r.cash || 0);
    totalTarjeta += Number(r.card || 0);
    totalTransferencia += Number(r.transfer || 0);
    // ✅ ELIMINADO: totalOtros += Number(r.mix || 0);
  });

  const totalCaja = totalEfectivo + totalTarjeta + totalTransferencia;
  const totalReal = cashReal + cardReal + transferReal + otherReal;
  const diferencia = Math.abs(totalCaja - totalReal);

  return {
    totalVentas,
    totalEfectivo,
    totalTarjeta,
    totalTransferencia,
    totalOtros: 0, // ✅ Siempre 0
    totalCaja,
    diferencia,
  };
}, [
  ventasPorFecha,
  resumenPorFecha,
  fechasSeleccionadas,
  cashReal,
  cardReal,
  transferReal,
  otherReal,
]);

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
    // ✅ ELIMINADO: "Other" ya no existe
  ].filter((item) => item.value > 0);
}, [totales]);

  // Datos por fecha para gráfico y tabla (usando resumenPorFecha)
  const datosPorFecha = useMemo(() => {
    return fechasSeleccionadas.map((fecha) => {
      const r = resumenPorFecha[fecha] || {
        cash: 0,
        card: 0,
        transfer: 0,
        mix: 0,
      };
      const total =
        Number(r.cash || 0) +
        Number(r.card || 0) +
        Number(r.transfer || 0) +
        Number(r.mix || 0);

      return {
        fecha: formatUS(fecha),
        cash: Number(r.cash || 0),
        card: Number(r.card || 0),
        transfer: Number(r.transfer || 0),
        other: Number(r.mix || 0),
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
                <p className="text-sm text-gray-600">System Total</p>
                <p className="text-lg font-bold text-green-800">
                  {totales.totalEfectivo > 0
                    ? fmtCurrency(totales.totalEfectivo)
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
                <p className="text-sm text-gray-600">System Total</p>
                <p className="text-lg font-bold text-blue-800">
                  {totales.totalTarjeta > 0
                    ? fmtCurrency(totales.totalTarjeta)
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
                <p className="text-sm text-gray-600">System Total</p>
                <p className="text-lg font-bold text-purple-800">
                  {totales.totalTransferencia > 0
                    ? fmtCurrency(totales.totalTransferencia)
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
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileText size={20} />
                Recent Transactions
              </h3>
              <div className="h-64 overflow-y-auto">
                {(() => {
                  // Combinar todas las transacciones (ventas + pagos directos)
                  const todasLasVentas = Object.values(
                    ventasPorFecha
                  ).flat();
                  const todosLosPagos = Object.values(
                    pagosPorFecha
                  ).flat();

                  // Mapear ventas con sus métodos de pago
                  const ventasConMetodo = todasLasVentas.flatMap(
                    (venta) => {
                      const items = [];
                      if (venta.pago?.map) {
                        if (venta.pago.map.efectivo > 0) {
                          items.push({
                            cliente:
                              venta.clientes?.nombre ||
                              "N/A",
                            fecha: venta.created_at,
                            metodo: "efectivo",
                            monto: venta.pago.map
                              .efectivo,
                            tipo: "venta",
                          });
                        }
                        if (venta.pago.map.tarjeta > 0) {
                          items.push({
                            cliente:
                              venta.clientes?.nombre ||
                              "N/A",
                            fecha: venta.created_at,
                            metodo: "tarjeta",
                            monto: venta.pago.map
                              .tarjeta,
                            tipo: "venta",
                          });
                        }
                        if (
                          venta.pago.map.transferencia >
                          0
                        ) {
                          items.push({
                            cliente:
                              venta.clientes?.nombre ||
                              "N/A",
                            fecha: venta.created_at,
                            metodo: "transferencia",
                            monto: venta.pago.map
                              .transferencia,
                            tipo: "venta",
                          });
                        }
                        if (venta.pago.map.otro > 0) {
                          items.push({
                            cliente:
                              venta.clientes?.nombre ||
                              "N/A",
                            fecha: venta.created_at,
                            metodo: "otro",
                            monto: venta.pago.map.otro,
                            tipo: "venta",
                          });
                        }
                      }
                      return items;
                    }
                  );

                  // Normalizar método de pago (español/inglés)
                  const normalizeMetodo = (metodo) => {
                    const m = String(metodo || "").toLowerCase();
                    if (m === "cash") return "efectivo";
                    if (m === "card") return "tarjeta";
                    if (m === "transfer") return "transferencia";
                    if (m === "other") return "otro";
                    return m;
                  };

                  // Mapear pagos directos
                  const pagosConMetodo = todosLosPagos.map(
                    (pago) => ({
                      cliente:
                        pago.clientes?.nombre || "N/A",
                      fecha: pago.fecha_pago,
                      metodo: normalizeMetodo(
                        pago.metodo_pago
                      ),
                      monto: pago.monto,
                      tipo: "pago",
                    })
                  );

                  // Combinar y ordenar por fecha
                  const todasTransacciones = [
                    ...ventasConMetodo,
                    ...pagosConMetodo,
                  ]
                    .sort(
                      (a, b) =>
                        new Date(b.fecha) -
                        new Date(a.fecha)
                    )
                    .slice(0, 10); // Últimas 10 transacciones

                  if (todasTransacciones.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <FileText
                          size={32}
                          className="mb-2 opacity-50"
                        />
                        <p className="text-sm">
                          No transactions found
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {todasTransacciones.map(
                        (trans, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {trans.cliente}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span
                                  className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                    trans.metodo ===
                                    "efectivo"
                                      ? "bg-green-100 text-green-800"
                                      : trans.metodo ===
                                        "tarjeta"
                                      ? "bg-blue-100 text-blue-800"
                                      : trans.metodo ===
                                        "transferencia"
                                      ? "bg-purple-100 text-purple-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {getPaymentMethodLabel(
                                    trans.metodo
                                  )}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(
                                    trans.fecha
                                  ).toLocaleTimeString(
                                    "en-US",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="ml-2">
                              <p className="text-sm font-bold text-gray-900">
                                {fmtCurrency(
                                  trans.monto
                                )}
                              </p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  );
                })()}
              </div>
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
                      Payments
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
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {(pagosPorFecha[fechaISO] ||
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
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                Quick Transfer Count
              </h3>
              <button
                onClick={() =>
                  setShowTransferBreakdownModal(false)
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
                    Enter the count for each transfer type:
                  </p>
                  <div className="text-xl font-bold text-purple-700">
                    Total: {fmtCurrency(transferTotal)}
                  </div>
                </div>
                <div className="space-y-3">
                  {TRANSFER_TYPES.map((type) => (
                    <div
                      key={type.value}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: type.color }}
                        ></div>
                        <span className="font-medium text-gray-700">
                          {type.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            subtractTransferCount(type.value)
                          }
                          className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="text"
                          value={String(
                            transferCounts[type.value] || 0
                          ).padStart(1, "0")}
                          onChange={(e) =>
                            updateTransferCount(
                              type.value,
                              e.target.value
                            )
                          }
                          className="w-16 text-center border border-gray-300 rounded-lg py-1 px-2"
                        />
                        <button
                          onClick={() =>
                            addTransferCount(type.value)
                          }
                          className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="font-medium text-gray-900">
                        {fmtCurrency(
                          (transferCounts[type.value] || 0) *
                            1
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
                  setShowTransferBreakdownModal(false)
                }
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
