// src/components/PaymentAgreementsPanel.jsx
// ============================================================
// Panel de Acuerdos de Pago — Diseño orientado a MOSTRAR AL CLIENTE
// Reemplaza la sección "Payment Agreements" en Ventas.jsx Step 1
// ============================================================

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabaseClient";

const fmt = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PaymentAgreementsPanel({ clienteId, clienteName, onRefresh }) {
  const [acuerdos, setAcuerdos] = useState([]);
  const [cuotas, setCuotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showClientView, setShowClientView] = useState(false);

  // Cargar datos
  async function loadData() {
    if (!clienteId) return;
    setLoading(true);
    try {
     const { data: acData } = await supabase
  .from("acuerdos_pago")
  .select("*")
  .eq("cliente_id", clienteId)
  .neq("estado", "cancelado")  // ✅ Excluir cancelados
  .order("fecha_acuerdo", { ascending: true });

      const ids = (acData || []).map((a) => a.id);
      let cuData = [];
      if (ids.length > 0) {
        const { data } = await supabase
          .from("cuotas_acuerdo")
          .select("*")
          .in("acuerdo_id", ids)
          .order("fecha_vencimiento", { ascending: true });
        cuData = data || [];
      }

      setAcuerdos(acData || []);
      setCuotas(cuData);
    } catch (err) {
      console.error("Error loading agreements:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [clienteId]);

  // Cálculos
  const stats = useMemo(() => {
    const activos = acuerdos.filter((a) => a.estado === "activo");
    const completados = acuerdos.filter((a) => a.estado === "completado");
    const rotos = acuerdos.filter((a) => a.estado === "roto");

    const cuotasPendientes = cuotas.filter(
      (c) => c.estado === "pendiente" || c.estado === "vencida" || c.estado === "parcial"
    );
    const cuotasPagadas = cuotas.filter((c) => c.estado === "pagada");

    const totalDeuda = cuotasPendientes.reduce(
      (s, c) => s + Number(c.monto || 0) - Number(c.monto_pagado || 0),
      0
    );
    const totalPagado = cuotas.reduce((s, c) => s + Number(c.monto_pagado || 0), 0);
    const totalGeneral = cuotas.reduce((s, c) => s + Number(c.monto || 0), 0);

    // Próxima cuota
    const now = new Date();
    const proximaCuota = cuotasPendientes
      .sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento))[0] || null;

    let diasParaProxima = null;
    let cuotaVencida = false;
    if (proximaCuota) {
      const diff = new Date(proximaCuota.fecha_vencimiento) - now;
      diasParaProxima = Math.ceil(diff / (1000 * 60 * 60 * 24));
      cuotaVencida = diasParaProxima < 0;
    }

    // Cuotas vencidas
    const cuotasVencidas = cuotasPendientes.filter((c) => {
      return new Date(c.fecha_vencimiento) < now;
    });

    const progreso = totalGeneral > 0 ? (totalPagado / totalGeneral) * 100 : 0;

    return {
      activos: activos.length,
      completados: completados.length,
      rotos: rotos.length,
      totalDeuda,
      totalPagado,
      totalGeneral,
      progreso,
      proximaCuota,
      diasParaProxima,
      cuotaVencida,
      cuotasVencidas: cuotasVencidas.length,
      cuotasPendientes,
      cuotasPagadas: cuotasPagadas.length,
      totalCuotas: cuotas.length,
    };
  }, [acuerdos, cuotas]);

  // Agrupar cuotas por acuerdo para vista de cliente
  const cuotasPorAcuerdo = useMemo(() => {
    const map = {};
    const activosIds = new Set(acuerdos.filter((a) => a.estado === "activo").map((a) => a.id));
    
    cuotas.forEach((c) => {
      if (!activosIds.has(c.acuerdo_id)) return;
      if (!map[c.acuerdo_id]) map[c.acuerdo_id] = [];
      map[c.acuerdo_id].push(c);
    });
    return map;
  }, [cuotas, acuerdos]);

  if (!clienteId) return null;
  if (loading) {
    return (
      <div className="text-center py-6 text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
        Loading agreements...
      </div>
    );
  }
  if (acuerdos.length === 0) return null;

  // ===================== CLIENT VIEW (Mostrar al cliente) =====================
  if (showClientView) {
    return (
      <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
        {/* Header */}
        <div
          className="text-white p-6 text-center"
          style={{
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          }}
        >
          <div className="text-xs uppercase tracking-[0.3em] opacity-70 mb-1">
            Payment Agreement
          </div>
          <div className="text-2xl font-bold tracking-tight">{clienteName || "Client"}</div>
          <div className="text-xs opacity-60 mt-1">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>

        {/* Progreso visual */}
        <div className="px-6 py-5" style={{ background: "#f8f9fa" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Payment Progress
            </span>
            <span className="text-xs font-bold text-gray-700">
              {stats.progreso.toFixed(0)}% Complete
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.max(2, stats.progreso)}%`,
                background:
                  stats.progreso >= 80
                    ? "linear-gradient(90deg, #10b981, #059669)"
                    : stats.progreso >= 40
                    ? "linear-gradient(90deg, #f59e0b, #d97706)"
                    : "linear-gradient(90deg, #ef4444, #dc2626)",
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Paid: <b className="text-green-700">{fmt(stats.totalPagado)}</b></span>
            <span>Remaining: <b className="text-red-700">{fmt(stats.totalDeuda)}</b></span>
          </div>
        </div>

        {/* Próximo pago destacado */}
        {stats.proximaCuota && (
          <div className="mx-6 mt-4">
            <div
              className="rounded-2xl p-5 text-center shadow-lg"
              style={{
                background: stats.cuotaVencida
                  ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                  : stats.diasParaProxima <= 3
                  ? "linear-gradient(135deg, #f59e0b, #d97706)"
                  : "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "white",
              }}
            >
              <div className="text-xs uppercase tracking-[0.2em] opacity-80 mb-1">
                {stats.cuotaVencida ? "⚠️ OVERDUE PAYMENT" : "Next Payment"}
              </div>
              <div className="text-4xl font-black tracking-tight my-2">
                {fmt(
                  Number(stats.proximaCuota.monto || 0) -
                    Number(stats.proximaCuota.monto_pagado || 0)
                )}
              </div>
              <div className="text-sm opacity-90 font-semibold">
                {stats.cuotaVencida ? (
                  <span>
                    {Math.abs(stats.diasParaProxima)} days overdue
                  </span>
                ) : stats.diasParaProxima === 0 ? (
                  <span>Due TODAY</span>
                ) : (
                  <span>
                    Due in {stats.diasParaProxima} day{stats.diasParaProxima !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="text-xs opacity-70 mt-1">
                {new Date(stats.proximaCuota.fecha_vencimiento).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>
        )}

        {/* Calendario de cuotas */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
            Payment Schedule
          </div>

          {Object.entries(cuotasPorAcuerdo).map(([acuerdoId, cuotasAcuerdo]) => {
            const acuerdo = acuerdos.find((a) => a.id === acuerdoId);
            return (
              <div key={acuerdoId} className="mb-4">
                {Object.keys(cuotasPorAcuerdo).length > 1 && (
                  <div className="text-xs text-gray-400 mb-2 font-semibold">
                    Agreement — {fmt(acuerdo?.monto_total)}
                  </div>
                )}
                <div className="space-y-2">
                  {cuotasAcuerdo.map((c, idx) => {
                    const pendiente =
                      Number(c.monto || 0) - Number(c.monto_pagado || 0);
                    const isPaid = c.estado === "pagada";
                    const isOverdue =
                      !isPaid && new Date(c.fecha_vencimiento) < new Date();
                    const isPartial = c.estado === "parcial";
                    const isNext =
                      stats.proximaCuota && c.id === stats.proximaCuota.id;

                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                          isPaid
                            ? "bg-green-50 border-green-200 opacity-70"
                            : isOverdue
                            ? "bg-red-50 border-red-300 shadow-md"
                            : isNext
                            ? "bg-blue-50 border-blue-300 shadow-md ring-2 ring-blue-200"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        {/* Icono estado */}
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 shadow-sm ${
                            isPaid
                              ? "bg-green-500 text-white"
                              : isOverdue
                              ? "bg-red-500 text-white animate-pulse"
                              : isPartial
                              ? "bg-amber-500 text-white"
                              : "bg-gray-200 text-gray-500"
                          }`}
                        >
                          {isPaid ? "✓" : isOverdue ? "!" : isPartial ? "◐" : idx + 1}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div
                              className={`font-bold ${
                                isPaid
                                  ? "text-green-700 line-through"
                                  : isOverdue
                                  ? "text-red-700"
                                  : "text-gray-900"
                              }`}
                            >
                              {isPaid ? fmt(c.monto) : fmt(pendiente)}
                            </div>
                            {isNext && !isPaid && (
                              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">
                                NEXT
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {new Date(c.fecha_vencimiento).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                            {isPaid && " — Paid ✓"}
                            {isOverdue && (
                              <span className="text-red-600 font-bold ml-1">
                                — OVERDUE
                              </span>
                            )}
                            {isPartial && (
                              <span className="text-amber-600 font-semibold ml-1">
                                — Partial ({fmt(c.monto_pagado)} paid)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t-2 border-gray-200 safe-area-bottom"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-gray-500 uppercase font-bold">Total Remaining</div>
              <div className="text-2xl font-black text-red-700">{fmt(stats.totalDeuda)}</div>
            </div>
            {stats.cuotasVencidas > 0 && (
              <div className="bg-red-100 text-red-800 px-3 py-1.5 rounded-xl text-xs font-bold">
                ⚠️ {stats.cuotasVencidas} overdue
              </div>
            )}
          </div>
          <button
            onClick={() => setShowClientView(false)}
            className="w-full py-3.5 rounded-xl font-bold text-white text-lg shadow-lg"
            style={{
              background: "linear-gradient(135deg, #1a1a2e, #0f3460)",
            }}
          >
            ← Back to Sales
          </button>
        </div>
      </div>
    );
  }

  // ===================== SELLER VIEW (Panel normal en ventas) =====================
  return (
    <div className="rounded-2xl overflow-hidden border-2 border-gray-200 shadow-lg">
      {/* Header */}
      <div
        className="p-4 text-white"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="font-bold tracking-wide">Payment Agreements</span>
          </div>
          <button
            onClick={loadData}
            className="text-white/60 hover:text-white transition-colors text-sm"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 divide-x divide-gray-200 bg-gray-50">
        <div className="p-3 text-center">
          <div className="text-2xl font-black text-blue-600">{stats.activos}</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Active</div>
        </div>
        <div className="p-3 text-center">
          <div className="text-2xl font-black text-green-600">{stats.completados}</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Done</div>
        </div>
        <div className="p-3 text-center">
          <div className="text-2xl font-black text-red-600">{stats.rotos}</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Broken</div>
        </div>
        <div className="p-3 text-center">
          <div className="text-2xl font-black text-amber-600">{stats.cuotasVencidas}</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Overdue</div>
        </div>
      </div>

      {/* Barra de progreso */}
      {stats.totalGeneral > 0 && (
        <div className="px-4 pt-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">
              <b className="text-green-700">{fmt(stats.totalPagado)}</b> paid
            </span>
            <span className="text-gray-500">
              <b className="text-red-700">{fmt(stats.totalDeuda)}</b> remaining
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.max(2, stats.progreso)}%`,
                background:
                  stats.progreso >= 80
                    ? "linear-gradient(90deg, #10b981, #059669)"
                    : stats.progreso >= 40
                    ? "linear-gradient(90deg, #f59e0b, #d97706)"
                    : "linear-gradient(90deg, #ef4444, #dc2626)",
              }}
            />
          </div>
          <div className="text-center text-xs text-gray-400 mt-1">
            {stats.progreso.toFixed(0)}% complete — {stats.cuotasPagadas}/{stats.totalCuotas} payments
          </div>
        </div>
      )}

      {/* Próximo pago */}
      {stats.proximaCuota && (
        <div className="mx-4 mt-3">
          <div
            className="rounded-xl p-4 flex items-center justify-between"
            style={{
              background: stats.cuotaVencida
                ? "linear-gradient(135deg, #fef2f2, #fee2e2)"
                : stats.diasParaProxima <= 3
                ? "linear-gradient(135deg, #fffbeb, #fef3c7)"
                : "linear-gradient(135deg, #eff6ff, #dbeafe)",
              borderLeft: `4px solid ${
                stats.cuotaVencida ? "#dc2626" : stats.diasParaProxima <= 3 ? "#d97706" : "#2563eb"
              }`,
            }}
          >
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase">
                {stats.cuotaVencida ? "⚠️ Overdue" : "📅 Next Payment"}
              </div>
              <div
                className={`text-xl font-black mt-0.5 ${
                  stats.cuotaVencida
                    ? "text-red-700"
                    : stats.diasParaProxima <= 3
                    ? "text-amber-700"
                    : "text-blue-700"
                }`}
              >
                {fmt(
                  Number(stats.proximaCuota.monto || 0) -
                    Number(stats.proximaCuota.monto_pagado || 0)
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {new Date(stats.proximaCuota.fecha_vencimiento).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>

            <div className="text-right">
              {stats.cuotaVencida ? (
                <div className="bg-red-600 text-white px-3 py-1.5 rounded-full text-xs font-black animate-pulse">
                  {Math.abs(stats.diasParaProxima)}d LATE
                </div>
              ) : stats.diasParaProxima === 0 ? (
                <div className="bg-amber-500 text-white px-3 py-1.5 rounded-full text-xs font-black">
                  TODAY
                </div>
              ) : (
                <div>
                  <div className="text-3xl font-black text-gray-800">
                    {stats.diasParaProxima}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold">
                    days left
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Botón mostrar al cliente */}
      <div className="p-4">
        <button
          onClick={() => setShowClientView(true)}
          className="w-full py-3 rounded-xl font-bold text-white text-sm shadow-lg transition-all active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #1a1a2e, #0f3460)",
          }}
        >
          📱 Show to Client — Full Payment Schedule
        </button>
      </div>
    </div>
  );
}