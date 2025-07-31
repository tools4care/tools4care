import { useState, useEffect } from "react";
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

// HOOK para buscar días con movimientos pendientes de cierre
function useFechasPendientes(van_id) {
  const [fechas, setFechas] = useState([]);
  useEffect(() => {
    if (!van_id) return;
    (async () => {
      // Este RPC debe devolver ["2025-07-28", "2025-07-29", ...]
      const { data } = await supabase.rpc("fechas_pendientes_cierre_van", { van_id_param: van_id });
      setFechas(data || []);
    })();
  }, [van_id]);
  return fechas;
}

// HOOK para buscar movimientos no cerrados
function useMovimientosNoCerrados(van_id, fechaInicio, fechaFin) {
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!van_id || !fechaInicio || !fechaFin) return;
    setLoading(true);
    (async () => {
      const { data: ventasPend } = await supabase.rpc(
        "ventas_no_cerradas_por_van",
        { van_id_param: van_id, fecha_inicio: fechaInicio, fecha_fin: fechaFin }
      );
      const { data: pagosPend } = await supabase.rpc(
        "pagos_no_cerrados_por_van",
        { van_id_param: van_id, fecha_inicio: fechaInicio, fecha_fin: fechaFin }
      );
      setVentas(ventasPend || []);
      setPagos(pagosPend || []);
      setLoading(false);
    })();
  }, [van_id, fechaInicio, fechaFin]);

  return { ventas, pagos, loading };
}

// HOOK para buscar cierres históricos
function useCierresVan(van_id, fechaDesde, fechaHasta) {
  const [cierres, setCierres] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!van_id || !fechaDesde || !fechaHasta) return;
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

// HOOK para traer usuarios por IDs
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

// HOOK para traer vans por IDs
function useVansPorIds(vanIds) {
  const [vans, setVans] = useState({});
  useEffect(() => {
    if (!vanIds || vanIds.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("vans")
        .select("id, nombre")
        .in("id", vanIds);
      const dic = {};
      for (const v of data || []) dic[v.id] = v;
      setVans(dic);
    })();
  }, [vanIds?.join(",")]);
  return vans;
}

// UTILS
function sumBy(arr, key) {
  return arr.reduce((t, x) => t + Number(x[key] || 0), 0);
}

// ---------- TABLAS ----------
function TablaMovimientosPendientes({ ventas }) {
  const totalCxc = ventas.reduce((t, v) => t + ((Number(v.total_venta) || 0) - (Number(v.total_pagado) || 0)), 0);
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
              <td className="p-1">{v.cliente_nombre || v.cliente_id?.slice(0, 8) || "-"}</td>
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
              <td className="p-1">{p.cliente_nombre || p.cliente_id?.slice(0, 8) || "-"}</td>
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
    if (open) {
      setBilletes(DENOMINACIONES.map(d => ({ ...d, cantidad: "" })));
    }
  }, [open]);

  const total = billetes.reduce(
    (t, b) => t + Number(b.cantidad || 0) * b.valor, 0
  );
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
                <td className="text-xs pl-2 text-gray-400">${(b.valor * Number(b.cantidad || 0)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mb-4 text-right font-bold text-blue-700">
          Total: ${total.toFixed(2)}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded">Cancel</button>
          <button
            onClick={() => onSave(total)}
            className="px-3 py-1 bg-blue-700 text-white rounded"
          >Use Total</button>
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
          <button
            onClick={onConfirm}
            className="bg-blue-700 text-white px-4 py-1 rounded font-bold"
          >Confirm</button>
        </div>
      </div>
    </div>
  );
}

// FUNCION PARA CARGAR DETALLES (ventas y pagos) de un cierre por id
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

// GENERADOR DE PDF
function generarPDFCierreVan({
  empresa = {
    nombre: "TOOLS4CARE",
    direccion: "108 Lafayette St, Salem, MA 01970",
    telefono: "(978) 594-1624",
    email: "soporte@tools4care.com"
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

  doc.setFontSize(14);
  doc.setTextColor(azul);
  doc.text("Van Closeout - Executive Report", 36, 110);
  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Period: ${fechaInicio} to ${fechaFin}`, 36, 130);
  doc.text(`Van: ${vanNombre || cierre?.van_nombre || cierre?.van_id || "-"}`, 320, 130);
  doc.text(`Responsible: ${usuario?.nombre || usuario?.email || cierre?.usuario_id || "-"}`, 36, 146);
  doc.text(`Closeout Date: ${new Date().toLocaleString()}`, 320, 146);

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

  doc.setFont("helvetica", "bold");
  doc.setTextColor(azul);
  doc.setFontSize(13);
  doc.text("Pending Sales Included in This Report", 36, 240);

  autoTable(doc, {
    startY: 250,
    head: [[
      "Date", "Client", "Total", "Cash", "Card", "Transfer", "Paid", "A/R"
    ]],
    body: ventas.length === 0 ? [["-", "-", "-", "-", "-", "-", "-", "-"]] : ventas.map(v => [
      v.fecha?.slice(0, 10) || "-",
      v.cliente_nombre || v.cliente_id?.slice(0,8) || "-",
      "$" + Number(v.total_venta || 0).toFixed(2),
      "$" + Number(v.pago_efectivo || 0).toFixed(2),
      "$" + Number(v.pago_tarjeta || 0).toFixed(2),
      "$" + Number(v.pago_transferencia || 0).toFixed(2),
      "$" + Number(v.total_pagado || 0).toFixed(2),
      "$" + ((Number(v.total_venta || 0) - Number(v.total_pagado || 0)).toFixed(2)),
    ]),
    theme: "grid",
    headStyles: {
      fillColor: azul,
      textColor: "#fff",
      fontStyle: "bold"
    },
    styles: {
      fontSize: 9,
      lineColor: azulSuave,
      textColor: "#333"
    },
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
    footStyles: {
      fillColor: gris,
      textColor: azul,
      fontStyle: "bold"
    },
    margin: { left: 36, right: 36 }
  });

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
        p.cliente_nombre || p.cliente_id?.slice(0,8) || "-",
        "$" + Number(p.monto || 0).toFixed(2),
        p.metodo_pago || "-",
        p.referencia || "-",
        p.notas || "-"
      ]),
    theme: "grid",
    headStyles: {
      fillColor: azul,
      textColor: "#fff",
      fontStyle: "bold"
    },
    styles: {
      fontSize: 9,
      lineColor: gris,
      textColor: "#333"
    },
    margin: { left: 36, right: 36 }
  });

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

  doc.save(`VanCloseout_${vanNombre || cierre?.van_nombre || cierre?.van_id || ""}_${fechaInicio}_${fechaFin}.pdf`);
}

// ----------- COMPONENTE PRINCIPAL DIVIDIDO -----------
export default function CierreVan() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  // -------- BLOQUE 1: Selección de día pendiente a cerrar --------
  const fechasPendientes = useFechasPendientes(van?.id);
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(hoy);

  useEffect(() => {
    if (fechasPendientes.length > 0) {
      if (fechasPendientes.includes(hoy)) setFechaSeleccionada(hoy);
      else setFechaSeleccionada(fechasPendientes[0]);
    }
  }, [fechasPendientes]);

  // -------- BLOQUE 2: Formulario y confirmación visual del cierre --------
  const fechaInicio = fechaSeleccionada;
  const fechaFin = fechaSeleccionada;
  const { ventas, pagos, loading } = useMovimientosNoCerrados(van?.id, fechaInicio, fechaFin);

  // Filtros para buscar cierres anteriores
  const [filtroDesde, setFiltroDesde] = useState(hoy);
  const [filtroHasta, setFiltroHasta] = useState(hoy);
  const { cierres, loading: loadingCierres } = useCierresVan(
    van?.id,
    filtroDesde,
    filtroHasta
  );

  // Para mostrar nombre usuario y van
  const usuarioIds = Array.from(new Set((cierres || []).map(c => c.usuario_id).filter(Boolean)));
  const vanIds = Array.from(new Set((cierres || []).map(c => c.van_id).filter(Boolean)));
  const usuariosDic = useUsuariosPorIds(usuarioIds);
  const vansDic = useVansPorIds(vanIds);

  // --- Totales y cuentas por cobrar
  const totalesEsperados = {
    pago_efectivo: Number(
      (
        sumBy(ventas, "pago_efectivo") + sumBy(pagos.filter(p => p.metodo_pago === "Cash"), "monto")
      ).toFixed(2)
    ),
    pago_tarjeta: Number(
      (
        sumBy(ventas, "pago_tarjeta") + sumBy(pagos.filter(p => p.metodo_pago === "Card"), "monto")
      ).toFixed(2)
    ),
    pago_transferencia: Number(
      (
        sumBy(ventas, "pago_transferencia") + sumBy(pagos.filter(p => p.metodo_pago === "Transfer"), "monto")
      ).toFixed(2)
    ),
  };

  const cuentasCobrar = Number(
    ventas.reduce((t, v) => t + ((Number(v.total_venta) || 0) - (Number(v.total_pagado) || 0)), 0).toFixed(2)
  );

  // --- Popup desglose de efectivo
  const [openDesglose, setOpenDesglose] = useState(false);

  const [reales, setReales] = useState({
    pago_efectivo: "",
    pago_tarjeta: "",
    pago_transferencia: ""
  });
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  async function guardarCierre(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!van?.id || ventas.length + pagos.length === 0) {
      setMensaje("No transactions to close.");
      return;
    }
    setGuardando(true);

    const ventas_ids = ventas.map((v) => v.id);
    const pagos_ids = pagos.map((p) => p.id);

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
        fecha_fin: fechaFin
      });
      await supabase.rpc("cerrar_pagos_por_van", {
        cierre_id_param: cierre_id,
        van_id_param: van.id,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin
      });
    }

    setGuardando(false);
    setMensaje("Closeout registered successfully!");
    setReales({ pago_efectivo: "", pago_tarjeta: "", pago_transferencia: "" });
    setComentario("");
    setTimeout(() => setMensaje(""), 2000);
  }

  const resumenPDF = {
    efectivo_esperado: totalesEsperados.pago_efectivo,
    tarjeta_esperado: totalesEsperados.pago_tarjeta,
    transferencia_esperado: totalesEsperados.pago_transferencia,
    cxc_periodo: cuentasCobrar
  };

  // UI
  return (
    <div className="max-w-2xl mx-auto mt-10 bg-white rounded shadow p-6">
      <h2 className="font-bold text-xl mb-6 text-blue-900">Van Closeout</h2>
      {/* BLOQUE 1: Selección del día a cerrar */}
      <div className="mb-4">
        <label className="font-bold text-sm mb-1 block">Select date to close:</label>
        <select
          className="border p-2 rounded w-full max-w-xs"
          value={fechaSeleccionada}
          onChange={e => setFechaSeleccionada(e.target.value)}
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
      {/* BLOQUE 2: Formulario de cierre y confirmación */}
      {loading ? (
        <div className="text-blue-600">Loading transactions...</div>
      ) : (
        <>
          <TablaMovimientosPendientes ventas={ventas} />
          <TablaAbonosPendientes pagos={pagos} />
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
                onChange={e =>
                  setReales(r => ({ ...r, [campo]: e.target.value }))
                }
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
            onChange={e => setComentario(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="bg-blue-700 text-white px-4 py-2 rounded font-bold w-full"
          disabled={guardando || ventas.length + pagos.length === 0}
        >
          {guardando ? "Saving..." : "Register Closeout"}
        </button>
        {mensaje && (
          <div className="mt-2 p-2 rounded text-center text-sm bg-blue-100 text-blue-700">
            {mensaje}
          </div>
        )}
      </form>
      {/* MODAL DE CONFIRMACION */}
      <ConfirmModal
        open={showConfirmModal}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={async () => {
          setShowConfirmModal(false);
          await guardarCierre({ preventDefault: () => {} });
        }}
        totalesEsperados={totalesEsperados}
        reales={reales}
        cuentasCobrar={cuentasCobrar}
        comentario={comentario}
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
      />
      {/* MODAL DESGLOSE EFECTIVO */}
      <DesgloseEfectivoModal
        open={openDesglose}
        onClose={() => setOpenDesglose(false)}
        onSave={(total) => {
          setReales((r) => ({ ...r, pago_efectivo: total }));
          setOpenDesglose(false);
        }}
      />

      {/* ---------- SECCION: BUSCAR Y DESCARGAR CIERRES PASADOS ---------- */}
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
                        generarPDFCierreVan({
                          cierre,
                          usuario: usuariosDic?.[cierre.usuario_id] || { nombre: cierre.usuario_id },
                          vanNombre: vansDic?.[cierre.van_id]?.nombre || cierre.van_nombre,
                          ventas,
                          pagos,
                          resumen: {
                            efectivo_esperado: cierre.efectivo_esperado,
                            tarjeta_esperado: cierre.tarjeta_esperado,
                            transferencia_esperado: cierre.transferencia_esperado,
                            cxc_periodo: cierre.cuentas_por_cobrar
                          },
                          fechaInicio: cierre.fecha_inicio,
                          fechaFin: cierre.fecha_fin,
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
