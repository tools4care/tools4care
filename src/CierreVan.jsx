// src/CierreVan.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

// MM/DD/YYYY
const toUSFormat = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
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

const toLocalYMD = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const getPagoDate = (p) =>
  p?.fecha_pago || p?.fecha || p?.fecha_abono || p?.created_at || p?.updated_at || "";

const pagoYMD = (p) => toLocalYMD(getPagoDate(p));

/* ===== breakdown utils ===== */
const emptyBk = () => ({ cash: 0, card: 0, transfer: 0 });
const cloneBk = (bk) => ({ cash: +(bk.cash || 0), card: +(bk.card || 0), transfer: +(bk.transfer || 0) });
const sumBk = (bk) => (+(bk.cash || 0)) + (+(bk.card || 0)) + (+(bk.transfer || 0));
const addBk = (a, b) => ({
  cash: (+(a.cash || 0)) + (+(b.cash || 0)),
  card: (+(a.card || 0)) + (+(b.card || 0)),
  transfer: (+(a.transfer || 0)) + (+(b.transfer || 0)),
});

function capBreakdownTo(bk, max) {
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
      const { data, error } = await supabase
        .from("vw_expected_por_dia_van")
        .select("dia").eq("van_id", van_id)
        .gte("dia", toISO(desde)).lte("dia", toISO(hoy))
        .order("dia", { ascending: false });
      if (error) { setFechas([]); return; }
      setFechas((data || []).map((r) => r.dia).filter(isIsoDate));
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
      if (error) { setFechasCerradas([]); return; }
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
      if (error || !data) { setCierreInfo(null); return; }
      setCierreInfo(data);
    })();
  }, [van_id, fecha]);
  return cierreInfo;
}

// 4) Movimientos PENDIENTES
function useMovimientosNoCerrados(van_id, fechaInicio, fechaFin) {
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!van_id || !isIsoDate(fechaInicio) || !isIsoDate(fechaFin)) { setVentas([]); setPagos([]); return; }
    setLoading(true);
    (async () => {
      try {
        // Intentar con RPC primero
        const { data: ventasPend = [], error: errorVentas } = await supabase.rpc("ventas_no_cerradas_por_van_by_id", {
          van_id_param: van_id, fecha_inicio: fechaInicio, fecha_fin: fechaFin,
        });
        
        console.log("🔍 RPC ventas_no_cerradas_por_van_by_id resultado:", ventasPend.length, ventasPend);
        console.log("Error del RPC:", errorVentas);
        console.log("Parámetros enviados:", { van_id_param: van_id, fecha_inicio: fechaInicio, fecha_fin: fechaFin });
        
        // Si el RPC no retorna nada, intentar consulta directa como fallback
        if (ventasPend.length === 0) {
          console.log("⚠️ RPC retornó 0 ventas, intentando consulta directa...");
          
          // Probar con fecha como string
          const { data: ventasDirectas = [], error: errorDirecto } = await supabase
            .from("ventas")
            .select("*")
            .eq("van_id", van_id)
            .gte("fecha", fechaInicio)
            .lte("fecha", fechaFin + "T23:59:59")
            .is("cierre_id", null);
          
          console.log("🔍 Consulta directa a tabla ventas:", ventasDirectas.length, ventasDirectas);
          console.log("Error consulta directa:", errorDirecto);
          
          if (ventasDirectas.length === 0) {
            // Intentar sin filtro de fecha para ver qué hay
            console.log("⚠️ Intentando SIN filtro de fecha para diagnóstico...");
            const { data: todasVentas = [] } = await supabase
              .from("ventas")
              .select("id, fecha, van_id, cierre_id, total_venta")
              .eq("van_id", van_id)
              .is("cierre_id", null)
              .order("created_at", { ascending: false })
              .limit(10);
            
            console.log("🔍 Últimas 10 ventas sin cierre para este van:", todasVentas);
            if (todasVentas.length > 0) {
              console.log("Ejemplo de fecha en DB:", todasVentas[0].fecha);
              console.log("Fecha que buscamos:", fechaInicio);
            }
          }
          
          if (ventasDirectas.length > 0) {
            console.log("✅ Encontradas ventas con consulta directa, usando esas");
            setVentas(ventasDirectas);
          } else {
            setVentas(ventasPend);
          }
        } else {
          setVentas(ventasPend);
        }
        
        const { data: pagosPend = [] } = await supabase.rpc("pagos_no_cerrados_por_van_by_id", {
          van_id_param: van_id, fecha_inicio: fechaInicio, fecha_fin: fechaFin,
        });
        console.log("🔍 RPC pagos_no_cerrados_por_van_by_id resultado:", pagosPend.length);
        setPagos(pagosPend);
      } finally { setLoading(false); }
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
    if (!van_id || !isIsoDate(dia)) { setExp({ cash:0, card:0, transfer:0, mix:0 }); return; }
    (async () => {
      const { data } = await supabase
        .from("vw_expected_por_dia_van")
        .select("cash_expected, card_expected, transfer_expected, mix_unallocated")
        .eq("van_id", van_id).eq("dia", dia).maybeSingle();
      setExp({
        cash: Number(data?.cash_expected || 0),
        card: Number(data?.card_expected || 0),
        transfer: Number(data?.transfer_expected || 0),
        mix: Number(data?.mix_unallocated || 0),
      });
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
  const totalSystem = gridSystem.cash + gridSystem.card + gridSystem.transfer;
  const totalCounted = counted.cash + counted.card + counted.transfer;
  const overUnder = (totalCounted - totalSystem);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 shadow-xl w-[420px] max-w-full">
        <h2 className="font-bold text-lg mb-3 text-blue-800">Confirm Closeout</h2>
        <div className="mb-2 text-sm"><b>From:</b> {toUSFormat(fechaInicio)} <b>To:</b> {toUSFormat(fechaFin)}</div>
        <div className="border rounded bg-gray-50 p-3 mb-3 text-xs">
          <div><b>Cash (system):</b> ${totalSystem ? gridSystem.cash.toFixed(2) : "0.00"} | <b>counted:</b> ${counted.cash.toFixed(2)}</div>
          <div><b>Card (system):</b> ${totalSystem ? gridSystem.card.toFixed(2) : "0.00"} | <b>counted:</b> ${counted.card.toFixed(2)}</div>
          <div><b>Transfer (system):</b> ${totalSystem ? gridSystem.transfer.toFixed(2) : "0.00"} | <b>counted:</b> ${counted.transfer.toFixed(2)}</div>
          <div><b>Total system:</b> ${totalSystem.toFixed(2)} | <b>Total counted:</b> ${totalCounted.toFixed(2)}</div>
          <div><b>Over/Under:</b> ${overUnder.toFixed(2)}</div>
          <div className="mt-2"><b>House Charge (A/R) this day:</b> ${arPeriodo.toFixed(2)}</div>
          <div><b>Pmt on House Chrg (today):</b> ${pagosCxC.toFixed(2)}</div>
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

  const fechasPendientes = useFechasPendientes(van?.id);
  const fechasCerradas = useFechasCerradas(van?.id);
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");

  const cierreInfo = useCierreInfo(van?.id, fechaSeleccionada);

  useEffect(() => {
    if (fechasPendientes.length === 0) { setFechaSeleccionada(""); return; }
    let pref = "";
    try { pref = localStorage.getItem("pre_cierre_fecha") || ""; } catch {}
    if (isIsoDate(pref) && fechasPendientes.includes(pref)) setFechaSeleccionada(pref);
    else if (fechasPendientes.includes(hoy)) setFechaSeleccionada(hoy);
    else setFechaSeleccionada(fechasPendientes[0]);
  }, [fechasPendientes, hoy]);

  const fechaInicio = fechaSeleccionada;
  const fechaFin = fechaSeleccionada;

  // Pendientes
  const { ventas: ventasPend, pagos: pagosPend, loading: loadingPend } =
    useMovimientosNoCerrados(van?.id, fechaInicio, fechaFin);

  // Cerrados
  const { ventas: ventasCerr, pagos: pagosCerr, loading: loadingCerr } =
    useMovimientosCerrados(cierreInfo?.id || null);

  // En función de si está cerrado, escogemos fuente de datos
  const isClosedDay = !!cierreInfo;
  const loading = isClosedDay ? loadingCerr : loadingPend;
  const ventasRaw = isClosedDay ? ventasCerr : ventasPend;
  const pagosRaw = isClosedDay ? pagosCerr : pagosPend;

  // Diccionario de clientes
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
      setClientesDic(dic);
    })();
  }, [clienteKeys.join(",")]);

  /* =========== Decorar pagos y agrupar por venta =========== */
  const pagosDecor = useMemo(
    () =>
      (pagosRaw || []).map((p) => ({
        ...p,
        _bk: breakdownPorMetodo(p),
        cliente_nombre:
          p.cliente_nombre ||
          (clientesDic[p.cliente_id]
            ? displayName(clientesDic[p.cliente_id])
            : p.cliente_id
            ? p.cliente_id.slice(0, 8)
            : NO_CLIENTE),
      })),
    [pagosRaw, clientesDic]
  );

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

  // Ventas con tope + excedentes a CxC
  const { ventasDecor, excedentesCxC } = useMemo(() => {
    const extrasAcumulados = [];
    const decor = (ventasRaw || []).map((v) => {
      const ficha = clientesDic[v.cliente_id];
      const propio = breakdownPorMetodo(v);
      
      const totalVenta = Number(v.total_venta || 0);
      const totalPagadoTabla = Number(v.total_pagado || 0);
      const saldoVenta = Math.max(0, totalVenta - totalPagadoTabla);
      const pack = pagosPorVenta.get(v.id) || { cash: 0, card: 0, transfer: 0, rows: [] };

      if (isClosedDay) {
        return {
          ...v,
          _bk: { cash: Number(propio.cash||0), card: Number(propio.card||0), transfer: Number(propio.transfer||0) },
          cliente_nombre: v.cliente_nombre || (ficha ? displayName(ficha) : v.cliente_id ? v.cliente_id.slice(0, 8) : NO_CLIENTE),
        };
      }

      if (saldoVenta <= 0 || sumBk(pack) <= 0) {
        return {
          ...v,
          _bk: { cash: Number(propio.cash||0), card: Number(propio.card||0), transfer: Number(propio.transfer||0) },
          cliente_nombre: v.cliente_nombre || (ficha ? displayName(ficha) : v.cliente_id ? v.cliente_id.slice(0, 8) : NO_CLIENTE),
        };
      }

      const { assigned, extra } = capBreakdownTo(
        { cash: Number(pack.cash||0), card: Number(pack.card||0), transfer: Number(pack.transfer||0) },
        Number(saldoVenta)
      );

      const extraTotal = sumBk(extra);
      if (extraTotal > 0.0001) {
        extrasAcumulados.push({
          id: `extra-${v.id}`,
          cliente_id: v.cliente_id,
          cliente_nombre: v.cliente_nombre || (ficha ? displayName(ficha) : v.cliente_id?.slice(0,8) || NO_CLIENTE),
          _bk: extra,
          referencia: "Overpayment applied to A/R",
          notas: "",
          fecha_pago: v.fecha,
          van_id: v.van_id,
        });
      }

      const aplicado = addBk(propio, assigned);
      return {
        ...v,
        _bk: aplicado,
        cliente_nombre: v.cliente_nombre || (ficha ? displayName(ficha) : v.cliente_id ? v.cliente_id.slice(0, 8) : NO_CLIENTE),
      };
    });

    return { ventasDecor: decor, excedentesCxC: extrasAcumulados };
  }, [ventasRaw, clientesDic, pagosPorVenta, isClosedDay]);

  // Avances del día
  const ventasIdSet = useMemo(() => new Set((ventasRaw || []).map((v) => v.id)), [ventasRaw]);

  const avances = useMemo(() => {
    if (isClosedDay) {
      return (pagosDecor || []).filter(p => !(p?.venta_id && ventasIdSet.has(p.venta_id)));
    }
    const lista = [];
    for (const p of pagosDecor) {
      const ligadoAVentaDelRango = !!(p?.venta_id && ventasIdSet.has(p.venta_id));
      const diaLocal = pagoYMD(p);
      const vanOK = !p?.van_id || !van?.id || p.van_id === van.id;
      const monto = sumBk(p._bk) || Number(p.monto || 0);
      if (!ligadoAVentaDelRango && diaLocal === String(fechaSeleccionada).trim() && vanOK && monto > 0.0001) {
        lista.push(p);
      }
    }
    for (const ex of excedentesCxC) {
      const diaLocal = pagoYMD(ex);
      if (diaLocal === String(fechaSeleccionada).trim()) lista.push(ex);
    }
    return lista;
  }, [isClosedDay, pagosDecor, ventasIdSet, excedentesCxC, fechaSeleccionada, van?.id]);

  // Expected
  const expectedOpen = useExpectedDia(van?.id, fechaSeleccionada);
  const systemGrid = useMemo(() => {
    if (isClosedDay) {
      return {
        cash: Number(cierreInfo?.efectivo_esperado || 0),
        card: Number(cierreInfo?.tarjeta_esperado || 0),
        transfer: Number(cierreInfo?.transferencia_esperado || 0),
      };
    }
    const fromVentas = ventasDecor.reduce((acc, v) => addBk(acc, v._bk || emptyBk()), emptyBk());
    const fromAvances = avances.reduce((acc, p) => addBk(acc, p._bk || emptyBk()), emptyBk());
    return addBk(fromVentas, fromAvances);
  }, [isClosedDay, cierreInfo, ventasDecor, avances]);

  const totalesEsperadosPanel = {
    cash: isClosedDay ? systemGrid.cash : Number(expectedOpen.cash || 0),
    card: isClosedDay ? systemGrid.card : Number(expectedOpen.card || 0),
    transfer: isClosedDay ? systemGrid.transfer : Number(expectedOpen.transfer || 0),
  };

  // A/R y pagos CxC
  const arPeriodo = useMemo(() => {
    if (isClosedDay) return Number(cierreInfo?.cuentas_por_cobrar || 0);
    return (ventasDecor || []).reduce((t, v) => {
      const venta = Number(v.total_venta) || 0;
      const pagado = Number(v.total_pagado) || 0;
      const credito = venta - pagado;
      return t + (credito > 0 ? credito : 0);
    }, 0);
  }, [isClosedDay, cierreInfo, ventasDecor]);

  const pagosCxC = useMemo(() => {
    if (isClosedDay) return Number(cierreInfo?.pagos_cxc || 0);
    return (avances || []).reduce((t, p) => t + sumBk(p._bk), 0);
  }, [isClosedDay, cierreInfo, avances]);

  // Counted
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
    const sys = systemGrid.cash + systemGrid.card + systemGrid.transfer;
    const cnt = counted.cash + counted.card + counted.transfer;
    return cnt - sys;
  }, [systemGrid, counted]);

  // Totales por tipo de pago (nuevo cálculo)
  const totalesPorTipoPago = useMemo(() => {
    const totals = { cash: 0, card: 0, transfer: 0 };
    
    // Sumar de ventas
    ventasDecor.forEach(v => {
      totals.cash += Number(v._bk?.cash || 0);
      totals.card += Number(v._bk?.card || 0);
      totals.transfer += Number(v._bk?.transfer || 0);
    });
    
    // Sumar de avances/pagos CxC
    avances.forEach(p => {
      totals.cash += Number(p._bk?.cash || 0);
      totals.card += Number(p._bk?.card || 0);
      totals.transfer += Number(p._bk?.transfer || 0);
    });
    
    return totals;
  }, [ventasDecor, avances]);

  /* ======================= Guardar / PDF ======================= */
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
      efectivo_esperado: Number(systemGrid.cash.toFixed(2)),
      efectivo_real: Number(counted.cash || 0),
      tarjeta_esperado: Number(systemGrid.card.toFixed(2)),
      tarjeta_real: Number(counted.card || 0),
      transferencia_esperado: Number(systemGrid.transfer.toFixed(2)),
      transferencia_real: Number(counted.transfer || 0),
      pagos_cxc: Number(pagosCxC.toFixed(2)),
      ventas_ids,
      pagos_ids,
    };

    const { data, error } = await supabase
      .from("cierres_van")
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      setGuardando(false);
      setMensaje("Error saving closeout: " + error.message);
      setTimeout(() => setMensaje(""), 3500);
      return;
    }

    const cierre_id = data?.id;
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
        efectivo_esperado: systemGrid.cash,
        tarjeta_esperado: systemGrid.card,
        transferencia_esperado: systemGrid.transfer,
        cxc_periodo: arPeriodo,
        pagos_cxc: pagosCxC,
      };
      const fechaCierre = cierreInfo?.created_at ? toLocalYMD(cierreInfo.created_at) : null;

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
      setMensaje("Error generating PDF: " + error.message);
    } finally {
      setGenerandoPDF(false);
      setTimeout(() => setMensaje(""), 3500);
    }
  };

  /* ======================= UI ======================= */
  return (
    <div className="max-w-4xl mx-auto mt-6 bg-white rounded shadow p-6">
      <h2 className="font-bold text-xl mb-4 text-blue-900">Van Closeout</h2>

      {/* Selección de fecha */}
      <div className="mb-4">
        <label className="font-bold text-sm mb-1 block">Select date to close or view:</label>
        <select
          className="border p-2 rounded w-full max-w-xs"
          value={fechaSeleccionada}
          onChange={(e) => {
            const v = e.target.value;
            setFechaSeleccionada(v);
            try { localStorage.setItem("pre_cierre_fecha", v); } catch {}
          }}
        >
          {fechasPendientes.length === 0 ? (
            <option value="">No available days</option>
          ) : (
            fechasPendientes.map((f) => {
              const isClosed = fechasCerradas.includes(f);
              return (
                <option value={f} key={f}>
                  {toUSFormat(f)} {isClosed ? "✓ Closed" : "• Pending"}
                </option>
              );
            })
          )}
        </select>

        {isClosedDay && (
          <div className="mt-2 p-2 rounded bg-blue-50 border border-blue-200">
            <div className="text-sm font-semibold text-blue-800 mb-1">
              📋 This date was closed on {toUSFormat(toLocalYMD(cierreInfo.created_at))}
            </div>
            <div className="text-xs text-gray-600">
              You can view and reprint the report, but cannot modify the closeout.
            </div>
          </div>
        )}
      </div>

      {/* NUEVA SECCIÓN: Resumen de Totales por Tipo de Pago */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-lg p-5 mb-6 border border-blue-200">
        <h3 className="font-bold mb-4 text-xl text-blue-900 flex items-center">
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Payment Totals Summary
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* CASH */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">💵 CASH</span>
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-green-700">
              ${totalesPorTipoPago.cash.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">From sales & A/R payments</div>
          </div>

          {/* CARD */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">💳 CARD</span>
              <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-blue-700">
              ${totalesPorTipoPago.card.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">From sales & A/R payments</div>
          </div>

          {/* TRANSFER */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">🏦 TRANSFER</span>
              <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-purple-700">
              ${totalesPorTipoPago.transfer.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">From sales & A/R payments</div>
          </div>
        </div>

        {/* Total General */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-md p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold opacity-90">GRAND TOTAL</div>
              <div className="text-4xl font-bold mt-1">
                ${(totalesPorTipoPago.cash + totalesPorTipoPago.card + totalesPorTipoPago.transfer).toFixed(2)}
              </div>
            </div>
            <svg className="w-16 h-16 opacity-30" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>

      {/* Tabla de ventas del día */}
      <div className="bg-gray-50 rounded-xl shadow p-4 mb-6">
        <h3 className="font-bold mb-3 text-lg text-blue-800">Pending Closeout Movements</h3>
        <div className="mb-2 font-semibold text-gray-700">Sales in this day:</div>
        
        {/* Debug info */}
        {!loading && ventasDecor.length === 0 && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
            <div className="font-bold text-yellow-800 mb-1">⚠️ No sales found for this date</div>
            <div className="text-yellow-700">
              Check the browser console (F12) for detailed logs. 
              The RPC might not be returning data for recent sales.
            </div>
          </div>
        )}
        
        {/* A/R Indicator */}
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
                  const totalVenta = Number(v.total_venta || 0);
                  const totalPagado = Number(v.total_pagado || 0);
                  const credito = Math.max(0, totalVenta - totalPagado);
                  return (
                    <tr key={v.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{toUSFormat((v.fecha || "").toString().slice(0,10)) || "-"}</td>
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
              <tfoot className="bg-blue-50 font-bold">
                <tr>
                  <td className="p-2" colSpan={2}>Totals</td>
                  <td className="p-2 text-right">
                    ${ventasDecor.reduce((t, v) => t + Number(v.total_venta || 0), 0).toFixed(2)}
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
                      const venta = Number(v.total_venta||0), pagado = Number(v.total_pagado||0);
                      const ar = venta - pagado; return t + (ar>0?ar:0);
                    }, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Avances (pagos a CxC) */}
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

      {/* Expected */}
      <div className="mb-4 p-3 rounded bg-blue-50 text-sm">
        <div className="font-bold text-blue-900 mb-1">Expected (from totals)</div>
        <div>Cash expected: ${Number(totalesEsperadosPanel.cash).toFixed(2)}</div>
        <div>Card expected: ${Number(totalesEsperadosPanel.card).toFixed(2)}</div>
        <div>Transfer expected: ${Number(totalesEsperadosPanel.transfer).toFixed(2)}</div>
        <div>House Charge (A/R) today: ${Number(arPeriodo).toFixed(2)}</div>
        <div>Pmt on House Charge: ${Number(pagosCxC).toFixed(2)}</div>
      </div>

      {/* GRID System vs Counted */}
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
                <td className="p-2 text-right">${systemGrid.cash.toFixed(2)}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="border rounded p-1 w-full text-right"
                    disabled={isClosedDay}
                    value={counted.cash}
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
                <td className="p-2 text-right">${systemGrid.card.toFixed(2)}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="border rounded p-1 w-full text-right"
                    disabled={isClosedDay}
                    value={counted.card}
                    onChange={(e)=>setCounted((c)=>({...c, card:Number(e.target.value||0)}))}
                  />
                </td>
                <td className="p-2 text-center text-gray-400">—</td>
              </tr>
              <tr className="border-b">
                <td className="p-2">TRANSFER</td>
                <td className="p-2 text-right">${systemGrid.transfer.toFixed(2)}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="border rounded p-1 w-full text-right"
                    disabled={isClosedDay}
                    value={counted.transfer}
                    onChange={(e)=>setCounted((c)=>({...c, transfer:Number(e.target.value||0)}))}
                  />
                </td>
                <td className="p-2 text-center text-gray-400">—</td>
              </tr>
              <tr>
                <td className="p-2 font-bold">Total</td>
                <td className="p-2 text-right font-bold">
                  ${(systemGrid.cash + systemGrid.card + systemGrid.transfer).toFixed(2)}
                </td>
                <td className="p-2 text-right font-bold">
                  ${(counted.cash + counted.card + counted.transfer).toFixed(2)}
                </td>
                <td className="p-2"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Drawer Totals */}
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

      {/* Comentario */}
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

      {/* PDF */}
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

      {/* Acciones */}
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

      {/* Modales */}
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