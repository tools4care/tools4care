// src/CierreVan.jsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Métodos de pago
const METODOS_PAGO = [
  { campo: "pago_efectivo", label: "Cash" },
  { campo: "pago_tarjeta", label: "Card" },
  { campo: "pago_transferencia", label: "Transfer" }
];

// Denominaciones para desglose efectivo
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
  { nombre: "Pennies", valor: 0.01 }
];

const NO_CLIENTE = "Quick sale / No client";
const isIsoDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const normalizeFecha = (x) => {
  if (!x) return "";
  if (typeof x === "string") return x.slice(0, 10);
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  if (typeof x === "object") {
    const cand = x.fecha ?? x.date ?? x.day ?? Object.values(x)[0];
    return cand ? String(cand).slice(0, 10) : "";
  }
  return String(x).slice(0, 10);
};

/* ======================= HELPERS ======================= */
function displayName(cli) {
  if (!cli) return "";
  const nombre = [cli.nombre, cli.apellido].filter(Boolean).join(" ").trim();
  return cli.negocio ? `${nombre || cli.id} (${cli.negocio})` : (nombre || cli.id);
}

/**
 * Diccionario de clientes accesible por id
 * Busca en clientes y clientes_balance SOLO por id
 */
async function fetchClientesDic(ids) {
  const keys = Array.from(new Set((ids || []).filter(Boolean)));
  const dic = {};
  if (!keys.length) return dic;

  try {
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, negocio")
      .in("id", keys);
    for (const c of data || []) dic[c.id] = c;
  } catch {}

  const missing = keys.filter(k => !dic[k]);

  if (missing.length) {
    try {
      const { data } = await supabase
        .from("clientes_balance")
        .select("id, nombre, negocio")
        .in("id", missing);
      for (const c of data || []) dic[c.id] = c;
    } catch {}
  }

  return dic;
}

function useClientesPorIds(ids) {
  const [dic, setDic] = useState({});
  const key = useMemo(
    () => (ids || []).filter(Boolean).sort().join(","),
    [ids]
  );
  useEffect(() => {
    if (!key) { setDic({}); return; }
    (async () => setDic(await fetchClientesDic(ids)))();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return dic;
}

/* ===== Fechas pendientes de cierre ===== */
function useFechasPendientes(van_id) {
  const [fechas, setFechas] = useState([]);
  useEffect(() => {
    if (!van_id) { setFechas([]); return; }

    (async () => {
      let list = [];

      try {
        const { data, error } = await supabase.rpc(
          "fechas_pendientes_cierre_van",
          { van_id_param: van_id }
        );
        if (!error && Array.isArray(data)) {
          list = (data || []).map(normalizeFecha).filter(isIsoDate);
        }
      } catch { /* noop */ }

      if (list.length === 0) {
        const pad = (n) => String(n).padStart(2,"0");
        const hoy = new Date();
        const dias = [];
        for (let i = 0; i < 21; i++) {
          const d = new Date(hoy);
          d.setDate(d.getDate() - i);
          dias.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
        }

        const encontrados = [];
        for (const dia of dias) {
          try {
            const [{ data: v }, { data: p }] = await Promise.all([
              supabase.rpc("ventas_no_cerradas_por_van_by_id", {
                van_id_param: van_id, fecha_inicio: dia, fecha_fin: dia
              }),
              supabase.rpc("pagos_no_cerrados_por_van_by_id", {
                van_id_param: van_id, fecha_inicio: dia, fecha_fin: dia
              }),
            ]);
            if ((v?.length || 0) > 0 || (p?.length || 0) > 0) encontrados.push(dia);
          } catch { /* noop */ }
        }
        list = encontrados;
      }

      try {
        const pref = localStorage.getItem("pre_cierre_fecha");
        if (isIsoDate(pref) && !list.includes(pref)) list.unshift(pref);
      } catch {}

      setFechas(Array.from(new Set(list)).filter(isIsoDate));
    })();
  }, [van_id]);

  return fechas;
}

// Movimientos no cerrados
function useMovimientosNoCerrados(van_id, fechaInicio, fechaFin) {
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!van_id || !isIsoDate(fechaInicio) || !isIsoDate(fechaFin)) {
      setVentas([]); setPagos([]); return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data: ventasPend } = await supabase.rpc(
          "ventas_no_cerradas_por_van_by_id",
          { van_id_param: van_id, fecha_inicio: fechaInicio, fecha_fin: fechaFin }
        );
        const { data: pagosPend } = await supabase.rpc(
          "pagos_no_cerrados_por_van_by_id",
          { van_id_param: van_id, fecha_inicio: fechaInicio, fecha_fin: fechaFin }
        );
        setVentas(ventasPend || []);
        setPagos(pagosPend || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [van_id, fechaInicio, fechaFin]);

  return { ventas, pagos, loading };
}

// Cierres históricos
function useCierresVan(van_id, fechaDesde, fechaHasta) {
  const [cierres, setCierres] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!van_id || !isIsoDate(fechaDesde) || !isIsoDate(fechaHasta)) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("cierres_van")
        .select("*")
        .eq("van_id", van_id)
        .gte("fecha_inicio", fechaDesde)
        .lte("fecha_fin", fechaHasta)
        .order("fecha_fin", { ascending: false });
      setCierres(data || []);
      setLoading(false);
    })();
  }, [van_id, fechaDesde, fechaHasta]);
  return { cierres, loading };
}

// Usuarios por IDs
function useUsuariosPorIds(usuarioIds) {
  const [usuarios, setUsuarios] = useState({});
  useEffect(() => {
    if (!usuarioIds || usuarioIds.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("usuarios")
        .select("id, nombre, email")
        .in("id", usuarioIds);
      const dic = {};
      for (const u of data || []) dic[u.id] = u;
      setUsuarios(dic);
    })();
  }, [usuarioIds?.join(",")]);
  return usuarios;
}

// Vans por IDs (tabla tiene nombre_van)
function useVansPorIds(vanIds) {
  const [vans, setVans] = useState({});
  useEffect(() => {
    if (!vanIds || vanIds.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("vans")
        .select("id, nombre_van")
        .in("id", vanIds);
      const dic = {};
      for (const v of data || []) dic[v.id] = { ...v, nombre: v.nombre_van || v.nombre };
      setVans(dic);
    })();
  }, [vanIds?.join(",")]);
  return vans;
}

// UTILS
function sumBy(arr, key) {
  return arr.reduce((t, x) => t + Number(x[key] || 0), 0);
}

/* ======================= TABLAS ======================= */
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
              <td className="p-1">{v.fecha?.slice(0, 10) || "-"}</td>
              <td className="p-1">
                {v.cliente_nombre ||
                  (v.cliente_id ? v.cliente_id.slice(0, 8) : NO_CLIENTE)}
              </td>
              <td className="p-1">${Number(v.total_venta || 0).toFixed(2)}</td>
              <td className="p-1">${Number(v.pago_efectivo || 0).toFixed(2)}</td>
              <td className="p-1">${Number(v.pago_tarjeta || 0).toFixed(2)}</td>
              <td className="p-1">${Number(v.pago_transferencia || 0).toFixed(2)}</td>
              <td className="p-1">${Number(v.total_pagado || 0).toFixed(2)}</td>
              <td className="p-1">${(Number(v.total_venta || 0) - Number(v.total_pagado || 0)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-blue-50 font-bold">
          <tr>
            <td className="p-1">Totals</td>
            <td className="p-1"></td>
            <td className="p-1">${sumBy(ventas, "total_venta").toFixed(2)}</td>
            <td className="p-1">${sumBy(ventas, "pago_efectivo").toFixed(2)}</td>
            <td className="p-1">${sumBy(ventas, "pago_tarjeta").toFixed(2)}</td>
            <td className="p-1">${sumBy(ventas, "pago_transferencia").toFixed(2)}</td>
            <td className="p-1">${sumBy(ventas, "total_pagado").toFixed(2)}</td>
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
      <h3 className="font-bold mb-3 text-lg text-blue-800">Customer Payments/Advances Included in This Closing</h3>
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
          {pagos.map((p) => (
            <tr key={p.id}>
              <td className="p-1">{p.fecha_pago?.slice(0, 10) || "-"}</td>
              <td className="p-1">
                {p.cliente_nombre ||
                  (p.cliente_id ? p.cliente_id.slice(0, 8) : NO_CLIENTE)}
              </td>
              <td className="p-1">${Number(p.monto || 0).toFixed(2)}</td>
              <td className="p-1">{p.metodo_pago || "-"}</td>
              <td className="p-1">{p.referencia || "-"}</td>
              <td className="p-1">{p.notas || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DesgloseEfectivoModal({ open, onClose, onSave }) {
  const [billetes, setBilletes] = useState(
    DENOMINACIONES.map(d => ({ ...d, cantidad: "" }))
  );
  useEffect(() => {
    if (open) setBilletes(DENOMINACIONES.map(d => ({ ...d, cantidad: "" })));
  }, [open]);

  const total = billetes.reduce((t, b) => t + Number(b.cantidad || 0) * b.valor, 0);
  return !open ? null : (
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
                    onChange={e => {
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
          <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded">Cancel</button>
          <button onClick={() => onSave(total)} className="px-3 py-1 bg-blue-700 text-white rounded">
            Use Total
          </button>
        </div>
      </div>
    </div>
  );
}

// CONFIRMACION VISUAL
function ConfirmModal({ open, onCancel, onConfirm, totalesEsperados, reales, cuentasCobrar, comentario, fechaInicio, fechaFin }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 shadow-xl w-[370px] max-w-full">
        <h2 className="font-bold text-lg mb-3 text-blue-800">Confirm Closeout</h2>
        <div className="mb-2 text-sm">
          <b>From:</b> {fechaInicio} <b>To:</b> {fechaFin}
        </div>
        <div className="border rounded bg-gray-50 p-3 mb-3 text-xs">
          <div><b>Cash (expected):</b> ${totalesEsperados.pago_efectivo}</div>
          <div><b>Card (expected):</b> ${totalesEsperados.pago_tarjeta}</div>
          <div><b>Transfer (expected):</b> ${totalesEsperados.pago_transferencia}</div>
          <div><b>Cash (counted):</b> ${reales.pago_efectivo || 0}</div>
          <div><b>Card (counted):</b> ${reales.pago_tarjeta || 0}</div>
          <div><b>Transfer (counted):</b> ${reales.pago_transferencia || 0}</div>
          <div><b>Accounts Receivable:</b> ${cuentasCobrar}</div>
          <div><b>Comment:</b> {comentario || "-"}</div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="bg-gray-200 px-3 py-1 rounded">Cancel</button>
          <button onClick={onConfirm} className="bg-blue-700 text-white px-4 py-1 rounded font-bold">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// Cargar detalles (ventas y pagos) de un cierre por id
async function cargarDetallesCierre(cierre) {
  const ventas_ids = cierre.ventas_ids || [];
  const pagos_ids = cierre.pagos_ids || [];
  if (ventas_ids.length === 0 && pagos_ids.length === 0) return { ventas: [], pagos: [] };
  const ventasIdsArray = Array.isArray(ventas_ids) ? ventas_ids : [ventas_ids];
  const pagosIdsArray = Array.isArray(pagos_ids) ? pagos_ids : [pagos_ids];
  const { data: ventas } = ventasIdsArray.length
    ? await supabase.from("ventas").select("*").in("id", ventasIdsArray)
    : { data: [] };
  const { data: pagos } = pagosIdsArray.length
    ? await supabase.from("pagos").select("*").in("id", pagosIdsArray)
    : { data: [] };
  return { ventas: ventas || [], pagos: pagos || [] };
}

/* =========================
   GENERADOR DE PDF
   ========================= */
function generarPDFCierreVan({
  empresa = {
    nombre: "TOOLS4CARE",
    direccion: "108 Lafayette St, Salem, MA 01970",
    telefono: "(978) 594-1624",
    email: "tools4care@gmail.com"
  },
  cierre,
  usuario,
  vanNombre,
  ventas = [],
  pagos = [],
  resumen = {},
  fechaInicio,
  fechaFin
}) {
  const doc = new jsPDF("p", "pt", "a4");
  const azul = "#0B4A6F";
  const gris = "#F4F6FB";
  const azulSuave = "#e3f2fd";
  const negro = "#222";

  // Marca
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(azul);
  doc.text(empresa.nombre, 36, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Address: ${empresa.direccion}`, 36, 65);
  doc.text(`Phone: ${empresa.telefono}  |  Email: ${empresa.email}`, 36, 78);

  doc.setLineWidth(1.1);
  doc.setDrawColor(azul);
  doc.line(36, 86, 560, 86);

  // Cabecera
  const vanId = cierre?.van_id || "-";
  const vanIdShort = (vanId || "").toString().slice(0, 8);
  const vanLabel = [vanNombre || cierre?.van_nombre || "-", `ID: ${vanIdShort}`]
    .filter(Boolean)
    .join(" — ");
  const userLine = `${usuario?.nombre || usuario?.email || cierre?.usuario_id || "-"}${usuario?.email ? " | " + usuario.email : ""}${cierre?.usuario_id ? " (ID: " + cierre.usuario_id + ")" : ""}`;

  doc.setFontSize(14);
  doc.setTextColor(azul);
  doc.text("Van Closeout - Executive Report", 36, 110);

  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Period: ${fechaInicio} to ${fechaFin}`, 36, 130);
  doc.text(doc.splitTextToSize(`Responsible: ${userLine}`, 240), 36, 146);
  doc.text(doc.splitTextToSize(`Van: ${vanLabel}`, 220), 316, 130);
  doc.text(`Closeout Date: ${new Date().toLocaleString()}`, 316, 146);

  // Resumen
  doc.setFillColor(azulSuave);
  doc.roundedRect(36, 160, 520, 52, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(azul);
  doc.setFontSize(12);
  doc.text("Executive Summary", 44, 180);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Expected Cash: $${Number(resumen.efectivo_esperado).toFixed(2)}`, 44, 198);
  doc.text(`Expected Card: $${Number(resumen.tarjeta_esperado).toFixed(2)}`, 220, 198);
  doc.text(`Expected Transfer: $${Number(resumen.transferencia_esperado).toFixed(2)}`, 370, 198);
  doc.text(`A/R in Period: $${Number(resumen.cxc_periodo).toFixed(2)}`, 44, 214);

  // Ventas
  doc.setFont("helvetica", "bold");
  doc.setTextColor(azul);
  doc.setFontSize(13);
  doc.text("Pending Sales Included in This Report", 36, 240);

  autoTable(doc, {
    startY: 250,
    head: [["Date", "Client", "Total", "Cash", "Card", "Transfer", "Paid", "A/R"]],
    body: ventas.length === 0
      ? [["-", "-", "-", "-", "-", "-", "-", "-"]]
      : ventas.map(v => [
          v.fecha?.slice(0, 10) || "-",
          v.cliente_nombre || (v.cliente_id ? v.cliente_id.slice(0, 8) : NO_CLIENTE),
          "$" + Number(v.total_venta || 0).toFixed(2),
          "$" + Number(v.pago_efectivo || 0).toFixed(2),
          "$" + Number(v.pago_tarjeta || 0).toFixed(2),
          "$" + Number(v.pago_transferencia || 0).toFixed(2),
          "$" + Number(v.total_pagado || 0).toFixed(2),
          "$" + ((Number(v.total_venta || 0) - Number(v.total_pagado || 0)).toFixed(2)),
        ]),
    theme: "grid",
    headStyles: { fillColor: azul, textColor: "#fff", fontStyle: "bold" },
    styles: { fontSize: 9, lineColor: azulSuave, textColor: "#333" },
    foot: [[
      "Totals",
      "",
      "$" + ventas.reduce((t, v) => t + Number(v.total_venta || 0), 0).toFixed(2),
      "$" + ventas.reduce((t, v) => t + Number(v.pago_efectivo || 0), 0).toFixed(2),
      "$" + ventas.reduce((t, v) => t + Number(v.pago_tarjeta || 0), 0).toFixed(2),
      "$" + ventas.reduce((t, v) => t + Number(v.pago_transferencia || 0), 0).toFixed(2),
      "$" + ventas.reduce((t, v) => t + Number(v.total_pagado || 0), 0).toFixed(2),
      "$" + ventas.reduce((t, v) => t + (Number(v.total_venta || 0) - Number(v.total_pagado || 0)), 0).toFixed(2)
    ]],
    footStyles: { fillColor: gris, textColor: azul, fontStyle: "bold" },
    margin: { left: 36, right: 36 }
  });

  // Pagos
  let yAbonos = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 320;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(azul);
  doc.text("Customer Payments Included in This Closing", 36, yAbonos);

  autoTable(doc, {
    startY: yAbonos + 10,
    head: [["Date", "Client", "Amount", "Method", "Reference", "Notes"]],
    body: pagos.length === 0
      ? [["-", "-", "-", "-", "-", "-"]]
      : pagos.map(p => [
          p.fecha_pago?.slice(0,10) || "-",
          p.cliente_nombre || (p.cliente_id ? p.cliente_id.slice(0,8) : NO_CLIENTE),
          "$" + Number(p.monto || 0).toFixed(2),
          p.metodo_pago || "-",
          p.referencia || "-",
          p.notas || "-"
        ]),
    theme: "grid",
    headStyles: { fillColor: azul, textColor: "#fff", fontStyle: "bold" },
    styles: { fontSize: 9, lineColor: gris, textColor: "#333" },
    margin: { left: 36, right: 36 }
  });

  // Pie
  let yPie = doc.lastAutoTable ? doc.lastAutoTable.finalY + 40 : 760;
  if (yPie > 740) yPie = 740;
  doc.setDrawColor(gris);
  doc.line(36, yPie, 560, yPie);
  doc.setFontSize(8);
  doc.setTextColor("#666");
  doc.text(
    `Automatically generated by TOOLS4CARE  |  ${new Date().toLocaleString()}`,
    36,
    yPie + 15
  );
  doc.text(
    "Confidential document for audit and control. Distribution without authorization is prohibited.",
    36,
    yPie + 30
  );

  const nombreArchivo = `VanCloseout_${(vanNombre || vanIdShort || "").toString().replace(/\s+/g, "")}_${fechaInicio}_${fechaFin}.pdf`;
  doc.save(nombreArchivo);
}

// ----------- COMPONENTE PRINCIPAL -----------
export default function CierreVan() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  // -------- BLOQUE 1: Selección de día pendiente a cerrar --------
  const fechasPendientes = useFechasPendientes(van?.id);
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");

  useEffect(() => {
    if (fechasPendientes.length === 0) {
      setFechaSeleccionada("");
      return;
    }
    let pref = "";
    try { pref = localStorage.getItem("pre_cierre_fecha") || ""; } catch {}
    if (isIsoDate(pref) && fechasPendientes.includes(pref)) {
      setFechaSeleccionada(pref);
    } else if (fechasPendientes.includes(hoy)) {
      setFechaSeleccionada(hoy);
    } else {
      setFechaSeleccionada(fechasPendientes[0]);
    }
  }, [fechasPendientes, hoy]);

  // -------- BLOQUE 2: Formulario y confirmación visual del cierre --------
  const fechaInicio = fechaSeleccionada;
  const fechaFin = fechaSeleccionada;
  const { ventas, pagos, loading } = useMovimientosNoCerrados(van?.id, fechaInicio, fechaFin);

  // Enriquecer con nombres de cliente
  const clienteKeys = useMemo(
    () => Array.from(new Set([...ventas, ...pagos].map(x => x?.cliente_id).filter(Boolean))),
    [ventas, pagos]
  );

  const clientesDic = useClientesPorIds(clienteKeys);

  const ventasConNombre = useMemo(
    () => ventas.map(v => {
      const ficha = clientesDic[v.cliente_id];
      return {
        ...v,
        cliente_nombre: v.cliente_nombre || (ficha ? displayName(ficha) : (v.cliente_id ? v.cliente_id.slice(0,8) : NO_CLIENTE))
      };
    }),
    [ventas, clientesDic]
  );

  const pagosConNombre = useMemo(
    () => pagos.map(p => {
      const ficha = clientesDic[p.cliente_id];
      return {
        ...p,
        cliente_nombre: p.cliente_nombre || (ficha ? displayName(ficha) : (p.cliente_id ? p.cliente_id.slice(0,8) : NO_CLIENTE))
      };
    }),
    [pagos, clientesDic]
  );

  // Cierres anteriores
  const [filtroDesde, setFiltroDesde] = useState(hoy);
  const [filtroHasta, setFiltroHasta] = useState(hoy);
  const { cierres, loading: loadingCierres } = useCierresVan(van?.id, filtroDesde, filtroHasta);

  // Diccionarios
  const usuarioIds = Array.from(new Set((cierres || []).map(c => c.usuario_id).filter(Boolean)));
  const vanIds = Array.from(new Set((cierres || []).map(c => c.van_id).filter(Boolean)));
  const usuariosDic = useUsuariosPorIds(usuarioIds);
  const vansDic = useVansPorIds(vanIds);

  // Totales
  const totalesEsperados = {
    pago_efectivo: Number((sumBy(ventasConNombre, "pago_efectivo") + sumBy(pagosConNombre.filter(p => p.metodo_pago === "Cash"), "monto")).toFixed(2)),
    pago_tarjeta: Number((sumBy(ventasConNombre, "pago_tarjeta") + sumBy(pagosConNombre.filter(p => p.metodo_pago === "Card"), "monto")).toFixed(2)),
    pago_transferencia: Number((sumBy(ventasConNombre, "pago_transferencia") + sumBy(pagosConNombre.filter(p => p.metodo_pago === "Transfer"), "monto")).toFixed(2)),
  };

  const cuentasCobrar = Number(
    ventasConNombre.reduce((t, v) => t + ((Number(v.total_venta) || 0) - (Number(v.total_pagado) || 0)), 0).toFixed(2)
  );

  // UI state
  const [openDesglose, setOpenDesglose] = useState(false);
  const [reales, setReales] = useState({ pago_efectivo: "", pago_tarjeta: "", pago_transferencia: "" });
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  async function guardarCierre(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!van?.id || ventasConNombre.length + pagosConNombre.length === 0) {
      setMensaje("No transactions to close.");
      return;
    }
    setGuardando(true);

    const ventas_ids = ventasConNombre.map((v) => v.id);
    const pagos_ids = pagosConNombre.map((p) => p.id);

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
      pagos_ids
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
      } catch {}
    }

    setGuardando(false);
    setMensaje("Closeout registered successfully!");
    setReales({ pago_efectivo: "", pago_tarjeta: "", pago_transferencia: "" });
    setComentario("");
    try { localStorage.removeItem("pre_cierre_fecha"); } catch {}
    setTimeout(() => setMensaje(""), 2000);
  }

  const resumenPDF = {
    efectivo_esperado: totalesEsperados.pago_efectivo,
    tarjeta_esperado: totalesEsperados.pago_tarjeta,
    transferencia_esperado: totalesEsperados.pago_transferencia,
    cxc_periodo: cuentasCobrar
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-white rounded shadow p-6">
      <h2 className="font-bold text-xl mb-6 text-blue-900">Van Closeout</h2>

      {/* BLOQUE 1: Selección del día a cerrar */}
      <div className="mb-4">
        <label className="font-bold text-sm mb-1 block">Select date to close:</label>
        <select
          className="border p-2 rounded w-full max-w-xs"
          value={fechaSeleccionada}
          onChange={e => {
            const v = e.target.value;
            setFechaSeleccionada(v);
            try { localStorage.setItem("pre_cierre_fecha", v); } catch {}
          }}
        >
          {fechasPendientes.length === 0 ? (
            <option value="">No pending days</option>
          ) : (
            fechasPendientes.map(f =>
              <option value={f} key={f}>{f}</option>
            )
          )}
        </select>
      </div>

      {/* BLOQUE 2 */}
      {loading ? (
        <div className="text-blue-600">Loading transactions...</div>
      ) : (
        <>
          <TablaMovimientosPendientes ventas={ventasConNombre} />
          <TablaAbonosPendientes pagos={pagosConNombre} />
        </>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          setShowConfirmModal(true);
        }}
      >
        {METODOS_PAGO.map(({ campo, label }) => (
          <div key={campo} className="mb-2">
            <label className="block font-bold">{label} expected:</label>
            <input className="border bg-gray-100 p-2 w-full mb-1" value={totalesEsperados[campo] || 0} disabled />
            <label className="block">Counted:</label>
            <div className="flex gap-2">
              <input
                className="border p-2 w-full"
                type="number"
                value={reales[campo] || ""}
                onChange={e => setReales(r => ({ ...r, [campo]: e.target.value }))}
                required
              />
              {campo === "pago_efectivo" && (
                <button
                  type="button"
                  className="bg-blue-100 px-3 py-2 rounded text-xs font-bold text-blue-900 border border-blue-200"
                  onClick={() => setOpenDesglose(true)}
                  tabIndex={-1}
                >
                  Breakdown
                </button>
              )}
            </div>
          </div>
        ))}
        <div className="mb-2">
          <label className="block font-bold">Accounts Receivable for the Period:</label>
          <input className="border p-2 w-full mb-1 bg-gray-100" value={cuentasCobrar} disabled />
        </div>
        <div className="mb-3">
          <label className="block font-bold">Comment:</label>
          <textarea className="border p-2 w-full" value={comentario} onChange={e => setComentario(e.target.value)} />
        </div>
        <button
          type="submit"
          className="bg-blue-700 text-white px-4 py-2 rounded font-bold w-full"
          disabled={guardando || ventasConNombre.length + pagosConNombre.length === 0}
        >
          {guardando ? "Saving..." : "Register Closeout"}
        </button>
        {mensaje && (
          <div className="mt-2 p-2 rounded text-center text-sm bg-blue-100 text-blue-700">
            {mensaje}
          </div>
        )}
      </form>

      {/* MODALES */}
      <ConfirmModal
        open={showConfirmModal}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={async () => { setShowConfirmModal(false); await guardarCierre({ preventDefault: () => {} }); }}
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
        onSave={(total) => { setReales((r) => ({ ...r, pago_efectivo: total })); setOpenDesglose(false); }}
      />

      {/* Cierres pasados */}
      <div className="mb-10 mt-12 p-4 border-t pt-8">
        <h3 className="font-bold text-lg mb-2 text-blue-800">Past Closeouts</h3>
        <div className="flex gap-3 mb-4">
          <div>
            <label className="text-xs">From:</label>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} className="border p-1 rounded" />
          </div>
          <div>
            <label className="text-xs">To:</label>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} className="border p-1 rounded" />
          </div>
        </div>
        {loadingCierres ? (
          <div className="text-blue-600">Loading...</div>
        ) : cierres.length === 0 ? (
          <div className="text-gray-400">No closeouts found for this van and date range.</div>
        ) : (
          <table className="w-full text-xs mb-3 bg-white rounded shadow">
            <thead>
              <tr className="bg-blue-100">
                <th className="p-1">Closeout #</th>
                <th className="p-1">Period</th>
                <th className="p-1">User</th>
                <th className="p-1">Van</th>
                <th className="p-1">Cash</th>
                <th className="p-1">Card</th>
                <th className="p-1">Transfer</th>
                <th className="p-1">A/R</th>
                <th className="p-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cierres.map(cierre => (
                <tr key={cierre.id}>
                  <td className="p-1">{String(cierre.id).slice(0, 8)}</td>
                  <td className="p-1">
                    {cierre.fecha_inicio?.slice(0, 10)} - {cierre.fecha_fin?.slice(0, 10)}
                  </td>
                  <td className="p-1">
                    {usuariosDic?.[cierre.usuario_id]?.nombre ||
                      usuariosDic?.[cierre.usuario_id]?.email ||
                      cierre.usuario_id || "-"}
                  </td>
                  <td className="p-1">
                    {vansDic?.[cierre.van_id]?.nombre ||
                      cierre.van_nombre ||
                      cierre.van_id || "-"}
                  </td>
                  <td className="p-1">${Number(cierre.efectivo_real || 0).toFixed(2)}</td>
                  <td className="p-1">${Number(cierre.tarjeta_real || 0).toFixed(2)}</td>
                  <td className="p-1">${Number(cierre.transferencia_real || 0).toFixed(2)}</td>
                  <td className="p-1">${Number(cierre.cuentas_por_cobrar || 0).toFixed(2)}</td>
                  <td className="p-1">
                    <button
                      className="bg-blue-700 text-white px-2 py-1 rounded text-xs"
                      onClick={async () => {
                        const { ventas, pagos } = await cargarDetallesCierre(cierre);
                        const keys = [...ventas, ...pagos].map(x => x?.cliente_id).filter(Boolean);
                        const dicClientes = await fetchClientesDic(keys);

                        const ventasPDF = ventas.map(v => {
                          const ficha = dicClientes[v.cliente_id];
                          return {
                            ...v,
                            cliente_nombre: v.cliente_nombre || (ficha ? displayName(ficha) : (v.cliente_id ? v.cliente_id.slice(0,8) : NO_CLIENTE))
                          };
                        });
                        const pagosPDF = pagos.map(p => {
                          const ficha = dicClientes[p.cliente_id];
                          return {
                            ...p,
                            cliente_nombre: p.cliente_nombre || (ficha ? displayName(ficha) : (p.cliente_id ? p.cliente_id.slice(0,8) : NO_CLIENTE))
                          };
                        });

                        const [{ data: usuarioData }, { data: vanData }] = await Promise.all([
                          supabase.from("usuarios").select("id, nombre, email").eq("id", cierre.usuario_id).maybeSingle(),
                          supabase.from("vans").select("id, nombre_van").eq("id", cierre.van_id).maybeSingle()
                        ]);

                        generarPDFCierreVan({
                          cierre,
                          usuario: usuarioData || usuariosDic?.[cierre.usuario_id] || usuario || { nombre: cierre.usuario_id, email: "" },
                          vanNombre: (vanData && (vanData.nombre_van || vanData.nombre)) || vansDic?.[cierre.van_id]?.nombre || "",
                          ventas: ventasPDF,
                          pagos: pagosPDF,
                          resumen: {
                            efectivo_esperado: cierre.efectivo_esperado,
                            tarjeta_esperado: cierre.tarjeta_esperado,
                            transferencia_esperado: cierre.transferencia_esperado,
                            cxc_periodo: cierre.cuentas_por_cobrar
                          },
                          fechaInicio: cierre.fecha_inicio,
                          fechaFin: cierre.fecha_fin
                        });
                      }}
                    >
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
