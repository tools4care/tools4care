// src/Facturas.jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";

/* ===================== Utilities ===================== */
function formatAddress(dir) {
  if (!dir) return "-";
  if (typeof dir === "string") {
    try {
      if (dir.includes(",") && dir.match(/[A-Z]{2}\s*\d{5}/)) return dir;
      dir = JSON.parse(dir);
    } catch {
      return dir;
    }
  }
  const partes = [
    dir.calle && dir.calle.trim() ? dir.calle.trim() : null,
    dir.ciudad && dir.ciudad.trim() ? dir.ciudad.trim() : null,
    dir.estado && dir.estado.trim() ? dir.estado.trim() : null,
    dir.zip && dir.zip.trim() ? dir.zip.trim() : null,
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : "-";
}
function formatPhone(phone) {
  if (!phone) return "-";
  const num = String(phone).replace(/\D/g, "");
  if (num.length === 10) return `(${num.substr(0,3)}) ${num.substr(3,3)}-${num.substr(6)}`;
  if (num.length === 11 && num[0] === "1") return `(${num.substr(1,3)}) ${num.substr(4,3)}-${num.substr(7)}`;
  return String(phone);
}

/* ========== Normalización / fallbacks de detalle ========== */

// Normaliza filas de detalle (vengan de detalle_ventas o ventas.productos)
function normalizeDetalleRows(rows, productosMap) {
  return (rows || []).map((d) => {
    const pid = d.producto_id ?? d.producto ?? d.id;
    const prod = productosMap?.get?.(pid);

    const unit =
      d.precio_unitario != null
        ? Number(d.precio_unitario)
        : d.precio_unit != null
        ? Number(d.precio_unit)
        : d.precio != null
        ? Number(d.precio)
        : d.unit_price != null
        ? Number(d.unit_price)
        : 0;

    return {
      producto_id: pid,
      cantidad: Number(d.cantidad || 1),
      precio_unitario: Number(unit || 0),
      productos: prod
        ? { nombre: prod.nombre, codigo: prod.codigo }
        : d.productos
        ? { nombre: d.productos.nombre, codigo: d.productos.codigo }
        : null,
    };
  });
}

// Fallback: lee productos desde ventas.productos (JSON) y los enriquece con nombre/código
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
function descargarPDFFactura(factura) {
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

  doc.setTextColor(azul);
  doc.setFont("helvetica", "bold");
  doc.text("Product/Service Details", 36, 230);

  const body =
    factura.detalle_ventas && factura.detalle_ventas.length > 0
      ? factura.detalle_ventas.map((d) => {
          const nombre = d.productos?.nombre || d.producto_nombre || d.producto_id || "-";
          const qty = Number(d.cantidad || 1);
          const unit = Number(
            d.precio_unitario != null ? d.precio_unitario : d.precio_unit != null ? d.precio_unit : 0
          );
          const sub = unit * qty;
          return [nombre, qty, "$" + unit.toFixed(2), "$" + sub.toFixed(2)];
        })
      : [["-", "-", "-", "-"]];

  autoTable(doc, {
    startY: 240,
    head: [["Product", "Quantity", "Unit Price", "Subtotal"]],
    body,
    theme: "grid",
    headStyles: { fillColor: azul, textColor: "#fff", fontStyle: "bold" },
    styles: { fontSize: 10, lineColor: gris, textColor: "#333" },
    margin: { left: 36, right: 36 },
  });

  let totalY = doc.lastAutoTable.finalY + 25;
  doc.setFontSize(11);
  doc.setTextColor(azul);
  doc.text("Total:", 400, totalY);
  doc.setTextColor(negro);
  doc.text("$" + Number(factura.total_venta || 0).toFixed(2), 470, totalY);
  doc.setFontSize(10);
  doc.setTextColor("#444");
  doc.text(
    `Status: ${factura.estado_pago === "pagado" ? "Paid" : "Pending"}`,
    36,
    totalY + 25
  );

  let yPie = totalY + 55;
  doc.setDrawColor(gris);
  doc.line(36, yPie, 560, yPie);
  doc.setFontSize(8);
  doc.setTextColor("#666");
  doc.text(`Generated by TOOLS4CARE | ${new Date().toLocaleString("en-US")}`, 36, yPie + 15);
  doc.text("Valid document for US tax purposes. Consult your accountant.", 36, yPie + 30);
  doc.save(`Invoice_${factura.numero_factura || factura.id}.pdf`);
}

/* ===================== MAIN ===================== */
export default function Facturas() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);

  // Pagination
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);
  const [totalVentas, setTotalVentas] = useState(0);

  // Search filter
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    cargarFacturas();
    // eslint-disable-next-line
  }, [pagina, porPagina]);

  async function cargarFacturas() {
    setLoading(true);
    let query = supabase.from("facturas_ext").select("*", { count: "exact" });

    if (usuario?.rol !== "admin" && van?.id) {
      query = query.eq("van_id", van.id);
    }

    const desde = (pagina - 1) * porPagina;
    const hasta = desde + porPagina - 1;

    query = query.order("fecha", { ascending: false }).range(desde, hasta);

    const { data, count } = await query;
    setFacturas(data || []);
    setTotalVentas(count || 0);
    setLoading(false);
  }

  const facturasFiltradas = facturas.filter((f) => {
    const t1 = (f.cliente_nombre_c || "").toLowerCase();
    const t2 = (f.numero_factura || "").toLowerCase();
    const q = busqueda.toLowerCase();
    return t1.includes(q) || t2.includes(q);
  });

  /* === Carga perezosa del detalle (con fallbacks) === */
  useEffect(() => {
    if (!facturaSeleccionada) return;
    if (facturaSeleccionada.detalle_ventas) return;

    async function cargarDetalle() {
      const ventaId = facturaSeleccionada.id;

      // 1) detalle_ventas por venta_id con alias al precio
      let rows = [];
      try {
        const { data } = await supabase
          .from("detalle_ventas")
          .select("producto_id,cantidad,precio_unitario:precio_unit, productos(nombre,codigo)")
          .eq("venta_id", ventaId);
        rows = data || [];
      } catch {}

      // 2) mismo pero con columna nativa precio_unitario
      if (!rows.length) {
        try {
          const { data } = await supabase
            .from("detalle_ventas")
            .select("producto_id,cantidad,precio_unitario, productos(nombre,codigo)")
            .eq("venta_id", ventaId);
          rows = data || [];
        } catch {}
      }

      // 3) algunos esquemas usan FK 'venta' en lugar de 'venta_id'
      if (!rows.length) {
        try {
          const { data } = await supabase
            .from("detalle_ventas")
            .select("producto_id,cantidad,precio_unitario:precio_unit, productos(nombre,codigo)")
            .eq("venta", ventaId);
          rows = data || [];
        } catch {}
      }

      // 4) 🔥 Fallback definitivo: leer ventas.productos (JSON) y enriquecer
      if (!rows.length) {
        try {
          rows = await fetchDetalleFromVenta(ventaId);
        } catch {}
      }

      // Normalización final (soporta cualquiera de los casos)
      const normalizados = normalizeDetalleRows(rows);
      setFacturaSeleccionada((f) => (f ? { ...f, detalle_ventas: normalizados } : f));
    }

    cargarDetalle();
  }, [facturaSeleccionada]);

  const totalPaginas = Math.ceil(totalVentas / porPagina) || 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              🧾 Invoices (Sales)
            </h2>
            <span className="text-sm text-gray-500">
              Showing <b>{facturasFiltradas.length}</b> of <b>{facturas.length}</b> on this page
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input
              className="w-full sm:w-96 border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              placeholder="🔍 Search by client or invoice number"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <span className="hidden sm:inline text-xs text-gray-500">
              Page {pagina} / {totalPaginas}
            </span>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl shadow-lg p-0 overflow-hidden">
          {loading ? (
            <div className="p-8 text-blue-700 font-semibold">Loading invoices…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100/80 text-gray-700">
                    <th className="p-3 text-left">Number</th>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Client</th>
                    <th className="p-3 text-left">Total</th>
                    <th className="p-3 text-left">VAN</th>
                    <th className="p-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {facturasFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-8">
                        No results.
                      </td>
                    </tr>
                  )}
                  {facturasFiltradas.map((f) => (
                    <tr
                      key={f.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => setFacturaSeleccionada(f)}
                    >
                      <td className="p-3 font-mono text-gray-800">
                        {f.numero_factura || f.id?.slice(0, 8)}
                      </td>
                      <td className="p-3 text-gray-800">
                        {f.fecha ? new Date(f.fecha).toLocaleDateString("en-US") : ""}
                      </td>
                      <td className="p-3 text-gray-800">{f.cliente_nombre_c || "-"}</td>
                      <td className="p-3 text-gray-900 font-semibold">
                        ${Number(f.total_venta || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-gray-800">{f.nombre_van || "-"}</td>
                      <td className="p-3">
                        <span
                          className={
                            f.estado_pago === "pagado"
                              ? "inline-block px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold text-xs"
                              : "inline-block px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold text-xs"
                          }
                        >
                          {f.estado_pago === "pagado" ? "Paid" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginación */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
          <div className="text-xs text-gray-500">
            Total records: <b>{totalVentas}</b> · Per page: <b>{porPagina}</b>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-gray-200 to-gray-300 text-gray-800 font-medium shadow hover:shadow-md disabled:opacity-50"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina === 1}
            >
              ← Previous
            </button>
            <span className="px-3 py-1 rounded-full border text-xs text-gray-600 bg-white">
              Page {pagina} of {totalPaginas}
            </span>
            <button
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow hover:shadow-md disabled:opacity-50"
              onClick={() => setPagina((p) => p + 1)}
              disabled={pagina >= totalPaginas}
            >
              Next →
            </button>
          </div>
        </div>

        {/* Modal Detalle */}
        {facturaSeleccionada && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-3 flex items-center justify-between">
                <h3 className="font-bold text-lg tracking-tight">Invoice Details</h3>
                <button
                  className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"
                  onClick={() => setFacturaSeleccionada(null)}
                >
                  ✖️
                </button>
              </div>

              <div className="p-5 text-sm text-gray-700 space-y-2">
                <div><b>Invoice Number:</b> {facturaSeleccionada.numero_factura || facturaSeleccionada.id}</div>
                <div><b>Date:</b> {facturaSeleccionada.fecha ? new Date(facturaSeleccionada.fecha).toLocaleDateString("en-US") : ""}</div>
                <div><b>Client:</b> {facturaSeleccionada.cliente_nombre_c || "-"}</div>
                <div><b>Address:</b> {formatAddress(facturaSeleccionada.cliente_direccion)}</div>
                <div><b>Phone:</b> {formatPhone(facturaSeleccionada.cliente_telefono)}</div>
                <div><b>Email:</b> {facturaSeleccionada.cliente_email || "-"}</div>
                <div><b>Total:</b> ${Number(facturaSeleccionada.total_venta || 0).toFixed(2)}</div>
                <div><b>VAN:</b> {facturaSeleccionada.nombre_van || "-"}</div>
                <div>
                  <b>Status:</b>{" "}
                  <span
                    className={
                      facturaSeleccionada.estado_pago === "pagado"
                        ? "inline-block px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold text-xs ml-2"
                        : "inline-block px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold text-xs ml-2"
                    }
                  >
                    {facturaSeleccionada.estado_pago === "pagado" ? "Paid" : "Pending"}
                  </span>
                </div>

                <div className="mt-3">
                  <b>Products:</b>
                  <ul className="list-disc ml-6 space-y-1 mt-1">
                    {(facturaSeleccionada.detalle_ventas || []).map((item, idx) => (
                      <li key={idx}>
                        {(item.productos?.nombre || item.producto_nombre || item.producto_id || "-")}
                        {" x "}
                        {item.cantidad || 1}
                        {" @ $"}
                        {Number(item.precio_unitario != null ? item.precio_unitario : item.precio_unit || 0).toFixed(2)}
                      </li>
                    ))}
                    {(facturaSeleccionada.detalle_ventas || []).length === 0 && (
                      <li className="text-gray-400">No products</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="p-5 pt-0 flex flex-col gap-2">
                <button
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-2.5 px-4 rounded-lg shadow-md disabled:opacity-50"
                  onClick={() => descargarPDFFactura(facturaSeleccionada)}
                  disabled={!facturaSeleccionada.detalle_ventas}
                >
                  ⬇️ Download PDF
                </button>
                <button
                  className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2.5 px-4 rounded-lg"
                  onClick={() => setFacturaSeleccionada(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
