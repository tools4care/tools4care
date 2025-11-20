import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ======================= Helpers de fecha (Eastern Time) ======================= */

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
  
  const dateEastern = new Date(`${isoDay}T00:00:00`);
  const startEastern = new Date(dateEastern);
  startEastern.setHours(0, 0, 0, 0);
  
  const endEastern = new Date(dateEastern);
  endEastern.setHours(23, 59, 59, 999);
  
  const start = startEastern.toISOString();
  const end = endEastern.toISOString();
  
  console.log(`Eastern Day Bounds for ${isoDay}:`, { start, end });
  return { start, end };
}

// Función para formatear fecha en Eastern Time (MM/DD/YYYY)
function formatEastern(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  });
}

// Función para convertir fecha a Eastern Time y luego a YYYY-MM-DD
function toEasternYMD(d) {
  if (!d) return "";
  const dt = new Date(d);
  const eastern = new Date(dt.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const y = eastern.getFullYear();
  const m = String(eastern.getMonth() + 1).padStart(2, "0");
  const dd = String(eastern.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/* ======================= SVG Icons ======================= */
const IconCalculator = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const IconDollar = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconShoppingCart = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const IconCreditCard = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);

const IconBank = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
  </svg>
);

const IconCheck = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const IconDocument = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

/* ======================= Constantes ======================= */
const DENOMINACIONES = [
  { nombre: "$100", valor: 100 },
  { nombre: "$50", valor: 50 },
  { nombre: "$20", valor: 20 },
  { nombre: "$10", valor: 10 },
  { nombre: "$5", valor: 5 },
  { nombre: "$1", valor: 1 },
  { nombre: "Quarters", valor: 0.25 },
  { nombre: "Dimes", valor: 0.10 },
  { nombre: "Nickels", valor: 0.05 },
  { nombre: "Pennies", valor: 0.01 },
];

const NO_CLIENTE = "Quick sale / No client";
const isIsoDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const toUSFormat = (dateStr) => {
  if (!dateStr) return "";
  const eastern = new Date(dateStr + "T00:00:00");
  return eastern.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  });
};

/* ======================= Helpers ======================= */
function displayName(cli) {
  if (!cli) return "";
  const nombre = [cli.nombre, cli.apellido].filter(Boolean).join(" ").trim();
  return cli.negocio ? `${nombre || cli.id} (${cli.negocio})` : nombre || cli.id;
}

const normMetodo = (m) => {
  const s = String(m || "").trim().toLowerCase();
  if (["transfer", "transferencia", "wire", "zelle", "bank", "bank transfer"].includes(s)) return "transfer";
  if (["cash", "efectivo"].includes(s)) return "cash";
  if (["card", "tarjeta", "debit", "credit"].includes(s)) return "card";
  if (["mix", "mixed", "mixto"].includes(s)) return "mix";
  return s;
};

const getPagoDate = (p) =>
  p?.fecha_pago || p?.fecha || p?.fecha_abono || p?.created_at || p?.updated_at || "";

const pagoYMD = (p) => toEasternYMD(getPagoDate(p));

/* ===== breakdown utils ===== */
const emptyBk = () => ({ cash: 0, card: 0, transfer: 0 });
const cloneBk = (bk) => ({ cash: +(bk?.cash || 0), card: +(bk?.card || 0), transfer: +(bk?.transfer || 0) });
const sumBk = (bk) => {
  if (!bk) return 0;
  return (+(bk.cash || 0)) + (+(bk.card || 0)) + (+(bk.transfer || 0));
};
const addBk = (a, b) => {
  if (!a) a = emptyBk();
  if (!b) b = emptyBk();
  return {
    cash: (+(a.cash || 0)) + (+(b.cash || 0)),
    card: (+(a.card || 0)) + (+(b.card || 0)),
    transfer: (+(a.transfer || 0)) + (+(b.transfer || 0)),
  };
};

function capBreakdownTo(bk, max) {
  if (!bk) bk = emptyBk();
  const total = sumBk(bk);
  if (total <= 0.0001 || max <= 0) return { assigned: emptyBk(), extra: cloneBk(bk) };
  if (total <= max + 0.0001) return { assigned: cloneBk(bk), extra: emptyBk() };
  const ratio = max / total;
  const assigned = {
    cash: +(bk.cash || 0) * ratio,
    card: +(bk.card || 0) * ratio,
    transfer: +(bk.transfer || 0) * ratio,
  };
  const extra = {
    cash: +(bk.cash || 0) - assigned.cash,
    card: +(bk.card || 0) - assigned.card,
    transfer: +(bk.transfer || 0) - assigned.transfer,
  };
  return { assigned, extra };
}

function breakdownPorMetodo(item) {
  const out = { cash: 0, card: 0, transfer: 0 };

  ["efectivo", "tarjeta", "transferencia"].forEach((k) => {
    const v = Number(item?.[`pago_${k}`] || 0);
    if (k === "efectivo") out.cash += v;
    if (k === "tarjeta") out.card += v;
    if (k === "transferencia") out.transfer += v;
  });

  const candidates = [
    item?.pago, item?.pagos_detalle, item?.detalle_pagos, item?.payment_breakdown,
    item?.payment_details, item?.metodos, item?.metodos_detalle, item?.metodo_detalles,
    item?.metodo_json, item?.detalles, item?.detalle, item?.pago_detalle, item?.pagos,
  ];

  const sumDict = (obj) => {
    if (!obj || typeof obj !== "object") return;
    const map = {
      cash: "cash", efectivo: "cash",
      card: "card", tarjeta: "card",
      transfer: "transfer", transferencia: "transfer", wire: "transfer", zelle: "transfer", bank: "transfer",
    };
    for (const [k, v] of Object.entries(obj)) {
      const key = map[k?.toLowerCase?.() || k] || "";
      if (key) out[key] += Number(v || 0);
    }
  };

  for (let cand of candidates) {
    if (!cand) continue;
    try {
      if (typeof cand === "string") cand = JSON.parse(cand);
    } catch {}
    if (Array.isArray(cand)) {
      for (const r of cand) {
        const metodo = normMetodo(r?.metodo || r?.metodo_pago || r?.type);
        const monto = Number(r?.monto ?? r?.amount ?? r?.total ?? r?.value ?? 0);
        if (metodo === "cash") out.cash += monto;
        else if (metodo === "card") out.card += monto;
        else if (metodo === "transfer") out.transfer += monto;
      }
    } else if (typeof cand === "object") {
      if (cand.map && typeof cand.map === "object") sumDict(cand.map);
      else sumDict(cand);
    }
  }

  if (out.cash + out.card + out.transfer === 0) {
    const metodo = normMetodo(item?.metodo_pago);
    const montoFallback = Number(item?.monto ?? item?.amount ?? item?.total ?? item?.total_pagado ?? 0);
    if (montoFallback) {
      if (metodo === "cash") out.cash += montoFallback;
      else if (metodo === "card") out.card += montoFallback;
      else if (metodo === "transfer") out.transfer += montoFallback;
    }
  }
  return out;
}

/* ======================= Hooks de datos ======================= */
function useFechasPendientes(van_id) {
  const [fechas, setFechas] = useState([]);
  useEffect(() => {
    if (!van_id) { setFechas([]); return; }
    (async () => {
      const hoy = new Date();
      const desde = new Date(hoy); desde.setDate(hoy.getDate() - 90);
      const toISO = (d) => d.toISOString().slice(0, 10);
      
      const { data, error } = await supabase
        .from("vw_expected_por_dia_van")
        .select("dia").eq("van_id", van_id)
        .gte("dia", toISO(desde)).lte("dia", toISO(hoy))
        .order("dia", { ascending: false });
      
      if (error) { 
        console.error("❌ Error loading pending dates:", error);
        setFechas([]); 
        return; 
      }
      
      console.log("✅ Raw pending dates:", data);
      
      const fechasUTC = (data || []).map((r) => {
        const dateEastern = new Date(r.dia);
        const dateUTC = new Date(dateEastern.toLocaleString("en-US", { timeZone: "UTC" }));
        return dateUTC.toISOString().slice(0, 10);
      }).filter(isIsoDate);
      
      console.log("✅ Pending dates converted to UTC:", fechasUTC);
      setFechas(fechasUTC);
    })();
  }, [van_id]);
  return fechas;
}

function useFechasCerradas(van_id) {
  const [fechasCerradas, setFechasCerradas] = useState([]);
  useEffect(() => {
    if (!van_id) { setFechasCerradas([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from("cierres_van")
        .select("fecha_inicio").eq("van_id", van_id);
      if (error) { 
        console.error("❌ Error loading closed dates:", error);
        setFechasCerradas([]); 
        return; 
      }
      console.log("✅ Closed dates loaded:", data);
      setFechasCerradas(Array.from(new Set((data || []).map(x => x.fecha_inicio))));
    })();
  }, [van_id]);
  return fechasCerradas;
}

function useCierreInfo(van_id, fecha) {
  const [cierreInfo, setCierreInfo] = useState(null);
  useEffect(() => {
    if (!van_id || !isIsoDate(fecha)) { setCierreInfo(null); return; }
    (async () => {
      const { data, error } = await supabase
        .from("cierres_van")
        .select("*")
        .eq("van_id", van_id)
        .eq("fecha_inicio", fecha)
        .maybeSingle();
      if (error || !data) { 
        console.log("ℹ️ No closeout for this date or error:", error);
        setCierreInfo(null); 
        return; 
      }
      console.log("✅ Closeout info loaded:", data);
      setCierreInfo(data);
    })();
  }, [van_id, fecha]);
  return cierreInfo;
}

function useMovimientosNoCerrados(van_id, fechaInicio, fechaFin) {
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!van_id || !isIsoDate(fechaInicio) || !isIsoDate(fechaFin)) { 
      console.log("⚠️ Invalid parameters:", { van_id, fechaInicio, fechaFin });
      setVentas([]); 
      setPagos([]); 
      return; 
    }
    
    setLoading(true);
    
    (async () => {
      try {
        console.log("🔍 STARTING MOVEMENT SEARCH");
        console.log("Van ID:", van_id);
        console.log("Start date (Eastern):", fechaInicio);
        console.log("End date (Eastern):", fechaFin);
        
        const { start, end } = easternDayBounds(fechaInicio);
        
        const { data: sampleVenta, error: sampleError } = await supabase
          .from("ventas_local")
          .select("*")
          .limit(1)
          .maybeSingle();
        
        if (sampleVenta) {
          console.log("📋 Available fields in ventas_local:", Object.keys(sampleVenta));
        }
        
        console.log("🔍 Searching sales with fecha_local...");
        const { data: ventasData, error: errorVentas } = await supabase
          .from("ventas_local")
          .select("*")
          .eq("van_id", van_id)
          .gte("fecha_local", start.split('T')[0])
          .lte("fecha_local", end.split('T')[0])
          .is("cierre_id", null)
          .order("created_at", { ascending: true });
        
        if (errorVentas) {
          console.error("❌ Error loading sales:", errorVentas);
          console.log("Trying with 'fecha' field instead...");
          
          const { data: ventasData2, error: errorVentas2 } = await supabase
            .from("ventas_local")
            .select("*")
            .eq("van_id", van_id)
            .gte("fecha", start.split('T')[0])
            .lte("fecha", end.split('T')[0])
            .is("cierre_id", null)
            .order("created_at", { ascending: true });
          
          if (errorVentas2) {
            console.error("❌ Error also with 'fecha' field:", errorVentas2);
            setVentas([]);
          } else {
            console.log("✅ Sales found with 'fecha' field:", ventasData2?.length || 0);
            console.log("Sales data:", ventasData2);
            setVentas(ventasData2 || []);
          }
        } else {
          console.log("✅ Sales found with fecha_local:", ventasData?.length || 0);
          if (ventasData && ventasData.length > 0) {
            console.log("Sample of first sale:", ventasData[0]);
          }
          setVentas(ventasData || []);
        }
        
        console.log("🔍 Searching payments...");
        
        const { data: pagosData1, error: errorPagos1 } = await supabase
          .from("pagos_local")
          .select("*")
          .eq("van_id", van_id)
          .gte("fecha_pago", start.split('T')[0])
          .lte("fecha_pago", end.split('T')[0])
          .is("cierre_id", null)
          .order("fecha_pago", { ascending: true });
        
        if (!errorPagos1 && pagosData1) {
          console.log("✅ Payments found with fecha_pago:", pagosData1?.length || 0);
          setPagos(pagosData1 || []);
        } else {
          const { data: pagosData2, error: errorPagos2 } = await supabase
            .from("pagos_local")
            .select("*")
            .eq("van_id", van_id)
            .gte("fecha", start.split('T')[0])
            .lte("fecha", end.split('T')[0])
            .is("cierre_id", null)
            .order("fecha_pago", { ascending: true });
          
          if (!errorPagos2 && pagosData2) {
            console.log("✅ Payments found with fecha:", pagosData2?.length || 0);
            setPagos(pagosData2 || []);
          } else {
            console.error("❌ Error loading payments:", errorPagos1 || errorPagos2);
            setPagos([]);
          }
        }
        
      } catch (error) {
        console.error("❌ General error in useMovimientosNoCerrados:", error);
        setVentas([]);
        setPagos([]);
      } finally { 
        setLoading(false); 
      }
    })();
  }, [van_id, fechaInicio, fechaFin]);
  
  return { ventas, pagos, loading };
}

function useMovimientosCerrados(cierre_id) {
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cierre_id) { setVentas([]); setPagos([]); return; }
    setLoading(true);
    (async () => {
      try {
        const { data: ventasC = [] } = await supabase
          .from("ventas")
          .select("*")
          .eq("cierre_id", cierre_id);

        const { data: pagosC = [] } = await supabase
          .from("pagos")
          .select("*")
          .eq("cierre_id", cierre_id);

        console.log("✅ Closed movements loaded - Sales:", ventasC.length, "Payments:", pagosC.length);
        setVentas(ventasC); setPagos(pagosC);
      } finally { setLoading(false); }
    })();
  }, [cierre_id]);

  return { ventas, pagos, loading };
}

function useExpectedDia(van_id, dia) {
  const [exp, setExp] = useState({ cash: 0, card: 0, transfer: 0, mix: 0 });
  useEffect(() => {
    if (!van_id || !isIsoDate(dia)) { 
      setExp({ cash:0, card:0, transfer:0, mix:0 }); 
      return; 
    }
    (async () => {
      const { data, error } = await supabase
        .from("vw_expected_por_dia_van")
        .select("cash_expected, card_expected, transfer_expected, mix_unallocated")
        .eq("van_id", van_id).eq("dia", dia).maybeSingle();
      
      if (error) {
        console.error("❌ Error loading expected:", error);
      }
      
      const expected = {
        cash: Number(data?.cash_expected || 0),
        card: Number(data?.card_expected || 0),
        transfer: Number(data?.transfer_expected || 0),
        mix: Number(data?.mix_unallocated || 0),
      };
      
      console.log("✅ Expected loaded for", dia, ":", expected);
      setExp(expected);
    })();
  }, [van_id, dia]);
  return exp;
}

/* ======================= Modales ======================= */
function DesgloseEfectivoModal({ open, onClose, onSave }) {
  const [billetes, setBilletes] = useState(DENOMINACIONES.map((d) => ({ ...d, cantidad: "" })));
  useEffect(() => { if (open) setBilletes(DENOMINACIONES.map((d)=>({ ...d, cantidad:"" }))); }, [open]);
  const total = billetes.reduce((t, b) => t + Number(b.cantidad || 0) * b.valor, 0);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconCalculator />
            <h2 className="text-xl font-bold">Cash Calculator</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            ✖
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-200">
            <table className="w-full">
              <tbody className="space-y-2">
                {billetes.map((b, i) => (
                  <tr key={b.nombre} className="border-b border-green-100 last:border-0">
                    <td className="py-3 font-semibold text-gray-700">{b.nombre}</td>
                    <td className="py-3">
                      <input
                        type="number" 
                        min="0"
                        className="border-2 border-gray-200 focus:border-green-500 rounded-lg px-3 py-2 w-24 text-right font-semibold transition-colors"
                        value={b.cantidad}
                        onChange={(e) => {
                          const nuevo = [...billetes]; 
                          nuevo[i].cantidad = e.target.value; 
                          setBilletes(nuevo);
                        }}
                      />
                    </td>
                    <td className="py-3 text-right text-sm text-gray-500 font-mono">
                      ${(b.valor * Number(b.cantidad || 0)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Total Amount:</span>
              <span className="text-4xl font-bold">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <div className="px-6 pb-6 flex gap-3">
          <button 
            onClick={onClose} 
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(total)} 
            className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all"
          >
            Use Total
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  open, onCancel, onConfirm,
  gridSystem, counted, arPeriodo, pagosCxC, comentario,
  fechaInicio, fechaFin
}) {
  if (!open) return null;
  
  const safeGridSystem = gridSystem || emptyBk();
  const safeCounted = counted || emptyBk();
  
  const totalSystem = sumBk(safeGridSystem);
  const totalCounted = sumBk(safeCounted);
  const overUnder = (totalCounted - totalSystem);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconCheck />
            <h2 className="text-xl font-bold">Confirm Closeout</h2>
          </div>
          <button
            onClick={onCancel}
            className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            ✖
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
              <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Period Start</div>
              <div className="text-lg font-bold text-gray-900">{toUSFormat(fechaInicio)}</div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
              <div className="text-xs text-purple-600 font-semibold uppercase mb-1">Period End</div>
              <div className="text-lg font-bold text-gray-900">{toUSFormat(fechaFin)}</div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-2xl p-5 space-y-3 border-2 border-gray-200">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <IconDollar />
              <span>Payment Summary</span>
            </h3>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">💵 CASH</div>
                <div className="font-semibold text-gray-900">System: ${(safeGridSystem.cash || 0).toFixed(2)}</div>
                <div className="font-semibold text-green-700">Counted: ${(safeCounted.cash || 0).toFixed(2)}</div>
              </div>
              
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">💳 CARD</div>
                <div className="font-semibold text-gray-900">System: ${(safeGridSystem.card || 0).toFixed(2)}</div>
                <div className="font-semibold text-blue-700">Counted: ${(safeCounted.card || 0).toFixed(2)}</div>
              </div>
              
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">🏦 TRANSFER</div>
                <div className="font-semibold text-gray-900">System: ${(safeGridSystem.transfer || 0).toFixed(2)}</div>
                <div className="font-semibold text-purple-700">Counted: ${(safeCounted.transfer || 0).toFixed(2)}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
              <div className="bg-blue-100 rounded-lg p-3">
                <div className="text-xs text-blue-600 font-semibold mb-1">Total System</div>
                <div className="text-xl font-bold text-blue-700">${totalSystem.toFixed(2)}</div>
              </div>
              <div className="bg-green-100 rounded-lg p-3">
                <div className="text-xs text-green-600 font-semibold mb-1">Total Counted</div>
                <div className="text-xl font-bold text-green-700">${totalCounted.toFixed(2)}</div>
              </div>
            </div>
            
            <div className={`rounded-lg p-4 ${overUnder >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700">Over/Under:</span>
                <span className={`text-2xl font-bold ${overUnder >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  ${overUnder.toFixed(2)}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
              <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                <div className="text-xs text-red-600 font-semibold mb-1">🏠 A/R (House Charge)</div>
                <div className="text-lg font-bold text-red-700">${(arPeriodo || 0).toFixed(2)}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                <div className="text-xs text-green-600 font-semibold mb-1">💰 A/R Payments</div>
                <div className="text-lg font-bold text-green-700">${(pagosCxC || 0).toFixed(2)}</div>
              </div>
            </div>
            
            {comentario && (
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="text-xs text-amber-600 font-semibold mb-1">📝 Comment</div>
                <div className="text-sm text-gray-700">{comentario}</div>
              </div>
            )}
          </div>
        </div>
        
        <div className="px-6 pb-6 flex gap-3">
          <button 
            onClick={onCancel} 
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm} 
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all"
          >
            Confirm Closeout
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= PDF ======================= */
function generarPDFCierreVan({
  empresa, usuario, vanNombre,
  ventas = [], avances = [],
  resumen = {}, fechaInicio, fechaFin, fechaCierre = null, mode = "download"
}) {
  const doc = new jsPDF("p", "pt", "a4");
  const azul = "#0B4A6F", azulSuave = "#e3f2fd", negro = "#222";
  const xLeft = 36;

  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(azul);
  doc.text(empresa.nombre, xLeft, 48);

  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(negro);
  doc.text(`Address: ${empresa.direccion}`, xLeft, 65);
  doc.text(`Phone: ${empresa.telefono}  |  Email: ${empresa.email}`, xLeft, 78);
  doc.setLineWidth(1.1); doc.setDrawColor(azul); doc.line(36, 86, 560, 86);

  const vanIdShort = (vanNombre || "").toString().slice(0, 8);
  const vanLabel = [vanNombre || "-", `ID: ${vanIdShort}`].filter(Boolean).join(" — ");
  const userLine = `${usuario?.nombre || usuario?.email || "-"}${usuario?.email ? " | " + usuario.email : ""}${usuario?.id ? " (ID: " + usuario.id + ")" : ""}`;

  doc.setFontSize(14); doc.setTextColor(azul); doc.text("Van Closeout - Executive Report", 36, 110);
  doc.setFontSize(10); doc.setTextColor(negro);
  doc.text(`Period: ${toUSFormat(fechaInicio)} to ${toUSFormat(fechaFin)}`, 36, 130);
  doc.text(doc.splitTextToSize(`Responsible: ${userLine}`, 240), 36, 146);
  doc.text(doc.splitTextToSize(`Van: ${vanLabel}`, 220), 316, 130);
  if (fechaCierre) doc.text(`Closeout Date: ${toUSFormat(fechaCierre)}`, 316, 146);
  else {
    const now = new Date();
    doc.text(`Closeout Date: ${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`, 316, 146);
  }

  doc.setFillColor(azulSuave);
  doc.roundedRect(36, 160, 520, 52, 8, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setTextColor(azul); doc.setFontSize(12);
  doc.text("Executive Summary", 44, 180);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(negro);
  doc.text(`Expected Cash: $${Number(resumen.efectivo_esperado || 0).toFixed(2)}`, 44, 198);
  doc.text(`Expected Card: $${Number(resumen.tarjeta_esperado || 0).toFixed(2)}`, 220, 198);
  doc.text(`Expected Transfer: $${Number(resumen.transferencia_esperado || 0).toFixed(2)}`, 370, 198);
  doc.text(`A/R in Period: $${Number(resumen.cxc_periodo || 0).toFixed(2)}`, 44, 214);
  doc.text(`Pmt on House Chrg: $${Number(resumen.pagos_cxc || 0).toFixed(2)}`, 220, 214);

  doc.setFont("helvetica", "bold"); doc.setTextColor(azul); doc.setFontSize(13);
  doc.text("Sales included in this closeout", 36, 240);

  autoTable(doc, {
    startY: 250,
    head: [["Date", "Client", "Total", "Cash", "Card", "Transfer", "Paid", "A/R"]],
    body:
      ventas.length === 0
        ? [["-", "-", "-", "-", "-", "-", "-", "-"]]
        : ventas.map((v) => [
            toUSFormat((v.fecha || "").toString().slice(0,10)) || "-",
            v.cliente_nombre || (v.cliente_id ? v.cliente_id.slice(0, 8) : "No client"),
            "$" + Number(v.total_venta || 0).toFixed(2),
            "$" + Number(v._bk?.cash || 0).toFixed(2),
            "$" + Number(v._bk?.card || 0).toFixed(2),
            "$" + Number(v._bk?.transfer || 0).toFixed(2),
            "$" + Number(v.total_pagado || 0).toFixed(2),
            "$" + Math.max(0, Number(v.total_venta || 0) - Number(v.total_pagado || 0)).toFixed(2),
          ]),
    theme: "grid",
    headStyles: { fillColor: "#0B4A6F", textColor: "#fff", fontStyle: "bold" },
    styles: { fontSize: 9 },
    margin: { left: 36, right: 36 },
  });

  let yAbonos = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 260) + 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor("#0B4A6F");
  doc.text("Customer Payments (A/R) included", 36, yAbonos);

  autoTable(doc, {
    startY: yAbonos + 10,
    head: [["Date", "Client", "Amount", "Cash", "Card", "Transfer", "Reference", "Notes"]],
    body:
      avances.length === 0
        ? [["-", "-", "-", "-", "-", "-", "-", "-"]]
        : avances.map((p) => {
            const cash = Number(p._bk?.cash || 0);
            const card = Number(p._bk?.card || 0);
            const transfer = Number(p._bk?.transfer || 0);
            const amount = cash + card + transfer || Number(p.monto || 0);
            return [
              toUSFormat(pagoYMD(p)) || "-",
              p.cliente_nombre || (p.cliente_id ? p.cliente_id.slice(0, 8) : "No client"),
              "$" + amount.toFixed(2),
              "$" + cash.toFixed(2),
              "$" + card.toFixed(2),
              "$" + transfer.toFixed(2),
              p.referencia || "-",
              p.notas || "-",
            ];
          }),
    theme: "grid",
    headStyles: { fillColor: "#0B4A6F", textColor: "#fff", fontStyle: "bold" },
    styles: { fontSize: 9 },
    margin: { left: 36, right: 36 },
  });

  const totalCash = ventas.reduce((t, v) => t + Number(v._bk?.cash || 0), 0) +
                    avances.reduce((t, p) => t + Number(p._bk?.cash || 0), 0);
  const totalCard = ventas.reduce((t, v) => t + Number(v._bk?.card || 0), 0) +
                    avances.reduce((t, p) => t + Number(p._bk?.card || 0), 0);
  const totalTransfer = ventas.reduce((t, v) => t + Number(v._bk?.transfer || 0), 0) +
                        avances.reduce((t, p) => t + Number(p._bk?.transfer || 0), 0);

  let yTot = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 260) + 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(azul);
  doc.text("Payment Totals", 36, yTot);

  autoTable(doc, {
    startY: yTot + 10,
    head: [["Payment Method", "Total"]],
    body: [
      ["Cash", "$" + totalCash.toFixed(2)],
      ["Card", "$" + totalCard.toFixed(2)],
      ["Transfer", "$" + totalTransfer.toFixed(2)],
      ["Grand Total", "$" + (totalCash + totalCard + totalTransfer).toFixed(2)]
    ],
    theme: "grid",
    headStyles: { fillColor: "#0B4A6F", textColor: "#fff", fontStyle: "bold" },
    styles: { fontSize: 10 },
    margin: { left: 36, right: 36 },
  });

  const nombreArchivo = `VanCloseout_${(vanNombre || "").toString().replace(/\s+/g, "")}_${fechaInicio}_${fechaFin}.pdf`;
  if (mode === "print") {
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    const win = window.open(blobUrl, "_blank");
    setTimeout(() => { try { win?.print?.(); } catch {} }, 400);
    return;
  }
  doc.save(nombreArchivo);
}

/* ======================= Componente principal ======================= */
export default function CierreVan() {
  const navigate = useNavigate();
  const { usuario } = useUsuario();
  const { van } = useVan();

  console.log("🚀 CierreVan mounted - Van:", van);

  const fechasPendientes = useFechasPendientes(van?.id);
  const fechasCerradas = useFechasCerradas(van?.id);
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");

  const cierreInfo = useCierreInfo(van?.id, fechaSeleccionada);

  useEffect(() => {
    console.log("📅 Pending dates:", fechasPendientes);
    if (fechasPendientes.length === 0) { 
      setFechaSeleccionada(""); 
      return; 
    }
    
    let pref = "";
    try { 
      pref = localStorage.getItem("pre_cierre_fecha") || ""; 
    } catch {}
    
    if (isIsoDate(pref)) {
      const datePref = new Date(pref);
      const prefEastern = new Date(datePref.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const prefEasternStr = prefEastern.toISOString().slice(0, 10);
      
      if (fechasPendientes.includes(prefEasternStr)) {
        setFechaSeleccionada(prefEasternStr);
        return;
      }
    }
    
    const nowEastern = new Date();
    const nowEasternStr = nowEastern.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    
    const [month, day, year] = nowEasternStr.split("/");
    const todayEastern = `${year}-${month}-${day}`;
    
    console.log("Today in Eastern Time:", todayEastern);
    
    if (fechasPendientes.includes(todayEastern)) {
      setFechaSeleccionada(todayEastern);
    } else {
      setFechaSeleccionada(fechasPendientes[0]);
    }
  }, [fechasPendientes]);

  const fechaInicio = fechaSeleccionada;
  const fechaFin = fechaSeleccionada;

  const { ventas: ventasPend, pagos: pagosPend, loading: loadingPend } =
    useMovimientosNoCerrados(van?.id, fechaInicio, fechaFin);

  const { ventas: ventasCerr, pagos: pagosCerr, loading: loadingCerr } =
    useMovimientosCerrados(cierreInfo?.id || null);

  const isClosedDay = !!cierreInfo;
  const loading = isClosedDay ? loadingCerr || loadingPend : loadingPend;

  const ventasRaw = isClosedDay 
    ? [...ventasCerr, ...ventasPend]
    : ventasPend;

  const pagosRaw = isClosedDay 
    ? [...pagosCerr, ...pagosPend]
    : pagosPend;

  console.log("📊 Raw data - Sales:", ventasRaw.length, "Payments:", pagosRaw.length);

  const clienteKeys = useMemo(
    () => Array.from(new Set([...ventasRaw, ...pagosRaw].map((x) => x?.cliente_id).filter(Boolean))),
    [ventasRaw, pagosRaw]
  );
  const [clientesDic, setClientesDic] = useState({});
  useEffect(() => {
    if (!clienteKeys.length) { setClientesDic({}); return; }
    (async () => {
      const keys = Array.from(new Set(clienteKeys));
      const dic = {};
      const { data: a } = await supabase.from("clientes").select("id, nombre, negocio").in("id", keys);
      for (const c of a || []) dic[c.id] = c;
      const missing = keys.filter((k) => !dic[k]);
      if (missing.length) {
        const { data: b } = await supabase.from("clientes_balance").select("id, nombre, negocio").in("id", missing);
        for (const c of b || []) dic[c.id] = c;
      }
      console.log("✅ Clients loaded:", Object.keys(dic).length);
      setClientesDic(dic);
    })();
  }, [clienteKeys.join(",")]);

  const pagosDecor = useMemo(() => {
    const arr = [];

    for (const v of ventasRaw || []) {
      for (const p of v.pagos || []) {
        arr.push({
          ...p,
          venta_id: v.id,
          cliente_id: v.cliente_id,
          fecha_local: v.fecha_local || v.fecha || v.created_at,
          cliente_nombre:
            v.cliente_nombre ||
            (clientesDic[v.cliente_id]
              ? displayName(clientesDic[v.cliente_id])
              : "No client"),
        });
      }
    }

    for (const c of pagosRaw || []) {
      if (c.venta_id) continue;

      arr.push({
        ...c,
        fecha_local:
          c.fecha_local ||
          c.fecha_pago ||
          c.fecha ||
          c.created_at ||
          c.updated_at,
        cliente_nombre:
          c.cliente_nombre ||
          (clientesDic[c.cliente_id]
            ? displayName(clientesDic[c.cliente_id])
            : "No client"),
      });
    }

    return arr.map((p) => {
      let breakdown = breakdownPorMetodo(p);

      const totalBk = sumBk(breakdown);
      if (totalBk === 0 && p.monto && p.metodo_pago) {
        const monto = Number(p.monto || 0);
        const metodo = normMetodo(p.metodo_pago);

        breakdown = emptyBk();
        if (metodo === "cash") breakdown.cash = monto;
        else if (metodo === "card") breakdown.card = monto;
        else if (metodo === "transfer") breakdown.transfer = monto;
      }

      return {
        ...p,
        _bk: breakdown,
      };
    });
  }, [ventasRaw, pagosRaw, clientesDic]);

  console.log("🔵 DEBUG pagosDecor:", pagosDecor);
  
  const pagosPorVenta = useMemo(() => {
    const map = new Map();
    for (const p of pagosDecor) {
      const ventaId = p.venta_id || p.sale_id || p.ventaId;
      if (!ventaId) continue;
      const prev = map.get(ventaId) || { cash: 0, card: 0, transfer: 0, rows: [] };
      prev.cash += Number(p._bk?.cash || 0);
      prev.card += Number(p._bk?.card || 0);
      prev.transfer += Number(p._bk?.transfer || 0);
      prev.rows.push(p);
      map.set(ventaId, prev);
    }
    return map;
  }, [pagosDecor]);

  const ventasIdSet = useMemo(() => new Set((ventasRaw || []).map((v) => v.id)), [ventasRaw]);

  const { ventasDecor, excedentesCxC } = useMemo(() => {
    const extrasAcumulados = [];
    const decor = (ventasRaw || []).map((v) => {
      const ficha = clientesDic[v.cliente_id];
      
      const breakdownVenta = {
        cash: Number(v.pago_efectivo || 0),
        card: Number(v.pago_tarjeta || 0),
        transfer: Number(v.pago_transferencia || 0),
      };
      
      return {
        ...v,
        _bk: breakdownVenta,
        cliente_nombre: v.cliente_nombre || (ficha ? displayName(ficha) : v.cliente_id ? v.cliente_id.slice(0, 8) : "No client"),
      };
    });

    console.log("✅ Decorated sales:", decor.length);
    if (decor.length > 0) {
      console.log("Sample of decorated sale:", decor[0]);
    }

    return { ventasDecor: decor, excedentesCxC: [] };
  }, [ventasRaw, clientesDic]);

  const avances = useMemo(() => {
    if (isClosedDay) {
      return (pagosDecor || []).filter(p => !p.venta_id);
    }

    const isSameEasternDay = (p) => {
      const ymd = pagoYMD(p);
      return ymd === fechaSeleccionada;
    };

    return (pagosDecor || []).filter(p => {
      if (p.venta_id) return false;
      if (p.van_id && p.van_id !== van?.id) return false;
      return isSameEasternDay(p);
    });
  }, [isClosedDay, pagosDecor, fechaSeleccionada, van?.id]);

  const expectedOpen = useExpectedDia(van?.id, fechaSeleccionada);
  
  const systemGrid = useMemo(() => {
    const grupos = new Map();

    for (const p of pagosDecor || []) {
      const key =
        p.idempotency_key ||
        p.referencia ||
        `${p.metodo_pago}-${pagoYMD(p)}-${p.cliente_id || "nc"}`;

      if (!grupos.has(key)) {
        grupos.set(key, { cash: 0, card: 0, transfer: 0 });
      }

      const g = grupos.get(key);

      g.cash += Number(p._bk?.cash || 0);
      g.card += Number(p._bk?.card || 0);
      g.transfer += Number(p._bk?.transfer || 0);

      grupos.set(key, g);
    }

    const totals = { cash: 0, card: 0, transfer: 0 };

    for (const g of grupos.values()) {
      totals.cash += g.cash;
      totals.card += g.card;
      totals.transfer += g.transfer;
    }

    return totals;
  }, [pagosDecor]);

  const totalesEsperadosPanel = useMemo(() => {
    const result = {
      cash: isClosedDay ? (systemGrid?.cash || 0) : Number(expectedOpen?.cash || 0),
      card: isClosedDay ? (systemGrid?.card || 0) : Number(expectedOpen?.card || 0),
      transfer: isClosedDay ? (systemGrid?.transfer || 0) : Number(expectedOpen?.transfer || 0),
    };
    console.log("📊 Expected panel totals:", result);
    return result;
  }, [isClosedDay, systemGrid, expectedOpen]);

  const arPeriodo = useMemo(() => {
    if (isClosedDay) return Number(cierreInfo?.cuentas_por_cobrar || 0);
    return (ventasDecor || []).reduce((t, v) => {
      const totalDesdeBreakdown = sumBk(v._bk);
      const venta = Number(v.total_venta) || totalDesdeBreakdown;
      const pagado = Number(v.total_pagado) || 0;
      const credito = venta - pagado;
      return t + (credito > 0 ? credito : 0);
    }, 0);
  }, [isClosedDay, cierreInfo, ventasDecor]);

  const pagosCxC = useMemo(() => {
    if (isClosedDay) return Number(cierreInfo?.pagos_cuentas_por_cobrar || 0);
    return (avances || []).reduce((t, p) => t + sumBk(p._bk), 0);
  }, [isClosedDay, cierreInfo, avances]);

  const [openDesglose, setOpenDesglose] = useState(false);
  const [counted, setCounted] = useState({ cash: 0, card: 0, transfer: 0 });
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    if (!fechaSeleccionada) return;
    if (!isClosedDay) { setCounted({ cash: 0, card: 0, transfer: 0 }); setComentario(""); }
  }, [fechaSeleccionada, isClosedDay]);

  useEffect(() => {
    if (!isClosedDay) return;
    setCounted({
      cash: Number(cierreInfo?.efectivo_real || 0),
      card: Number(cierreInfo?.tarjeta_real || 0),
      transfer: Number(cierreInfo?.transferencia_real || 0),
    });
    setComentario(cierreInfo?.comentario || "");
  }, [isClosedDay, cierreInfo]);

  const overUnder = useMemo(() => {
    const sys = sumBk(systemGrid);
    const cnt = sumBk(counted);
    return cnt - sys;
  }, [systemGrid, counted]);

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [pdfMode, setPdfMode] = useState("download");

  async function guardarCierre(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (isClosedDay) return;
    if (!van?.id || ventasDecor.length + avances.length === 0) {
      setMensaje("No transactions to close."); return;
    }
    setGuardando(true);

    const ventas_ids = ventasDecor.map((v) => v.id);
    const pagos_ids = [...pagosDecor.map(p => p.id)];

    const payload = {
      van_id: van.id,
      usuario_id: usuario?.id,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      comentario,
      cuentas_por_cobrar: Number(arPeriodo.toFixed(2)),
      efectivo_esperado: Number((systemGrid?.cash || 0).toFixed(2)),
      efectivo_real: Number(counted?.cash || 0),
      tarjeta_esperado: Number((systemGrid?.card || 0).toFixed(2)),
      tarjeta_real: Number(counted?.card || 0),
      transferencia_esperado: Number((systemGrid?.transfer || 0).toFixed(2)),
      transferencia_real: Number(counted?.transfer || 0),
      pagos_cuentas_por_cobrar: Number(pagosCxC.toFixed(2)),
      ventas_ids,
      pagos_ids,
    };

    console.log("💾 Saving closeout with payload:", payload);

    const { data, error } = await supabase
      .from("cierres_van")
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.error("❌ Error saving closeout:", error);
      setGuardando(false);
      setMensaje("Error saving closeout: " + error.message);
      setTimeout(() => setMensaje(""), 3500);
      return;
    }

    const cierre_id = data?.id;
    console.log("✅ Closeout saved with ID:", cierre_id);
    
    if (cierre_id) {
      await supabase.rpc("cerrar_ventas_por_van", {
        cierre_id_param: cierre_id, van_id_param: van.id, fecha_inicio: fechaInicio, fecha_fin: fechaFin,
      });
      await supabase.rpc("cerrar_pagos_por_van", {
        cierre_id_param: cierre_id, van_id_param: van.id, fecha_inicio: fechaInicio, fecha_fin: fechaFin,
      });
      try {
        localStorage.removeItem("pre_cierre_fecha");
        localStorage.setItem("pre_cierre_last_closed", fechaInicio);
        localStorage.setItem("pre_cierre_refresh", String(Date.now()));
      } catch {}
    }

    setGuardando(false);
    setShowConfirmModal(false);
    setMensaje("Closeout registered successfully!");
    setCounted({ cash: 0, card: 0, transfer: 0 });
    setComentario("");
    navigate("/cierres");
  }

  const generarPDF = async () => {
    setGenerandoPDF(true);
    try {
      const resumen = {
        efectivo_esperado: systemGrid?.cash || 0,
        tarjeta_esperado: systemGrid?.card || 0,
        transferencia_esperado: systemGrid?.transfer || 0,
        cxc_periodo: arPeriodo,
        pagos_cxc: pagosCxC,
      };
      const fechaCierre = cierreInfo?.created_at ? toEasternYMD(cierreInfo.created_at) : null;

      generarPDFCierreVan({
        empresa: { nombre: "TOOLS4CARE", direccion: "108 Lafayette St, Salem, MA 01970", telefono: "(978) 594-1624", email: "tools4care@gmail.com" },
        usuario,
        vanNombre: van?.nombre || van?.van_nombre || "",
        ventas: ventasDecor,
        avances,
        resumen,
        fechaInicio,
        fechaFin,
        fechaCierre,
        mode: pdfMode,
      });
      setMensaje(pdfMode === "print" ? "PDF generated for printing..." : "PDF generated successfully!");
    } catch (error) {
      console.error("❌ Error generating PDF:", error);
      setMensaje("Error generating PDF: " + error.message);
    } finally {
      setGenerandoPDF(false);
      setTimeout(() => setMensaje(""), 3500);
    }
  };

  if (!loading && fechaSeleccionada && ventasDecor.length === 0 && avances.length === 0) {
    console.warn("⚠️ NO DATA FOUND FOR DATE:", fechaSeleccionada);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-3 sm:p-6">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        
        {/* Header Mejorado */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                Van Closeout
              </h1>
              <p className="text-gray-600 text-sm flex items-center gap-2">
                {van?.nombre || van?.nombre_van ? (
                  <span className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full font-semibold">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                      <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                    </svg>
                    {van?.nombre || van?.nombre_van}
                  </span>
                ) : (
                  <span className="text-amber-600">⚠️ Select a VAN to continue</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* DEBUG INFO */}
        {!loading && fechaSeleccionada && ventasDecor.length === 0 && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl shadow-lg p-5 border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
              <div className="text-3xl">⚠️</div>
              <div className="flex-1">
                <p className="font-bold text-yellow-900 mb-2">No sales found for this date</p>
                <p className="text-sm text-yellow-700 mb-1">Check the browser console (F12) for detailed search logs.</p>
                <div className="mt-3 bg-white/50 rounded-lg p-3 text-xs space-y-1 font-mono">
                  <p><strong>Van ID:</strong> {van?.id || 'Not defined'}</p>
                  <p><strong>Selected date (UTC):</strong> {fechaSeleccionada}</p>
                  <p><strong>Selected date (Eastern):</strong> {toUSFormat(fechaSeleccionada)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selector de Fecha */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <label className="font-bold text-lg mb-3 block text-gray-800 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Select date to close or view
          </label>
          <select
            className="border-2 border-gray-200 focus:border-blue-500 p-3 rounded-xl w-full max-w-md font-semibold transition-colors shadow-sm hover:shadow-md"
            value={fechaSeleccionada}
            onChange={(e) => {
              const v = e.target.value;
              console.log("📅 Selected date changed to:", v);
              setFechaSeleccionada(v);
              try { localStorage.setItem("pre_cierre_fecha", v); } catch {}
            }}
          >
            {fechasPendientes.length === 0 ? (
              <option value="">No available days</option>
            ) : (
              fechasPendientes.map((f) => {
                const dateUTC = new Date(f);
                const dateEastern = new Date(dateUTC.toLocaleString("en-US", { timeZone: "America/New_York" }));
                const fechaEasternStr = dateEastern.toLocaleDateString("en-US", {
                  month: "2-digit",
                  day: "2-digit",
                  year: "numeric"
                });
                
                const isClosed = fechasCerradas.includes(f);
                return (
                  <option value={f} key={f}>
                    {fechaEasternStr} {isClosed ? "✓ Closed" : "• Pending"}
                  </option>
                );
              })
            )}
          </select>

          {isClosedDay && (
            <div className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 border-2 border-blue-200">
              <div className="flex items-start gap-3">
                <div className="bg-blue-500 p-2 rounded-lg text-white">
                  <IconCheck />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-blue-900 mb-1">
                    📋 This date was closed on {toUSFormat(toEasternYMD(cierreInfo.created_at))}
                  </div>
                  <div className="text-xs text-blue-700">
                    You can view and reprint the report, but cannot modify the closeout.
                  </div>
                </div>
              </div>
            </div>
          )}

          {isClosedDay && ventasPend.length > 0 && (
            <div className="mt-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-5 border-l-4 border-orange-500 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="text-3xl animate-pulse">⚠️</div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-orange-900 mb-1">
                    {ventasPend.length} new sale{ventasPend.length > 1 ? 's' : ''} made after closeout
                  </div>
                  <div className="text-xs text-orange-700">
                    These transactions are NOT included in the original closeout. Expected totals have been recalculated.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Payment Totals Summary */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <h3 className="font-bold mb-5 text-2xl text-gray-800 flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3 rounded-xl text-white">
              <IconDollar />
            </div>
            Payment Totals Summary
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-md p-5 border-2 border-green-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-green-600 uppercase">💵 Cash</span>
                <svg className="w-8 h-8 text-green-500 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-4xl font-bold text-green-700">
                ${(systemGrid?.cash || 0).toFixed(2)}
              </div>
              <div className="text-xs text-green-600 mt-2">From sales & A/R payments</div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-md p-5 border-2 border-blue-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-blue-600 uppercase">💳 Card</span>
                <svg className="w-8 h-8 text-blue-500 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                  <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-4xl font-bold text-blue-700">
                ${(systemGrid?.card || 0).toFixed(2)}
              </div>
              <div className="text-xs text-blue-600 mt-2">From sales & A/R payments</div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl shadow-md p-5 border-2 border-purple-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-purple-600 uppercase">🏦 Transfer</span>
                <svg className="w-8 h-8 text-purple-500 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-4xl font-bold text-purple-700">
                ${(systemGrid?.transfer || 0).toFixed(2)}
              </div>
              <div className="text-xs text-purple-600 mt-2">From sales & A/R payments</div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold opacity-90 mb-1">GRAND TOTAL</div>
                <div className="text-5xl font-bold">
                  ${sumBk(systemGrid).toFixed(2)}
                </div>
              </div>
              <svg className="w-20 h-20 opacity-20" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        {/* Sales Table */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-2xl text-gray-800 flex items-center gap-3">
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-3 rounded-xl text-white">
                <IconShoppingCart />
              </div>
              Pending Closeout Movements
            </h3>
          </div>
          
          <div className="mb-4 font-semibold text-lg text-gray-700">Sales in this day:</div>
          
          {loading && (
            <div className="mb-4 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl text-center">
              <div className="inline-block w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
              <div className="font-bold text-blue-800">⏳ Loading data...</div>
            </div>
          )}
          
          {!loading && ventasDecor.length === 0 && (
            <div className="mb-4 p-5 bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="text-3xl">⚠️</div>
                <div>
                  <div className="font-bold text-yellow-900 mb-1">No sales found for this date</div>
                  <div className="text-sm text-yellow-700">
                    Check the browser console (F12) for detailed logs.
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {ventasDecor.length > 0 && (
            <div className="mb-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-2xl p-5 border-l-4 border-red-500 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-red-800 mb-1">🏠 A/R (House Charge) today</div>
                  <div className="text-xs text-red-600">Credit extended to customers</div>
                </div>
                <div className="text-3xl font-bold text-red-700">
                  ${arPeriodo.toFixed(2)}
                </div>
              </div>
            </div>
          )}
          
          <div className="overflow-x-auto rounded-2xl border-2 border-gray-200">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                  <th className="p-4 text-left font-bold">Date</th>
                  <th className="p-4 text-left font-bold">Client</th>
                  <th className="p-4 text-right font-bold">Total</th>
                  <th className="p-4 text-right font-bold">Cash</th>
                  <th className="p-4 text-right font-bold">Card</th>
                  <th className="p-4 text-right font-bold">Transfer</th>
                  <th className="p-4 text-right font-bold">Paid</th>
                  <th className="p-4 text-right font-bold">Credit (A/R)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center text-gray-400 p-8">Loading...</td></tr>
                ) : ventasDecor.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-gray-400 p-8">No sales</td></tr>
                ) : (
                  ventasDecor.map((v) => {
                    const totalDesdeBreakdown = sumBk(v._bk);
                    const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                    const totalPagado = Number(v.total_pagado || 0);
                    const credito = Math.max(0, totalVenta - totalPagado);
                    return (
                      <tr 
                        key={v.id} 
                        className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${!v.cierre_id && isClosedDay ? 'bg-yellow-50' : ''}`}
                      >
                        <td className="p-4">
                          {!v.cierre_id && isClosedDay && (
                            <span className="inline-block text-xs bg-orange-500 text-white px-2 py-1 rounded-full mr-2 font-bold">
                              NEW
                            </span>
                          )}
                          {toUSFormat((v.fecha || "").toString().slice(0,10)) || "-"}
                        </td>
                        <td className="p-4">{v.cliente_nombre || (v.cliente_id ? v.cliente_id.slice(0,8) : NO_CLIENTE)}</td>
                        <td className="p-4 font-bold text-right text-gray-900">${totalVenta.toFixed(2)}</td>
                        <td className="p-4 text-green-700 font-semibold text-right">${Number(v._bk?.cash || 0).toFixed(2)}</td>
                        <td className="p-4 text-blue-700 font-semibold text-right">${Number(v._bk?.card || 0).toFixed(2)}</td>
                        <td className="p-4 text-purple-700 font-semibold text-right">${Number(v._bk?.transfer || 0).toFixed(2)}</td>
                        <td className="p-4 text-right font-semibold">${totalPagado.toFixed(2)}</td>
                        <td className="p-4 text-red-700 font-bold text-right">${credito.toFixed(2)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {ventasDecor.length > 0 && (
                <tfoot className="bg-gradient-to-r from-gray-50 to-slate-50 font-bold">
                  {isClosedDay && ventasCerr.length > 0 && (
                    <tr className="bg-blue-100">
                      <td className="p-4" colSpan={2}>In Original Closeout ({ventasCerr.length})</td>
                      <td className="p-4 text-right">
                        ${ventasCerr.reduce((t, v) => {
                          const totalDesdeBreakdown = sumBk(v._bk);
                          const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                          return t + totalVenta;
                        }, 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-green-700 text-right">
                        ${ventasCerr.reduce((t, v) => t + Number(v._bk?.cash || 0), 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-blue-700 text-right">
                        ${ventasCerr.reduce((t, v) => t + Number(v._bk?.card || 0), 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-purple-700 text-right">
                        ${ventasCerr.reduce((t, v) => t + Number(v._bk?.transfer || 0), 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-right">
                        ${ventasCerr.reduce((t, v) => t + Number(v.total_pagado || 0), 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-red-700 text-right">
                        ${ventasCerr.reduce((t, v) => {
                          const totalDesdeBreakdown = sumBk(v._bk);
                          const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                          const pagado = Number(v.total_pagado||0);
                          const ar = totalVenta - pagado; 
                          return t + (ar>0?ar:0);
                        }, 0).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  {isClosedDay && ventasPend.length > 0 && (
                    <tr className="bg-orange-50">
                      <td className="p-4" colSpan={2}>⚠️ After Closeout ({ventasPend.length})</td>
                      <td className="p-4 text-right">
                        ${ventasPend.reduce((t, v) => {
                          const totalDesdeBreakdown = sumBk(v._bk);
                          const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                          return t + totalVenta;
                        }, 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-green-700 text-right">
                        ${ventasPend.reduce((t, v) => t + Number(v._bk?.cash || 0), 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-blue-700 text-right">
                        ${ventasPend.reduce((t, v) => t + Number(v._bk?.card || 0), 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-purple-700 text-right">
                        ${ventasPend.reduce((t, v) => t + Number(v._bk?.transfer || 0), 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-right">
                        ${ventasPend.reduce((t, v) => t + Number(v.total_pagado || 0), 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-red-700 text-right">
                        ${ventasPend.reduce((t, v) => {
                          const totalDesdeBreakdown = sumBk(v._bk);
                          const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                          const pagado = Number(v.total_pagado||0);
                          const ar = totalVenta - pagado; 
                          return t + (ar>0?ar:0);
                        }, 0).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  <tr className={`${isClosedDay && ventasPend.length > 0 ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'bg-blue-50'}`}>
                    <td className="p-4" colSpan={2}>TOTAL ALL ({ventasDecor.length})</td>
                    <td className="p-4 text-right">
                      ${ventasDecor.reduce((t, v) => {
                        const totalDesdeBreakdown = sumBk(v._bk);
                        const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                        return t + totalVenta;
                      }, 0).toFixed(2)}
                    </td>
                    <td className={`p-4 text-right ${isClosedDay && ventasPend.length > 0 ? 'text-green-300' : 'text-green-700'}`}>
                      ${ventasDecor.reduce((t, v) => t + Number(v._bk?.cash || 0), 0).toFixed(2)}
                    </td>
                    <td className={`p-4 text-right ${isClosedDay && ventasPend.length > 0 ? 'text-blue-300' : 'text-blue-700'}`}>
                      ${ventasDecor.reduce((t, v) => t + Number(v._bk?.card || 0), 0).toFixed(2)}
                    </td>
                    <td className={`p-4 text-right ${isClosedDay && ventasPend.length > 0 ? 'text-purple-300' : 'text-purple-700'}`}>
                      ${ventasDecor.reduce((t, v) => t + Number(v._bk?.transfer || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-4 text-right">
                      ${ventasDecor.reduce((t, v) => t + Number(v.total_pagado || 0), 0).toFixed(2)}
                    </td>
                    <td className={`p-4 text-right ${isClosedDay && ventasPend.length > 0 ? 'text-red-300' : 'text-red-700'}`}>
                      ${ventasDecor.reduce((t, v) => {
                        const totalDesdeBreakdown = sumBk(v._bk);
                        const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                        const pagado = Number(v.total_pagado||0);
                        const ar = totalVenta - pagado; 
                        return t + (ar>0?ar:0);
                      }, 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* A/R Payments Table */}
        {avances.length > 0 && (
          <div className="bg-white rounded-3xl shadow-xl p-6">
            <h3 className="font-bold mb-5 text-2xl text-gray-800 flex items-center gap-3">
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-3 rounded-xl text-white">
                <IconBank />
              </div>
              Customer Payments on A/R (today)
            </h3>
            <div className="overflow-x-auto rounded-2xl border-2 border-gray-200">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                    <th className="p-4 text-left font-bold">Date</th>
                    <th className="p-4 text-left font-bold">Client</th>
                    <th className="p-4 text-right font-bold">Amount</th>
                    <th className="p-4 text-right font-bold">Cash</th>
                    <th className="p-4 text-right font-bold">Card</th>
                    <th className="p-4 text-right font-bold">Transfer</th>
                    <th className="p-4 text-left font-bold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {avances.map((p) => {
                    const cash = Number(p._bk?.cash || 0);
                    const card = Number(p._bk?.card || 0);
                    const transfer = Number(p._bk?.transfer || 0);
                    const amount = cash + card + transfer || Number(p.monto || 0);
                    return (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-purple-50 transition-colors">
                        <td className="p-4">{toUSFormat(pagoYMD(p)) || "-"}</td>
                        <td className="p-4">{p.cliente_nombre || (p.cliente_id ? p.cliente_id.slice(0,8) : NO_CLIENTE)}</td>
                        <td className="p-4 font-bold text-right text-gray-900">${amount.toFixed(2)}</td>
                        <td className="p-4 text-green-700 font-semibold text-right">${cash.toFixed(2)}</td>
                        <td className="p-4 text-blue-700 font-semibold text-right">${card.toFixed(2)}</td>
                        <td className="p-4 text-purple-700 font-semibold text-right">${transfer.toFixed(2)}</td>
                        <td className="p-4 font-mono text-sm">{p.referencia || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gradient-to-r from-gray-50 to-slate-50 font-bold">
                  <tr>
                    <td className="p-4" colSpan={2}>Totals</td>
                    <td className="p-4 text-right">
                      ${avances.reduce((t, p) => t + sumBk(p._bk), 0).toFixed(2)}
                    </td>
                    <td className="p-4 text-green-700 text-right">
                      ${avances.reduce((t, p) => t + Number(p._bk?.cash || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-4 text-blue-700 text-right">
                      ${avances.reduce((t, p) => t + Number(p._bk?.card || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-4 text-purple-700 text-right">
                      ${avances.reduce((t, p) => t + Number(p._bk?.transfer || 0), 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* End of Day Tenders */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <h3 className="font-bold text-2xl text-gray-800 mb-5 flex items-center gap-3">
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-3 rounded-xl text-white">
              <IconCalculator />
            </div>
            End of Day — Tenders
          </h3>
          
          <div className="overflow-x-auto rounded-2xl border-2 border-gray-200 mb-6">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-amber-600 to-orange-600 text-white">
                  <th className="p-4 text-left font-bold">Pay Type</th>
                  <th className="p-4 text-right font-bold">System</th>
                  <th className="p-4 text-right font-bold">Counted</th>
                  <th className="p-4 text-center font-bold">Calculator</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 hover:bg-green-50 transition-colors">
                  <td className="p-4 font-bold text-gray-800">💵 CASH</td>
                  <td className="p-4 text-right font-semibold">${(systemGrid?.cash || 0).toFixed(2)}</td>
                  <td className="p-4">
                    <input
                      type="number"
                      step="0.01"
                      className="border-2 border-gray-200 focus:border-green-500 rounded-xl p-3 w-full text-right font-bold transition-colors"
                      disabled={isClosedDay}
                      value={counted?.cash || 0}
                      onChange={(e)=>setCounted((c)=>({...c, cash:Number(e.target.value||0)}))}
                    />
                  </td>
                  <td className="p-4 text-center">
                    <button
                      type="button"
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 py-2 rounded-xl font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={()=>setOpenDesglose(true)}
                      disabled={isClosedDay}
                    >
                      <IconCalculator />
                    </button>
                  </td>
                </tr>
                <tr className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                  <td className="p-4 font-bold text-gray-800">💳 CARD</td>
                  <td className="p-4 text-right font-semibold">${(systemGrid?.card || 0).toFixed(2)}</td>
                  <td className="p-4">
                    <input
                      type="number"
                      step="0.01"
                      className="border-2 border-gray-200 focus:border-blue-500 rounded-xl p-3 w-full text-right font-bold transition-colors"
                      disabled={isClosedDay}
                      value={counted?.card || 0}
                      onChange={(e)=>setCounted((c)=>({...c, card:Number(e.target.value||0)}))}
                    />
                  </td>
                  <td className="p-4 text-center text-gray-400">—</td>
                </tr>
                <tr className="border-b border-gray-100 hover:bg-purple-50 transition-colors">
                  <td className="p-4 font-bold text-gray-800">🏦 TRANSFER</td>
                  <td className="p-4 text-right font-semibold">${(systemGrid?.transfer || 0).toFixed(2)}</td>
                  <td className="p-4">
                    <input
                      type="number"
                      step="0.01"
                      className="border-2 border-gray-200 focus:border-purple-500 rounded-xl p-3 w-full text-right font-bold transition-colors"
                      disabled={isClosedDay}
                      value={counted?.transfer || 0}
                      onChange={(e)=>setCounted((c)=>({...c, transfer:Number(e.target.value||0)}))}
                    />
                  </td>
                  <td className="p-4 text-center text-gray-400">—</td>
                </tr>
                <tr className="bg-gradient-to-r from-gray-50 to-slate-50">
                  <td className="p-4 font-bold text-gray-900 text-lg">Total</td>
                  <td className="p-4 text-right font-bold text-xl text-blue-700">
                    ${sumBk(systemGrid).toFixed(2)}
                  </td>
                  <td className="p-4 text-right font-bold text-xl text-green-700">
                    ${sumBk(counted).toFixed(2)}
                  </td>
                  <td className="p-4"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl p-5 border-2 border-red-200 shadow-md">
              <div className="text-sm text-red-600 font-bold uppercase mb-2">🏠 A/R (House Charge)</div>
              <div className="text-3xl font-bold text-red-700">${arPeriodo.toFixed(2)}</div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 border-2 border-green-200 shadow-md">
              <div className="text-sm text-green-600 font-bold uppercase mb-2">💰 A/R Payments</div>
              <div className="text-3xl font-bold text-green-700">${pagosCxC.toFixed(2)}</div>
            </div>
            <div className={`bg-gradient-to-br rounded-2xl p-5 border-2 shadow-md ${overUnder>=0 ? 'from-green-50 to-emerald-50 border-green-200' : 'from-red-50 to-orange-50 border-red-200'}`}>
              <div className={`text-sm font-bold uppercase mb-2 ${overUnder>=0 ? 'text-green-600' : 'text-red-600'}`}>
                {overUnder >= 0 ? '📈' : '📉'} Over/Under
              </div>
              <div className={`text-3xl font-bold ${overUnder>=0 ? 'text-green-700' : 'text-red-700'}`}>
                ${overUnder.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Comment and PDF */}
        <div className="bg-white rounded-3xl shadow-xl p-6 space-y-6">
          <div>
            <label className="block font-bold text-lg mb-3 text-gray-800 flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Comment
            </label>
            <textarea
              className="border-2 border-gray-200 focus:border-blue-500 p-4 w-full rounded-2xl transition-colors resize-none"
              rows={3}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              disabled={isClosedDay}
              placeholder="Add any relevant notes about this closeout..."
            />
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border-2 border-blue-200">
            <h3 className="font-bold text-xl text-gray-800 mb-4 flex items-center gap-2">
              <IconDocument />
              PDF Report
            </h3>
            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  id="pdf-download" 
                  name="pdf-mode" 
                  value="download"
                  checked={pdfMode === "download"} 
                  onChange={() => setPdfMode("download")} 
                  className="w-5 h-5 text-blue-600"
                />
                <span className="font-semibold text-gray-700">Download PDF</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  id="pdf-print" 
                  name="pdf-mode" 
                  value="print"
                  checked={pdfMode === "print"} 
                  onChange={() => setPdfMode("print")} 
                  className="w-5 h-5 text-blue-600"
                />
                <span className="font-semibold text-gray-700">Print PDF</span>
              </label>
            </div>
            <button
              type="button"
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-4 rounded-xl font-bold w-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              onClick={generarPDF}
              disabled={generandoPDF}
            >
              {generandoPDF ? (
                <>
                  <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <IconDocument />
                  <span>Generate PDF Report</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Action Button */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <button
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-5 rounded-2xl font-bold text-xl w-full shadow-xl hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            disabled={guardando || isClosedDay || (ventasDecor.length + avances.length === 0)}
            onClick={() => setShowConfirmModal(true)}
          >
            {guardando ? (
              <>
                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <IconCheck />
                <span>Register Closeout</span>
              </>
            )}
          </button>
          
          {mensaje && (
            <div className="mt-4 p-4 rounded-2xl text-center font-semibold bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-2 border-blue-200">
              {mensaje}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={showConfirmModal}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={async () => { await guardarCierre({ preventDefault: () => {} }); }}
        gridSystem={systemGrid}
        counted={counted}
        arPeriodo={arPeriodo}
        pagosCxC={pagosCxC}
        comentario={comentario}
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
      />

      <DesgloseEfectivoModal
        open={openDesglose}
        onClose={() => setOpenDesglose(false)}
        onSave={(total) => { setCounted((r)=>({ ...r, cash: Number(total||0) })); setOpenDesglose(false); }}
      />
    </div>
  );
}