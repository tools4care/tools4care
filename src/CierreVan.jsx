import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Métodos de pago
const METODOS_PAGO = [
  { campo: "pago_efectivo", label: "Efectivo" },
  { campo: "pago_tarjeta", label: "Tarjeta" },
  { campo: "pago_transferencia", label: "Transferencia" }
];

// Hook para traer ventas y pagos no cerrados
function useMovimientosNoCerrados(van_id, fechaInicio, fechaFin) {
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!van_id || !fechaInicio || !fechaFin) return;
    setLoading(true);
    (async () => {
      // Asegúrate que tus funciones retornen cliente_nombre (LEFT JOIN con clientes)
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

// Tabla de ventas pendientes
function TablaMovimientosPendientes({ ventas }) {
  const sumBy = (arr, key) => arr.reduce((t, x) => t + Number(x[key] || 0), 0);
  const totalCxc = ventas.reduce((t, v) => t + ((Number(v.total_venta) || 0) - (Number(v.total_pagado) || 0)), 0);

  return (
    <div className="bg-gray-50 rounded-xl shadow p-4 mb-6">
      <h3 className="font-bold mb-3 text-lg text-blue-800">Movimientos pendientes de cierre</h3>
      <b>Ventas pendientes:</b>
      <table className="w-full text-xs mb-3">
        <thead>
          <tr className="bg-blue-100">
            <th className="p-1">Fecha</th>
            <th className="p-1">Cliente</th>
            <th className="p-1">Total</th>
            <th className="p-1">Efectivo</th>
            <th className="p-1">Tarjeta</th>
            <th className="p-1">Transferencia</th>
            <th className="p-1">Pagado</th>
            <th className="p-1">CXC</th>
          </tr>
        </thead>
        <tbody>
          {ventas.length === 0 && (
            <tr>
              <td colSpan={8} className="text-gray-400 text-center">
                Sin ventas pendientes
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
            <td className="p-1">Totales</td>
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

// Tabla de abonos/anticipos de clientes
function TablaAbonosPendientes({ pagos }) {
  return (
    <div className="bg-gray-50 rounded-xl shadow p-4 mb-6">
      <h3 className="font-bold mb-3 text-lg text-blue-800">Abonos/Anticipos de clientes incluidos en este cierre</h3>
      <table className="w-full text-xs mb-3">
        <thead>
          <tr className="bg-blue-100">
            <th className="p-1">Fecha</th>
            <th className="p-1">Cliente</th>
            <th className="p-1">Monto</th>
            <th className="p-1">Método</th>
            <th className="p-1">Referencia</th>
            <th className="p-1">Notas</th>
          </tr>
        </thead>
        <tbody>
          {pagos.length === 0 && (
            <tr>
              <td colSpan={6} className="text-gray-400 text-center">
                Sin abonos/anticipos pendientes
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

// PDF profesional de cierre de VAN
function generarPDFCierreVan({
  empresa = {
    nombre: "TOOLS4CARE",
    direccion: "26 Howley St, Peabody, MA",
    telefono: "(555) 123-4567",
    email: "soporte@tools4care.com"
  },
  cierre,
  usuario,
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
  doc.text(`Dirección: ${empresa.direccion}`, 36, 65);
  doc.text(`Tel: ${empresa.telefono}  |  Email: ${empresa.email}`, 36, 78);

  doc.setLineWidth(1.1);
  doc.setDrawColor(azul);
  doc.line(36, 86, 560, 86);

  doc.setFontSize(14);
  doc.setTextColor(azul);
  doc.text("Cierre de Van - Reporte Ejecutivo", 36, 110);
  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Periodo: ${fechaInicio} a ${fechaFin}`, 36, 130);
  doc.text(`Van: ${cierre?.van_nombre || cierre?.van_id || "-"}`, 320, 130);
  doc.text(`Responsable: ${usuario?.nombre || usuario?.email || "-"}`, 36, 146);
  doc.text(`Fecha cierre: ${new Date().toLocaleString()}`, 320, 146);

  doc.setFillColor(azulSuave);
  doc.roundedRect(36, 160, 520, 52, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(azul);
  doc.setFontSize(12);
  doc.text("RESUMEN EJECUTIVO", 44, 180);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Efectivo esperado: $${Number(resumen.efectivo_esperado).toFixed(2)}`, 44, 198);
  doc.text(`Tarjeta esperado: $${Number(resumen.tarjeta_esperado).toFixed(2)}`, 220, 198);
  doc.text(`Transferencia esperado: $${Number(resumen.transferencia_esperado).toFixed(2)}`, 370, 198);
  doc.text(`CXC periodo: $${Number(resumen.cxc_periodo).toFixed(2)}`, 44, 214);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(azul);
  doc.setFontSize(13);
  doc.text("Ventas pendientes incluidas en este cierre", 36, 240);

  autoTable(doc, {
    startY: 250,
    head: [[
      "Fecha", "Cliente", "Total", "Efectivo", "Tarjeta", "Transferencia", "Pagado", "CXC"
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
      "Totales",
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
  doc.text("Abonos de clientes incluidos en este cierre", 36, yAbonos);

  autoTable(doc, {
    startY: yAbonos + 10,
    head: [["Fecha", "Cliente", "Monto", "Método", "Referencia", "Notas"]],
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
    `Generado automáticamente por TOOLS4CARE  |  ${new Date().toLocaleString()}`,
    36,
    yPie + 15
  );
  doc.text(
    "Documento confidencial para auditoría y control. Prohibida su distribución sin autorización.",
    36,
    yPie + 30
  );

  doc.save(`CierreVan_${cierre?.van_nombre || cierre?.van_id || ""}_${fechaInicio}_${fechaFin}.pdf`);
}

export default function CierreVan() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  const hoy = new Date();
  const fechaHoy = hoy.toISOString().slice(0, 10);
  const [fechaInicio, setFechaInicio] = useState(fechaHoy);
  const [fechaFin, setFechaFin] = useState(fechaHoy);

  const { ventas, pagos, loading } = useMovimientosNoCerrados(
    van?.id,
    fechaInicio,
    fechaFin
  );

  const sumBy = (arr, key) => arr.reduce((t, x) => t + Number(x[key] || 0), 0);
  const totalesEsperados = {
    pago_efectivo: sumBy(ventas, "pago_efectivo") + sumBy(pagos.filter(p => p.metodo_pago === "Efectivo"), "monto"),
    pago_tarjeta: sumBy(ventas, "pago_tarjeta") + sumBy(pagos.filter(p => p.metodo_pago === "Tarjeta"), "monto"),
    pago_transferencia: sumBy(ventas, "pago_transferencia") + sumBy(pagos.filter(p => p.metodo_pago === "Transferencia"), "monto"),
  };
  const cuentasCobrar = ventas.reduce((t, v) => t + ((Number(v.total_venta) || 0) - (Number(v.total_pagado) || 0)), 0);

  const [reales, setReales] = useState({
    pago_efectivo: "",
    pago_tarjeta: "",
    pago_transferencia: ""
  });
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function guardarCierre(e) {
    e.preventDefault();
    if (!van?.id || ventas.length + pagos.length === 0) {
      setMensaje("No hay movimientos para cerrar.");
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
      setMensaje("Error al guardar el cierre: " + error.message);
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
    setMensaje("¡Cierre registrado correctamente!");
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

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-white rounded shadow p-6">
      <h2 className="font-bold text-xl mb-4 text-blue-900">Cierre de VAN</h2>
      <div className="flex gap-2 mb-4">
        <div>
          <label className="block text-xs">Desde:</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="border p-1 rounded"
          />
        </div>
        <div>
          <label className="block text-xs">Hasta:</label>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="border p-1 rounded"
          />
        </div>
        <button
          onClick={() =>
            generarPDFCierreVan({
              cierre: { van_id: van?.id, van_nombre: van?.nombre || "" },
              usuario,
              ventas,
              pagos,
              resumen: resumenPDF,
              fechaInicio,
              fechaFin,
            })
          }
          className="ml-auto bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded font-bold text-sm h-9 mt-6"
          type="button"
        >
          Descargar PDF
        </button>
      </div>
      {loading ? (
        <div className="text-blue-600">Cargando movimientos…</div>
      ) : (
        <>
          <TablaMovimientosPendientes ventas={ventas} />
          <TablaAbonosPendientes pagos={pagos} />
        </>
      )}
      <form onSubmit={guardarCierre}>
        {METODOS_PAGO.map(({ campo, label }) => (
          <div key={campo} className="mb-2">
            <label className="block font-bold">{label} esperado:</label>
            <input
              className="border bg-gray-100 p-2 w-full mb-1"
              value={totalesEsperados[campo] || 0}
              disabled
            />
            <label className="block">Contado:</label>
            <input
              className="border p-2 w-full"
              type="number"
              value={reales[campo] || ""}
              onChange={(e) =>
                setReales((r) => ({ ...r, [campo]: e.target.value }))
              }
              required
            />
          </div>
        ))}
        <div className="mb-2">
          <label className="block font-bold">Cuentas por cobrar del periodo:</label>
          <input
            className="border p-2 w-full mb-1 bg-gray-100"
            value={cuentasCobrar}
            disabled
          />
        </div>
        <div className="mb-3">
          <label className="block font-bold">Comentario:</label>
          <textarea
            className="border p-2 w-full"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="bg-blue-700 text-white px-4 py-2 rounded font-bold w-full"
          disabled={guardando || ventas.length + pagos.length === 0}
        >
          {guardando ? "Guardando..." : "Registrar Cierre"}
        </button>
        {mensaje && (
          <div className="mt-2 p-2 rounded text-center text-sm bg-blue-100 text-blue-700">
            {mensaje}
          </div>
        )}
      </form>
    </div>
  );
}
