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
  
  // Crear un objeto Date para la fecha en Eastern Time
  const dateEastern = new Date(`${isoDay}T00:00:00`);
  
  // Obtener el inicio del día en Eastern Time (00:00:00)
  const startEastern = new Date(dateEastern);
  startEastern.setHours(0, 0, 0, 0);
  
  // Obtener el fin del día en Eastern Time (23:59:59.999)
  const endEastern = new Date(dateEastern);
  endEastern.setHours(23, 59, 59, 999);
  
  // Convertir a UTC para la consulta
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

// MM/DD/YYYY en Eastern Time
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
// 1) Fechas con actividad (incluye cerradas)
function useFechasPendientes(van_id) {
  const [fechas, setFechas] = useState([]);
  useEffect(() => {
    if (!van_id) { setFechas([]); return; }
    (async () => {
      const hoy = new Date();
      const desde = new Date(hoy); desde.setDate(hoy.getDate() - 90);
      const toISO = (d) => d.toISOString().slice(0, 10);
      
      // Obtener fechas en Eastern Time
      const { data, error } = await supabase
        .from("vw_expected_por_dia_van")
        .select("dia").eq("van_id", van_id)
        .gte("dia", toISO(desde)).lte("dia", toISO(hoy))
        .order("dia", { ascending: false });
      
      if (error) { 
        console.error("❌ Error cargando fechas pendientes:", error);
        setFechas([]); 
        return; 
      }
      
      console.log("✅ Fechas pendientes crudas:", data);
      
      // Convertir fechas de Eastern Time a formato UTC para almacenamiento
      const fechasUTC = (data || []).map((r) => {
        const dateEastern = new Date(r.dia);
        const dateUTC = new Date(dateEastern.toLocaleString("en-US", { timeZone: "UTC" }));
        return dateUTC.toISOString().slice(0, 10);
      }).filter(isIsoDate);
      
      console.log("✅ Fechas pendientes convertidas a UTC:", fechasUTC);
      setFechas(fechasUTC);
    })();
  }, [van_id]);
  return fechas;
}

// 2) Fechas ya cerradas (para marcar en el select)
function useFechasCerradas(van_id) {
  const [fechasCerradas, setFechasCerradas] = useState([]);
  useEffect(() => {
    if (!van_id) { setFechasCerradas([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from("cierres_van")
        .select("fecha_inicio").eq("van_id", van_id);
      if (error) { 
        console.error("❌ Error cargando fechas cerradas:", error);
        setFechasCerradas([]); 
        return; 
      }
      console.log("✅ Fechas cerradas cargadas:", data);
      setFechasCerradas(Array.from(new Set((data || []).map(x => x.fecha_inicio))));
    })();
  }, [van_id]);
  return fechasCerradas;
}

// 3) Snapshot de cierre si existe
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
        console.log("ℹ️ No hay cierre para esta fecha o error:", error);
        setCierreInfo(null); 
        return; 
      }
      console.log("✅ Cierre info cargada:", data);
      setCierreInfo(data);
    })();
  }, [van_id, fecha]);
  return cierreInfo;
}

// 4) Movimientos PENDIENTES
// 4) Movimientos PENDIENTES
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
        
        // Usar las fechas directamente sin convertir a bounds de Eastern
        // porque las fechas ya vienen en formato YYYY-MM-DD
        
        // BUSCAR EN LA TABLA VENTAS (no ventas_local)
        console.log("🔍 Searching sales in 'ventas' table...");
        
        // Primero intentar con fecha_local
        let ventasData = null;
        let errorVentas = null;
        
        const { data: testData } = await supabase
          .from("ventas")
          .select("*")
          .limit(1)
          .maybeSingle();
        
        if (testData) {
          console.log("📋 Available fields in ventas:", Object.keys(testData));
        }
        
        // Intentar con fecha_local
        if (testData && 'fecha_local' in testData) {
          const result = await supabase
            .from("ventas")
            .select("*")
            .eq("van_id", van_id)
            .gte("fecha_local", fechaInicio)
            .lte("fecha_local", fechaFin)
            .is("cierre_id", null)
            .order("created_at", { ascending: true });
          
          ventasData = result.data;
          errorVentas = result.error;
          
          if (!errorVentas && ventasData) {
            console.log("✅ Sales found with fecha_local:", ventasData.length);
          }
        }
        
        // Si no hay fecha_local o falló, usar 'fecha'
        if (!ventasData || ventasData.length === 0) {
          console.log("Trying with 'fecha' field...");
          const result = await supabase
            .from("ventas")
            .select("*")
            .eq("van_id", van_id)
            .gte("fecha", `${fechaInicio}T00:00:00`)
            .lte("fecha", `${fechaFin}T23:59:59`)
            .is("cierre_id", null)
            .order("created_at", { ascending: true });
          
          ventasData = result.data;
          errorVentas = result.error;
          
          if (!errorVentas && ventasData) {
            console.log("✅ Sales found with fecha:", ventasData.length);
          }
        }
        
        // Si aún no hay resultados, intentar sin filtro de fecha para debug
        if (!ventasData || ventasData.length === 0) {
          console.log("⚠️ No sales found, checking all sales for this van...");
          const result = await supabase
            .from("ventas")
            .select("*")
            .eq("van_id", van_id)
            .is("cierre_id", null)
            .order("created_at", { ascending: false })
            .limit(10);
          
          console.log("Last 10 unclosed sales for this van:", result.data);
          
          // Revisar las fechas de estas ventas
          if (result.data && result.data.length > 0) {
            result.data.forEach(v => {
              console.log("Sale:", {
                id: v.id,
                fecha: v.fecha,
                fecha_local: v.fecha_local,
                created_at: v.created_at,
                total: v.total_venta
              });
            });
          }
        }
        
        setVentas(ventasData || []);
        
        // BUSCAR PAGOS en la tabla 'pagos' (no pagos_local)
        console.log("🔍 Searching payments in 'pagos' table...");
        
        let pagosData = null;
        
        // Intentar con fecha_pago
        const resultPagos = await supabase
          .from("pagos")
          .select("*")
          .eq("van_id", van_id)
          .gte("fecha_pago", `${fechaInicio}T00:00:00`)
          .lte("fecha_pago", `${fechaFin}T23:59:59`)
          .is("cierre_id", null)
          .order("fecha_pago", { ascending: true });
        
        pagosData = resultPagos.data;
        
        if (!resultPagos.error && pagosData) {
          console.log("✅ Payments found:", pagosData.length);
        } else {
          // Intentar con 'fecha'
          const resultPagos2 = await supabase
            .from("pagos")
            .select("*")
            .eq("van_id", van_id)
            .gte("fecha", `${fechaInicio}T00:00:00`)
            .lte("fecha", `${fechaFin}T23:59:59`)
            .is("cierre_id", null)
            .order("created_at", { ascending: true });
          
          pagosData = resultPagos2.data;
          console.log("✅ Payments found with fecha:", pagosData?.length || 0);
        }
        
        setPagos(pagosData || []);
        
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

// 5) Movimientos CERRADOS (por snapshot de cierre)
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

        console.log("✅ Movimientos cerrados cargados - Ventas:", ventasC.length, "Pagos:", pagosC.length);
        setVentas(ventasC); setPagos(pagosC);
      } finally { setLoading(false); }
    })();
  }, [cierre_id]);

  return { ventas, pagos, loading };
}

// 6) Expected (solo para días abiertos; en cerrados usamos cierreInfo)
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
        console.error("❌ Error cargando expected:", error);
      }
      
      const expected = {
        cash: Number(data?.cash_expected || 0),
        card: Number(data?.card_expected || 0),
        transfer: Number(data?.transfer_expected || 0),
        mix: Number(data?.mix_unallocated || 0),
      };
      
      console.log("✅ Expected cargado para", dia, ":", expected);
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
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 shadow-xl w-[360px] max-w-full">
        <h2 className="text-lg font-bold mb-2">Cash Calculator</h2>
        <table className="w-full mb-4">
          <tbody>
            {billetes.map((b, i) => (
              <tr key={b.nombre}>
                <td className="py-1">{b.nombre}</td>
                <td>
                  <input
                    type="number" min="0"
                    className="border p-1 w-20 rounded text-right"
                    value={b.cantidad}
                    onChange={(e) => {
                      const nuevo = [...billetes]; nuevo[i].cantidad = e.target.value; setBilletes(nuevo);
                    }}
                  />
                </td>
                <td className="text-xs pl-2 text-gray-400">${(b.valor * Number(b.cantidad || 0)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mb-4 text-right font-bold text-blue-700">Total: ${total.toFixed(2)}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded">Cancel</button>
          <button onClick={() => onSave(total)} className="px-3 py-1 bg-blue-700 text-white rounded">Use Total</button>
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
  
  // Validar que gridSystem y counted existan
  const safeGridSystem = gridSystem || emptyBk();
  const safeCounted = counted || emptyBk();
  
  const totalSystem = sumBk(safeGridSystem);
  const totalCounted = sumBk(safeCounted);
  const overUnder = (totalCounted - totalSystem);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 shadow-xl w-[420px] max-w-full">
        <h2 className="font-bold text-lg mb-3 text-blue-800">Confirm Closeout</h2>
        <div className="mb-2 text-sm"><b>From:</b> {toUSFormat(fechaInicio)} <b>To:</b> {toUSFormat(fechaFin)}</div>
        <div className="border rounded bg-gray-50 p-3 mb-3 text-xs">
          <div><b>Cash (system):</b> ${(safeGridSystem.cash || 0).toFixed(2)} | <b>counted:</b> ${(safeCounted.cash || 0).toFixed(2)}</div>
          <div><b>Card (system):</b> ${(safeGridSystem.card || 0).toFixed(2)} | <b>counted:</b> ${(safeCounted.card || 0).toFixed(2)}</div>
          <div><b>Transfer (system):</b> ${(safeGridSystem.transfer || 0).toFixed(2)} | <b>counted:</b> ${(safeCounted.transfer || 0).toFixed(2)}</div>
          <div><b>Total system:</b> ${totalSystem.toFixed(2)} | <b>Total counted:</b> ${totalCounted.toFixed(2)}</div>
          <div><b>Over/Under:</b> ${overUnder.toFixed(2)}</div>
          <div className="mt-2"><b>House Charge (A/R) this day:</b> ${(arPeriodo || 0).toFixed(2)}</div>
          <div><b>Pmt on House Chrg (today):</b> ${(pagosCxC || 0).toFixed(2)}</div>
          <div className="mt-2"><b>Comment:</b> {comentario || "-"}</div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="bg-gray-200 px-3 py-1 rounded">Cancel</button>
          <button onClick={onConfirm} className="bg-blue-700 text-white px-4 py-1 rounded font-bold">Confirm</button>
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

  console.log("🚀 CierreVan montado - Van:", van);

  const fechasPendientes = useFechasPendientes(van?.id);
  const fechasCerradas = useFechasCerradas(van?.id);
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");

  const cierreInfo = useCierreInfo(van?.id, fechaSeleccionada);

// Modificar la función de selección de fecha en el componente principal
useEffect(() => {
  console.log("📅 Fechas pendientes:", fechasPendientes);
  if (fechasPendientes.length === 0) { 
    setFechaSeleccionada(""); 
    return; 
  }
  
  let pref = "";
  try { 
    pref = localStorage.getItem("pre_cierre_fecha") || ""; 
  } catch {}
  
  // Convertir preferencia a Eastern Time si existe
  if (isIsoDate(pref)) {
    const datePref = new Date(pref);
    // Convertir a Eastern Time
    const prefEastern = new Date(datePref.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const prefEasternStr = prefEastern.toISOString().slice(0, 10);
    
    if (fechasPendientes.includes(prefEasternStr)) {
      setFechaSeleccionada(prefEasternStr);
      return;
    }
  }
  
  // Obtener fecha actual en Eastern Time
  const nowEastern = new Date();
  const nowEasternStr = nowEastern.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  
  // Convertir Eastern Time a formato YYYY-MM-DD para comparar
  const [month, day, year] = nowEasternStr.split("/");
  const todayEastern = `${year}-${month}-${day}`;
  
  console.log("Hoy en Eastern Time:", todayEastern);
  
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

  console.log("📊 Datos crudos - Ventas:", ventasRaw.length, "Pagos:", pagosRaw.length);

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
      console.log("✅ Clientes cargados:", Object.keys(dic).length);
      setClientesDic(dic);
    })();
  }, [clienteKeys.join(",")]);

// 🔵 PAGOS DECORADOS: ventas + CxC + cualquier pago suelto
// 🔵 PAGOS DECORADOS: ventas + CxC + cualquier pago suelto
const pagosDecor = useMemo(() => {
  const arr = [];

  // 1) Pagos sueltos tipo CxC de la tabla pagos
  for (const c of pagosRaw || []) {
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

  // 2) Pagos que vienen de las ventas (usando los campos directos de la venta)
  for (const v of ventasRaw || []) {
    // Verificar si la venta tiene pagos en los campos directos
    const pagoEfectivo = Number(v.pago_efectivo || 0);
    const pagoTarjeta = Number(v.pago_tarjeta || 0);
    const pagoTransferencia = Number(v.pago_transferencia || 0);
    
    const totalPagoVenta = pagoEfectivo + pagoTarjeta + pagoTransferencia;
    
    // Solo agregar si hay algún pago
    if (totalPagoVenta > 0) {
      arr.push({
        id: `venta-pago-${v.id}`,
        venta_id: v.id,
        cliente_id: v.cliente_id,
        fecha_local: v.fecha_local || v.fecha || v.created_at,
        fecha_pago: v.fecha_local || v.fecha || v.created_at,
        cliente_nombre:
          v.cliente_nombre ||
          (clientesDic[v.cliente_id]
            ? displayName(clientesDic[v.cliente_id])
            : "No client"),
        pago_efectivo: pagoEfectivo,
        pago_tarjeta: pagoTarjeta,
        pago_transferencia: pagoTransferencia,
        monto: totalPagoVenta,
        metodo_pago: pagoEfectivo > 0 ? 'cash' : (pagoTarjeta > 0 ? 'card' : 'transfer'),
        referencia: `VENTA-${v.id?.slice(0, 8)}`,
        idempotency_key: `venta-${v.id}`,
      });
    }
  }

  // 3) Decoración final con breakdown
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
  const decor = (ventasRaw || []).map((v) => {
    const ficha = clientesDic[v.cliente_id];
    
    // Usar los campos de pago directos de la venta
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

  console.log("✅ Ventas decoradas:", decor.length);
  if (decor.length > 0) {
    console.log("Muestra de venta decorada:", decor[0]);
    console.log("Breakdown de primera venta:", decor[0]._bk);
  }

  return { ventasDecor: decor, excedentesCxC: [] };
}, [ventasRaw, clientesDic]);

const avances = useMemo(() => {
  // Si el día está cerrado, simplemente usa todo lo que no tiene venta_id
  if (isClosedDay) {
    return (pagosDecor || []).filter(p => !p.venta_id);
  }

  // Función para comparar fecha del pago con la fecha seleccionada (en Eastern Time)
  const isSameEasternDay = (p) => {
    const ymd = pagoYMD(p);  // ← convierte cualquier fecha del pago a YYYY-MM-DD en Eastern
    return ymd === fechaSeleccionada;
  };

  return (pagosDecor || []).filter(p => {
    // Tiene que ser un pago sin venta
    if (p.venta_id) return false;

    // Tiene que ser de la misma van
    if (p.van_id && p.van_id !== van?.id) return false;

    // Validar que cae en el día seleccionado usando Eastern Time
    return isSameEasternDay(p);
  });
}, [isClosedDay, pagosDecor, fechaSeleccionada, van?.id]);



  const expectedOpen = useExpectedDia(van?.id, fechaSeleccionada);
  
 // 🔵 GRID DEL SISTEMA - AGRUPANDO PAGOS REALES POR idempotency_key
// 🔵 GRID DEL SISTEMA — SUMA PAGOS REALES SIN DUPLICARLOS
const systemGrid = useMemo(() => {
  const grupos = new Map();

  for (const p of pagosDecor || []) {
    // Agrupamos por idempotency_key (ideal)
    // Si falta, usamos referencia
    // Si falta, generamos clave estable usando método + fecha + cliente
    const key =
      p.idempotency_key ||
      p.referencia ||
      `${p.metodo_pago}-${pagoYMD(p)}-${p.cliente_id || "nc"}`;

    if (!grupos.has(key)) {
      grupos.set(key, { cash: 0, card: 0, transfer: 0 });
    }

    const g = grupos.get(key);

    // Sumamos por método según la vista _bk que ya está estandarizada
    g.cash += Number(p._bk?.cash || 0);
    g.card += Number(p._bk?.card || 0);
    g.transfer += Number(p._bk?.transfer || 0);

    grupos.set(key, g);
  }

  // Sumamos totales REALES (sin duplicados)
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
    console.log("📊 Totales esperados panel:", result);
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

    console.log("💾 Guardando cierre con payload:", payload);

    const { data, error } = await supabase
      .from("cierres_van")
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.error("❌ Error guardando cierre:", error);
      setGuardando(false);
      setMensaje("Error saving closeout: " + error.message);
      setTimeout(() => setMensaje(""), 3500);
      return;
    }

    const cierre_id = data?.id;
    console.log("✅ Cierre guardado con ID:", cierre_id);
    
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
      console.error("❌ Error generando PDF:", error);
      setMensaje("Error generating PDF: " + error.message);
    } finally {
      setGenerandoPDF(false);
      setTimeout(() => setMensaje(""), 3500);
    }
  };

  // Mostrar mensaje de debugging si no hay datos
  if (!loading && fechaSeleccionada && ventasDecor.length === 0 && avances.length === 0) {
    console.warn("⚠️ NO SE ENCONTRARON DATOS PARA LA FECHA:", fechaSeleccionada);
  }

  return (
    <div className="max-w-4xl mx-auto mt-6 bg-white rounded shadow p-6">
      <h2 className="font-bold text-xl mb-4 text-blue-900">Van Closeout</h2>

      {/* DEBUG INFO */}
      {!loading && fechaSeleccionada && ventasDecor.length === 0 && (
        <div className="mb-4 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700">
          <p className="font-bold mb-2">⚠️ No se encontraron ventas para esta fecha</p>
          <p className="text-sm">Revisa la consola del navegador (F12) para ver los logs detallados de la búsqueda.</p>
          <p className="text-sm mt-2">Van ID: {van?.id || 'No definido'}</p>
          <p className="text-sm">Fecha seleccionada (UTC): {fechaSeleccionada}</p>
          <p className="text-sm">Fecha seleccionada (Eastern): {toUSFormat(fechaSeleccionada)}</p>
        </div>
      )}

      <div className="mb-4">
        <label className="font-bold text-sm mb-1 block">Select date to close or view:</label>
        <select
          className="border p-2 rounded w-full max-w-xs"
          value={fechaSeleccionada}
          onChange={(e) => {
            const v = e.target.value;
            console.log("📅 Fecha seleccionada cambiada a:", v);
            setFechaSeleccionada(v);
            try { localStorage.setItem("pre_cierre_fecha", v); } catch {}
          }}
        >
          {fechasPendientes.length === 0 ? (
            <option value="">No available days</option>
          ) : (
            fechasPendientes.map((f) => {
              // Convertir fecha UTC a Eastern Time para mostrar
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
          <div className="mt-2 p-2 rounded bg-blue-50 border border-blue-200">
            <div className="text-sm font-semibold text-blue-800 mb-1">
              📋 This date was closed on {toUSFormat(toEasternYMD(cierreInfo.created_at))}
            </div>
            <div className="text-xs text-gray-600">
              You can view and reprint the report, but cannot modify the closeout.
            </div>
          </div>
        )}

        {isClosedDay && ventasPend.length > 0 && (
          <div className="mt-2 p-3 rounded bg-orange-50 border-l-4 border-orange-500">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <div className="text-sm font-semibold text-orange-800">
                  {ventasPend.length} new sale{ventasPend.length > 1 ? 's' : ''} made after closeout
                </div>
                <div className="text-xs text-orange-600 mt-1">
                  These transactions are NOT included in the original closeout. Expected totals have been recalculated.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- PAYMENT TOTALS SUMMARY (usa systemGrid) ---------- */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-lg p-5 mb-6 border border-blue-200">
        <h3 className="font-bold mb-4 text-xl text-blue-900 flex items-center">
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Payment Totals Summary
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">💵 CASH</span>
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-green-700">
              ${(systemGrid?.cash || 0).toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">From sales & A/R payments</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">💳 CARD</span>
              <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-blue-700">
              ${(systemGrid?.card || 0).toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">From sales & A/R payments</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">🏦 TRANSFER</span>
              <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-purple-700">
              ${(systemGrid?.transfer || 0).toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">From sales & A/R payments</div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-md p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold opacity-90">GRAND TOTAL</div>
              <div className="text-4xl font-bold mt-1">
                ${sumBk(systemGrid).toFixed(2)}
              </div>
            </div>
            <svg className="w-16 h-16 opacity-30" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>

      {/* ---------- TABLA DE VENTAS ---------- */}
      <div className="bg-gray-50 rounded-xl shadow p-4 mb-6">
        <h3 className="font-bold mb-3 text-lg text-blue-800">Pending Closeout Movements</h3>
        <div className="mb-2 font-semibold text-gray-700">Sales in this day:</div>
        
        {loading && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
            <div className="font-bold text-blue-800">⏳ Cargando datos...</div>
          </div>
        )}
        
        {!loading && ventasDecor.length === 0 && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
            <div className="font-bold text-yellow-800 mb-1">⚠️ No sales found for this date</div>
            <div className="text-yellow-700">
              Check the browser console (F12) for detailed logs.
            </div>
          </div>
        )}
        
        {ventasDecor.length > 0 && (
          <div className="mb-3 p-3 bg-red-50 border-l-4 border-red-500 rounded">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-red-800">🏠 A/R (House Charge) today</div>
                <div className="text-xs text-red-600 mt-1">Credit extended to customers</div>
              </div>
              <div className="text-2xl font-bold text-red-700">
                ${arPeriodo.toFixed(2)}
              </div>
            </div>
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-blue-100">
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Client</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Cash</th>
                <th className="p-2 text-right">Card</th>
                <th className="p-2 text-right">Transfer</th>
                <th className="p-2 text-right">Paid</th>
                <th className="p-2 text-right">Credit (A/R)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center text-gray-400 p-4">Loading...</td></tr>
              ) : ventasDecor.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 p-4">No sales</td></tr>
              ) : (
                ventasDecor.map((v) => {
                  const totalDesdeBreakdown = sumBk(v._bk);
                  const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                  const totalPagado = Number(v.total_pagado || 0);
                  const credito = Math.max(0, totalVenta - totalPagado);
                  return (
                    <tr 
                      key={v.id} 
                      className={`border-b hover:bg-gray-50 ${!v.cierre_id && isClosedDay ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="p-2">
                        {!v.cierre_id && isClosedDay && (
                          <span className="inline-block text-xs bg-orange-500 text-white px-2 py-0.5 rounded mr-2 font-semibold">
                            NEW
                          </span>
                        )}
                        {toUSFormat((v.fecha || "").toString().slice(0,10)) || "-"}
                      </td>
                      <td className="p-2">{v.cliente_nombre || (v.cliente_id ? v.cliente_id.slice(0,8) : NO_CLIENTE)}</td>
                      <td className="p-2 font-semibold text-right">${totalVenta.toFixed(2)}</td>
                      <td className="p-2 text-green-700 text-right">${Number(v._bk?.cash || 0).toFixed(2)}</td>
                      <td className="p-2 text-blue-700 text-right">${Number(v._bk?.card || 0).toFixed(2)}</td>
                      <td className="p-2 text-purple-700 text-right">${Number(v._bk?.transfer || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">${totalPagado.toFixed(2)}</td>
                      <td className="p-2 text-red-700 font-semibold text-right">${credito.toFixed(2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {ventasDecor.length > 0 && (
              <tfoot className="bg-blue-50 font-bold text-xs">
                {isClosedDay && ventasCerr.length > 0 && (
                  <tr className="bg-blue-100">
                    <td className="p-2" colSpan={2}>In Original Closeout ({ventasCerr.length})</td>
                    <td className="p-2 text-right">
                      ${ventasCerr.reduce((t, v) => {
                        const totalDesdeBreakdown = sumBk(v._bk);
                        const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                        return t + totalVenta;
                      }, 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-green-700 text-right">
                      ${ventasCerr.reduce((t, v) => t + Number(v._bk?.cash || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-blue-700 text-right">
                      ${ventasCerr.reduce((t, v) => t + Number(v._bk?.card || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-purple-700 text-right">
                      ${ventasCerr.reduce((t, v) => t + Number(v._bk?.transfer || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-right">
                      ${ventasCerr.reduce((t, v) => t + Number(v.total_pagado || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-red-700 text-right">
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
                    <td className="p-2" colSpan={2}>⚠️ After Closeout ({ventasPend.length})</td>
                    <td className="p-2 text-right">
                      ${ventasPend.reduce((t, v) => {
                        const totalDesdeBreakdown = sumBk(v._bk);
                        const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                        return t + totalVenta;
                      }, 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-green-700 text-right">
                      ${ventasPend.reduce((t, v) => t + Number(v._bk?.cash || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-blue-700 text-right">
                      ${ventasPend.reduce((t, v) => t + Number(v._bk?.card || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-purple-700 text-right">
                      ${ventasPend.reduce((t, v) => t + Number(v._bk?.transfer || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-right">
                      ${ventasPend.reduce((t, v) => t + Number(v.total_pagado || 0), 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-red-700 text-right">
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
                <tr className={`${isClosedDay && ventasPend.length > 0 ? 'bg-blue-200' : 'bg-blue-50'}`}>
                  <td className="p-2" colSpan={2}>TOTAL ALL ({ventasDecor.length})</td>
                  <td className="p-2 text-right">
                    ${ventasDecor.reduce((t, v) => {
                      const totalDesdeBreakdown = sumBk(v._bk);
                      const totalVenta = Number(v.total_venta) || totalDesdeBreakdown;
                      return t + totalVenta;
                    }, 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-green-700 text-right">
                    ${ventasDecor.reduce((t, v) => t + Number(v._bk?.cash || 0), 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-blue-700 text-right">
                    ${ventasDecor.reduce((t, v) => t + Number(v._bk?.card || 0), 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-purple-700 text-right">
                    ${ventasDecor.reduce((t, v) => t + Number(v._bk?.transfer || 0), 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-right">
                    ${ventasDecor.reduce((t, v) => t + Number(v.total_pagado || 0), 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-red-700 text-right">
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

      {/* ---------- PAGOS CxC ---------- */}
      {avances.length > 0 && (
        <div className="bg-gray-50 rounded-xl shadow p-4 mb-6">
          <h3 className="font-bold mb-3 text-lg text-blue-800">Customer Payments on A/R (today)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-blue-100">
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Client</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2 text-right">Cash</th>
                  <th className="p-2 text-right">Card</th>
                  <th className="p-2 text-right">Transfer</th>
                  <th className="p-2 text-left">Reference</th>
                </tr>
              </thead>
              <tbody>
                {avances.map((p) => {
                  const cash = Number(p._bk?.cash || 0);
                  const card = Number(p._bk?.card || 0);
                  const transfer = Number(p._bk?.transfer || 0);
                  const amount = cash + card + transfer || Number(p.monto || 0);
                  return (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{toUSFormat(pagoYMD(p)) || "-"}</td>
                      <td className="p-2">{p.cliente_nombre || (p.cliente_id ? p.cliente_id.slice(0,8) : NO_CLIENTE)}</td>
                      <td className="p-2 font-semibold text-right">${amount.toFixed(2)}</td>
                      <td className="p-2 text-green-700 text-right">${cash.toFixed(2)}</td>
                      <td className="p-2 text-blue-700 text-right">${card.toFixed(2)}</td>
                      <td className="p-2 text-purple-700 text-right">${transfer.toFixed(2)}</td>
                      <td className="p-2">{p.referencia || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-blue-50 font-bold">
                <tr>
                  <td className="p-2" colSpan={2}>Totals</td>
                  <td className="p-2 text-right">
                    ${avances.reduce((t, p) => t + sumBk(p._bk), 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-green-700 text-right">
                    ${avances.reduce((t, p) => t + Number(p._bk?.cash || 0), 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-blue-700 text-right">
                    ${avances.reduce((t, p) => t + Number(p._bk?.card || 0), 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-purple-700 text-right">
                    ${avances.reduce((t, p) => t + Number(p._bk?.transfer || 0), 0).toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ---------- END OF DAY — TENDERS (System ahora = systemGrid) ---------- */}
      <div className="mb-4">
        <h3 className="font-bold text-blue-800 mb-2">End of Day — Tenders</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 text-left">Pay Type</th>
                <th className="p-2 text-right">System</th>
                <th className="p-2 text-right">Counted</th>
                <th className="p-2">Calculator</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-2">CASH</td>
                <td className="p-2 text-right">${(systemGrid?.cash || 0).toFixed(2)}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="border rounded p-1 w-full text-right"
                    disabled={isClosedDay}
                    value={counted?.cash || 0}
                    onChange={(e)=>setCounted((c)=>({...c, cash:Number(e.target.value||0)}))}
                  />
                </td>
                <td className="p-2 text-center">
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-blue-100 border border-blue-300 hover:bg-blue-200"
                    onClick={()=>setOpenDesglose(true)}
                    disabled={isClosedDay}
                  >Calculator</button>
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-2">VISA / MASTERCARD</td>
                <td className="p-2 text-right">${(systemGrid?.card || 0).toFixed(2)}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="border rounded p-1 w-full text-right"
                    disabled={isClosedDay}
                    value={counted?.card || 0}
                    onChange={(e)=>setCounted((c)=>({...c, card:Number(e.target.value||0)}))}
                  />
                </td>
                <td className="p-2 text-center text-gray-400">—</td>
              </tr>
              <tr className="border-b">
                <td className="p-2">TRANSFER</td>
                <td className="p-2 text-right">${(systemGrid?.transfer || 0).toFixed(2)}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="border rounded p-1 w-full text-right"
                    disabled={isClosedDay}
                    value={counted?.transfer || 0}
                    onChange={(e)=>setCounted((c)=>({...c, transfer:Number(e.target.value||0)}))}
                  />
                </td>
                <td className="p-2 text-center text-gray-400">—</td>
              </tr>
              <tr>
                <td className="p-2 font-bold">Total</td>
                <td className="p-2 text-right font-bold">
                  ${sumBk(systemGrid).toFixed(2)}
                </td>
                <td className="p-2 text-right font-bold">
                  ${sumBk(counted).toFixed(2)}
                </td>
                <td className="p-2"></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="p-3 bg-gray-50 rounded border">
            <div className="text-sm text-gray-600">A/R (House Charge) today</div>
            <div className="text-lg font-bold text-red-700">${arPeriodo.toFixed(2)}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded border">
            <div className="text-sm text-gray-600">Pmt on House Chrg</div>
            <div className="text-lg font-bold text-green-700">${pagosCxC.toFixed(2)}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded border">
            <div className="text-sm text-gray-600">Over/Under</div>
            <div className={`text-lg font-bold ${overUnder>=0?'text-green-700':'text-red-700'}`}>
              ${overUnder.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- COMENTARIO Y PDF ---------- */}
      <div className="mb-3">
        <label className="block font-bold mb-1">Comment:</label>
        <textarea
          className="border p-2 w-full rounded"
          rows={2}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          disabled={isClosedDay}
        />
      </div>

      <div className="mb-4 p-3 bg-gray-50 rounded">
        <h3 className="font-bold text-blue-800 mb-2">PDF Report</h3>
        <div className="flex items-center mb-2">
          <input type="radio" id="pdf-download" name="pdf-mode" value="download"
            checked={pdfMode === "download"} onChange={() => setPdfMode("download")} className="mr-2" />
          <label htmlFor="pdf-download" className="mr-4">Download PDF</label>
          <input type="radio" id="pdf-print" name="pdf-mode" value="print"
            checked={pdfMode === "print"} onChange={() => setPdfMode("print")} className="mr-2" />
          <label htmlFor="pdf-print">Print PDF</label>
        </div>
        <button
          type="button"
          className="bg-green-700 text-white px-4 py-2 rounded font-bold w-full hover:bg-green-800"
          onClick={generarPDF}
          disabled={generandoPDF}
        >
          {generandoPDF ? "Generating PDF..." : "Generate PDF Report"}
        </button>
      </div>

      {/* ---------- BOTÓN DE CIERRE ---------- */}
      <div className="flex flex-col gap-2">
        <button
          className="bg-blue-700 text-white px-4 py-2 rounded font-bold w-full hover:bg-blue-800 disabled:bg-gray-400"
          disabled={guardando || isClosedDay || (ventasDecor.length + avances.length === 0)}
          onClick={() => setShowConfirmModal(true)}
        >
          {guardando ? "Saving..." : "Register Closeout"}
        </button>
        {mensaje && (
          <div className="p-2 rounded text-center text-sm bg-blue-100 text-blue-700">
            {mensaje}
          </div>
        )}
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
