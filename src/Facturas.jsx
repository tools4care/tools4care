import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useToast } from "./hooks/useToast";
import { loadPdfLibs } from "./utils/lazyPdf";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { useLocation } from "react-router-dom";
import { SkeletonCard } from "./components/ui/Skeleton";
import PrimarySearch from "./components/ui/PrimarySearch";

/* ===================== Iconos SVG ===================== */
const IconInvoice = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const IconCalendar = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const IconFilter = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const IconDollar = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconDownload = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const IconUser = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const IconTruck = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
  </svg>
);

const IconCheck = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const IconClock = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconMail = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const IconSend = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

/* ===================== Utilities ===================== */
function formatAddress(dir) {
  if (!dir) return "-";

  if (typeof dir === "string") {
    try {
      dir = JSON.parse(dir);
    } catch {
      return dir;
    }
  }

  if (typeof dir === "object" && dir !== null) {
    const partes = [
      dir.calle,
      dir.ciudad,
      dir.estado,
      dir.zip,
      dir.country
    ].filter(Boolean).map(p => String(p).trim()).filter(p => p.length > 0);

    return partes.length ? partes.join(", ") : "-";
  }

  return String(dir);
}

function formatPhone(phone) {
  if (!phone) return "-";
  const num = String(phone).replace(/\D/g, "");
  if (num.length === 10) return `(${num.substr(0,3)}) ${num.substr(3,3)}-${num.substr(6)}`;
  if (num.length === 11 && num[0] === "1") return `(${num.substr(1,3)}) ${num.substr(4,3)}-${num.substr(7)}`;
  return String(phone);
}

/* ========== Normalización / fallbacks de detalle ========== */
function normalizeDetalleRows(rows, productosMap) {
  return (rows || []).map((d) => {
    const pid = d.producto_id ?? d.producto ?? d.id;
    const prod = productosMap?.get?.(pid);

    const base =
      d.precio_unitario != null
        ? Number(d.precio_unitario)
        : d.precio_unit != null
        ? Number(d.precio_unit)
        : d.precio != null
        ? Number(d.precio)
        : d.unit_price != null
        ? Number(d.unit_price)
        : 0;

    const qty = Number(d.cantidad || 1);
    const pct = Number(d.descuento ?? 0);

    // precio_unitario_real = lo que realmente se cobró por unidad.
    // Some old rows saved subtotal before discount; when a discount percent exists,
    // the percent is the source of truth for the final unit price.
    const subtotalGuardado = Number(d.subtotal ?? 0);
    const unitReal = pct > 0
      ? Number((base * (1 - pct / 100)).toFixed(2))
      : subtotalGuardado > 0
        ? Number((subtotalGuardado / qty).toFixed(2))
        : base;

    return {
      producto_id: pid,
      cantidad: qty,
      precio_unitario: unitReal,      // precio real cobrado por unidad
      precio_base: base,              // precio de lista (antes del descuento)
      descuento: pct,
      subtotal: Number((unitReal * qty).toFixed(2)),
      productos: prod
        ? { nombre: prod.nombre, codigo: prod.codigo }
        : d.productos
        ? { nombre: d.productos.nombre, codigo: d.productos.codigo }
        : null,
    };
  });
}

async function fetchDetalleFromVenta(ventaId) {
  const { data: v } = await supabase
    .from("ventas")
    .select("productos")
    .eq("id", ventaId)
    .maybeSingle();

  const items = Array.isArray(v?.productos) ? v.productos : [];
  if (items.length === 0) return [];

  const ids = [...new Set(items.map((i) => i.producto_id).filter(Boolean))];
  let map = new Map();
  if (ids.length) {
    const { data: prods } = await supabase
      .from("productos")
      .select("id,nombre,codigo")
      .in("id", ids);
    map = new Map((prods || []).map((p) => [p.id, { nombre: p.nombre, codigo: p.codigo }]));
  }
  return normalizeDetalleRows(items, map);
}

/* ===================== PDF ===================== */
async function buildFacturaPDF(factura) {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF("p", "pt", "a4");
  const azul = "#0B4A6F";
  const gris = "#F4F6FB";
  const negro = "#222";
  const empresa = {
    nombre: "TOOLS4CARE",
    direccion: "108 Lafayette St, Salem, MA 01970",
    telefono: "(978) 594-1624",
    email: "soporte@tools4care.com",
  };
  const dirCliente = formatAddress(factura.cliente_direccion);
  const telCliente = formatPhone(factura.cliente_telefono);
  const emailCliente = factura.cliente_email || "-";

  // --- HEADER ---
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

  // --- INFO FACTURA ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(azul);
  doc.text("INVOICE", 36, 110);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(negro);
  doc.text(`Invoice Number: ${factura.numero_factura || factura.id?.slice(0, 8)}`, 36, 130);
  doc.text(
    `Date: ${factura.fecha ? new Date(factura.fecha).toLocaleDateString("en-US") : ""}`,
    36,
    145
  );
  doc.text(`Client: ${factura.cliente_nombre_c || "-"}`, 36, 160);
  doc.text(`Address: ${dirCliente}`, 36, 175);
  doc.text(`Phone: ${telCliente}`, 36, 190);
  doc.text(`Email: ${emailCliente}`, 36, 205);

  // --- TABLA DE PRODUCTOS (Incluyendo CÓDIGO) ---
  doc.setTextColor(azul);
  doc.setFont("helvetica", "bold");
  doc.text("Product/Service Details", 36, 230);

  let subtotalAcumulado = 0;
  let regularSubtotal = 0;
  let totalDiscounts = 0;

  // Generar filas
  let items = [];

  if (factura.detalle_ventas && factura.detalle_ventas.length > 0) {
    items = factura.detalle_ventas.map((d) => {
      const codigo = d.productos?.codigo || "N/A";
      const nombre = d.productos?.nombre || d.producto_nombre || d.producto_id || "-";
      const qty = Number(d.cantidad || 1);
      // precio_unitario ya viene normalizado (con descuento aplicado) desde normalizeDetalleRows
      const unit = Number(d.precio_unitario ?? d.precio_unit ?? 0);
      const baseUnit = Number(d.precio_base ?? unit);
      const pct = Number(d.descuento || 0);
      const sub = Number(d.subtotal ?? unit * qty);
      const regularSub = Number((baseUnit * qty).toFixed(2));
      const discountAmount = Math.max(0, Number((regularSub - sub).toFixed(2)));
      subtotalAcumulado += sub;
      regularSubtotal += regularSub;
      totalDiscounts += discountAmount;
      const discountText = discountAmount > 0
        ? `-${"$" + discountAmount.toFixed(2)}${pct > 0 ? ` (${pct.toFixed(2).replace(/\.00$/, "")}%)` : ""}`
        : "-";
      return [
        codigo,
        nombre,
        qty,
        "$" + baseUnit.toFixed(2),
        discountText,
        "$" + unit.toFixed(2),
        "$" + sub.toFixed(2),
      ];
    });
  } else {
    items = [["-", "No data loaded", "-", "-", "-", "-", "-"]];
  }

  // Lógica de Totales y Balance
  const totalFactura = Number(factura.total || subtotalAcumulado);
  const invoiceLevelDiscount = Math.max(0, Number((subtotalAcumulado - totalFactura).toFixed(2)));
  const displayedDiscounts = Number((totalDiscounts + invoiceLevelDiscount).toFixed(2));
  const subtotalAfterDiscounts = Math.max(0, Number((subtotalAcumulado - invoiceLevelDiscount).toFixed(2)));
  const paidAmount = factura.total_pagado != null
    ? Number(factura.total_pagado || 0)
    : factura.estado_pago === "pagado"
      ? totalFactura
      : 0;

  let balance = 0;
  let pagadoTexto = "Unpaid";

  if (factura.estado_pago === 'pagado') {
    balance = 0;
    pagadoTexto = "Paid";
  } else if (factura.estado_pago === 'parcial') {
    balance = Math.max(0, totalFactura - paidAmount);
    pagadoTexto = "Partial";
  } else {
    balance = Math.max(0, totalFactura - paidAmount);
  }

  const taxRate = 0; // Ajustar si aplica impuesto
  const taxAmount = subtotalAcumulado * taxRate;

  autoTable(doc, {
    startY: 240,
    head: [["Code", "Product", "Qty", "Regular", "Discount", "Final", "Subtotal"]],
    body: items,
    theme: "grid",
    headStyles: { fillColor: azul, textColor: "#fff", fontStyle: "bold" },
    styles: { fontSize: 8, lineColor: gris, textColor: "#333" },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 35, halign: 'center' },
      3: { cellWidth: 50, halign: 'right' },
      4: { cellWidth: 58, halign: 'right', textColor: "#B91C1C" },
      5: { cellWidth: 50, halign: 'right' },
      6: { cellWidth: 55, halign: 'right' },
    },
    margin: { left: 36, right: 36 },
  });

  // --- RESUMEN FINANCIERO ---
  let finalY = doc.lastAutoTable.finalY + 20;
  const labelX = 455;
  const valueX = 560;
  const rowHeight = 18;
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;
  const drawSummaryRow = (label, value, y, { labelColor = "#555", valueColor = "#222", bold = false, fontSize = 10 } = {}) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(labelColor);
    doc.text(label, labelX, y, { align: "right" });
    doc.setTextColor(valueColor);
    doc.text(value, valueX, y, { align: "right" });
  };

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#555");

  drawSummaryRow("Regular subtotal:", money(regularSubtotal), finalY);

  finalY += rowHeight;
  drawSummaryRow(
    "Discounts:",
    displayedDiscounts > 0 ? `-${money(displayedDiscounts)}` : "$0.00",
    finalY,
    { labelColor: displayedDiscounts > 0 ? "#B91C1C" : "#555", valueColor: displayedDiscounts > 0 ? "#B91C1C" : "#222" }
  );

  finalY += rowHeight;
  drawSummaryRow("Subtotal after discounts:", money(subtotalAfterDiscounts), finalY);

  // Tax
  finalY += rowHeight;
  drawSummaryRow(`Tax (${(taxRate*100).toFixed(0)}%):`, money(taxAmount), finalY);

  // Separador
  finalY += 5;
  doc.setDrawColor("#ccc");
  doc.setLineWidth(0.5);
  doc.line(360, finalY, 560, finalY);
  finalY += 10;

   // TOTAL
  drawSummaryRow("Total:", money(totalFactura), finalY, { labelColor: azul, valueColor: azul, bold: true, fontSize: 12 });

  finalY += rowHeight + 4;
  drawSummaryRow("Paid:", money(paidAmount), finalY, { labelColor: "#059669", valueColor: "#059669" });

  finalY += rowHeight;
  drawSummaryRow("Balance due:", money(balance), finalY, {
    labelColor: balance > 0 ? "#D97706" : "#059669",
    valueColor: balance > 0 ? "#D97706" : "#059669",
    bold: balance > 0,
  });

  finalY += rowHeight;
  drawSummaryRow("Status:", pagadoTexto, finalY, { labelColor: "#555", valueColor: balance > 0 ? "#D97706" : "#059669" });

  // --- PIE DE PÁGINA ---
  let yPie = finalY + 40;
  doc.setDrawColor(gris);
  doc.line(36, yPie, 560, yPie);
  doc.setFontSize(8);
  doc.setTextColor("#666");
  doc.text("Thank you for your business. Payment is due within 30 days.", 36, yPie + 15);

  return doc;
}

async function descargarPDFFactura(factura) {
  const doc = await buildFacturaPDF(factura);
  doc.save(`Invoice_${factura.numero_factura || factura.id}.pdf`);
}

async function uploadFacturaPDF(factura) {
  const doc = await buildFacturaPDF(factura);
  const pdfBlob = doc.output("blob");
  const invoiceNum = String(factura.numero_factura || factura.id?.slice(0, 8) || "invoice")
    .replace(/[^a-z0-9_-]+/gi, "-");
  const path = `${factura.van_id || "invoices"}/invoice-${invoiceNum}-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from("expense-receipts")
    .upload(path, pdfBlob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("expense-receipts").getPublicUrl(path);
  return data?.publicUrl || "";
}

/* Build a complete styled HTML invoice — same data as the PDF */
function buildFullInvoiceHTML(factura, { pdfUrl = "" } = {}) {
  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
  const empresa = {
    nombre: "TOOLS4CARE",
    direccion: "108 Lafayette St, Salem, MA 01970",
    telefono: "(978) 594-1624",
    email: "soporte@tools4care.com",
  };

  const fecha = factura.fecha
    ? new Date(factura.fecha.includes("T") ? factura.fecha : factura.fecha + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "-";
  const invoiceNum = factura.numero_factura || factura.id?.slice(0, 8) || "-";
  const cliente = factura.cliente_nombre_c || "Quick Sale";
  const direccion = formatAddress(factura.cliente_direccion);
  const telefono = factura.cliente_telefono || "-";
  const emailCliente = factura.cliente_email || "-";

  const items = (factura.detalle_ventas || []);
  let subtotal = 0;
  let regularSubtotal = 0;
  let totalDiscounts = 0;
  const itemRows = items.length
    ? items.map(d => {
        const codigo = d.productos?.codigo || "N/A";
        const nombre = d.productos?.nombre || d.producto_nombre || "-";
        const qty = Number(d.cantidad || 1);
        // precio_unitario ya viene normalizado (con descuento aplicado) desde normalizeDetalleRows
        const unit = Number(d.precio_unitario ?? d.precio_unit ?? 0);
        const baseUnit = Number(d.precio_base ?? unit);
        const pct = Number(d.descuento || 0);
        const sub = Number(d.subtotal ?? unit * qty);
        const regularSub = Number((baseUnit * qty).toFixed(2));
        const discountAmount = Math.max(0, Number((regularSub - sub).toFixed(2)));
        subtotal += sub;
        regularSubtotal += regularSub;
        totalDiscounts += discountAmount;
        const discountLabel = discountAmount > 0
          ? `-${fmt(discountAmount)}${pct > 0 ? ` (${pct.toFixed(2).replace(/\.00$/, "")}%)` : ""}`
          : "-";
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">${codigo}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:500;">${nombre}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:13px;">${qty}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;color:#6b7280;">${fmt(baseUnit)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;color:${discountAmount > 0 ? "#b91c1c" : "#9ca3af"};font-weight:${discountAmount > 0 ? "700" : "400"};">${discountLabel}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;">${fmt(unit)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;">${fmt(sub)}</td>
          </tr>`;
      }).join("")
    : `<tr><td colspan="7" style="padding:16px;text-align:center;color:#9ca3af;">No items</td></tr>`;

  const totalFactura = Number(factura.total || subtotal);
  const invoiceLevelDiscount = Math.max(0, Number((subtotal - totalFactura).toFixed(2)));
  const displayedDiscounts = Number((totalDiscounts + invoiceLevelDiscount).toFixed(2));
  const subtotalAfterDiscounts = Math.max(0, Number((subtotal - invoiceLevelDiscount).toFixed(2)));
  const estadoPago = factura.estado_pago;
  const statusColor = estadoPago === "pagado" ? "#065f46" : estadoPago === "parcial" ? "#1e40af" : "#92400e";
  const statusBg = estadoPago === "pagado" ? "#d1fae5" : estadoPago === "parcial" ? "#dbeafe" : "#fef3c7";
  const statusLabel = estadoPago === "pagado" ? "PAID" : estadoPago === "parcial" ? "PARTIAL" : "PENDING";
  const paidAmount = factura.total_pagado != null
    ? Number(factura.total_pagado || 0)
    : estadoPago === "pagado"
      ? totalFactura
      : 0;
  const balanceDue = estadoPago === "pagado" ? 0 : Math.max(0, totalFactura - paidAmount);

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:680px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:#0b4a6f;padding:28px 32px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="color:white;font-size:26px;font-weight:bold;letter-spacing:1px;">${empresa.nombre}</div>
      <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:4px;">${empresa.direccion}</div>
      <div style="color:rgba(255,255,255,0.75);font-size:12px;">${empresa.telefono} · ${empresa.email}</div>
    </div>
    <div style="text-align:right;">
      <div style="color:white;font-size:22px;font-weight:bold;">INVOICE</div>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">#${invoiceNum}</div>
      <div style="background:${statusBg};color:${statusColor};font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;margin-top:8px;display:inline-block;letter-spacing:.5px;">${statusLabel}</div>
    </div>
  </div>

  <!-- Invoice meta + Client -->
  <div style="display:flex;gap:0;border-bottom:2px solid #f3f4f6;">
    <div style="flex:1;padding:24px 32px;border-right:1px solid #f3f4f6;">
      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Invoice Date</div>
      <div style="font-size:14px;font-weight:600;color:#111;">${fecha}</div>
    </div>
    <div style="flex:1;padding:24px 32px;border-right:1px solid #f3f4f6;">
      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Invoice #</div>
      <div style="font-size:14px;font-weight:600;color:#111;font-family:monospace;">${invoiceNum}</div>
    </div>
    <div style="flex:1;padding:24px 32px;">
      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Bill To</div>
      <div style="font-size:14px;font-weight:700;color:#111;">${cliente}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px;">${direccion}</div>
      <div style="font-size:12px;color:#6b7280;">${telefono}</div>
      <div style="font-size:12px;color:#6b7280;">${emailCliente}</div>
    </div>
  </div>

  <!-- Items table -->
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#f8fafc;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Code</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Product / Service</th>
        <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Qty</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Regular</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Discount</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Final</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- Totals -->
  <div style="padding:20px 32px;border-top:2px solid #f3f4f6;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:4px 0;color:#6b7280;font-size:13px;">Regular subtotal</td>
        <td style="padding:4px 0;text-align:right;font-size:13px;">${fmt(regularSubtotal)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${displayedDiscounts > 0 ? "#b91c1c" : "#6b7280"};font-size:13px;font-weight:${displayedDiscounts > 0 ? "700" : "400"};">Discounts</td>
        <td style="padding:4px 0;text-align:right;font-size:13px;color:${displayedDiscounts > 0 ? "#b91c1c" : "#6b7280"};font-weight:${displayedDiscounts > 0 ? "700" : "400"};">${displayedDiscounts > 0 ? `-${fmt(displayedDiscounts)}` : "$0.00"}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#6b7280;font-size:13px;">Subtotal after discounts</td>
        <td style="padding:4px 0;text-align:right;font-size:13px;">${fmt(subtotalAfterDiscounts)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#6b7280;font-size:13px;">Tax</td>
        <td style="padding:4px 0;text-align:right;font-size:13px;">$0.00</td>
      </tr>
      <tr>
        <td style="padding:12px 0 4px;font-size:16px;font-weight:800;color:#0b4a6f;border-top:2px solid #e5e7eb;">TOTAL</td>
        <td style="padding:12px 0 4px;text-align:right;font-size:16px;font-weight:800;color:#0b4a6f;border-top:2px solid #e5e7eb;">${fmt(totalFactura)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#059669;font-size:13px;font-weight:600;">Paid</td>
        <td style="padding:4px 0;text-align:right;font-size:13px;font-weight:600;color:#059669;">${fmt(paidAmount)}</td>
      </tr>
      ${balanceDue > 0 ? `
      <tr>
        <td style="padding:4px 0;color:#d97706;font-size:13px;font-weight:600;">Balance Due</td>
        <td style="padding:4px 0;text-align:right;font-size:13px;font-weight:600;color:#d97706;">${fmt(balanceDue)}</td>
      </tr>` : `
      <tr>
        <td style="padding:4px 0;color:#059669;font-size:13px;font-weight:600;">Balance Due</td>
        <td style="padding:4px 0;text-align:right;font-size:13px;font-weight:600;color:#059669;">$0.00</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:4px 0;color:#059669;font-size:13px;font-weight:600;">✅ Paid in full</td>
      </tr>`}
    </table>
  </div>

  ${pdfUrl ? `
  <div style="padding:0 32px 20px;">
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:13px;color:#1e3a8a;margin-bottom:10px;font-weight:bold;">PDF invoice available</div>
      <a href="${pdfUrl}" style="display:inline-block;background:#0b4a6f;color:white;text-decoration:none;border-radius:8px;padding:10px 16px;font-size:13px;font-weight:bold;">Download PDF Invoice</a>
    </div>
  </div>
  ` : ""}

  <!-- Footer -->
  <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
    <div style="font-size:12px;color:#374151;font-weight:600;">Thank you for your business!</div>
    <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Payment is due within 30 days · ${empresa.nombre} · ${empresa.direccion}</div>
    <div style="font-size:10px;color:#d1d5db;margin-top:8px;">Generated ${new Date().toLocaleString("en-US")} · Tools4Care Financial System</div>
  </div>
</div>
</body></html>`;
}

/* ===================== MAIN ===================== */
export default function Facturas() {
  const location = useLocation();
  const { usuario } = useUsuario();
  const { van } = useVan();
  const { toast } = useToast();

  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);

  // Estado para selección múltiple
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectAll, setIsSelectAll] = useState(false);

  // Estado para envío masivo por email
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
  const [bulkEmailTarget, setBulkEmailTarget] = useState("");
  const [sendingBulkEmail, setSendingBulkEmail] = useState(false);
  const [bulkEmailSent, setBulkEmailSent] = useState(false);

  // Estado para envío individual desde el detalle de factura
  const [showSingleEmailInput, setShowSingleEmailInput] = useState(false);
  const [singleEmailTarget, setSingleEmailTarget] = useState("");
  const [sendingSingleEmail, setSendingSingleEmail] = useState(false);
  const [singleEmailSent, setSingleEmailSent] = useState(false);

  // Pagination
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);
  const [totalVentas, setTotalVentas] = useState(0);

  // Filters
  const [busqueda, setBusqueda] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("all");

  // Período para estadísticas (7, 30, 90 días o "all")
  const [periodoStats, setPeriodoStats] = useState(30);

  // Admin: filtro por VAN ("" = todas)
  const [vans, setVans] = useState([]);
  const [vanFiltro, setVanFiltro] = useState("");

  // Estadísticas
  const [estadisticas, setEstadisticas] = useState({
    totalGeneral: 0,
    totalPagado: 0,
    totalPendiente: 0,
    cantidadTotal: 0,
    cantidadPagadas: 0,
    cantidadPendientes: 0,
  });

  // Cargar lista de vans para el selector de admin
  useEffect(() => {
    if (usuario?.rol !== "admin") return;
    supabase.from("vans").select("id,nombre_van").order("nombre_van").then(({ data }) => setVans(data || []));
  }, [usuario?.rol]);

  useEffect(() => {
    cargarFacturas();
    cargarEstadisticas();
    // eslint-disable-next-line
  }, [pagina, porPagina, fechaInicio, fechaFin, estadoFiltro, busqueda, periodoStats, vanFiltro]);

  useEffect(() => {
    const invoiceId = new URLSearchParams(location.search).get("invoice");
    if (!invoiceId) return;
    let cancelled = false;
    supabase.from("facturas_ext").select("*").eq("id", invoiceId).maybeSingle().then(({ data }) => {
      if (!cancelled && data) setFacturaSeleccionada(data);
    });
    return () => { cancelled = true; };
  }, [location.search]);

  // Resetear selección cuando cambian los filtros o pagina
  useEffect(() => {
    setSelectedIds(new Set());
    setIsSelectAll(false);
  }, [pagina, porPagina, fechaInicio, fechaFin, estadoFiltro, busqueda]);

  async function cargarEstadisticas() {
    let query = supabase.from("facturas_ext").select("total, estado_pago");

    if (usuario?.rol === "admin") {
      if (vanFiltro) query = query.eq("van_id", vanFiltro);
    } else if (van?.id) {
      query = query.eq("van_id", van.id);
    }

    // Aplicar período para estadísticas
    if (periodoStats !== "all") {
      const fechaDesde = new Date();
      fechaDesde.setDate(fechaDesde.getDate() - periodoStats);
      query = query.gte("fecha", fechaDesde.toISOString().split("T")[0]);
    }

    const { data } = await query;

    if (data) {
      const totalGeneral = data.reduce((sum, f) => sum + Number(f.total || 0), 0);
      const pagadas = data.filter(f => f.estado_pago === "pagado");
      const totalPagado = pagadas.reduce((sum, f) => sum + Number(f.total || 0), 0);
      const pendientes = data.filter(f => f.estado_pago !== "pagado");
      const totalPendiente = pendientes.reduce((sum, f) => sum + Number(f.total || 0), 0);

      setEstadisticas({
        totalGeneral,
        totalPagado,
        totalPendiente,
        cantidadTotal: data.length,
        cantidadPagadas: pagadas.length,
        cantidadPendientes: pendientes.length,
      });
    }
  }

  async function cargarFacturas() {
    setLoading(true);
    let query = supabase.from("facturas_ext").select("*", { count: "exact" });

    if (usuario?.rol === "admin") {
      if (vanFiltro) query = query.eq("van_id", vanFiltro);
    } else if (van?.id) {
      query = query.eq("van_id", van.id);
    }

    // Filtro por rango de fechas
    if (fechaInicio) {
      query = query.gte("fecha", fechaInicio);
    }
    if (fechaFin) {
      const fechaFinAjustada = new Date(fechaFin);
      fechaFinAjustada.setDate(fechaFinAjustada.getDate() + 1);
      query = query.lt("fecha", fechaFinAjustada.toISOString().split("T")[0]);
    }

    // Filtro por estado de pago
    if (estadoFiltro !== "all") {
      query = query.eq("estado_pago", estadoFiltro);
    }

    // CORREGIDO: Búsqueda integrada en el query
    if (busqueda.trim()) {
      query = query.or(`cliente_nombre_c.ilike.%${busqueda}%,numero_factura.ilike.%${busqueda}%`);
    }

    const desde = (pagina - 1) * porPagina;
    const hasta = desde + porPagina - 1;

    query = query.order("fecha", { ascending: false }).range(desde, hasta);

    const { data, count } = await query;
    setFacturas(data || []);
    setTotalVentas(count || 0);
    setLoading(false);
  }

  /* === Carga perezosa del detalle === */
  useEffect(() => {
    if (!facturaSeleccionada) return;
    if (facturaSeleccionada.detalle_ventas) return;

    async function cargarDetalle() {
      const ventaId = facturaSeleccionada.id;
      let rows = [];

      try {
        const { data } = await supabase
          .from("detalle_ventas")
          .select("producto_id,cantidad,precio_unitario,descuento,subtotal,productos(nombre,codigo)")
          .eq("venta_id", ventaId);
        rows = data || [];
      } catch {}

      if (!rows.length) {
        try {
          rows = await fetchDetalleFromVenta(ventaId);
        } catch {}
      }

      const normalizados = normalizeDetalleRows(rows);
      setFacturaSeleccionada((f) => (f ? { ...f, detalle_ventas: normalizados } : f));
    }

    cargarDetalle();
  }, [facturaSeleccionada]);

  // Funciones de Selección
  const toggleSelection = (id) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
    setIsSelectAll(newSelection.size === facturas.length && facturas.length > 0);
  };

  const toggleSelectAll = () => {
    if (isSelectAll) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(facturas.map(f => f.id)));
    }
    setIsSelectAll(!isSelectAll);
  };

  // Función de Descarga Masiva
  const handleBulkDownload = async () => {
    const selectedInvoices = facturas.filter(f => selectedIds.has(f.id));
    if (selectedInvoices.length === 0) return;

    setLoading(true);

    // Procesar una por una para evitar congelar el navegador
    for (const factura of selectedInvoices) {
      // Asegurar que tenga detalle antes de imprimir
      let facturaProcesada = factura;
      if (!facturaProcesada.detalle_ventas) {
        const ventaId = facturaProcesada.id;
        let rows = [];
        try {
          const { data } = await supabase
            .from("detalle_ventas")
            .select("producto_id,cantidad,precio_unitario,descuento,subtotal,productos(nombre,codigo)")
            .eq("venta_id", ventaId);
          rows = data || [];
        } catch {}
        if (!rows.length) {
          try { rows = await fetchDetalleFromVenta(ventaId); } catch {}
        }
        facturaProcesada = { ...facturaProcesada, detalle_ventas: normalizeDetalleRows(rows) };
      }

      await descargarPDFFactura(facturaProcesada);

      // Pequeña pausa para que el navegador gestione el diálogo de descarga
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setLoading(false);
  };

  const handleBulkEmail = async () => {
    const selected = facturas.filter(f => selectedIds.has(f.id));
    if (!selected.length || !bulkEmailTarget.trim()) return;
    setSendingBulkEmail(true);
    try {
      // 1. Fetch detalle_ventas for each invoice that doesn't have it loaded
      const withDetail = await Promise.all(selected.map(async (f) => {
        if (f.detalle_ventas?.length) return f;
        let rows = [];
        try {
          const { data } = await supabase
            .from("detalle_ventas")
            .select("producto_id,cantidad,precio_unitario,descuento,subtotal,productos(nombre,codigo)")
            .eq("venta_id", f.id);
          rows = data || [];
        } catch {}
        if (!rows.length) {
          try { rows = await fetchDetalleFromVenta(f.id); } catch {}
        }
        return { ...f, detalle_ventas: normalizeDetalleRows(rows) };
      }));

      // 2. Build one full-invoice HTML per selected invoice, with a PDF link
      const invoicesWithPdf = await Promise.all(withDetail.map(async (f) => {
        try {
          return { factura: f, pdfUrl: await uploadFacturaPDF(f) };
        } catch (error) {
          console.warn("Could not create invoice PDF link:", error?.message || error);
          return { factura: f, pdfUrl: "" };
        }
      }));
      const html = invoicesWithPdf
        .map(({ factura, pdfUrl }) => buildFullInvoiceHTML(factura, { pdfUrl }))
        .join('<div style="page-break-after:always;height:24px;"></div>');

      const count = withDetail.length;
      const { data, error } = await supabase.functions.invoke("send-order-email", {
        body: {
          to: bulkEmailTarget.trim(),
          subject: `Tools4Care — ${count} Invoice${count !== 1 ? "s" : ""} — ${new Date().toLocaleDateString("en-US")}`,
          html,
        },
      });
      if (error) throw new Error(error.message || "Failed to send email");
      if (!data?.ok) throw new Error(data?.error || "Failed to send email");
      setBulkEmailSent(true);
    } catch (e) {
      toast.error("Error sending email: " + e.message);
    } finally {
      setSendingBulkEmail(false);
    }
  };

  const handleSingleInvoiceEmail = async (factura) => {
    if (!singleEmailTarget.trim() || !factura) return;
    setSendingSingleEmail(true);
    try {
      // Ensure detail is loaded
      let f = factura;
      if (!f.detalle_ventas?.length) {
        let rows = [];
        try {
          const { data } = await supabase
            .from("detalle_ventas")
            .select("producto_id,cantidad,precio_unitario,descuento,subtotal,productos(nombre,codigo)")
            .eq("venta_id", f.id);
          rows = data || [];
        } catch {}
        if (!rows.length) { try { rows = await fetchDetalleFromVenta(f.id); } catch {} }
        f = { ...f, detalle_ventas: normalizeDetalleRows(rows) };
      }

      let pdfUrl = "";
      try {
        pdfUrl = await uploadFacturaPDF(f);
      } catch (error) {
        console.warn("Could not create invoice PDF link:", error?.message || error);
      }

      const html = buildFullInvoiceHTML(f, { pdfUrl });

      const { data, error } = await supabase.functions.invoke("send-order-email", {
        body: {
          to: singleEmailTarget.trim(),
          subject: `Tools4Care Invoice ${f.numero_factura || f.id?.slice(0, 8)} — ${f.cliente_nombre_c || ""}`,
          html,
        },
      });
      if (error) throw new Error(error.message || "Failed to send");
      if (!data?.ok) throw new Error(data?.error || "Failed to send");
      setSingleEmailSent(true);
    } catch (e) {
      toast.error("Error sending: " + e.message);
    } finally {
      setSendingSingleEmail(false);
    }
  };

  const totalPaginas = Math.ceil(totalVentas / porPagina) || 1;

  function limpiarFiltros() {
    setBusqueda("");
    setFechaInicio("");
    setFechaFin("");
    setEstadoFiltro("all");
    setVanFiltro("");
    setPagina(1);
  }

  function handleBusquedaChange(value) {
    setBusqueda(value);
    setPagina(1); // Resetear a página 1 cuando se busca
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 p-3 sm:p-6 pb-24">
      <div className="w-full max-w-[1600px] mx-auto space-y-6">

        {/* Header Mejorado */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="mb-1 flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent sm:text-3xl">
                <IconInvoice />
                Invoices
              </h1>
              <p className="text-gray-600 dark:text-slate-400 text-sm">
                Manage and download your invoices
              </p>
            </div>
            <div className="shrink-0 rounded-full bg-blue-100 px-3 py-2 text-xs font-semibold text-gray-600 dark:bg-blue-900/40 dark:text-slate-300 sm:px-4 sm:text-sm">
              Page {pagina} / {totalPaginas}
            </div>
          </div>

          <PrimarySearch
            id="invoice-search"
            label="Find an invoice"
            description="Search by customer name or invoice number."
            placeholder="Customer or invoice number…"
            value={busqueda}
            onChange={handleBusquedaChange}
            busy={loading}
            busyLabel="Loading invoices"
            status={`${totalVentas} matching ${totalVentas === 1 ? "invoice" : "invoices"}`}
            className="mb-4 border-blue-100 bg-blue-50/30 shadow-none dark:border-slate-700 dark:bg-slate-900/30"
            rightAction={
              <button
                type="button"
                onClick={limpiarFiltros}
                className="flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-700 px-3 font-black text-white transition-colors hover:bg-slate-800 sm:px-4"
              >
                <IconFilter />
                <span className="hidden sm:inline">Clear filters</span>
                <span className="sm:hidden">Clear</span>
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="relative">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">From</span>
                <span className="pointer-events-none absolute bottom-3 left-3 text-gray-400">
                  <IconCalendar />
                </span>
                <input
                  type="date"
                  className="min-h-11 w-full rounded-xl border-2 border-gray-300 bg-white py-2.5 pl-10 pr-3 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  value={fechaInicio}
                  onChange={(e) => {
                    setFechaInicio(e.target.value);
                    setPagina(1);
                  }}
                  aria-label="Invoice start date"
                />
              </label>

              <label className="relative">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">To</span>
                <span className="pointer-events-none absolute bottom-3 left-3 text-gray-400">
                  <IconCalendar />
                </span>
                <input
                  type="date"
                  className="min-h-11 w-full rounded-xl border-2 border-gray-300 bg-white py-2.5 pl-10 pr-3 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  value={fechaFin}
                  onChange={(e) => {
                    setFechaFin(e.target.value);
                    setPagina(1);
                  }}
                  aria-label="Invoice end date"
                />
              </label>

              <label>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Status</span>
                <select
                  className="min-h-11 w-full rounded-xl border-2 border-gray-300 bg-white px-3 py-2.5 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  value={estadoFiltro}
                  onChange={(e) => {
                    setEstadoFiltro(e.target.value);
                    setPagina(1);
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="pagado">Paid</option>
                  <option value="parcial">Partial</option>
                  <option value="pendiente">Pending</option>
                </select>
              </label>

              {usuario?.rol === "admin" && (
                <label>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Location</span>
                  <select
                    className="min-h-11 w-full rounded-xl border-2 border-blue-300 bg-blue-50 px-3 py-2.5 font-medium text-blue-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    value={vanFiltro}
                    onChange={(e) => { setVanFiltro(e.target.value); setPagina(1); }}
                  >
                    <option value="">All VANs</option>
                    {vans.map(v => (
                      <option key={v.id} value={v.id}>{v.nombre_van}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </PrimarySearch>

          {/* Selector de Período para Estadísticas */}
          <div className="mb-4">
            <div className="text-sm font-semibold text-gray-700 mb-2">Statistics Period:</div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { value: 7, label: "Last 7 days" },
                { value: 30, label: "Last 30 days" },
                { value: 90, label: "Last 90 days" },
                { value: "all", label: "All time" },
              ].map((periodo) => (
                <button
                  key={periodo.value}
                  onClick={() => setPeriodoStats(periodo.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    periodoStats === periodo.value
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {periodo.label}
                </button>
              ))}
            </div>
          </div>

          {/* Estadísticas Visuales */}
          <div className="mb-2 grid grid-cols-3 gap-2 sm:gap-4">
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-3 text-white shadow-md transition-shadow hover:shadow-lg sm:rounded-2xl sm:p-5">
              <div className="absolute top-0 right-0 opacity-10 transform translate-x-4 -translate-y-4 scale-[2]">
                <IconDollar />
              </div>
              <div className="relative z-10">
                <div className="mb-1 flex items-center justify-between">
                  <div className="truncate text-[10px] font-semibold uppercase opacity-90 sm:text-sm sm:normal-case">Revenue</div>
                  <IconDollar />
                </div>
                <div className="mb-1 truncate text-base font-black sm:text-2xl lg:text-3xl">${estadisticas.totalGeneral.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="text-[10px] opacity-80 sm:text-sm">{estadisticas.cantidadTotal} invoices</div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 p-3 text-white shadow-md transition-shadow hover:shadow-lg sm:rounded-2xl sm:p-5">
              <div className="absolute top-0 right-0 opacity-10 transform translate-x-4 -translate-y-4 scale-[2]">
                <IconCheck />
              </div>
              <div className="relative z-10">
                <div className="mb-1 flex items-center justify-between">
                  <div className="truncate text-[10px] font-semibold uppercase opacity-90 sm:text-sm sm:normal-case">Paid</div>
                  <IconCheck />
                </div>
                <div className="mb-1 truncate text-base font-black sm:text-2xl lg:text-3xl">${estadisticas.totalPagado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="text-[10px] opacity-80 sm:text-sm">{estadisticas.cantidadPagadas} paid</div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-3 text-white shadow-md transition-shadow hover:shadow-lg sm:rounded-2xl sm:p-5">
              <div className="absolute top-0 right-0 opacity-10 transform translate-x-4 -translate-y-4 scale-[2]">
                <IconClock />
              </div>
              <div className="relative z-10">
                <div className="mb-1 flex items-center justify-between">
                  <div className="truncate text-[10px] font-semibold uppercase opacity-90 sm:text-sm sm:normal-case">Pending</div>
                  <IconClock />
                </div>
                <div className="mb-1 truncate text-base font-black sm:text-2xl lg:text-3xl">${estadisticas.totalPendiente.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="text-[10px] opacity-80 sm:text-sm">{estadisticas.cantidadPendientes} pending</div>
              </div>
            </div>
          </div>
        </div>


                {/* Tabla / Cards */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl">
          <div className="p-6 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Invoice List</h2>
              <div className="text-sm text-gray-500">
                Showing <span className="font-semibold text-gray-800">{facturas.length}</span> of <span className="font-semibold text-gray-800">{totalVentas}</span>
              </div>
            </div>
                      {/* BARRA DE ACCIONES (Ahora es un banner estático sobre la tabla) */}
          {selectedIds.size > 0 && (
            <div className="mx-6 mt-4 mb-4 bg-gray-900 text-white rounded-xl shadow-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-full shrink-0">
                  <IconDownload />
                </div>
                <div>
                  <div className="text-xs text-gray-300">Selected</div>
                  <div className="font-bold text-lg">{selectedIds.size} Invoices</div>
                </div>
              </div>

              <div className="h-8 w-px bg-gray-700 hidden sm:block"></div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={handleBulkDownload}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-semibold transition-colors disabled:opacity-50 flex-1 sm:flex-none"
                >
                  <IconDownload />
                  <span className="hidden sm:inline">Download All</span>
                  <span className="sm:hidden">Download</span>
                </button>
                <button
                  onClick={() => { setBulkEmailSent(false); setBulkEmailTarget(""); setShowBulkEmailModal(true); }}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl font-semibold transition-colors disabled:opacity-50 flex-1 sm:flex-none"
                >
                  <IconMail />
                  <span className="hidden sm:inline">Send by Email</span>
                  <span className="sm:hidden">Email</span>
                </button>
                <button
                  onClick={() => { setSelectedIds(new Set()); setIsSelectAll(false); }}
                  className="text-gray-400 hover:text-white font-semibold px-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : facturas.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">📄</div>
              <div className="text-gray-400 font-semibold mb-2">No invoices found</div>
              <div className="text-sm text-gray-500">Try adjusting your search filters</div>
            </div>
          ) : (
            <>
              {/* Vista Desktop - Tabla */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700">
                      <th className="p-4 w-12 text-center">
                         <label className="cursor-pointer relative flex items-center justify-center">
                            <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={isSelectAll} onChange={toggleSelectAll} />
                         </label>
                      </th>
                      <th className="p-4 text-left">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-slate-300">
                          <IconInvoice />
                          Number
                        </div>
                      </th>
                      <th className="p-4 text-left text-sm font-bold text-gray-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <IconCalendar />
                          Date
                        </div>
                      </th>
                      <th className="p-4 text-left text-sm font-bold text-gray-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <IconUser />
                          Client
                        </div>
                      </th>
                      <th className="p-4 text-right text-sm font-bold text-gray-700 dark:text-slate-300">
                        <div className="flex items-center justify-end gap-2">
                          <IconDollar />
                          Total
                        </div>
                      </th>
                      <th className="p-4 text-left text-sm font-bold text-gray-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <IconTruck />
                          VAN
                        </div>
                      </th>
                      <th className="p-4 text-center text-sm font-bold text-gray-700 dark:text-slate-300">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {facturas.map((f) => (
                      <tr
                        key={f.id}
                        className={`hover:bg-blue-50 dark:hover:bg-slate-700 dark:text-slate-200 cursor-pointer transition-all group ${selectedIds.has(f.id) ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}
                        onClick={(e) => {
                             // Evitar conflicto con click en checkbox
                            if (e.target.type !== 'checkbox') setFacturaSeleccionada(f);
                        }}
                      >
                        <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                            <label className="cursor-pointer relative flex items-center justify-center">
                                <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={selectedIds.has(f.id)} onChange={() => toggleSelection(f.id)} />
                            </label>
                        </td>
                        <td className="p-4">
                          <div className="font-mono text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                            {f.numero_factura || f.id?.slice(0, 8)}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-medium text-gray-800">
                            {f.fecha ? new Date(f.fecha).toLocaleDateString("en-US", {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            }) : "-"}
                          </div>
                        </td>
                        <td className="p-4 font-medium text-gray-800">{f.cliente_nombre_c || "-"}</td>
                        <td className="p-4 text-right">
                          <div className="font-bold text-xl text-gray-900 group-hover:text-blue-600 transition-colors">
                            ${Number(f.total || 0).toFixed(2)}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm text-gray-600">{f.nombre_van || "-"}</div>
                        </td>
                        <td className="p-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                              f.estado_pago === "pagado"
                                ? "bg-green-500 text-white"
                                : f.estado_pago === "parcial"
                                ? "bg-blue-500 text-white"
                                : "bg-amber-500 text-white"
                            }`}
                          >
                            {f.estado_pago === "pagado" ? (
                              <>
                                <IconCheck />
                                Paid
                              </>
                            ) : f.estado_pago === "parcial" ? (
                              "◐ Partial"
                            ) : (
                              <>
                                <IconClock />
                                Pending
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Vista Mobile - Cards */}
              <div className="md:hidden p-4 space-y-3">
                {facturas.map((f) => (
                  <div
                    key={f.id}
                    className={`bg-gradient-to-br from-white to-blue-50 rounded-2xl p-4 border-2 ${selectedIds.has(f.id) ? 'border-blue-500 bg-blue-50' : 'border-blue-100'} hover:border-blue-300 hover:shadow-lg cursor-pointer transition-all relative`}
                    onClick={() => setFacturaSeleccionada(f)}
                  >
                    {/* Checkbox Móvil */}
                    <div
                        className="absolute top-4 right-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <label className="cursor-pointer relative flex items-center justify-center">
                            <input type="checkbox" className="w-6 h-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={selectedIds.has(f.id)} onChange={() => toggleSelection(f.id)} />
                        </label>
                    </div>

                    <div className="flex-1 pr-8">
                      <div className="font-mono text-sm font-bold text-blue-600 mb-1">
                        #{f.numero_factura || f.id?.slice(0, 8)}
                      </div>
                      <div className="font-semibold text-gray-900 mb-1">{f.cliente_nombre_c || "-"}</div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <IconCalendar />
                        {f.fecha ? new Date(f.fecha).toLocaleDateString("en-US") : "-"}
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-3 mt-3">
                      <div className="flex items-center gap-2">
                        <IconDollar />
                        <span className="font-semibold">Total</span>
                      </div>
                      <span className="text-2xl font-bold">${Number(f.total || 0).toFixed(2)}</span>
                    </div>

                    {f.nombre_van && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                        <IconTruck />
                        {f.nombre_van}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Paginación Mejorada */}
        {!loading && totalVentas > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-2xl shadow-lg p-4">
            <div className="text-sm text-gray-600">
              Showing <span className="font-bold text-gray-800">{(pagina - 1) * porPagina + 1}</span> - <span className="font-bold text-gray-800">{Math.min(pagina * porPagina, totalVentas)}</span> of <span className="font-bold text-gray-800">{totalVentas}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-gray-200 to-gray-300 hover:from-gray-300 hover:to-gray-400 text-gray-800 font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1}
              >
                ← Previous
              </button>
              <div className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold shadow-md">
                {pagina} / {totalPaginas}
              </div>
              <button
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                onClick={() => setPagina((p) => p + 1)}
                disabled={pagina >= totalPaginas}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>



      {/* Modal Detalle Mejorado */}
      {facturaSeleccionada && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconInvoice />
                <h3 className="font-bold text-xl">Invoice Details</h3>
              </div>
              <button
                className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
                onClick={() => setFacturaSeleccionada(null)}
              >
                ✖
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Info Principal en Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                  <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Invoice Number</div>
                  <div className="font-mono text-lg font-bold text-gray-800">{facturaSeleccionada.numero_factura || facturaSeleccionada.id?.slice(0, 12)}</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
                  <div className="text-xs text-purple-600 font-semibold uppercase mb-1">Date</div>
                  <div className="font-semibold text-gray-800">
                    {facturaSeleccionada.fecha ? new Date(facturaSeleccionada.fecha).toLocaleDateString("en-US", {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    }) : "-"}
                  </div>
                </div>
              </div>

              {/* Cliente */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-200">
                <div className="flex items-center gap-2 mb-3">
                  <IconUser />
                  <h4 className="font-bold text-gray-800">Client Information</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div><span className="font-semibold">Name:</span> {facturaSeleccionada.cliente_nombre_c || "-"}</div>
                  <div><span className="font-semibold">Address:</span> {formatAddress(facturaSeleccionada.cliente_direccion)}</div>
                  <div><span className="font-semibold">Phone:</span> {formatPhone(facturaSeleccionada.cliente_telefono)}</div>
                  <div><span className="font-semibold">Email:</span> {facturaSeleccionada.cliente_email || "-"}</div>
                </div>
              </div>

              {/* Total y Estado */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <IconDollar />
                      <div className="text-sm font-semibold opacity-90">Invoice Total</div>
                    </div>
                    <div className="text-5xl font-bold">
                      ${Number(facturaSeleccionada.total || 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold opacity-90 mb-2">Payment Status</div>
                    <span
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-base font-bold ${
                        facturaSeleccionada.estado_pago === "pagado"
                          ? "bg-green-500"
                          : facturaSeleccionada.estado_pago === "parcial"
                          ? "bg-blue-400"
                          : "bg-amber-500"
                      }`}
                    >
                      {facturaSeleccionada.estado_pago === "pagado" ? (
                        <>
                          <IconCheck />
                          Paid
                        </>
                      ) : facturaSeleccionada.estado_pago === "parcial" ? (
                        "◐ Partial"
                      ) : (
                        <>
                          <IconClock />
                          Pending
                        </>
                      )}
                    </span>
                    {facturaSeleccionada.nombre_van && (
                      <div className="mt-3 flex items-center gap-2 opacity-90">
                        <IconTruck />
                        <span className="text-sm">{facturaSeleccionada.nombre_van}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Productos */}
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <h4 className="font-bold text-gray-800">Products</h4>
                </div>
                {!facturaSeleccionada.detalle_ventas ? (
                  <div className="text-blue-600 text-sm py-4">Loading products...</div>
                ) : (facturaSeleccionada.detalle_ventas || []).length === 0 ? (
                  <div className="text-gray-400 text-sm py-4">No products</div>
                ) : (
                  <div className="space-y-2">
                    {(facturaSeleccionada.detalle_ventas || []).map((item, idx) => {
                      // precio_unitario ya viene normalizado (con descuento) desde normalizeDetalleRows
                      const unit = Number(item.precio_unitario ?? item.precio_unit ?? 0);
                      const baseUnit = Number(item.precio_base ?? unit);
                      const pct = Number(item.descuento || 0);
                      const subtotal = Number(item.subtotal ?? unit * Number(item.cantidad || 1));
                      const regularSubtotal = Number((baseUnit * Number(item.cantidad || 1)).toFixed(2));
                      const discountAmount = Math.max(0, Number((regularSubtotal - subtotal).toFixed(2)));
                      return (
                        <div key={idx} className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900">
                                {item.productos?.nombre || item.producto_nombre || item.producto_id || "-"}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                Code: {item.productos?.codigo || 'N/A'} <br/>
                                Quantity: <span className="font-semibold">{item.cantidad || 1}</span> × ${unit.toFixed(2)}
                              </div>
                              {discountAmount > 0 && (
                                <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                  <span>Regular ${baseUnit.toFixed(2)}</span>
                                  <span>Discount -${discountAmount.toFixed(2)}{pct > 0 ? ` (${pct.toFixed(2).replace(/\.00$/, "")}%)` : ""}</span>
                                  <span>Final ${unit.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-500">Subtotal</div>
                              <div className="font-bold text-lg text-gray-900">${subtotal.toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer con botones */}
            <div className="p-6 pt-0 space-y-3 border-t">
              <div className="flex gap-2">
                <button
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => descargarPDFFactura(facturaSeleccionada)}
                  disabled={!facturaSeleccionada.detalle_ventas}
                >
                  <IconDownload />
                  Download PDF
                </button>
                <button
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  disabled={!facturaSeleccionada.detalle_ventas}
                  onClick={() => { setShowSingleEmailInput(v => !v); setSingleEmailSent(false); setSingleEmailTarget(""); }}
                >
                  <IconMail />
                  Email
                </button>
              </div>

              {/* Email input inline */}
              {showSingleEmailInput && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 space-y-2">
                  {singleEmailSent ? (
                    <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Invoice sent to {singleEmailTarget}
                    </div>
                  ) : (
                    <>
                      <div className="text-xs font-semibold text-blue-700">Send PDF invoice by email</div>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={singleEmailTarget}
                          onChange={e => setSingleEmailTarget(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleSingleInvoiceEmail(facturaSeleccionada)}
                          placeholder="recipient@email.com"
                          autoFocus
                          className="flex-1 border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        />
                        <button
                          onClick={() => handleSingleInvoiceEmail(facturaSeleccionada)}
                          disabled={sendingSingleEmail || !singleEmailTarget.trim()}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-1 disabled:opacity-50 transition-colors"
                        >
                          {sendingSingleEmail
                            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <IconSend />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button
                className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold py-3 px-4 rounded-xl transition-all"
                onClick={() => { setFacturaSeleccionada(null); setShowSingleEmailInput(false); setSingleEmailSent(false); setSingleEmailTarget(""); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk email modal ── */}
      {showBulkEmailModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-100 p-2 rounded-full">
                <IconMail />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Send Invoices by Email</h3>
                <p className="text-sm text-gray-500">{selectedIds.size} invoice{selectedIds.size !== 1 ? "s" : ""} selected</p>
              </div>
            </div>

            {bulkEmailSent ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="bg-emerald-100 rounded-full p-3">
                  <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="font-semibold text-emerald-700">Email sent successfully!</p>
                <p className="text-sm text-gray-500">{bulkEmailTarget}</p>
                <button
                  onClick={() => { setShowBulkEmailModal(false); setBulkEmailSent(false); setBulkEmailTarget(""); }}
                  className="mt-2 bg-gray-900 hover:bg-black text-white px-6 py-2 rounded-xl font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipient email</label>
                  <input
                    type="email"
                    value={bulkEmailTarget}
                    onChange={e => setBulkEmailTarget(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleBulkEmail()}
                    placeholder="admin@example.com"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleBulkEmail}
                    disabled={sendingBulkEmail || !bulkEmailTarget.trim()}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {sendingBulkEmail ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <IconSend />
                    )}
                    {sendingBulkEmail ? "Sending..." : "Send"}
                  </button>
                  <button
                    onClick={() => setShowBulkEmailModal(false)}
                    className="px-5 py-2.5 border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 font-semibold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
