// src/CierreDia.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ======================= Utilidades ======================= */
const NO_CLIENTE = "Quick sale / No client";
const isIsoDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const toYMD = (d) =>
  typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);

function normMetodo(s) {
  const x = String(s || "").trim().toLowerCase();
  if (["cash", "efectivo"].includes(x)) return "Cash";
  if (["card", "tarjeta", "credit", "debit"].includes(x)) return "Card";
  if (["transfer", "transferencia", "wire", "zelle", "bank"].includes(x))
    return "Transfer";
  if (["mix", "mixed", "mixto"].includes(x)) return "Mix";
  return x ? x[0].toUpperCase() + x.slice(1) : "-";
}

function breakdownPago(item) {
  const out = { cash: 0, card: 0, transfer: 0 };
  const add = (k, v) => (out[k] += Number(v || 0));
  const map = {
    efectivo: "cash",
    cash: "cash",
    card: "card",
    tarjeta: "card",
    transfer: "transfer",
    transferencia: "transfer",
    wire: "transfer",
    zelle: "transfer",
    bank: "transfer",
  };

  const candidates = [
    item?.pago,
    item?.pagos_detalle,
    item?.payment_details,
    item?.detalle_pagos,
  ];
  
  for (let c of candidates) {
    if (!c) continue;
    try {
      if (typeof c === "string") c = JSON.parse(c);
    } catch {}
    
    if (Array.isArray(c)) {
      for (const r of c) {
        const m = String(r?.metodo || r?.type || r?.metodo_pago || "").toLowerCase();
        const k = map[m];
        const v = Number(r?.monto ?? r?.amount ?? r?.total ?? 0);
        if (k) add(k, v);
      }
    } else if (typeof c === "object") {
      const obj = c.map && typeof c.map === "object" ? c.map : c;
      for (const [k, v] of Object.entries(obj)) {
        const kk = map[String(k).toLowerCase()];
        if (kk) add(kk, v);
      }
    }
  }

  if (out.cash + out.card + out.transfer === 0) {
    const k = map[String(item?.metodo_pago || "").toLowerCase()];
    const v = Number(item?.monto ?? item?.amount ?? item?.total ?? 0);
    if (k && v) add(k, v);
  }
  
  return out;
}

async function loadImageAsDataURL(src) {
  try {
    const res = await fetch(src, { cache: "no-cache" });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("No se pudo cargar el logo:", error);
    return null;
  }
}

/* ======================= CALCULAR CIERRE COMPLETO ======================= */
async function calcularCierreCompleto(van_id, fecha) {
  console.log('📊 Iniciando cálculo de cierre para:', { van_id, fecha });
  
  try {
    // 1️⃣ VENTAS DEL DÍA
    const { data: ventas, error: ventasError } = await supabase.rpc(
      "ventas_no_cerradas_por_van_by_id",
      {
        van_id_param: van_id,
        fecha_inicio: fecha,
        fecha_fin: fecha,
      }
    );

    if (ventasError) throw ventasError;

    // 2️⃣ PAGOS A CxC DEL DÍA (solo pagos NO ligados a ventas del día)
    const { data: pagosCxC, error: pagosError } = await supabase
      .from("pagos")
      .select(`
        id,
        cliente_id,
        monto,
        metodo_pago,
        fecha_pago,
        created_at,
        notas,
        referencia,
        venta_id,
        clientes:cliente_id (
          nombre,
          apellido
        )
      `)
      .eq("van_id", van_id)
      .gte("fecha_pago", `${fecha}T00:00:00`)
      .lte("fecha_pago", `${fecha}T23:59:59`)
      .is("venta_id", null);

    if (pagosError) throw pagosError;

    console.log('✅ Datos obtenidos:', { 
      ventas: ventas?.length || 0, 
      pagosCxC: pagosCxC?.length || 0 
    });

    // 3️⃣ PROCESAR VENTAS
    const ventasDetalle = (ventas || []).map(v => {
      const breakdown = breakdownPago(v);
      const total = Number(v.total_venta || 0);
      const pagado = Number(v.total_pagado || 0);
      const pendiente = total - pagado;

      return {
        id: v.id,
        fecha: v.fecha,
        cliente: v.cliente_nombre || "Quick sale",
        total,
        pagado,
        pendiente,
        metodo: normMetodo(v.metodo_pago),
        breakdown,
      };
    });

    // 4️⃣ PROCESAR PAGOS A CxC
    const pagosCxCDetalle = (pagosCxC || []).map(p => {
      const metodoRaw = String(p.metodo_pago || "").toLowerCase();
      const monto = Number(p.monto || 0);
      
      let breakdown = { cash: 0, card: 0, transfer: 0 };
      
      if (["cash", "efectivo"].includes(metodoRaw)) {
        breakdown.cash = monto;
      } else if (["card", "tarjeta", "credit", "debit"].includes(metodoRaw)) {
        breakdown.card = monto;
      } else if (["transfer", "transferencia", "wire", "zelle", "bank"].includes(metodoRaw)) {
        breakdown.transfer = monto;
      } else if (metodoRaw === "mix") {
        breakdown = breakdownPago(p);
      } else {
        breakdown.cash = monto;
      }

      return {
        id: p.id,
        fecha: p.fecha_pago || p.created_at,
        cliente: p.clientes?.nombre 
          ? `${p.clientes.nombre} ${p.clientes.apellido || ''}`.trim()
          : "Cliente",
        monto,
        metodo: normMetodo(p.metodo_pago),
        breakdown,
        notas: p.notas || "",
        referencia: p.referencia || "",
      };
    });

    // 5️⃣ TOTALES POR MÉTODO
    const totales = {
      ventas: {
        cash: 0,
        card: 0,
        transfer: 0,
        total: 0,
      },
      pagosCxC: {
        cash: 0,
        card: 0,
        transfer: 0,
        total: 0,
      },
      esperado: {
        cash: 0,
        card: 0,
        transfer: 0,
        total: 0,
      },
    };

    ventasDetalle.forEach(v => {
      totales.ventas.cash += v.breakdown.cash || 0;
      totales.ventas.card += v.breakdown.card || 0;
      totales.ventas.transfer += v.breakdown.transfer || 0;
      totales.ventas.total += v.pagado;
    });

    pagosCxCDetalle.forEach(p => {
      totales.pagosCxC.cash += p.breakdown.cash || 0;
      totales.pagosCxC.card += p.breakdown.card || 0;
      totales.pagosCxC.transfer += p.breakdown.transfer || 0;
      totales.pagosCxC.total += p.monto;
    });

    totales.esperado.cash = totales.ventas.cash + totales.pagosCxC.cash;
    totales.esperado.card = totales.ventas.card + totales.pagosCxC.card;
    totales.esperado.transfer = totales.ventas.transfer + totales.pagosCxC.transfer;
    totales.esperado.total = totales.ventas.total + totales.pagosCxC.total;

    console.log('💰 Totales calculados:', totales);

    return {
      fecha,
      van_id,
      ventas: ventasDetalle,
      pagosCxC: pagosCxCDetalle,
      totales,
      resumen: {
        cantidadVentas: ventasDetalle.length,
        cantidadPagosCxC: pagosCxCDetalle.length,
        totalVentasGeneradas: ventasDetalle.reduce((sum, v) => sum + v.total, 0),
        totalCobrado: totales.esperado.total,
        pendienteCobro: ventasDetalle.reduce((sum, v) => sum + v.pendiente, 0),
      }
    };

  } catch (error) {
    console.error('❌ Error en calcularCierreCompleto:', error);
    throw error;
  }
}

/* ======================= PDF ======================= */
function generarPDFCierreDia({
  van,
  fecha,
  ventas = [],
  pagos = [],
  logoDataUrl,
  mode = "download",
}) {
  const doc = new jsPDF("p", "pt", "a4");
  const azul = "#0B4A6F",
    gris = "#333",
    claro = "#eaf3ff";

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 36, 24, 80, 32, undefined, "FAST");
    } catch {}
  }
  const xLeft = logoDataUrl ? 36 + 90 : 36;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(azul);
  doc.text("End of Day Register Closeout", xLeft, 40);
  doc.setFontSize(10);
  doc.setTextColor(gris);
  doc.text(`Register: ${van?.nombre || van?.id || "-"}`, xLeft, 56);
  doc.text(`Date: ${fecha}`, xLeft, 70);
  doc.setDrawColor(azul);
  doc.setLineWidth(1);
  doc.line(36, 80, 559, 80);

  const ventasTot = ventas.reduce((t, v) => t + Number(v.total_venta || 0), 0);
  const pagosBK = pagos.map((p) => ({ ...p, _bk: breakdownPago(p) }));
  const pagosTot = {
    cash: pagosBK.reduce((t, p) => t + Number(p._bk.cash || 0), 0),
    card: pagosBK.reduce((t, p) => t + Number(p._bk.card || 0), 0),
    transfer: pagosBK.reduce((t, p) => t + Number(p._bk.transfer || 0), 0),
  };

  doc.setFillColor(claro);
  doc.roundedRect(36, 92, 520, 54, 6, 6, "F");
  doc.setTextColor(azul);
  doc.setFont("helvetica", "bold");
  doc.text("Executive Summary", 44, 110);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(gris);
  doc.text(`Invoices: ${ventas.length}`, 44, 128);
  doc.text(`Sales total: $${ventasTot.toFixed(2)}`, 160, 128);
  doc.text(
    `Payments — Cash: $${pagosTot.cash.toFixed(2)}  Card: $${pagosTot.card.toFixed(
      2
    )}  Transfer: $${pagosTot.transfer.toFixed(2)}`,
    300,
    128,
    { align: "right", maxWidth: 300 }
  );

  doc.setFont("helvetica", "bold");
  doc.setTextColor(azul);
  doc.text("Pending Sales", 36, 170);
  autoTable(doc, {
    startY: 180,
    head: [["Date", "Client", "Total", "Paid", "A/R"]],
    body: ventas.length
      ? ventas.map((v) => {
          const total = Number(v.total_venta || 0);
          const pagado = Number(v.total_pagado || 0);
          const ar = total - pagado;
          const cliente =
            v.cliente_nombre ||
            (v.cliente_id ? String(v.cliente_id).slice(0, 8) : NO_CLIENTE);
          return [
            toYMD(v.fecha),
            cliente,
            `$${total.toFixed(2)}`,
            `$${pagado.toFixed(2)}`,
            `$${ar.toFixed(2)}`,
          ];
        })
      : [["-", "-", "-", "-", "-"]],
    theme: "grid",
    headStyles: { fillColor: azul, textColor: "#fff" },
    styles: { fontSize: 9 },
    margin: { left: 36, right: 36 },
    foot: [
      [
        "Totals",
        "",
        `$${ventasTot.toFixed(2)}`,
        `$${ventas
          .reduce((t, v) => t + Number(v.total_pagado || 0), 0)
          .toFixed(2)}`,
        `$${ventas
          .reduce(
            (t, v) => t + (Number(v.total_venta || 0) - Number(v.total_pagado || 0)),
            0
          )
          .toFixed(2)}`,
      ],
    ],
  });

  const startY = (doc.lastAutoTable?.finalY || 180) + 18;
  doc.setTextColor(azul);
  doc.text("Customer Payments / Advances", 36, startY);
  autoTable(doc, {
    startY: startY + 10,
    head: [["Date", "Client", "Amount", "Method", "Reference", "Notes"]],
    body: pagosBK.length
      ? pagosBK.map((p) => {
          const amount =
            Number(p._bk.cash || 0) +
              Number(p._bk.card || 0) +
              Number(p._bk.transfer || 0) || Number(p.monto || 0);
          const metodo =
            (Number(p._bk.cash || 0) > 0) +
              (Number(p._bk.card || 0) > 0) +
              (Number(p._bk.transfer || 0) > 0) >
            1
              ? "Mix"
              : Number(p._bk.cash || 0) > 0
              ? "Cash"
              : Number(p._bk.card || 0) > 0
              ? "Card"
              : Number(p._bk.transfer || 0) > 0
              ? "Transfer"
              : normMetodo(p.metodo_pago);
          const cliente =
            p.cliente_nombre ||
            (p.cliente_id ? String(p.cliente_id).slice(0, 8) : NO_CLIENTE);
          return [
            toYMD(p.fecha_pago || p.fecha || p.created_at),
            cliente,
            `$${amount.toFixed(2)}`,
            metodo,
            p.referencia || "-",
            p.notas || "-",
          ];
        })
      : [["-", "-", "-", "-", "-", "-"]],
    theme: "grid",
    headStyles: { fillColor: azul, textColor: "#fff" },
    styles: { fontSize: 9 },
    margin: { left: 36, right: 36 },
  });

  const nombreArchivo = `Closeout_${(van?.nombre || van?.id || "register")
    .toString()
    .replace(/\s+/g, "")}_${fecha}.pdf`;

  if (mode === "print") {
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    const win = window.open(blobUrl, "_blank");
    setTimeout(() => {
      try {
        win?.print?.();
      } catch {}
    }, 400);
    return;
  }

  doc.save(nombreArchivo);
}

/* ======================= VISTA CIERRE DETALLADO ======================= */
function VistaCierreDetallado({ datos, onConfirmar, onCancelar }) {
  const [montosReales, setMontosReales] = useState({
    cash: '',
    card: '',
    transfer: '',
  });
  const [observaciones, setObservaciones] = useState('');
  const [showVentas, setShowVentas] = useState(false);
  const [showPagos, setShowPagos] = useState(false);

  const discrepancias = {
    cash: (Number(montosReales.cash) || 0) - datos.totales.esperado.cash,
    card: (Number(montosReales.card) || 0) - datos.totales.esperado.card,
    transfer: (Number(montosReales.transfer) || 0) - datos.totales.esperado.transfer,
  };

  const totalDiscrepancia = discrepancias.cash + discrepancias.card + discrepancias.transfer;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!montosReales.cash && !montosReales.card && !montosReales.transfer) {
      alert('⚠️ Debes ingresar al menos un monto real contado');
      return;
    }

    onConfirmar({
      montosReales: {
        cash: Number(montosReales.cash) || 0,
        card: Number(montosReales.card) || 0,
        transfer: Number(montosReales.transfer) || 0,
      },
      discrepancias,
      observaciones,
      datos,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl my-8">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-3xl">
          <h2 className="text-2xl font-bold">📊 Cierre de Día Detallado</h2>
          <p className="text-blue-100 mt-2">
            Fecha: {datos.fecha} • Van ID: {datos.van_id}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Resumen Ejecutivo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <div className="text-xs text-blue-600 uppercase font-bold">Ventas</div>
              <div className="text-2xl font-bold text-blue-700">
                {datos.resumen.cantidadVentas}
              </div>
              <div className="text-sm text-blue-600 mt-1">
                ${datos.resumen.totalVentasGeneradas.toFixed(2)}
              </div>
            </div>

            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <div className="text-xs text-green-600 uppercase font-bold">Pagos CxC</div>
              <div className="text-2xl font-bold text-green-700">
                {datos.resumen.cantidadPagosCxC}
              </div>
              <div className="text-sm text-green-600 mt-1">
                ${datos.totales.pagosCxC.total.toFixed(2)}
              </div>
            </div>

            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
              <div className="text-xs text-purple-600 uppercase font-bold">Total Cobrado</div>
              <div className="text-2xl font-bold text-purple-700">
                ${datos.resumen.totalCobrado.toFixed(2)}
              </div>
              <div className="text-sm text-purple-600 mt-1">
                Ventas + CxC
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
              <div className="text-xs text-amber-600 uppercase font-bold">Pendiente</div>
              <div className="text-2xl font-bold text-amber-700">
                ${datos.resumen.pendienteCobro.toFixed(2)}
              </div>
              <div className="text-sm text-amber-600 mt-1">
                A/R (Crédito)
              </div>
            </div>
          </div>

          {/* Desglose Esperado vs Real */}
          <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl border-2 border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              💰 Montos Esperados vs Reales
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* EFECTIVO */}
              <div className="space-y-3">
                <label className="block">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-gray-800">💵 Efectivo</span>
                    <span className="text-sm text-gray-600">
                      Esperado: ${datos.totales.esperado.cash.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={montosReales.cash}
                    onChange={(e) => setMontosReales(prev => ({ ...prev, cash: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-bold"
                    placeholder="0.00"
                  />
                </label>
                <div className="text-sm space-y-1 bg-white rounded-lg p-3 border">
                  <div className="flex justify-between">
                    <span className="text-gray-600">De ventas:</span>
                    <span className="font-semibold">${datos.totales.ventas.cash.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">De pagos CxC:</span>
                    <span className="font-semibold">${datos.totales.pagosCxC.cash.toFixed(2)}</span>
                  </div>
                  {discrepancias.cash !== 0 && (
                    <div className={`flex justify-between pt-2 border-t font-bold ${discrepancias.cash > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <span>{discrepancias.cash > 0 ? 'Sobrante:' : 'Faltante:'}</span>
                      <span>${Math.abs(discrepancias.cash).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* TARJETA */}
              <div className="space-y-3">
                <label className="block">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-gray-800">💳 Tarjeta</span>
                    <span className="text-sm text-gray-600">
                      Esperado: ${datos.totales.esperado.card.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={montosReales.card}
                    onChange={(e) => setMontosReales(prev => ({ ...prev, card: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-bold"
                    placeholder="0.00"
                  />
                </label>
                <div className="text-sm space-y-1 bg-white rounded-lg p-3 border">
                  <div className="flex justify-between">
                    <span className="text-gray-600">De ventas:</span>
                    <span className="font-semibold">${datos.totales.ventas.card.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">De pagos CxC:</span>
                    <span className="font-semibold">${datos.totales.pagosCxC.card.toFixed(2)}</span>
                  </div>
                  {discrepancias.card !== 0 && (
                    <div className={`flex justify-between pt-2 border-t font-bold ${discrepancias.card > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <span>{discrepancias.card > 0 ? 'Sobrante:' : 'Faltante:'}</span>
                      <span>${Math.abs(discrepancias.card).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* TRANSFERENCIA */}
              <div className="space-y-3">
                <label className="block">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-gray-800">🏦 Transferencia</span>
                    <span className="text-sm text-gray-600">
                      Esperado: ${datos.totales.esperado.transfer.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={montosReales.transfer}
                    onChange={(e) => setMontosReales(prev => ({ ...prev, transfer: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg font-bold"
                    placeholder="0.00"
                  />
                </label>
                <div className="text-sm space-y-1 bg-white rounded-lg p-3 border">
                  <div className="flex justify-between">
                    <span className="text-gray-600">De ventas:</span>
                    <span className="font-semibold">${datos.totales.ventas.transfer.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">De pagos CxC:</span>
                    <span className="font-semibold">${datos.totales.pagosCxC.transfer.toFixed(2)}</span>
                  </div>
                  {discrepancias.transfer !== 0 && (
                    <div className={`flex justify-between pt-2 border-t font-bold ${discrepancias.transfer > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <span>{discrepancias.transfer > 0 ? 'Sobrante:' : 'Faltante:'}</span>
                      <span>${Math.abs(discrepancias.transfer).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {totalDiscrepancia !== 0 && (
              <div className={`mt-6 p-4 rounded-xl border-2 ${totalDiscrepancia > 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-lg">
                    {totalDiscrepancia > 0 ? '✅ Sobrante Total:' : '⚠️ Faltante Total:'}
                  </span>
                  <span className={`text-2xl font-bold ${totalDiscrepancia > 0 ? 'text-green-700' : 'text-red-700'}`}>
                    ${Math.abs(totalDiscrepancia).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Detalles de Ventas y Pagos (Colapsables) */}
          <div className="space-y-4">
            {/* Ventas */}
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowVentas(!showVentas)}
                className="w-full bg-blue-50 hover:bg-blue-100 p-4 flex items-center justify-between transition-colors"
              >
                <span className="font-bold text-blue-900">
                  📋 Ver Detalle de Ventas ({datos.ventas.length})
                </span>
                <span className="text-blue-600">
                  {showVentas ? '▼' : '▶'}
                </span>
              </button>
              
              {showVentas && (
                <div className="p-4 max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Cliente</th>
                        <th className="p-2 text-right">Total</th>
                        <th className="p-2 text-right">Pagado</th>
                        <th className="p-2 text-right">Pendiente</th>
                        <th className="p-2 text-center">Método</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.ventas.map((v, idx) => (
                        <tr key={v.id || idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{v.cliente}</td>
                          <td className="p-2 text-right font-semibold">${v.total.toFixed(2)}</td>
                          <td className="p-2 text-right text-green-600">${v.pagado.toFixed(2)}</td>
                          <td className="p-2 text-right text-amber-600">${v.pendiente.toFixed(2)}</td>
                          <td className="p-2 text-center">{v.metodo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagos CxC */}
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPagos(!showPagos)}
                className="w-full bg-green-50 hover:bg-green-100 p-4 flex items-center justify-between transition-colors"
              >
                <span className="font-bold text-green-900">
                  💰 Ver Detalle de Pagos CxC ({datos.pagosCxC.length})
                </span>
                <span className="text-green-600">
                  {showPagos ? '▼' : '▶'}
                </span>
              </button>
              
              {showPagos && (
                <div className="p-4 max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Cliente</th>
                        <th className="p-2 text-right">Monto</th>
                        <th className="p-2 text-center">Método</th>
                        <th className="p-2 text-left">Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.pagosCxC.map((p, idx) => (
                        <tr key={p.id || idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{p.cliente}</td>
                          <td className="p-2 text-right font-semibold text-green-600">${p.monto.toFixed(2)}</td>
                          <td className="p-2 text-center">{p.metodo}</td>
                          <td className="p-2 text-xs text-gray-600">{p.notas || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block">
              <span className="font-bold text-gray-800 mb-2 block">📝 Observaciones</span>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Notas sobre discrepancias, incidencias, etc."
              />
            </label>
          </div>

          {/* Botones */}
          <div className="flex gap-4 pt-4 border-t-2 border-gray-200">
            <button
              type="button"
              onClick={onCancelar}
              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-6 py-4 rounded-xl font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg"
            >
              Confirmar Cierre
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ======================= MODO PRE-CIERRE ======================= */
function useFechasPendientes(van_id) {
  const [fechas, setFechas] = useState([]);
  useEffect(() => {
    if (!van_id) return setFechas([]);
    (async () => {
      const { data } = await supabase.rpc("fechas_pendientes_cierre_van", {
        van_id_param: van_id,
      });
      setFechas((data || []).filter(isIsoDate));
    })();
  }, [van_id]);
  return fechas;
}

function PreCierre({ onCerrar, onCancelar }) {
  const { van } = useVan();
  const fechas = useFechasPendientes(van?.id);
  const [selFecha, setSelFecha] = useState("");
  const [cuentas, setCuentas] = useState({});
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [calculando, setCalculando] = useState(false);

  const hoy = new Date().toISOString().slice(0, 10);
  
  useEffect(() => {
    if (!fechas.length) return;
    setSelFecha((prev) =>
      prev && fechas.includes(prev) ? prev : fechas.includes(hoy) ? hoy : fechas[0]
    );
  }, [fechas, hoy]);

  useEffect(() => {
    if (!van?.id || !fechas?.length) {
      setCuentas({});
      return;
    }
    setLoading(true);
    (async () => {
      const entries = await Promise.all(
        fechas.map(async (f) => {
          const [{ data: vs }, { data: ps }] = await Promise.all([
            supabase.rpc("ventas_no_cerradas_por_van_by_id", {
              van_id_param: van.id,
              fecha_inicio: f,
              fecha_fin: f,
            }),
            supabase.rpc("pagos_no_cerrados_por_van_by_id", {
              van_id_param: van.id,
              fecha_inicio: f,
              fecha_fin: f,
            }),
          ]);
          return [f, { ventas: (vs || []).length, pagos: (ps || []).length }];
        })
      );
      setCuentas(Object.fromEntries(entries));
      setLoading(false);
    })();
  }, [van?.id, fechas]);

  const totFacturas = useMemo(
    () => Object.values(cuentas).reduce((t, x) => t + (x?.ventas || 0), 0),
    [cuentas]
  );

  async function procesar() {
    if (!selFecha || !van?.id) return;
    
    setCalculando(true);
    try {
      const datosCierre = await calcularCierreCompleto(van.id, selFecha);
      localStorage.setItem('pre_cierre_fecha', selFecha);
      localStorage.setItem('datos_cierre', JSON.stringify(datosCierre));
      onCerrar?.({ fecha: selFecha, datos: datosCierre });
    } catch (error) {
      alert('❌ Error calculando cierre: ' + error.message);
      console.error(error);
    } finally {
      setCalculando(false);
    }
  }

  async function imprimirPDF() {
    if (!selFecha || !van?.id) return;
    setPrinting(true);
    try {
      const [{ data: ventas }, { data: pagos }] = await Promise.all([
        supabase.rpc("ventas_no_cerradas_por_van_by_id", {
          van_id_param: van.id,
          fecha_inicio: selFecha,
          fecha_fin: selFecha,
        }),
        supabase.rpc("pagos_no_cerrados_por_van_by_id", {
          van_id_param: van.id,
          fecha_inicio: selFecha,
          fecha_fin: selFecha,
        }),
      ]);
      const logo = await loadImageAsDataURL("/logo.png");
      generarPDFCierreDia({
        van,
        fecha: selFecha,
        ventas: ventas || [],
        pagos: pagos || [],
        logoDataUrl: logo,
        mode: "print",
      });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto mt-8 bg-white border rounded-xl shadow p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-blue-900">
          End of Day Register Closeout — Pre-Close
        </h2>
        <div className="text-xs sm:text-sm text-gray-600">
          Van: <b>{van?.nombre || `#${van?.id || "-"}`}</b>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border p-3">
          <div className="font-semibold text-gray-800 mb-2">By Register</div>
          <div className="flex items-center justify-between bg-gray-50 border rounded p-3">
            <div>
              <div className="text-xs text-gray-500">Register #</div>
              <div className="font-bold">{van?.id ?? "-"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Invoices</div>
              <div className="font-bold">{loading ? "…" : totFacturas}</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="font-semibold text-gray-800 mb-2">By Date</div>
          <div className="max-h-64 overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-blue-900 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-right">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {fechas.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-3 text-center text-gray-400">
                      No pending days
                    </td>
                  </tr>
                )}
                {fechas.map((f) => {
                  const isSel = selFecha === f;
                  const row = cuentas[f] || { ventas: 0, pagos: 0 };
                  return (
                    <tr
                      key={f}
                      className={`cursor-pointer ${
                        isSel ? "bg-blue-100" : "hover:bg-gray-50"
                      }`}
                      onClick={() => setSelFecha(f)}
                    >
                      <td className="p-2">{f}</td>
                      <td className="p-2 text-right">
                        {loading ? "…" : row.ventas}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="font-semibold text-gray-800 mb-2">By Day</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-16 text-gray-600">Start</span>
              <input
                className="border rounded p-1 w-24"
                type="time"
                value="00:00"
                disabled
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-gray-600">End</span>
              <input
                className="border rounded p-1 w-24"
                type="time"
                value="23:45"
                disabled
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => onCancelar?.()}
              type="button"
            >
              Cancel
            </button>

            <div className="flex gap-2">
              <button
                className="px-3 py-2 bg-white border rounded hover:bg-gray-50 disabled:opacity-50"
                type="button"
                onClick={imprimirPDF}
                disabled={!selFecha || printing}
                title="Print a PDF with all sales/payments for this day"
              >
                {printing ? "Preparing..." : "Print PDF"}
              </button>

              <button
                className="px-4 py-2 bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
                onClick={procesar}
                disabled={!selFecha || calculando}
                type="button"
              >
                {calculando ? "Calculating..." : "Process"}
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Start & End Times must be between 00:00 and 23:45 (day-based closeout).
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================= EXPORT PÚBLICO ======================= */
export default function CierreDia(props) {
  const { mode, resumen, datosCierre, onCerrar, onCancelar } = props || {};
  
  if (datosCierre) {
    return (
      <VistaCierreDetallado
        datos={datosCierre}
        onConfirmar={onCerrar}
        onCancelar={onCancelar}
      />
    );
  }
  
  if (mode === "pre" || !resumen) {
    return <PreCierre onCerrar={onCerrar} onCancelar={onCancelar} />;
  }
  
  return null;
}