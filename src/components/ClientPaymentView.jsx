// src/components/ClientPaymentView.jsx
// Vista dual: resumen para el vendedor + pantalla limpia para mostrar al cliente
import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

/* ─── helpers ─── */
const fmt = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function daysFromNow(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── fetch cuotas (solo si no vienen pre-cargadas) ─── */
async function fetchCuotasPendientes(clienteId) {
  if (!clienteId) return [];
  const { data: acuerdos, error: e1 } = await supabase
    .from("acuerdos_pago")
    .select("id, monto_total, monto_pagado, estado, fecha_inicio, numero_cuotas")
    .eq("cliente_id", clienteId)
    .in("estado", ["activo", "vencido"])
    .order("fecha_inicio", { ascending: true });
  if (e1 || !acuerdos?.length) return [];
  const acuerdoIds = acuerdos.map((a) => a.id);
  const { data: cuotas, error: e2 } = await supabase
    .from("cuotas_acuerdo")
    .select("id, acuerdo_id, numero_cuota, monto, monto_pagado, fecha_vencimiento, estado")
    .in("acuerdo_id", acuerdoIds)
    .in("estado", ["pendiente", "vencida", "parcial"])
    .order("fecha_vencimiento", { ascending: true });
  if (e2 || !cuotas?.length) return [];
  const acuerdoMap = new Map(acuerdos.map((a) => [a.id, a]));
  return cuotas.map((c) => ({
    ...c,
    acuerdo: acuerdoMap.get(c.acuerdo_id),
    pendiente: Math.round((c.monto - (c.monto_pagado || 0)) * 100) / 100,
  }));
}

/* ─── normalizar cuotas desde acuerdosResumen ─── */
function normalizarCuotasDeResumen(acuerdosData) {
  if (!acuerdosData) return [];

  // Intentar arrays primero
  const raw =
    acuerdosData.cuotasPendientes ||
    acuerdosData.proximas_cuotas ||
    acuerdosData.cuotas_pendientes ||
    acuerdosData.cuotas ||
    [];

  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((c) => ({
        id: c.id || Math.random(),
        acuerdo_id: c.acuerdo_id,
        numero_cuota: c.numero_cuota ?? "?",
        monto: Number(c.monto || 0),
        monto_pagado: Number(c.monto_pagado || 0),
        fecha_vencimiento: c.fecha_vencimiento || null,
        estado: c.estado || "pendiente",
        pendiente: Math.round(((c.monto || 0) - (c.monto_pagado || 0)) * 100) / 100,
      }))
      .filter((c) => c.pendiente > 0)
      .sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento));
  }

  // 🆕 Fallback: construir cuota desde el resumen summary
  if (acuerdosData.proxima_cuota_monto && acuerdosData.proxima_cuota_fecha) {
    const deudaTotal = Number(acuerdosData.deuda_en_acuerdos || 0);
    const montoCuota = Number(acuerdosData.proxima_cuota_monto || 0);
    const cuotasEstimadas = montoCuota > 0 ? Math.round(deudaTotal / montoCuota) : 1;

    // Generar cuotas estimadas basadas en la deuda total
    const cuotas = [];
    let fechaBase = new Date(acuerdosData.proxima_cuota_fecha);
    let deudaRestante = deudaTotal;

    for (let i = 0; i < cuotasEstimadas && deudaRestante > 0; i++) {
      const monto = Math.min(montoCuota, deudaRestante);
      cuotas.push({
        id: `summary-${i}`,
        acuerdo_id: null,
        numero_cuota: i + 1,
        monto: monto,
        monto_pagado: 0,
        fecha_vencimiento: new Date(fechaBase).toISOString(),
        estado: "pendiente",
        pendiente: monto,
      });
      fechaBase.setDate(fechaBase.getDate() + 7); // semana a semana
      deudaRestante -= monto;
    }

    return cuotas;
  }

  return [];
}

/* ═══════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════ */
export default function ClientPaymentView({
  clienteId,
  clienteName = "",
  balanceActual = 0,
  ventaHoy = 0,
  montoAPagar = 0,
  pagoMinimo = 0,
  onClose,
  isModal = false,
  compact = false,
  acuerdosData = null,
}) {
  const [cuotas, setCuotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClientView, setShowClientView] = useState(false);

  useEffect(() => {
    // 1) Datos pre-cargados → usarlos directamente
    if (acuerdosData) {
      const normalized = normalizarCuotasDeResumen(acuerdosData);
      setCuotas(normalized);
      setLoading(false);
      return;
    }
    // 2) Fetch propio
    if (!clienteId) { setLoading(false); return; }
    setLoading(true);
    fetchCuotasPendientes(clienteId)
      .then(setCuotas)
      .catch(() => setCuotas([]))
      .finally(() => setLoading(false));
  }, [clienteId, acuerdosData]);

  const totalPendiente = cuotas.reduce((s, c) => s + c.pendiente, 0);
  const nextCuota = cuotas[0] ?? null;
  const daysToNext = nextCuota ? daysFromNow(nextCuota.fecha_vencimiento) : null;
  const isOverdue = daysToNext !== null && daysToNext < 0;
  const balanceDespues = Math.max(0, balanceActual + ventaHoy - montoAPagar);
  const cubrioMinimo = pagoMinimo === 0 || montoAPagar >= pagoMinimo;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-400">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2" />
        Loading payment schedule...
      </div>
    );
  }

  if (cuotas.length === 0) {
    if (balanceActual === 0 && ventaHoy === 0) return null;
    return (
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">✅</span>
          <div>
            <div className="font-bold text-emerald-800">No payment agreements on file</div>
            {balanceActual > 0 && (
              <div className="text-sm text-emerald-700 mt-1">
                Outstanding balance: <b>{fmt(balanceActual)}</b>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════
     VISTA COMPACTA (Paso 3)
  ════════════════════════════════════════════ */
  if (compact) {
    return (
      <div className="bg-white border-2 border-indigo-200 rounded-xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="font-bold">Payment Agreements</span>
            <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">{cuotas.length} pending</span>
          </div>
          <button
            onClick={() => setShowClientView(true)}
            className="bg-white text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors shadow-sm"
          >
            👤 Show to Client
          </button>
        </div>

        {/* Next payment */}
        {nextCuota && (
          <div className={`px-4 py-3 border-b flex items-center justify-between ${
            isOverdue ? "bg-red-50 border-red-200"
            : daysToNext !== null && daysToNext <= 7 ? "bg-amber-50 border-amber-200"
            : "bg-blue-50 border-blue-100"
          }`}>
            <div>
              <div className={`text-xs font-bold uppercase ${isOverdue ? "text-red-600" : "text-blue-600"}`}>
                {isOverdue ? `⚠️ OVERDUE ${Math.abs(daysToNext)} days` : daysToNext === 0 ? "🔥 DUE TODAY" : "⬆️ NEXT PAYMENT (FIFO)"}
              </div>
              <div className="font-bold text-gray-900 text-lg">{fmt(nextCuota.pendiente)}</div>
              <div className="text-xs text-gray-500">
                #{nextCuota.numero_cuota} · {fmtDate(nextCuota.fecha_vencimiento)}
                {daysToNext !== null && daysToNext > 0 && (
                  <span className="ml-1 text-blue-600 font-semibold">· {daysToNext} days left</span>
                )}
              </div>
            </div>
            {montoAPagar > 0 && (
              <div className="text-right">
                {montoAPagar >= nextCuota.pendiente ? (
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">✅ Covered</span>
                ) : (
                  <div>
                    <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-1 rounded-full">⚡ Partial</span>
                    <div className="text-xs text-gray-500 mt-1">{fmt(nextCuota.pendiente - montoAPagar)} left</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Installment list */}
        <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto">
          {cuotas.map((c, idx) => {
            const days = daysFromNow(c.fecha_vencimiento);
            const over = days !== null && days < 0;
            const coveredBefore = cuotas.slice(0, idx).reduce((s, x) => s + x.pendiente, 0);
            const remainingPayment = Math.max(0, montoAPagar - coveredBefore);
            const coverage = montoAPagar > 0
              ? remainingPayment >= c.pendiente ? "full"
              : remainingPayment > 0 ? "partial" : "none"
              : "idle";

            return (
              <div key={c.id} className={`flex items-center gap-3 px-4 py-2.5 ${
                coverage === "full" ? "bg-green-50"
                : coverage === "partial" ? "bg-yellow-50"
                : over ? "bg-red-50" : "bg-white"
              }`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  coverage === "full" ? "bg-green-500 text-white"
                  : coverage === "partial" ? "bg-yellow-500 text-white"
                  : over ? "bg-red-500 text-white" : "bg-gray-200 text-gray-600"
                }`}>
                  {coverage === "full" ? "✓" : coverage === "partial" ? "½" : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 flex items-center gap-1 flex-wrap">
                    #{c.numero_cuota}
                    {idx === 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">NEXT</span>}
                    {over && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">OVERDUE</span>}
                  </div>
                  <div className="text-xs text-gray-500">{fmtDate(c.fecha_vencimiento)}</div>
                  {coverage !== "idle" && (
                    <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${coverage === "full" ? "bg-green-500" : "bg-yellow-500"}`}
                        style={{ width: coverage === "full" ? "100%" : `${Math.min(100, (remainingPayment / c.pendiente) * 100).toFixed(0)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-gray-900">{fmt(c.pendiente)}</div>
                  {coverage === "partial" && remainingPayment > 0 && (
                    <div className="text-[10px] text-yellow-700">{fmt(remainingPayment)} applied</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t px-4 py-2 flex items-center justify-between text-sm">
          <span className="text-gray-600">Total pending:</span>
          <span className="font-bold text-gray-900">{fmt(totalPendiente)}</span>
        </div>

        {/* Minimum payment */}
        {pagoMinimo > 0 && (
          <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-t ${
            cubrioMinimo ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"
          }`}>
            <span>{cubrioMinimo ? "✅" : "⚠️"} Min. required: {fmt(pagoMinimo)}</span>
            {!cubrioMinimo && <span className="font-bold">Missing: {fmt(pagoMinimo - montoAPagar)}</span>}
          </div>
        )}

        {showClientView && (
          <ClientFacingModal
            clienteName={clienteName} cuotas={cuotas} balanceActual={balanceActual}
            ventaHoy={ventaHoy} balanceDespues={balanceDespues} nextCuota={nextCuota}
            daysToNext={daysToNext} isOverdue={isOverdue} pagoMinimo={pagoMinimo}
            onClose={() => setShowClientView(false)}
          />
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════
     VISTA COMPLETA (standalone / modal)
  ════════════════════════════════════════════ */
  const wrapper = isModal
    ? "fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    : "w-full";

  return (
    <div className={wrapper}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-700 to-blue-600 text-white px-5 py-4 flex items-center justify-between">
          <div>
            <div className="font-bold text-lg">📋 Payment Schedule</div>
            <div className="text-indigo-200 text-sm">{clienteName}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowClientView(true)} className="bg-white text-indigo-700 text-xs font-bold px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors">
              👤 Client View
            </button>
            {onClose && (
              <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white w-8 h-8 rounded-full flex items-center justify-center">✖</button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-200 border-b">
          <div className="p-3 text-center">
            <div className="text-[10px] uppercase text-gray-500 font-semibold">Balance</div>
            <div className="text-xl font-bold text-red-700">{fmt(balanceActual)}</div>
          </div>
          <div className="p-3 text-center">
            <div className="text-[10px] uppercase text-gray-500 font-semibold">Today's Sale</div>
            <div className="text-xl font-bold text-blue-700">{fmt(ventaHoy)}</div>
          </div>
          <div className="p-3 text-center">
            <div className="text-[10px] uppercase text-gray-500 font-semibold">After Payment</div>
            <div className={`text-xl font-bold ${balanceDespues > 0 ? "text-amber-700" : "text-emerald-700"}`}>{fmt(balanceDespues)}</div>
          </div>
        </div>
        {nextCuota && (
          <div className={`mx-4 mt-4 rounded-xl p-4 ${isOverdue ? "bg-red-50 border-2 border-red-300" : "bg-blue-50 border-2 border-blue-200"}`}>
            <div className={`text-xs font-bold uppercase mb-1 ${isOverdue ? "text-red-600" : "text-blue-600"}`}>⬆️ NEXT PAYMENT — FIFO</div>
            <div className="text-3xl font-extrabold text-gray-900">{fmt(nextCuota.pendiente)}</div>
            <div className="text-sm text-gray-600 mt-1">
              {fmtDate(nextCuota.fecha_vencimiento)}
              {daysToNext !== null && (
                <span className={`ml-2 font-bold ${isOverdue ? "text-red-600" : "text-blue-700"}`}>
                  {isOverdue ? `${Math.abs(daysToNext)} days overdue` : daysToNext === 0 ? "Due today" : `${daysToNext} days left`}
                </span>
              )}
            </div>
          </div>
        )}
        {pagoMinimo > 0 && (
          <div className={`mx-4 mt-3 rounded-xl px-4 py-3 flex items-center justify-between ${cubrioMinimo ? "bg-green-50 border border-green-300" : "bg-amber-50 border-2 border-amber-400"}`}>
            <div>
              <div className={`text-xs font-bold uppercase ${cubrioMinimo ? "text-green-700" : "text-amber-700"}`}>
                {cubrioMinimo ? "✅ Minimum covered" : "⚠️ Minimum required"}
              </div>
              <div className={`text-2xl font-extrabold ${cubrioMinimo ? "text-green-800" : "text-amber-800"}`}>{fmt(pagoMinimo)}</div>
              <div className="text-xs text-gray-500">20% of balance</div>
            </div>
            {!cubrioMinimo && (
              <div className="text-right">
                <div className="text-xs text-amber-700">Missing</div>
                <div className="text-xl font-bold text-amber-800">{fmt(pagoMinimo - montoAPagar)}</div>
              </div>
            )}
          </div>
        )}
        <div className="mx-4 mt-3 mb-4 border rounded-xl overflow-hidden">
          <div className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600 uppercase flex justify-between">
            <span>All Pending Installments (FIFO)</span>
            <span>{fmt(totalPendiente)} total</span>
          </div>
          <div className="divide-y max-h-56 overflow-y-auto">
            {cuotas.map((c, idx) => {
              const days = daysFromNow(c.fecha_vencimiento);
              const over = days !== null && days < 0;
              const coveredBefore = cuotas.slice(0, idx).reduce((s, x) => s + x.pendiente, 0);
              const remaining = Math.max(0, montoAPagar - coveredBefore);
              const coverage = montoAPagar > 0
                ? remaining >= c.pendiente ? "full" : remaining > 0 ? "partial" : "none"
                : "idle";
              return (
                <div key={c.id} className={`flex items-center gap-3 px-4 py-3 ${
                  coverage === "full" ? "bg-green-50" : coverage === "partial" ? "bg-yellow-50" : over ? "bg-red-50" : "bg-white"
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    coverage === "full" ? "bg-green-500 text-white" : coverage === "partial" ? "bg-yellow-500 text-white" : over ? "bg-red-500 text-white" : "bg-gray-200 text-gray-700"
                  }`}>
                    {coverage === "full" ? "✓" : coverage === "partial" ? "½" : idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-800 flex items-center gap-2 flex-wrap">
                      Installment #{c.numero_cuota}
                      {idx === 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">NEXT</span>}
                      {over && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">OVERDUE</span>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {fmtDate(c.fecha_vencimiento)}
                      {days !== null && days >= 0 && <span className="ml-1 text-blue-600">· {days}d</span>}
                    </div>
                    {coverage !== "idle" && (
                      <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${coverage === "full" ? "bg-green-500" : "bg-yellow-500"}`}
                          style={{ width: coverage === "full" ? "100%" : `${Math.min(100, (remaining / c.pendiente) * 100).toFixed(0)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-gray-900">{fmt(c.pendiente)}</div>
                    {coverage === "partial" && remaining > 0 && (
                      <div className="text-[10px] text-yellow-700">{fmt(remaining)} of {fmt(c.pendiente)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {showClientView && (
        <ClientFacingModal
          clienteName={clienteName} cuotas={cuotas} balanceActual={balanceActual}
          ventaHoy={ventaHoy} balanceDespues={balanceDespues} nextCuota={nextCuota}
          daysToNext={daysToNext} isOverdue={isOverdue} pagoMinimo={pagoMinimo}
          onClose={() => setShowClientView(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CLIENT-FACING MODAL
═══════════════════════════════════════════════ */
function ClientFacingModal({ clienteName, cuotas, balanceActual, ventaHoy, balanceDespues, nextCuota, daysToNext, isOverdue, pagoMinimo, onClose }) {
  const totalPendiente = cuotas.reduce((s, c) => s + c.pendiente, 0);
  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col overflow-hidden">
      <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Showing to client
        </div>
        <button onClick={onClose} className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition-colors">
          ✖ Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-900 to-blue-900 text-white p-5 space-y-5">
        <div className="text-center pt-2">
          <div className="text-slate-400 text-sm uppercase font-bold tracking-widest mb-1">Account Summary</div>
          <div className="text-3xl font-extrabold text-white">{clienteName}</div>
          <div className="text-slate-400 text-sm mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-slate-300 text-xs uppercase font-semibold tracking-wide">Current Balance</div>
              <div className="text-3xl font-extrabold text-red-400 mt-1">{fmt(balanceActual)}</div>
            </div>
            {ventaHoy > 0 && (
              <div className="text-center">
                <div className="text-slate-300 text-xs uppercase font-semibold tracking-wide">Today's Purchase</div>
                <div className="text-3xl font-extrabold text-blue-300 mt-1">{fmt(ventaHoy)}</div>
              </div>
            )}
          </div>
          {(balanceDespues !== balanceActual || ventaHoy > 0) && (
            <div className="border-t border-white/20 pt-3 text-center">
              <div className="text-slate-300 text-xs uppercase font-semibold tracking-wide">Balance After This Visit</div>
              <div className={`text-4xl font-black mt-1 ${balanceDespues > 0 ? "text-amber-300" : "text-emerald-400"}`}>{fmt(balanceDespues)}</div>
            </div>
          )}
        </div>
        {nextCuota && (
          <div className={`rounded-2xl p-5 text-center ${
            isOverdue ? "bg-red-500/20 border-2 border-red-400"
            : daysToNext !== null && daysToNext <= 7 ? "bg-amber-500/20 border-2 border-amber-400"
            : "bg-blue-500/20 border-2 border-blue-400"
          }`}>
            <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${isOverdue ? "text-red-300" : "text-blue-300"}`}>
              {isOverdue ? "⚠️ Overdue Payment" : "📅 Next Payment Due"}
            </div>
            <div className="text-6xl font-black text-white">{fmt(nextCuota.pendiente)}</div>
            <div className={`text-xl font-bold mt-2 ${isOverdue ? "text-red-300" : "text-blue-200"}`}>{fmtDate(nextCuota.fecha_vencimiento)}</div>
            {daysToNext !== null && (
              <div className={`text-lg mt-1 font-semibold ${isOverdue ? "text-red-400" : daysToNext === 0 ? "text-amber-400" : "text-blue-300"}`}>
                {isOverdue ? `${Math.abs(daysToNext)} days past due` : daysToNext === 0 ? "Due today!" : `${daysToNext} days from now`}
              </div>
            )}
          </div>
        )}
        {pagoMinimo > 0 && (
          <div className="bg-white/10 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-slate-300 text-xs uppercase font-bold tracking-wide">Minimum Payment Required</div>
              <div className="text-3xl font-extrabold text-white mt-1">{fmt(pagoMinimo)}</div>
              <div className="text-slate-400 text-xs mt-1">20% of balance · due to keep account current</div>
            </div>
            <div className="text-4xl">💳</div>
          </div>
        )}
        {cuotas.length > 0 && (
          <div className="bg-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/20 flex items-center justify-between">
              <span className="font-bold text-white">Payment Schedule</span>
              <span className="text-slate-300 text-sm">{cuotas.length} installments</span>
            </div>
            <div className="divide-y divide-white/10">
              {cuotas.map((c, idx) => {
                const days = daysFromNow(c.fecha_vencimiento);
                const over = days !== null && days < 0;
                const isNext = idx === 0;
                return (
                  <div key={c.id} className={`flex items-center gap-4 px-4 py-3 ${isNext ? "bg-white/10" : ""}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${over ? "bg-red-500 text-white" : isNext ? "bg-blue-500 text-white" : "bg-white/20 text-white"}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-semibold flex items-center gap-2 flex-wrap">
                        Installment #{c.numero_cuota}
                        {isNext && <span className="text-[10px] bg-blue-500 px-1.5 py-0.5 rounded-full">NEXT</span>}
                        {over && <span className="text-[10px] bg-red-500 px-1.5 py-0.5 rounded-full">OVERDUE</span>}
                      </div>
                      <div className="text-slate-300 text-sm">
                        {fmtDate(c.fecha_vencimiento)}
                        {days !== null && days >= 0 && <span className="ml-1 text-blue-300">· {days}d</span>}
                      </div>
                    </div>
                    <div className={`text-xl font-extrabold flex-shrink-0 ${over ? "text-red-300" : isNext ? "text-blue-200" : "text-white"}`}>
                      {fmt(c.pendiente)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-3 bg-white/10 border-t border-white/20 flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Total Remaining</span>
              <span className="text-2xl font-extrabold text-white">{fmt(totalPendiente)}</span>
            </div>
          </div>
        )}
        <div className="text-center text-slate-400 text-xs pb-4">
          Thank you for your business! · Questions? Contact your sales representative.
        </div>
      </div>
    </div>
  );
}