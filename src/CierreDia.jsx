// src/CierreDia.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
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
  // admite: item.pago (json), item.pagos_detalle (array), item.metodo_pago + monto
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

// Utilidad local: cargar logo como dataURL (PNG/SVG/JPG)
async function loadImageAsDataURL(src) {
  const res = await fetch(src, { cache: "no-cache" });
  const blob = await res.blob();
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/* ======================= PDF ======================= */
function generarPDFCierreDia({
  van,
  fecha,
  ventas = [],
  pagos = [],
  logoDataUrl, // NUEVO
  mode = "download", // "download" | "print"
}) {
  const doc = new jsPDF("p", "pt", "a4");
  const azul = "#0B4A6F",
    gris = "#333",
    claro = "#eaf3ff";

  // LOGO (opcional)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 36, 24, 80, 32, undefined, "FAST");
    } catch {}
  }
  const xLeft = logoDataUrl ? 36 + 90 : 36;

  // Encabezado
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

  // Totales rápidos
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

  // Tabla Ventas
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

  // Tabla Pagos/Avances
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

  // Preselección (hoy si está, si no el primero)
  const hoy = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    if (!fechas.length) return;
    setSelFecha((prev) =>
      prev && fechas.includes(prev) ? prev : fechas.includes(hoy) ? hoy : fechas[0]
    );
  }, [fechas]);

  // Cargar conteos por fecha
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

  function procesar() {
    if (!selFecha) return;
    localStorage.setItem("pre_cierre_fecha", selFecha);
    onCerrar?.({ fecha: selFecha });
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
      const logo = await loadImageAsDataURL("/logo.png"); // ajusta ruta si es necesario
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
        {/* By Register */}
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

        {/* By Date */}
        <div className="rounded-lg border p-3">
          <div className="font-semibold text-gray-800 mb-2">By Date</div>
          <div className="max-h-64 overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-blue-900">
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

        {/* By Day / Process */}
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
                disabled={!selFecha}
                type="button"
              >
                Process
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Start & End Times must be between 00:00 and 23:45 (day-based
            closeout).
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================= MODO CONFIRMACIÓN (TU ORIGINAL) ======================= */
function ConfirmModal({ resumen, onCerrar, onCancelar }) {
  const [observaciones, setObservaciones] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onCerrar({ observaciones });
  };

  if (!resumen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
      <div className="bg-white p-6 rounded-lg min-w-[320px] shadow-lg">
        <h2 className="text-lg font-bold mb-4">Cierre de Día</h2>
        <div className="mb-4">
          <strong>Ventas totales:</strong> {resumen.ventas} <br />
          <strong>Efectivo entregado:</strong> {resumen.efectivo} <br />
        </div>
        <form onSubmit={handleSubmit}>
          <label className="block mb-2">
            Observaciones:
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="border w-full p-2 mt-1"
              rows={3}
              placeholder="Opcional"
            />
          </label>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              className="bg-gray-200 px-4 py-2 rounded"
              onClick={onCancelar}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Confirmar Cierre
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ======================= EXPORT PÚBLICO ======================= */
export default function CierreDia(props) {
  const { mode, resumen, onCerrar, onCancelar } = props || {};
  if (mode === "pre" || !resumen) {
    return <PreCierre onCerrar={onCerrar} onCancelar={onCancelar} />;
  }
  return (
    <ConfirmModal resumen={resumen} onCerrar={onCerrar} onCancelar={onCancelar} />
  );
}
