// src/CierreVan.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ======================= Constantes ======================= */
const METODOS_PAGO = [
  { campo: "pago_efectivo", label: "Cash" },
  { campo: "pago_tarjeta", label: "Card" },
  { campo: "pago_transferencia", label: "Transfer" },
];

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
// helper: fecha local 'YYYY-MM-DD'
const toLocalYMD = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
// obtiene la fecha de un pago, tolerante a distintos nombres de campo
const getPagoDate = (p) =>
  p?.fecha_pago || p?.fecha || p?.fecha_abono || p?.created_at || p?.updated_at || "";

// normaliza a 'YYYY-MM-DD' desde el registro de pago
const pagoYMD = (p) => toLocalYMD(getPagoDate(p));

function breakdownPorMetodo(item) {
  const out = { cash: 0, card: 0, transfer: 0 };

  // 1) columnas directas (si existieran en la fila)
  ["efectivo", "tarjeta", "transferencia"].forEach((k) => {
    const v = Number(item?.[`pago_${k}`] || 0);
    if (k === "efectivo") out.cash += v;
    if (k === "tarjeta") out.card += v;
    if (k === "transferencia") out.transfer += v;
  });

  // 2) posibles campos de desglose (incluye el JSON 'pago' que guardamos en Ventas)
  const candidates = [
    item?.pago,               // ⬅️ importante
    item?.pagos_detalle,
    item?.detalle_pagos,
    item?.payment_breakdown,
    item?.payment_details,
    item?.metodos,
    item?.metodos_detalle,
    item?.metodo_detalles,
    item?.metodo_json,
    item?.detalles,
    item?.detalle,
    item?.pago_detalle,
    item?.pagos,
  ];

  const sumDict = (obj) => {
    if (!obj || typeof obj !== "object") return;
    const map = {
      cash: "cash",
      efectivo: "cash",
      card: "card",
      tarjeta: "card",
      transfer: "transfer",
      transferencia: "transfer",
      wire: "transfer",
      zelle: "transfer",
      bank: "transfer",
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
      // si viene como { map: { efectivo, tarjeta, transferencia, ... } }
      if (cand.map && typeof cand.map === "object") {
        sumDict(cand.map);
      } else {
        sumDict(cand);
      }
    }
  } // ⬅️ cierra el for

  // 3) fallback por metodo_pago + monto (por si no hubo nada arriba)
  if (out.cash + out.card + out.transfer === 0) {
    const metodo = normMetodo(item?.metodo_pago);
    const montoFallback = Number(
      item?.monto ?? item?.amount ?? item?.total ?? item?.total_pagado ?? 0
    );
    if (montoFallback) {
      if (metodo === "cash") out.cash += montoFallback;
      else if (metodo === "card") out.card += montoFallback;
      else if (metodo === "transfer") out.transfer += montoFallback;
    }
  }

  return out;
}


/* ======================= Hooks de datos ======================= */

// 1) Fechas con actividad (vista ya filtra por van y días activos)
function useFechasPendientes(van_id) {
  const [fechas, setFechas] = useState([]);
  useEffect(() => {
    if (!van_id) {
      setFechas([]);
      return;
    }
    (async () => {
      const hoy = new Date();
      const desde = new Date(hoy);
      desde.setDate(hoy.getDate() - 20);
      const toISO = (d) => d.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("vw_expected_por_dia_van")
        .select("dia")
        .eq("van_id", van_id)
        .gte("dia", toISO(desde))
        .lte("dia", toISO(hoy))
        .order("dia", { ascending: false });

      if (error) {
        setFechas([]);
        return;
      }
      setFechas((data || []).map((r) => r.dia).filter(isIsoDate));
    })();
  }, [van_id]);
  return fechas;
}

// Hook para obtener fechas ya cerradas
function useFechasCerradas(van_id) {
  const [fechasCerradas, setFechasCerradas] = useState([]);
  useEffect(() => {
    if (!van_id) {
      setFechasCerradas([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("cierres_van")
        .select("fecha_inicio")
        .eq("van_id", van_id);
      
      if (error) {
        setFechasCerradas([]);
        return;
      }
      
      // Extraemos las fechas únicas
      const fechas = Array.from(new Set((data || []).map(item => item.fecha_inicio)));
      setFechasCerradas(fechas);
    })();
  }, [van_id]);
  return fechasCerradas;
}

// 2) Movimientos no cerrados (tus RPCs)
function useMovimientosNoCerrados(van_id, fechaInicio, fechaFin) {
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!van_id || !isIsoDate(fechaInicio) || !isIsoDate(fechaFin)) {
      setVentas([]);
      setPagos([]);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data: ventasPend } = await supabase.rpc("ventas_no_cerradas_por_van_by_id", {
          van_id_param: van_id,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
        });
        const { data: pagosPend } = await supabase.rpc("pagos_no_cerrados_por_van_by_id", {
          van_id_param: van_id,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
        });
        setVentas(ventasPend || []);
        setPagos(pagosPend || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [van_id, fechaInicio, fechaFin]);
  return { ventas, pagos, loading };
}

// 3) Expected por día (desde la vista)
function useExpectedDia(van_id, dia) {
  const [exp, setExp] = useState({ cash: 0, card: 0, transfer: 0, mix: 0 });
  useEffect(() => {
    if (!van_id || !isIsoDate(dia)) {
      setExp({ cash: 0, card: 0, transfer: 0, mix: 0 });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("vw_expected_por_dia_van")
        .select("cash_expected, card_expected, transfer_expected, mix_unallocated")
        .eq("van_id", van_id)
        .eq("dia", dia)
        .maybeSingle();

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

// Hook para obtener información del cierre
function useCierreInfo(van_id, fecha) {
  const [cierreInfo, setCierreInfo] = useState(null);
  useEffect(() => {
    if (!van_id || !isIsoDate(fecha)) {
      setCierreInfo(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("cierres_van")
        .select("*")
        .eq("van_id", van_id)
        .eq("fecha_inicio", fecha)
        .maybeSingle();
      
      if (error || !data) {
        setCierreInfo(null);
        return;
      }
      
      setCierreInfo(data);
    })();
  }, [van_id, fecha]);
  return cierreInfo;
}

/* ======================= Tablas UI ======================= */
function TablaMovimientosPendientes({ ventas }) {
  const totalCxc = ventas.reduce(
    (t, v) => t + ((Number(v.total_venta) || 0) - (Number(v.total_pagado) || 0)),
    0
  );
  return (
    <div className="bg-gray-50 rounded-xl shadow p-4 mb-6">
      <h3 className="font-bold mb-3 text-lg text-blue-800">Pending Closeout Movements</h3>
      <b>Pending Sales:</b>
      <table className="w-full text-xs mb-3">
        <thead>
          <tr className="bg-blue-100">
            <th className="p-1">Date</th>
            <th className="p-1">Client</th>
            <th className="p-1">Total</th>
            <th className="p-1">Cash</th>
            <th className="p-1">Card</th>
            <th className="p-1">Transfer</th>
            <th className="p-1">Paid</th>
            <th className="p-1">A/R</th>
          </tr>
        </thead>
        <tbody>
          {ventas.length === 0 && (
            <tr>
              <td colSpan={8} className="text-gray-400 text-center">
                No pending sales
              </td>
            </tr>
          )}
          {ventas.map((v) => (
            <tr key={v.id}>
              <td className="p-1">{toLocalYMD(v.fecha) || "-"}</td>
              <td className="p-1">
                {v.cliente_nombre ||
                  (v.cliente_id ? v.cliente_id.slice(0, 8) : NO_CLIENTE)}
              </td>
              <td className="p-1">${Number(v.total_venta || 0).toFixed(2)}</td>
              <td className="p-1">${Number(v._bk?.cash || 0).toFixed(2)}</td>
              <td className="p-1">${Number(v._bk?.card || 0).toFixed(2)}</td>
              <td className="p-1">${Number(v._bk?.transfer || 0).toFixed(2)}</td>
              <td className="p-1">${Number(v.total_pagado || 0).toFixed(2)}</td>
              <td className="p-1">
                $                 {(
                  Number(v.total_venta || 0) - Number(v.total_pagado || 0)
                ).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-blue-50 font-bold">
          <tr>
            <td className="p-1">Totals</td>
            <td className="p-1"></td>
            <td className="p-1">
              ${ventas.reduce((t, v) => t + Number(v.total_venta || 0), 0).toFixed(2)}
            </td>
            <td className="p-1">
              ${ventas.reduce((t, v) => t + Number(v._bk?.cash || 0), 0).toFixed(2)}
            </td>
            <td className="p-1">
              ${ventas.reduce((t, v) => t + Number(v._bk?.card || 0), 0).toFixed(2)}
            </td>
            <td className="p-1">
              ${ventas.reduce((t, v) => t + Number(v._bk?.transfer || 0), 0).toFixed(2)}
            </td>
            <td className="p-1">
             ${ventas.reduce((t, v) => t + Number(v.total_pagado || 0), 0).toFixed(2)}
           </td>
            <td className="p-1">${totalCxc.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TablaAbonosPendientes({ pagos }) {
  return (
    <div className="bg-gray-50 rounded-xl shadow p-4 mb-6">
      <h3 className="font-bold mb-3 text-lg text-blue-800">
        Customer Payments/Advances Included in This Closing
      </h3>
      <table className="w-full text-xs mb-3">
        <thead>
          <tr className="bg-blue-100">
            <th className="p-1">Date</th>
            <th className="p-1">Client</th>
            <th className="p-1">Amount</th>
            <th className="p-1">Method</th>
            <th className="p-1">Reference</th>
            <th className="p-1">Notes</th>
          </tr>
        </thead>
        <tbody>
          {pagos.length === 0 && (
            <tr>
              <td colSpan={6} className="text-gray-400 text-center">
                No pending payments/advances
              </td>
            </tr>
          )}
          {pagos.map((p) => {
            const amount =
              Number(p._bk?.cash || 0) +
                Number(p._bk?.card || 0) +
                Number(p._bk?.transfer || 0) || Number(p.monto || 0);

            const hasMix =
              (Number(p._bk?.cash || 0) > 0) +
                (Number(p._bk?.card || 0) > 0) +
                (Number(p._bk?.transfer || 0) > 0) >
              1;

            const method = hasMix
              ? "mix"
              : Number(p._bk?.cash || 0) > 0
              ? "Cash"
              : Number(p._bk?.card || 0) > 0
              ? "Card"
              : Number(p._bk?.transfer || 0) > 0
              ? "Transfer"
              : p.metodo_pago || "-";

            return (
              <tr key={p.id}>
                <td className="p-1">{pagoYMD(p) || "-"}</td>
                <td className="p-1">
                  {p.cliente_nombre ||
                    (p.cliente_id ? p.cliente_id.slice(0, 8) : NO_CLIENTE)}
                </td>
                <td className="p-1">${amount.toFixed(2)}</td>
                <td className="p-1">{method}</td>
                <td className="p-1">{p.referencia || "-"}</td>
                <td className="p-1">{p.notas || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ======================= PDF ======================= */
function generarPDFCierreVan({
  empresa = {
    nombre: "TOOLS4CARE",
    direccion: "108 Lafayette St, Salem, MA 01970",
    telefono: "(978) 594-1624",
    email: "tools4care@gmail.com",
  },
  usuario,
  vanNombre,
  ventas = [],
  pagos = [],
  resumen = {},
  fechaInicio,
  fechaFin,
  fechaCierre = null, // Nueva propiedad para fecha de cierre
  mode = "download", // "download" | "print"
}) {
  const doc = new jsPDF("p", "pt", "a4");
  const azul = "#0B4A6F", azulSuave = "#e3f2fd", negro = "#222";

  // Encabezado texto
  const xLeft = 36;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(azul);
  doc.text(empresa.nombre, xLeft, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Address: ${empresa.direccion}`, xLeft, 65);
  doc.text(`Phone: ${empresa.telefono}  |  Email: ${empresa.email}`, xLeft, 78);
  doc.setLineWidth(1.1);
  doc.setDrawColor(azul);
  doc.line(36, 86, 560, 86);

  const vanIdShort = (vanNombre || "").toString().slice(0, 8);
  const vanLabel = [vanNombre || "-", `ID: ${vanIdShort}`]
    .filter(Boolean)
    .join(" — ");
  const userLine = `${usuario?.nombre || usuario?.email || "-"}${
    usuario?.email ? " | " + usuario.email : ""
  }${usuario?.id ? " (ID: " + usuario.id + ")" : ""}`;

  doc.setFontSize(14);
  doc.setTextColor(azul);
  doc.text("Van Closeout - Executive Report", 36, 110);
  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Period: ${fechaInicio} to ${fechaFin}`, 36, 130);
  doc.text(doc.splitTextToSize(`Responsible: ${userLine}`, 240), 36, 146);
  doc.text(doc.splitTextToSize(`Van: ${vanLabel}`, 220), 316, 130);
  
  // Mostrar fecha de cierre si está disponible
  if (fechaCierre) {
    doc.text(`Closeout Date: ${fechaCierre}`, 316, 146);
  } else {
    doc.text(`Closeout Date: ${new Date().toLocaleString()}`, 316, 146);
  }

  doc.setFillColor(azulSuave);
  doc.roundedRect(36, 160, 520, 52, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(azul);
  doc.setFontSize(12);
  doc.text("Executive Summary", 44, 180);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Expected Cash: $${Number(resumen.efectivo_esperado || 0).toFixed(2)}`, 44, 198);
  doc.text(`Expected Card: $${Number(resumen.tarjeta_esperado || 0).toFixed(2)}`, 220, 198);
  doc.text(
    `Expected Transfer: $${Number(resumen.transferencia_esperado || 0).toFixed(2)}`,
    370, 198
  );
  doc.text(`A/R in Period: $${Number(resumen.cxc_periodo || 0).toFixed(2)}`, 44, 214);

  // ===== Tabla Ventas =====
  doc.setFont("helvetica", "bold");
  doc.setTextColor(azul);
  doc.setFontSize(13);
  doc.text("Pending Sales Included in This Report", 36, 240);

  autoTable(doc, {
    startY: 250,
    head: [["Date", "Client", "Total", "Cash", "Card", "Transfer", "Paid", "A/R"]],
    body:
      ventas.length === 0
        ? [["-", "-", "-", "-", "-", "-", "-", "-"]]
        : ventas.map((v) => [
            v.fecha?.slice(0, 10) || "-",
            v.cliente_nombre ||
              (v.cliente_id ? v.cliente_id.slice(0, 8) : "No client"),
            "$" + Number(v.total_venta || 0).toFixed(2),
            "$" + Number(v._bk?.cash || 0).toFixed(2),
            "$" + Number(v._bk?.card || 0).toFixed(2),
            "$" + Number(v._bk?.transfer || 0).toFixed(2),
            "$" + Number(v.total_pagado || 0).toFixed(2),
            "$" +
              (
                Number(v.total_venta || 0) - Number(v.total_pagado || 0)
              ).toFixed(2),
          ]),
    theme: "grid",
    headStyles: { fillColor: "#0B4A6F", textColor: "#fff", fontStyle: "bold" },
    styles: { fontSize: 9 },
    margin: { left: 36, right: 36 },
  });

  // ===== Tabla Pagos (Avances o pagosDecor) =====
  let yAbonos = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 260) + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor("#0B4A6F");
  doc.text("Customer Payments Included in This Closing", 36, yAbonos);

  autoTable(doc, {
    startY: yAbonos + 10,
    head: [["Date", "Client", "Amount", "Method", "Reference", "Notes"]],
    body:
      pagos.length === 0
        ? [["-", "-", "-", "-", "-", "-"]]
        : pagos.map((p) => {
            const amount =
              Number(p._bk?.cash || 0) +
                Number(p._bk?.card || 0) +
                Number(p._bk?.transfer || 0) || Number(p.monto || 0);
            const hasMix =
              (Number(p._bk?.cash || 0) > 0) +
                (Number(p._bk?.card || 0) > 0) +
                (Number(p._bk?.transfer || 0) > 0) >
              1;
            const method = hasMix
              ? "Mix"
              : Number(p._bk?.cash || 0) > 0
              ? "Cash"
              : Number(p._bk?.card || 0) > 0
              ? "Card"
              : Number(p._bk?.transfer || 0) > 0
              ? "Transfer"
              : p.metodo_pago || "-";
            return [
              (p.fecha_pago || p.fecha || p.created_at || "").toString().slice(0,10) || "-",
              p.cliente_nombre ||
                (p.cliente_id ? p.cliente_id.slice(0, 8) : "No client"),
              "$" + amount.toFixed(2),
              method,
              p.referencia || "-",
              p.notas || "-",
            ];
          }),
    theme: "grid",
    headStyles: { fillColor: "#0B4A6F", textColor: "#fff", fontStyle: "bold" },
    styles: { fontSize: 9 },
    margin: { left: 36, right: 36 },
  });

  // ===== Totales por método de pago =====
  const totalCash = ventas.reduce((t, v) => t + Number(v._bk?.cash || 0), 0) + 
                   pagos.reduce((t, p) => t + Number(p._bk?.cash || 0), 0);
  const totalCard = ventas.reduce((t, v) => t + Number(v._bk?.card || 0), 0) + 
                   pagos.reduce((t, p) => t + Number(p._bk?.card || 0), 0);
  const totalTransfer = ventas.reduce((t, v) => t + Number(v._bk?.transfer || 0), 0) + 
                      pagos.reduce((t, p) => t + Number(p._bk?.transfer || 0), 0);

  let yTotales = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 260) + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(azul);
  doc.text("Payment Totals", 36, yTotales);

  autoTable(doc, {
    startY: yTotales + 10,
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

  const nombreArchivo = `VanCloseout_${(vanNombre || "")
    .toString()
    .replace(/\s+/g, "")}_${fechaInicio}_${fechaFin}.pdf`;

  if (mode === "print") {
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    const win = window.open(blobUrl, "_blank");
    setTimeout(() => { try { win?.print?.(); } catch {} }, 400);
    return;
  }

  // default: descargar
  doc.save(nombreArchivo);
}

/* ======================= Modales ======================= */
function DesgloseEfectivoModal({ open, onClose, onSave }) {
  const [billetes, setBilletes] = useState(
    DENOMINACIONES.map((d) => ({ ...d, cantidad: "" }))
  );
  useEffect(() => {
    if (open)
      setBilletes(DENOMINACIONES.map((d) => ({ ...d, cantidad: "" })));
  }, [open]);

  const total = billetes.reduce(
    (t, b) => t + Number(b.cantidad || 0) * b.valor,
    0
  );
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 shadow-xl w-[360px] max-w-full">
        <h2 className="text-lg font-bold mb-2">Cash Breakdown</h2>
        <table className="w-full mb-4">
          <tbody>
            {billetes.map((b, i) => (
              <tr key={b.nombre}>
                <td className="py-1">{b.nombre}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    className="border p-1 w-16 rounded text-right"
                    value={b.cantidad}
                    onChange={(e) => {
                      const nuevo = [...billetes];
                      nuevo[i].cantidad = e.target.value;
                      setBilletes(nuevo);
                    }}
                  />
                </td>
                <td className="text-xs pl-2 text-gray-400">
                  ${(b.valor * Number(b.cantidad || 0)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mb-4 text-right font-bold text-blue-700">
          Total: ${total.toFixed(2)}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded">
            Cancel
          </button>
          <button
            onClick={() => onSave(total)}
            className="px-3 py-1 bg-blue-700 text-white rounded"
          >
            Use Total
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  open,
  onCancel,
  onConfirm,
  totalesEsperados,
  reales,
  cuentasCobrar,
  comentario,
  fechaInicio,
  fechaFin,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 shadow-xl w-[370px] max-w-full">
        <h2 className="font-bold text-lg mb-3 text-blue-800">Confirm Closeout</h2>
        <div className="mb-2 text-sm">
          <b>From:</b> {fechaInicio} <b>To:</b> {fechaFin}
        </div>
        <div className="border rounded bg-gray-50 p-3 mb-3 text-xs">
          <div>
            <b>Cash (expected):</b> ${totalesEsperados.pago_efectivo}
          </div>
          <div>
            <b>Card (expected):</b> ${totalesEsperados.pago_tarjeta}
          </div>
          <div>
            <b>Transfer (expected):</b> ${totalesEsperados.pago_transferencia}
          </div>
          <div>
            <b>Cash (counted):</b> ${reales.pago_efectivo || 0}
          </div>
          <div>
            <b>Card (counted):</b> ${reales.pago_tarjeta || 0}
          </div>
          <div>
            <b>Transfer (counted):</b> ${reales.pago_transferencia || 0}
          </div>
          <div>
            <b>Accounts Receivable:</b> ${cuentasCobrar}
          </div>
          <div>
            <b>Comment:</b> {comentario || "-"}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="bg-gray-200 px-3 py-1 rounded">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-blue-700 text-white px-4 py-1 rounded font-bold"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Componente principal ======================= */
export default function CierreVan() {
  const navigate = useNavigate();
  const { usuario } = useUsuario();
  const { van } = useVan();

  // Fechas disponibles
  const fechasPendientes = useFechasPendientes(van?.id);
  const fechasCerradas = useFechasCerradas(van?.id);
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");

  // Información del cierre si ya existe
  const cierreInfo = useCierreInfo(van?.id, fechaSeleccionada);

  useEffect(() => {
    if (fechasPendientes.length === 0) {
      setFechaSeleccionada("");
      return;
    }
    let pref = "";
    try {
      pref = localStorage.getItem("pre_cierre_fecha") || "";
    } catch {}
    if (isIsoDate(pref) && fechasPendientes.includes(pref)) {
      setFechaSeleccionada(pref);
    } else if (fechasPendientes.includes(hoy)) {
      setFechaSeleccionada(hoy);
    } else {
      // Buscar la primera fecha pendiente
      setFechaSeleccionada(fechasPendientes[0]);
    }
  }, [fechasPendientes, hoy]);

  const fechaInicio = fechaSeleccionada;
  const fechaFin = fechaSeleccionada;

  const { ventas, pagos, loading } = useMovimientosNoCerrados(
    van?.id,
    fechaInicio,
    fechaFin
  );

  // Enriquecer con nombres
  const clienteKeys = useMemo(
    () =>
      Array.from(
        new Set([...ventas, ...pagos].map((x) => x?.cliente_id).filter(Boolean))
      ),
    [ventas, pagos]
  );

  const [clientesDic, setClientesDic] = useState({});
  useEffect(() => {
    if (!clienteKeys.length) {
      setClientesDic({});
      return;
    }
    (async () => {
      const keys = Array.from(new Set(clienteKeys));
      const dic = {};
      const { data: a } = await supabase
        .from("clientes")
        .select("id, nombre, negocio")
        .in("id", keys);
      for (const c of a || []) dic[c.id] = c;
      const missing = keys.filter((k) => !dic[k]);
      if (missing.length) {
        const { data: b } = await supabase
          .from("clientes_balance")
          .select("id, nombre, negocio")
          .in("id", missing);
        for (const c of b || []) dic[c.id] = c;
      }
      setClientesDic(dic);
    })();
  }, [clienteKeys.join(",")]);

  // Pagos con breakdown
  const pagosDecor = useMemo(
    () =>
      (pagos || []).map((p) => ({
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
    [pagos, clientesDic]
  );

// Sumatorio por venta_id a partir de pagos (fallback si la venta no trae su propio desglose)
const bkPorVenta = useMemo(() => {
  const map = new Map();
  for (const p of pagosDecor) {
    const ventaId = p.venta_id || p.sale_id || p.ventaId;
    if (!ventaId) continue;
    const prev = map.get(ventaId) || { cash: 0, card: 0, transfer: 0 };
    prev.cash += Number(p._bk?.cash || 0);
    prev.card += Number(p._bk?.card || 0);
    prev.transfer += Number(p._bk?.transfer || 0);
    map.set(ventaId, prev);
  }
  return map;
}, [pagosDecor]);

const ventasDecor = useMemo(
  () =>
    (ventas || []).map((v) => {
      const ficha = clientesDic[v.cliente_id];

      // 🔑 1) Intentar primero el desglose propio de la venta
      //    (campos pago_efectivo / pago_tarjeta / pago_transferencia y/o JSON "pago")
      let propio = breakdownPorMetodo(v);

      // 🔑 2) Si la venta aún no trae nada, usar como fallback lo sumado desde pagos
      const fallback = bkPorVenta.get(v.id) || { cash: 0, card: 0, transfer: 0 };
      const derivado = (propio.cash + propio.card + propio.transfer > 0) ? propio : fallback;

      return {
        ...v,
        _bk: derivado,
        cliente_nombre:
          v.cliente_nombre ||
          (ficha ? displayName(ficha) : v.cliente_id ? v.cliente_id.slice(0, 8) : NO_CLIENTE),
      };
    }),
  [ventas, clientesDic, bkPorVenta]
);

// IDs de ventas que sí están en este cierre (mismo día/rango)
const ventasIdSet = useMemo(
  () => new Set((ventas || []).map((v) => v.id)),
  [ventas]
);
useEffect(() => {
  if (!pagosDecor) return;
  console.log("🔎 pagosDecor count:", pagosDecor.length);
  const sample = pagosDecor.slice(0, 10).map(p =>
    explainPagoFiltro(p, ventasIdSet, fechaSeleccionada, van)
  );
  console.table(sample);
}, [pagosDecor, ventasIdSet, fechaSeleccionada, van?.id]);

  // 🔍 TEMP: explica por qué un pago NO aparece en "avances"
function explainPagoFiltro(p, ventasIdSet, fechaSeleccionada, van) {
  const ligadoAVentaDelRango = !!(p?.venta_id && ventasIdSet.has(p.venta_id));
  const diaLocal = pagoYMD(p);
  const fechaOK = diaLocal === fechaSeleccionada;
  const vanOK = !(p?.van_id && van?.id && p.van_id !== van.id);

  return {
    id: p.id,
    venta_id: p.venta_id || null,
    monto_calc:
      (Number(p._bk?.cash || 0) +
        Number(p._bk?.card || 0) +
        Number(p._bk?.transfer || 0)) || Number(p.monto || 0),
    diaLocal,
    fechaSeleccionada,
    ligadoAVentaDelRango,
    fechaOK,
    vanOK,
  };
}


// Avances (pagos fuera de las ventas mostradas en este cierre)
const avances = useMemo(() => {
  console.log("Filtro Avances - pagosDecor original:", pagosDecor);

  return (pagosDecor || []).filter((p) => {
    
    const ligadoAVentaDelRango = !!(p?.venta_id && ventasIdSet.has(p.venta_id));
          const diaLocal = pagoYMD(p);
      if (String(diaLocal).trim() !== String(fechaSeleccionada).trim()) return false;

    const vanOK = !p?.van_id || !van?.id || p.van_id === van.id;

    console.log("DEBUG AVANCE:", {
      id: p.id,
      venta_id: p.venta_id || null,
      diaLocal,
      fechaSeleccionada,
      ligadoAVentaDelRango,
      fechaOK,
      vanOK,
      monto_calc:
        (Number(p._bk?.cash || 0) +
          Number(p._bk?.card || 0) +
          Number(p._bk?.transfer || 0)) || Number(p.monto || 0),
    });

    if (ligadoAVentaDelRango) return false;
    if (!fechaOK) return false;
    if (!vanOK) return false;

    const monto =
      (Number(p._bk?.cash || 0) +
        Number(p._bk?.card || 0) +
        Number(p._bk?.transfer || 0)) || Number(p.monto || 0);

    return monto > 0.0001;
  });
}, [pagosDecor, ventasIdSet, fechaSeleccionada, van?.id]);




  // Expected desde la vista
  const expected = useExpectedDia(van?.id, fechaSeleccionada);

  // Totales esperados que se muestran y se guardan
  const totalesEsperados = {
    pago_efectivo: Number(expected.cash || 0),
    pago_tarjeta: Number(expected.card || 0),
    pago_transferencia: Number(expected.transfer || 0),
  };

  // CxC del periodo (ventas - pagado)
  const cuentasCobrar = Number(
    ventasDecor
      .reduce(
        (t, v) =>
          t +
          ((Number(v.total_venta) || 0) - (Number(v.total_pagado) || 0)),
        0
      )
      .toFixed(2)
  );

  // UI
  const [openDesglose, setOpenDesglose] = useState(false);
  const [reales, setReales] = useState({
    pago_efectivo: "",
    pago_tarjeta: "",
    pago_transferencia: "",
  });
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  // Estados para generación de PDF
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [pdfMode, setPdfMode] = useState("download"); // "download" o "print"

  async function guardarCierre(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!van?.id || ventasDecor.length + pagosDecor.length === 0) {
      setMensaje("No transactions to close.");
      return;
    }
    setGuardando(true);

    const ventas_ids = ventasDecor.map((v) => v.id);
    const pagos_ids = pagosDecor.map((p) => p.id);

    const payload = {
      van_id: van.id,
      usuario_id: usuario?.id,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      comentario,
      cuentas_por_cobrar: cuentasCobrar,
      efectivo_esperado: totalesEsperados.pago_efectivo,
      efectivo_real: Number(reales.pago_efectivo || 0),
      tarjeta_esperado: totalesEsperados.pago_tarjeta,
      tarjeta_real: Number(reales.pago_tarjeta || 0),
      transferencia_esperado: totalesEsperados.pago_transferencia,
      transferencia_real: Number(reales.pago_transferencia || 0),
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
        cierre_id_param: cierre_id,
        van_id_param: van.id,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });
      await supabase.rpc("cerrar_pagos_por_van", {
        cierre_id_param: cierre_id,
        van_id_param: van.id,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
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
    setReales({ pago_efectivo: "", pago_tarjeta: "", pago_transferencia: "" });
    setComentario("");
    navigate("/cierres");
  }

  // Función para generar el PDF
  const generarPDF = async () => {
    setGenerandoPDF(true);
    
    try {
      const resumen = {
        efectivo_esperado: totalesEsperados.pago_efectivo,
        tarjeta_esperado: totalesEsperados.pago_tarjeta,
        transferencia_esperado: totalesEsperados.pago_transferencia,
        cxc_periodo: cuentasCobrar,
      };

      // Si ya hay un cierre, usar su fecha de cierre
      const fechaCierre = cierreInfo?.created_at ? toLocalYMD(cierreInfo.created_at) : null;

      generarPDFCierreVan({
        empresa: {
          nombre: "TOOLS4CARE",
          direccion: "108 Lafayette St, Salem, MA 01970",
          telefono: "(978) 594-1624",
          email: "tools4care@gmail.com",
        },
        usuario,
        vanNombre: van?.nombre || van?.van_nombre || "",
        ventas: ventasDecor,
        pagos: avances,
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

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-white rounded shadow p-6">
      <h2 className="font-bold text-xl mb-6 text-blue-900">Van Closeout</h2>

      <div className="mb-4">
        <label className="font-bold text-sm mb-1 block">Select date to close:</label>
        <select
          className="border p-2 rounded w-full max-w-xs"
          value={fechaSeleccionada}
          onChange={(e) => {
            const v = e.target.value;
            // Permitir cambiar a cualquier fecha, incluso si está cerrada
            setFechaSeleccionada(v);
            try {
              localStorage.setItem("pre_cierre_fecha", v);
            } catch {}
          }}
        >
          {fechasPendientes.length === 0 ? (
            <option value="">No pending days</option>
          ) : (
            fechasPendientes.map((f) => (
              <option 
                value={f} 
                key={f}
                disabled={fechasCerradas.includes(f)}
              >
                {f} {fechasCerradas.includes(f) ? "(Closed)" : ""}
              </option>
            ))
          )}
        </select>
        {cierreInfo && (
          <div className="mt-1 text-sm text-red-600">
            This date has already been closed on {toLocalYMD(cierreInfo.created_at)}
          </div>
        )}
      </div>

      
        {loading ? (
  <div className="text-blue-600">Loading transactions...</div>
) : (
  <>
    <TablaMovimientosPendientes ventas={ventasDecor} />

    {avances.length > 0 && (
      <>
        <p className="text-xs text-gray-500 mb-1">
          Only customer advances not tied to a sale are listed below.
          Payments captured inside a sale are summarized in that sale's row.
        </p>
        <TablaAbonosPendientes pagos={avances} />
      </>
    )}
  </>
)}


      {/* EXPECTED (desde la vista) */}
      <div className="mb-2 p-3 rounded bg-blue-50 text-sm">
        <div className="font-bold text-blue-900 mb-1">Expected (from totals)</div>
        <div>Cash expected: ${Number(expected.cash || 0).toFixed(2)}</div>
        <div>Card expected: ${Number(expected.card || 0).toFixed(2)}</div>
        <div>Transfer expected: ${Number(expected.transfer || 0).toFixed(2)}</div>
        {Number(expected.mix || 0) > 0 && (
          <div className="text-xs text-amber-700">
            Mix (unallocated): ${Number(expected.mix).toFixed(2)}
          </div>
        )}
      </div>

      {/* Formulario de conteo y confirmación */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setShowConfirmModal(true);
        }}
      >
        {METODOS_PAGO.map(({ campo, label }) => (
          <div key={campo} className="mb-2">
            <label className="block font-bold">{label} expected:</label>
            <input
              className="border bg-gray-100 p-2 w-full mb-1"
              value={totalesEsperados[campo] || 0}
              disabled
            />
            <label className="block">Counted:</label>
            <div className="flex gap-2">
              <input
                className="border p-2 w-full"
                type="number"
                value={reales[campo] || ""}
                onChange={(e) =>
                  setReales((r) => ({ ...r, [campo]: e.target.value }))
                }
                required
                disabled={cierreInfo !== null}
              />
              {campo === "pago_efectivo" && (
                <button
                  type="button"
                  className="bg-blue-100 px-3 py-2 rounded text-xs font-bold text-blue-900 border border-blue-200"
                  onClick={() => setOpenDesglose(true)}
                  tabIndex={-1}
                  disabled={cierreInfo !== null}
                >
                  Breakdown
                </button>
              )}
            </div>
          </div>
        ))}
        <div className="mb-2">
          <label className="block font-bold">Accounts Receivable for the Period:</label>
          <input
            className="border p-2 w-full mb-1 bg-gray-100"
            value={cuentasCobrar}
            disabled
          />
        </div>
        <div className="mb-3">
          <label className="block font-bold">Comment:</label>
          <textarea
            className="border p-2 w-full"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            disabled={cierreInfo !== null}
          />
        </div>
        
        {/* Opciones de PDF */}
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <h3 className="font-bold text-blue-800 mb-2">PDF Report Options</h3>
          <div className="flex items-center mb-2">
            <input
              type="radio"
              id="pdf-download"
              name="pdf-mode"
              value="download"
              checked={pdfMode === "download"}
              onChange={() => setPdfMode("download")}
              className="mr-2"
              // Permitir seleccionar aunque esté cerrado
            />
            <label htmlFor="pdf-download" className="mr-4">Download PDF</label>
            <input
              type="radio"
              id="pdf-print"
              name="pdf-mode"
              value="print"
              checked={pdfMode === "print"}
              onChange={() => setPdfMode("print")}
              className="mr-2"
              // Permitir seleccionar aunque esté cerrado
            />
            <label htmlFor="pdf-print">Print PDF</label>
          </div>
          <button
            type="button"
            className="bg-green-700 text-white px-4 py-2 rounded font-bold w-full"
            onClick={generarPDF}
            disabled={generandoPDF}
            // Permitir generar PDF aunque esté cerrado
          >
            {generandoPDF ? "Generating PDF..." : "Generate PDF Report"}
          </button>
        </div>
        
        <button
          type="submit"
          className="bg-blue-700 text-white px-4 py-2 rounded font-bold w-full"
          disabled={guardando || ventasDecor.length + pagosDecor.length === 0 || cierreInfo !== null}
        >
          {guardando ? "Saving..." : "Register Closeout"}
        </button>
        {mensaje && (
          <div className="mt-2 p-2 rounded text-center text-sm bg-blue-100 text-blue-700">
            {mensaje}
          </div>
        )}
      </form>

      <ConfirmModal
        open={showConfirmModal}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={async () => {
          await guardarCierre({ preventDefault: () => {} });
        }}
        totalesEsperados={totalesEsperados}
        reales={reales}
        cuentasCobrar={cuentasCobrar}
        comentario={comentario}
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
      />

      <DesgloseEfectivoModal
        open={openDesglose}
        onClose={() => setOpenDesglose(false)}
        onSave={(total) => {
          setReales((r) => ({ ...r, pago_efectivo: total }));
          setOpenDesglose(false);
        }}
      />
    </div>
  );
}