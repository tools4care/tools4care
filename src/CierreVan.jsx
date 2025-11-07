// src/CierreVan_UPDATED.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* ======================= CONSTANTES ======================= */
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

/* ======================= FECHAS Y FORMATO ======================= */
const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const pad2 = (n) => String(n).padStart(2, "0");
const isYMD = (str) => typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str);
const ymdFromDateLocal = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const toUSFromYMD = (ymd) => {
  if (!isYMD(ymd)) return "—";
  const [y, m, d] = ymd.split("-");
  return `${m}/${d}/${y}`;
};

/* ============ Helpers visuales para Expected y Delta (chips) ============ */
const format = (n) => fmt.format(Number(n || 0));

const deltaInfo = (countedVal, expectedVal) => {
  const c = Number(countedVal || 0);
  const e = Number(expectedVal || 0);
  const d = c - e;
  if (!isFinite(d)) return { label: "", cls: "" };
  if (Math.abs(d) < 0.005) return { label: "Match", cls: "bg-green-100 text-green-700 border-green-300" };
  if (d < 0) return { label: `Short ${format(Math.abs(d))}`, cls: "bg-red-100 text-red-700 border-red-300" };
  return { label: `Over ${format(Math.abs(d))}`, cls: "bg-amber-100 text-amber-700 border-amber-300" };
};

const Pill = ({ children, className = "" }) => (
  <span className={`inline-flex items-center px-2 py-[2px] rounded-full text-xs border ${className}`}>{children}</span>
);

/* ======================= UTILIDADES DE PAGO ======================= */
function breakdownPorMetodo(item) {
  const out = { cash: 0, card: 0, transfer: 0, other: 0 };
  if (item.pago_efectivo !== undefined) out.cash += Number(item.pago_efectivo || 0);
  if (item.pago_tarjeta !== undefined) out.card += Number(item.pago_tarjeta || 0);
  if (item.pago_transferencia !== undefined) out.transfer += Number(item.pago_transferencia || 0);
  if (item.pago_otro !== undefined) out.other += Number(item.pago_otro || 0);
  if (item.efectivo !== undefined) out.cash += Number(item.efectivo || 0);
  if (item.tarjeta !== undefined) out.card += Number(item.tarjeta || 0);
  if (item.transferencia !== undefined) out.transfer += Number(item.transferencia || 0);
  const candidates = [item?.pago, item?.payment_details, item?.metodos];
  for (let cand of candidates) {
    if (!cand) continue;
    try { if (typeof cand === "string") cand = JSON.parse(cand); } catch {}
    if (Array.isArray(cand)) {
      for (const r of cand) {
        const metodo = String(r?.metodo || "").toLowerCase();
        const monto = Number(r?.monto || 0);
        if (metodo.includes("cash") || metodo.includes("efectivo")) out.cash += monto;
        else if (metodo.includes("card") || metodo.includes("tarjeta")) out.card += monto;
        else if (metodo.includes("transfer")) out.transfer += monto;
        else out.other += monto;
      }
    }
  }
  return out;
}
function breakdownPago(pago) {
  const out = { cash: 0, card: 0, transfer: 0, other: 0 };
  const metodo = String(pago.metodo_pago || "").toLowerCase();
  const monto = Number(pago.monto || 0);
  if (metodo.includes("efectivo") || metodo.includes("cash")) out.cash = monto;
  else if (metodo.includes("tarjeta") || metodo.includes("card")) out.card = monto;
  else if (metodo.includes("transfer")) out.transfer = monto;
  else out.other = monto;
  return out;
}

/* ======================= HOOK: DATOS CIERRE (modo normal) ======================= */
function useDatosCierre(vanId, fechaInicio, fechaFin) {
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!vanId || !fechaInicio || !fechaFin) { setVentas([]); setPagos([]); return; }
    setLoading(true); setError(null);
    (async () => {
      try {
        const inicioYMD = isYMD(fechaInicio) ? fechaInicio : ymdFromDateLocal(fechaInicio);
        const finYMD = isYMD(fechaFin) ? fechaFin : ymdFromDateLocal(fechaFin);
        const inicioTS = `${inicioYMD} 00:00:00`;
        const finTS = `${finYMD} 23:59:59.999`;

        const { data: ventasData, error: ventasError } = await supabase
          .from("ventas")
          .select(`*, clientes!ventas_cliente_id_fkey(nombre)`)
          .eq("van_id", vanId)
          .gte("fecha", inicioTS)
          .lte("fecha", finTS)
          .is("cierre_id", null)
          .order("fecha", { ascending: false });
        if (ventasError) throw ventasError;

        const { data: pagosData, error: pagosError } = await supabase
          .from("pagos")
          .select(`*, clientes!pagos_cliente_id_fkey(nombre)`)
          .eq("van_id", vanId)
          .gte("fecha_pago", inicioTS)
          .lte("fecha_pago", finTS)
          .is("cierre_id", null)
          .order("fecha_pago", { ascending: false });
        if (pagosError) throw pagosError;

        setVentas(ventasData?.map((v) => ({ ...v, cliente_nombre: v.clientes?.nombre || "Sin nombre" })) || []);
        setPagos(pagosData?.map((p) => ({ ...p, cliente_nombre: p.clientes?.nombre || "Sin nombre" })) || []);
      } catch {
        setError("Error al cargar los datos. Por favor, intente de nuevo.");
      } finally { setLoading(false); }
    })();
  }, [vanId, fechaInicio, fechaFin]);

  return { ventas, pagos, loading, error };
}

/* ======================= MODAL DESGLOSE EFECTIVO ======================= */
function ModalDesglose({ open, initial, onClose, onSave }) {
  const [billetes, setBilletes] = useState(
    (initial && initial.length ? initial : DENOMINACIONES).map((d) => ({ ...d, cantidad: d.cantidad ?? "" }))
  );
  useEffect(() => {
    if (open) {
      const start = (initial && initial.length ? initial : DENOMINACIONES).map((d) => ({ ...d, cantidad: d.cantidad ?? "" }));
      setBilletes(start);
    }
  }, [open, initial]);

  const total = billetes.reduce((t, b) => t + Number(b.cantidad || 0) * b.valor, 0);
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 shadow-xl w-[420px] max-w-full max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4 text-blue-800">Cash Breakdown</h2>
        <table className="w-full mb-4">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Denomination</th>
              <th className="text-center py-2">Count</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {billetes.map((b, i) => (
              <tr key={b.nombre} className="border-b">
                <td className="py-2">{b.nombre}</td>
                <td className="py-2 text-center">
                  <input
                    type="number" min="0"
                    className="border p-1 w-20 rounded text-center"
                    value={b.cantidad}
                    onChange={(e) => {
                      const nuevo = [...billetes];
                      nuevo[i].cantidad = e.target.value;
                      setBilletes(nuevo);
                    }}
                  />
                </td>
                <td className="py-2 text-right text-gray-600">{fmt.format(b.valor * Number(b.cantidad || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mb-4 p-3 bg-blue-50 rounded text-right">
          <span className="font-bold text-lg text-blue-800">Total: {fmt.format(total)}</span>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
          <button onClick={() => onSave({ total, billetes })} className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800">Use This Total</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= COMPONENTE PRINCIPAL ======================= */
export default function CierreVan() {
  const navigate = useNavigate();
  const { usuario } = useUsuario();
  const { van } = useVan();

  if (!van || !van.id) {
    return (
      <div className="max-w-4xl mx-auto mt-10 p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <h2 className="text-lg font-bold mb-2">No se encontró una van asignada</h2>
        </div>
      </div>
    );
  }

  /* ====== Fechas del pre-cierre (modo normal) ====== */
  const readPreFechas = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("pre_cierre_fechas") || "[]");
      if (Array.isArray(saved) && saved.length > 0) return [...saved].sort();
    } catch {}
    return [ymdFromDateLocal(new Date())];
  };

  // inicialización sincrónica desde localStorage (evita “hoy” por defecto)
  const [fechasSeleccionadas, setFechasSeleccionadas] = useState(() => readPreFechas());
  const [fechaInicio, setFechaInicio] = useState(() => fechasSeleccionadas[0]);
  const [fechaFin, setFechaFin] = useState(
    () => fechasSeleccionadas[fechasSeleccionadas.length - 1] || fechasSeleccionadas[0]
  );

  // si cambian las fechas (por navegación desde Pre-cierre), re-sincroniza si NO estás viendo un cierre bloqueado
  const [viewClose, setViewClose] = useState(null);
  useEffect(() => {
    if (!viewClose && fechasSeleccionadas.length > 0) {
      setFechaInicio(fechasSeleccionadas[0]);
      setFechaFin(fechasSeleccionadas[fechasSeleccionadas.length - 1] || fechasSeleccionadas[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechasSeleccionadas]);

  // al montar, refresca por si cambió en otra pantalla
  useEffect(() => {
    setFechasSeleccionadas(readPreFechas());
  }, []);

  /* ====== Buscador OPCIONAL ====== */
  const [showSearch, setShowSearch] = useState(false);
  const [searchStart, setSearchStart] = useState(fechaInicio);
  const [searchEnd, setSearchEnd] = useState(fechaFin);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const openSearch = () => setShowSearch((s) => !s);

  const handleSearchCloseout = async () => {
    if (!isYMD(searchStart) || !isYMD(searchEnd)) return;
    setLoadingSearch(true);
    try {
      const { data, error } = await supabase
        .from("cierres_van")
        .select("*")
        .eq("van_id", van.id)
        .lte("fecha_inicio", searchEnd)
        .gte("fecha_fin", searchStart)
        .order("fecha_inicio", { ascending: true });
      if (error) throw error;
      setSearchResults(data || []);
      setViewClose(null);
    } catch {
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handlePickCloseout = (c) => {
    setFechaInicio(c.fecha_inicio);
    setFechaFin(c.fecha_fin);
    setViewClose(c);
    setCounted({
      cash: c.efectivo_real ?? "",
      card: c.tarjeta_real ?? "",
      transfer: c.transferencia_real ?? "",
      other: "",
    });
    setComentario(c.comentario ?? "");
  };

  const exitViewMode = () => {
    setViewClose(null);
    setComentario("");
    setCounted({ cash: "", card: "", transfer: "", other: "" });
    // volver al rango seleccionado en Pre-cierre
    const first = fechasSeleccionadas[0];
    const last = fechasSeleccionadas[fechasSeleccionadas.length - 1] || first;
    setFechaInicio(first);
    setFechaFin(last);
  };

  /* ====== Datos del periodo actual (modo normal) ====== */
  const { ventas, pagos, loading, error } = useDatosCierre(van.id, fechaInicio, fechaFin);

  const ventasConDesglose = useMemo(
    () =>
      ventas.map((v) => {
        const breakdown = breakdownPorMetodo(v);
        const totalVenta = Number(v.total || v.total_venta || 0);
        const totalPagado = Number(v.total_pagado || 0);
        const balance = Math.max(0, totalVenta - totalPagado);
        return { ...v, ...breakdown, total_venta: totalVenta, total_pagado: totalPagado, balance };
      }),
    [ventas]
  );
  const pagosConDesglose = useMemo(
    () => pagos.map((p) => ({ ...p, ...breakdownPago(p), monto: Number(p.monto || 0) })),
    [pagos]
  );

  const totales = useMemo(() => {
    const totalVentas = ventasConDesglose.reduce((t, v) => t + v.total_venta, 0);
    const totalPagado = ventasConDesglose.reduce((t, v) => t + v.total_pagado, 0);
    const balanceDue = ventasConDesglose.reduce((t, v) => t + v.balance, 0);
    const cashVentas = ventasConDesglose.reduce((t, v) => t + v.cash, 0);
    const cardVentas = ventasConDesglose.reduce((t, v) => t + v.card, 0);
    const transferVentas = ventasConDesglose.reduce((t, v) => t + v.transfer, 0);
    const otherVentas = ventasConDesglose.reduce((t, v) => t + (v.other || 0), 0);
    const cashPagos = pagosConDesglose.reduce((t, p) => t + p.cash, 0);
    const cardPagos = pagosConDesglose.reduce((t, p) => t + p.card, 0);
    const transferPagos = pagosConDesglose.reduce((t, p) => t + p.transfer, 0);
    const otherPagos = pagosConDesglose.reduce((t, p) => t + (p.other || 0), 0);
    return {
      totalVentas, totalPagado, balanceDue,
      cash: cashVentas + cashPagos,
      card: cardVentas + cardPagos,
      transfer: transferVentas + transferPagos,
      other: otherVentas + otherPagos,
      ventasEfectivo: cashVentas,
      ventasTarjeta: cardVentas,
      ventasTransfer: transferVentas,
      ventasOther: otherVentas,
      pagosEfectivo: cashPagos,
      pagosTarjeta: cardPagos,
      pagosTransfer: transferPagos,
      pagosOther: otherPagos,
    };
  }, [ventasConDesglose, pagosConDesglose]);

  /* ====== Contado / desglose ====== */
  const [cashBreakdown, setCashBreakdown] = useState(() => {
    try {
      const s = localStorage.getItem("cierre_cash_breakdown");
      if (!s) return DENOMINACIONES.map((d) => ({ ...d, cantidad: "" }));
      const arr = JSON.parse(s);
      return DENOMINACIONES.map((d) => {
        const found = arr.find((x) => x.nombre === d.nombre);
        return { ...d, cantidad: found?.cantidad ?? "" };
      });
    } catch { return DENOMINACIONES.map((d) => ({ ...d, cantidad: "" })); }
  });
  const totalCashBreakdown = useMemo(
    () => cashBreakdown.reduce((t, b) => t + Number(b.cantidad || 0) * b.valor, 0),
    [cashBreakdown]
  );

  const [counted, setCounted] = useState({ cash: "", card: "", transfer: "", other: "" });
  const [comentario, setComentario] = useState("");
  const [openDesglose, setOpenDesglose] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  /* ====== Validación: bloquear guardar hasta llenar datos ====== */
  const requireOther = totales.other > 0;
  const isNumberLike = (v) => v !== "" && !isNaN(Number(v)) && Number(v) >= 0;
  const isFormReady =
    !viewClose &&
    isNumberLike(counted.cash) &&
    isNumberLike(counted.card) &&
    isNumberLike(counted.transfer) &&
    (!requireOther || isNumberLike(counted.other));

  /* ======================= GUARDAR CIERRE ======================= */
  const guardarCierre = async (e) => {
    e.preventDefault();
    if (!van?.id || viewClose || !isFormReady) return;
    setGuardando(true);
    const payload = {
      van_id: van.id,
      usuario_id: usuario?.id,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      comentario,
      efectivo_esperado: totales.cash,
      tarjeta_esperado: totales.card,
      transferencia_esperado: totales.transfer,
      efectivo_real: Number(counted.cash || 0),
      tarjeta_real: Number(counted.card || 0),
      transferencia_real: Number(counted.transfer || 0),
      cuentas_por_cobrar: totales.balanceDue,
      ventas_ids: ventasConDesglose.map((v) => v.id),
      pagos_ids: pagosConDesglose.map((p) => p.id),
    };
    const { data, error } = await supabase.from("cierres_van").insert([payload]).select().maybeSingle();
    if (error) { setMensaje("Error: " + error.message); setGuardando(false); return; }

    if (data?.id) {
      if (ventasConDesglose.length > 0)
        await supabase.from("ventas").update({ cierre_id: data.id }).in("id", ventasConDesglose.map((v) => v.id));
      if (pagosConDesglose.length > 0)
        await supabase.from("pagos").update({ cierre_id: data.id }).in("id", pagosConDesglose.map((p) => p.id));
    }

    setMensaje("✅ Closeout saved successfully!");
    setGuardando(false);
    try {
      localStorage.removeItem("pre_cierre_fechas");
      localStorage.removeItem("pre_cierre_fecha");
      localStorage.setItem("cierre_cash_breakdown", JSON.stringify(cashBreakdown));
    } catch {}
    setTimeout(() => navigate("/cierres/historial"), 1200);
  };

  /* ======================= PDF ======================= */
  const imprimirPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const title = `End of Day Register Closeout`;
    const subtitle = `${van?.nombre || "Van"} — ${toUSFromYMD(fechaInicio)} to ${toUSFromYMD(fechaFin)}`;
    doc.setFontSize(16); doc.text(title, 40, 40);
    doc.setFontSize(11); doc.text(subtitle, 40, 60);
    const totalDiferencia =
      (Number(counted.cash || 0) - totales.cash) +
      (Number(counted.card || 0) - totales.card) +
      (Number(counted.transfer || 0) - totales.transfer) +
      (Number(counted.other || 0) - totales.other);

    autoTable(doc, {
      startY: 80,
      head: [["Metric", "Amount"]],
      body: [
        ["Total Sales", fmt.format(totales.totalVentas)],
        ["Total Paid on Sales", fmt.format(totales.totalPagado)],
        ["A/R Generated", fmt.format(totales.balanceDue)],
        ["Cash Expected", fmt.format(totales.cash)],
        ["Card Expected", fmt.format(totales.card)],
        ["Transfer Expected", fmt.format(totales.transfer)],
        ...(totales.other > 0 ? [["Other Expected", fmt.format(totales.other)]] : []),
        ["Cash Counted", fmt.format(Number(counted.cash || 0))],
        ["Card Counted", fmt.format(Number(counted.card || 0))],
        ["Transfer Counted", fmt.format(Number(counted.transfer || 0))],
        ...(counted.other ? [["Other Counted", fmt.format(Number(counted.other || 0))]] : []),
        [totalDiferencia >= 0 ? "OVERAGE" : "SHORTAGE", fmt.format(Math.abs(totalDiferencia))],
      ],
      theme: "striped", styles: { fontSize: 10 }, headStyles: { fillColor: [30, 64, 175] },
    });
    autoTable(doc, {
      head: [["Denomination", "Count", "Total"]],
      body: cashBreakdown.map((b) => [b.nombre, String(b.cantidad || 0), fmt.format((Number(b.cantidad || 0) || 0) * b.valor)]),
      theme: "grid", styles: { fontSize: 10 }, headStyles: { fillColor: [21, 128, 61] }, startY: doc.lastAutoTable.finalY + 15,
    });
    if (ventasConDesglose.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [["Date", "Client", "Total", "Paid", "Balance", "Cash", "Card", "Transfer"]],
        body: ventasConDesglose.map((v) => [
          toUSFromYMD((v.fecha || "").slice(0, 10)), v.cliente_nombre || "-", fmt.format(v.total_venta),
          fmt.format(v.total_pagado), fmt.format(v.balance), fmt.format(v.cash), fmt.format(v.card), fmt.format(v.transfer),
        ]),
        theme: "striped", styles: { fontSize: 9 }, headStyles: { fillColor: [59, 130, 246] },
      });
    }
    if (pagosConDesglose.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [["Date", "Client", "Amount", "Cash", "Card", "Transfer", "Reference"]],
        body: pagosConDesglose.map((p) => [
          toUSFromYMD((p.fecha_pago || "").slice(0, 10)), p.cliente_nombre || "-", fmt.format(p.monto),
          fmt.format(p.cash), fmt.format(p.card), fmt.format(p.transfer), p.referencia || "-",
        ]),
        theme: "striped", styles: { fontSize: 9 }, headStyles: { fillColor: [16, 185, 129] },
      });
    }
    doc.save(`closeout_${van?.nombre || "van"}_${fechaInicio}_to_${fechaFin}.pdf`);
  };

  /* ======================= UI ======================= */
  if (loading) return <div className="max-w-4xl mx-auto mt-10 p-6 text-center text-blue-600">Loading...</div>;
  if (error) return <div className="max-w-4xl mx-auto mt-10 p-6 bg-red-100 text-red-700 rounded">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto mt-10 bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-900 mb-1">End of Day Register Closeout</h1>
          <div className="text-sm text-gray-600">
            <span className="font-semibold">Period:</span> {toUSFromYMD(fechaInicio)} to {toUSFromYMD(fechaFin)}
            <span className="ml-4 font-semibold">Van:</span> {van?.nombre || "—"}
            {viewClose
              ? <span className="ml-2 text-indigo-700 font-semibold">(VIEW MODE • locked)</span>
              : <span className="ml-2 text-emerald-700 font-semibold">(NORMAL MODE)</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openSearch} className="px-4 py-2 bg-gray-100 border rounded hover:bg-gray-200">
            {showSearch ? "Hide Search" : "🔎 Search Closeout"}
          </button>
          {viewClose && (
            <button type="button" onClick={exitViewMode} className="px-4 py-2 bg-white border rounded hover:bg-gray-100">
              Exit view
            </button>
          )}
          <button type="button" onClick={imprimirPDF} className="px-4 py-2 bg-indigo-700 text-white rounded hover:bg-indigo-800">
            🖨️ Print PDF
          </button>
        </div>
      </div>

      {/* Buscador OPCIONAL */}
      {showSearch && (
        <div className="mb-6 rounded-xl border bg-neutral-50 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Start (YYYY-MM-DD)</label>
              <input type="date" value={searchStart} onChange={(e) => setSearchStart(e.target.value)} className="border p-2 rounded w-full" />
              <div className="text-[11px] text-gray-500 mt-1">Shown as {toUSFromYMD(searchStart)}</div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">End (YYYY-MM-DD)</label>
              <input type="date" value={searchEnd} onChange={(e) => setSearchEnd(e.target.value)} className="border p-2 rounded w-full" />
              <div className="text-[11px] text-gray-500 mt-1">Shown as {toUSFromYMD(searchEnd)}</div>
            </div>
            <div className="flex sm:block">
              <button
                onClick={handleSearchCloseout}
                type="button"
                disabled={loadingSearch}
                className="w-full sm:w-auto px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
              >
                {loadingSearch ? "Loading..." : "Load"}
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border rounded">
                <thead>
                  <tr className="bg-white">
                    <th className="p-2 text-left">Closeout</th>
                    <th className="p-2 text-left">User</th>
                    <th className="p-2 text-right">Cash</th>
                    <th className="p-2 text-right">Card</th>
                    <th className="p-2 text-right">Transfer</th>
                    <th className="p-2 text-right">A/R</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-gray-50">
                      <td className="p-2">
                        {toUSFromYMD(c.fecha_inicio)} — {toUSFromYMD(c.fecha_fin)} <span className="text-xs text-gray-500">(locked)</span>
                      </td>
                      <td className="p-2">{c.usuario_id || "—"}</td>
                      <td className="p-2 text-right">{fmt.format(c.efectivo_real ?? 0)}</td>
                      <td className="p-2 text-right">{fmt.format(c.tarjeta_real ?? 0)}</td>
                      <td className="p-2 text-right">{fmt.format(c.transferencia_real ?? 0)}</td>
                      <td className="p-2 text-right">{fmt.format(c.cuentas_por_cobrar ?? 0)}</td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => handlePickCloseout(c)} className="px-3 py-1 bg-white border rounded hover:bg-gray-100">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-gray-600 mt-1">
                Showing {searchResults.length} results inside {toUSFromYMD(searchStart)} to {toUSFromYMD(searchEnd)}. Select one to view it.
              </div>
            </div>
          )}
        </div>
      )}

      {/* RESUMEN */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200">
        <h2 className="text-lg font-bold text-blue-800 mb-3">📊 Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-3 border shadow-sm">
            <div className="text-[11px] text-gray-600 uppercase font-semibold">Total Sales</div>
            <div className="text-xl font-extrabold">{fmt.format(totales.totalVentas)}</div>
            <div className="text-[11px] text-gray-500">{ventasConDesglose.length} transactions</div>
          </div>
          <div className="bg-white rounded-lg p-3 border shadow-sm">
            <div className="text-[11px] text-gray-600 uppercase font-semibold">Total Paid</div>
            <div className="text-xl font-extrabold text-green-700">{fmt.format(totales.totalPagado)}</div>
            <div className="text-[11px] text-gray-500">On sales</div>
          </div>
          <div className="bg-white rounded-lg p-3 border shadow-sm">
            <div className="text-[11px] text-gray-600 uppercase font-semibold">Customer Payments</div>
            <div className="text-xl font-extrabold text-emerald-700">
              {fmt.format(pagosConDesglose.reduce((t, p) => t + p.monto, 0))}
            </div>
            <div className="text-[11px] text-gray-500">{pagosConDesglose.length} payments</div>
          </div>
          <div className="bg-white rounded-lg p-3 border shadow-sm">
            <div className="text-[11px] text-orange-700 uppercase font-semibold">A/R Generated</div>
            <div className="text-xl font-extrabold text-orange-700">{fmt.format(totales.balanceDue)}</div>
            <div className="text-[11px] text-gray-500">Accounts Receivable</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
            <div className="text-[11px] text-green-700 font-semibold">Cash Expected</div>
            <div className="text-lg font-bold text-green-800">{fmt.format(totales.cash)}</div>
            <div className="text-[11px] text-green-700 mt-1">
              Sales: {fmt.format(totales.ventasEfectivo)}<br />Payments: {fmt.format(totales.pagosEfectivo)}
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <div className="text-[11px] text-blue-700 font-semibold">Card Expected</div>
            <div className="text-lg font-bold text-blue-800">{fmt.format(totales.card)}</div>
            <div className="text-[11px] text-blue-700 mt-1">
              Sales: {fmt.format(totales.ventasTarjeta)}<br />Payments: {fmt.format(totales.pagosTarjeta)}
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded p-2 text-center">
            <div className="text-[11px] text-purple-700 font-semibold">Transfer Expected</div>
            <div className="text-lg font-bold text-purple-800">{fmt.format(totales.transfer)}</div>
            <div className="text-[11px] text-purple-700 mt-1">
              Sales: {fmt.format(totales.ventasTransfer)}<br />Payments: {fmt.format(totales.pagosTransfer)}
            </div>
          </div>
          {totales.other > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
              <div className="text-[11px] text-gray-700 font-semibold">Other Expected</div>
              <div className="text-lg font-bold text-gray-800">{fmt.format(totales.other)}</div>
            </div>
          )}
        </div>
      </div>

      {/* TABLAS */}
      {ventasConDesglose.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-blue-800 mb-3">🛒 Sales Detail</h2>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-100">
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Client</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">Paid</th>
                  <th className="p-2 text-right text-red-600">Balance</th>
                  <th className="p-2 text-right">Cash</th>
                  <th className="p-2 text-right">Card</th>
                  <th className="p-2 text-right">Transfer</th>
                </tr>
              </thead>
              <tbody>
                {ventasConDesglose.map((v) => (
                  <tr key={v.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">{toUSFromYMD((v.fecha || "").slice(0, 10))}</td>
                    <td className="p-2">{v.cliente_nombre || "-"}</td>
                    <td className="p-2 text-right">{fmt.format(v.total_venta)}</td>
                    <td className="p-2 text-right text-green-600">{fmt.format(v.total_pagado)}</td>
                    <td className="p-2 text-right text-red-600 font-bold">{fmt.format(v.balance)}</td>
                    <td className="p-2 text-right">{fmt.format(v.cash)}</td>
                    <td className="p-2 text-right">{fmt.format(v.card)}</td>
                    <td className="p-2 text-right">{fmt.format(v.transfer)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-50 font-bold">
                <tr>
                  <td colSpan={2} className="p-2">TOTALS</td>
                  <td className="p-2 text-right">{fmt.format(totales.totalVentas)}</td>
                  <td className="p-2 text-right text-green-600">{fmt.format(totales.totalPagado)}</td>
                  <td className="p-2 text-right text-red-600">{fmt.format(totales.balanceDue)}</td>
                  <td className="p-2 text-right">{fmt.format(totales.ventasEfectivo)}</td>
                  <td className="p-2 text-right">{fmt.format(totales.ventasTarjeta)}</td>
                  <td className="p-2 text-right">{fmt.format(totales.ventasTransfer)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {pagosConDesglose.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-emerald-800 mb-3">💰 Customer Payments (A/R)</h2>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-emerald-100">
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
                {pagosConDesglose.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">{toUSFromYMD((p.fecha_pago || "").slice(0, 10))}</td>
                    <td className="p-2">{p.cliente_nombre || "-"}</td>
                    <td className="p-2 text-right">{fmt.format(p.monto)}</td>
                    <td className="p-2 text-right">{fmt.format(p.cash)}</td>
                    <td className="p-2 text-right">{fmt.format(p.card)}</td>
                    <td className="p-2 text-right">{fmt.format(p.transfer)}</td>
                    <td className="p-2">{p.referencia || "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-emerald-50 font-bold">
                <tr>
                  <td colSpan={2} className="p-2">TOTALS</td>
                  <td className="p-2 text-right">{fmt.format(pagosConDesglose.reduce((t, p) => t + p.monto, 0))}</td>
                  <td className="p-2 text-right">{fmt.format(totales.pagosEfectivo)}</td>
                  <td className="p-2 text-right">{fmt.format(totales.pagosTarjeta)}</td>
                  <td className="p-2 text-right">{fmt.format(totales.pagosTransfer)}</td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* FORMULARIO DE CIERRE */}
      <form onSubmit={guardarCierre} className="space-y-4">
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
          <h2 className="text-lg font-bold text-yellow-900 mb-3">💵 Count Your Cash & Payments</h2>

          {/* Resumen desglose + botón junto a Cash */}
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Cash breakdown:</span>
              <button
                type="button"
                className="px-2 py-1 text-sm bg-blue-100 border border-blue-300 rounded"
                onClick={() => setOpenDesglose(true)}
                title="Edit breakdown"
                disabled={!!viewClose}
              >
                Edit
              </button>
              <span className="text-sm text-gray-600">Total by breakdown: <b>{fmt.format(totalCashBreakdown)}</b></span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {cashBreakdown.filter((b) => Number(b.cantidad || 0) > 0).map((b) => (
                <span key={b.nombre} className="px-2 py-1 rounded-full text-xs bg-white border shadow-sm">
                  {b.nombre}: {b.cantidad} → {fmt.format(b.valor * Number(b.cantidad))}
                </span>
              ))}
              {cashBreakdown.every((b) => !Number(b.cantidad || 0)) && (
                <span className="text-xs text-gray-500">No breakdown entered yet</span>
              )}
            </div>
          </div>

          {/* === Inputs con Expected y Δ diff === */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* CASH */}
            <div>
              <label className="block text-sm font-bold mb-1">
                Cash Counted:
                <span className="ml-2">
                  <Pill className="bg-green-50 text-green-700 border-green-200">Expected {format(totales.cash)}</Pill>
                </span>
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number" step="0.01" className="border p-2 rounded flex-1"
                  value={counted.cash} onChange={(e) => setCounted({ ...counted, cash: e.target.value })} required disabled={!!viewClose}
                />
                <button
                  type="button" className="px-3 bg-blue-100 border border-blue-300 rounded text-sm"
                  onClick={() => setOpenDesglose(true)} title="Count by denominations" disabled={!!viewClose}
                >
                  💵
                </button>
              </div>
              <div className="mt-1">
                {(() => {
                  const { label, cls } = deltaInfo(counted.cash, totales.cash);
                  return label ? <Pill className={cls}>{label}</Pill> : null;
                })()}
              </div>
            </div>

            {/* CARD */}
            <div>
              <label className="block text-sm font-bold mb-1">
                Card Counted:
                <span className="ml-2">
                  <Pill className="bg-blue-50 text-blue-700 border-blue-200">Expected {format(totales.card)}</Pill>
                </span>
              </label>
              <input
                type="number" step="0.01" className="border p-2 rounded w-full"
                value={counted.card} onChange={(e) => setCounted({ ...counted, card: e.target.value })} required disabled={!!viewClose}
              />
              <div className="mt-1">
                {(() => {
                  const { label, cls } = deltaInfo(counted.card, totales.card);
                  return label ? <Pill className={cls}>{label}</Pill> : null;
                })()}
              </div>
            </div>

            {/* TRANSFER */}
            <div>
              <label className="block text-sm font-bold mb-1">
                Transfer Counted:
                <span className="ml-2">
                  <Pill className="bg-purple-50 text-purple-700 border-purple-200">Expected {format(totales.transfer)}</Pill>
                </span>
              </label>
              <input
                type="number" step="0.01" className="border p-2 rounded w-full"
                value={counted.transfer} onChange={(e) => setCounted({ ...counted, transfer: e.target.value })} required disabled={!!viewClose}
              />
              <div className="mt-1">
                {(() => {
                  const { label, cls } = deltaInfo(counted.transfer, totales.transfer);
                  return label ? <Pill className={cls}>{label}</Pill> : null;
                })()}
              </div>
            </div>

            {/* OTHER (si aplica) */}
            {totales.other > 0 && (
              <div>
                <label className="block text-sm font-bold mb-1">
                  Other Counted:
                  <span className="ml-2">
                    <Pill className="bg-gray-50 text-gray-700 border-gray-200">Expected {format(totales.other)}</Pill>
                  </span>
                </label>
                <input
                  type="number" step="0.01" className="border p-2 rounded w-full"
                  value={counted.other} onChange={(e) => setCounted({ ...counted, other: e.target.value })} disabled={!!viewClose} required
                />
                <div className="mt-1">
                  {(() => {
                    const { label, cls } = deltaInfo(counted.other, totales.other);
                    return label ? <Pill className={cls}>{label}</Pill> : null;
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Comentarios */}
        <div>
          <label className="block text-sm font-bold mb-1">Comments:</label>
          <textarea
            className="border p-2 rounded w-full" rows={3}
            value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Optional notes..." disabled={!!viewClose}
          />
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <button type="button" onClick={() => navigate("/cierres/pre")} className="px-6 py-2 bg-gray-200 rounded hover:bg-gray-300">
            ← Back
          </button>
          <button
            type="submit"
            disabled={guardando || !!viewClose || !isFormReady}
            className="px-6 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50 flex-1"
            title={!isFormReady ? "Complete all required amounts to enable save" : ""}
          >
            {guardando ? "Saving..." : "💾 Save Closeout"}
          </button>
        </div>

        {mensaje && (
          <div className={`p-3 rounded text-center ${mensaje.includes("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {mensaje}
          </div>
        )}
      </form>

      <ModalDesglose
        open={openDesglose}
        initial={cashBreakdown}
        onClose={() => setOpenDesglose(false)}
        onSave={({ total, billetes }) => {
          setCashBreakdown(billetes);
          setCounted((prev) => ({ ...prev, cash: total.toFixed(2) }));
          try { localStorage.setItem("cierre_cash_breakdown", JSON.stringify(billetes)); } catch {}
          setOpenDesglose(false);
        }}
      />
    </div>
  );
}
