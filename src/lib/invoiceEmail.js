// src/lib/invoiceEmail.js
// Builds the same branded invoice HTML Facturas.jsx sends, and the one call
// needed to email it for a given sale — shared so Ventas.jsx can offer
// "email the invoice" right when a sale closes, not just from the Facturas
// list afterward. Reads from facturas_ext (the same view Facturas.jsx uses),
// so a sale immediately has everything this needs the moment it's saved.
import { supabase } from "../supabaseClient";
import { getSaleTaxParts } from "./saleTax";

export function formatAddress(dir) {
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

export function formatPhone(phone) {
  if (!phone) return "-";
  const num = String(phone).replace(/\D/g, "");
  if (num.length === 10) return `(${num.substr(0,3)}) ${num.substr(3,3)}-${num.substr(6)}`;
  if (num.length === 11 && num[0] === "1") return `(${num.substr(1,3)}) ${num.substr(4,3)}-${num.substr(7)}`;
  return String(phone);
}

export async function fetchSaleTaxParts(ventaId, fallbackTotal) {
  try {
    const { data } = await supabase
      .from("ventas")
      .select("pago, total_venta, total")
      .eq("id", ventaId)
      .maybeSingle();
    if (data) return getSaleTaxParts(data);
  } catch { /* fall through to no-tax default below */ }
  return { subtotal: fallbackTotal, tax: 0, grand: fallbackTotal };
}

export function buildFullInvoiceHTML(factura, { pdfUrl = "", taxAmount = 0 } = {}) {
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
        <td style="padding:4px 0;text-align:right;font-size:13px;">${fmt(taxAmount)}</td>
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

// The one call Ventas.jsx needs: given a just-completed sale's id and a
// destination address, fetch its invoice data from facturas_ext (same
// source Facturas.jsx uses), build the branded HTML, and send it through
// the send-order-email function.
export async function sendInvoiceEmailForVenta(ventaId, toEmail) {
  const to = String(toEmail || "").trim();
  if (!to) return { ok: false, error: "No email address given" };
  if (!ventaId) return { ok: false, error: "No sale id" };

  const { data: factura, error: fetchError } = await supabase
    .from("facturas_ext")
    .select("*")
    .eq("id", ventaId)
    .maybeSingle();
  if (fetchError || !factura) {
    return { ok: false, error: fetchError?.message || "Invoice not found for this sale" };
  }

  const taxInfo = await fetchSaleTaxParts(ventaId, Number(factura.total || 0));
  const html = buildFullInvoiceHTML(factura, { taxAmount: taxInfo.tax });
  const invoiceNum = factura.numero_factura || factura.id?.slice(0, 8) || "";

  const { data, error } = await supabase.functions.invoke("send-order-email", {
    body: { to, subject: `Tools4Care Invoice ${invoiceNum}`, html },
  });
  if (error) return { ok: false, error: error.message || "Failed to send" };
  if (!data?.ok) return { ok: false, error: data?.error || "Failed to send" };
  return { ok: true };
}
