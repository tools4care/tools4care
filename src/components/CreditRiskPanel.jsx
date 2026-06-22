import React from "react";

const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(n || 0)));
}

function decisionCopy({ nivel, saleFits, usageAfterPct, overdueSignal, reglasCredito }) {
  if (!saleFits) {
    return {
      label: "Collect before selling",
      tone: "red",
      title: "This sale exceeds available credit",
      detail: "Ask for payment now or reduce the order before continuing.",
    };
  }

  if (nivel === "alto" || usageAfterPct >= 90 || overdueSignal) {
    return {
      label: "Require payment",
      tone: "amber",
      title: "Approve only with collection",
      detail: "Get a partial payment today and avoid adding more balance than needed.",
    };
  }

  if (nivel === "medio" || reglasCredito?.requierePagoMinimo) {
    return {
      label: "Sell with caution",
      tone: "blue",
      title: "Good to sell, monitor balance",
      detail: "Sale fits the limit. Confirm payment plan if leaving a balance.",
    };
  }

  return {
    label: "Safe to sell",
    tone: "green",
    title: "Customer has room for this sale",
    detail: "Credit position looks healthy for the current order.",
  };
}

export default function CreditRiskPanel({
  clientRisk,
  creditProfile,
  reglasCredito,
  cxcBalance,
  cxcLimit,
  cxcAvailable,
  saleTotal,
  onRefresh,
}) {
  if (!clientRisk) return null;

  const nivel = clientRisk.nivelRiesgo || clientRisk.nivel || "nuevo";
  const score = clamp(clientRisk.score ?? 0);
  const balance = Math.max(0, Number(cxcBalance ?? creditProfile?.saldo ?? 0));
  const limit = Math.max(0, Number(cxcLimit ?? creditProfile?.limite ?? 0));
  const available = Math.max(0, Number(
    cxcAvailable != null
      ? cxcAvailable
      : limit > 0 ? limit - balance : reglasCredito?.montoMaximo || 0
  ));
  const sale = Math.max(0, Number(saleTotal || 0));
  const projectedBalance = Math.max(0, balance + sale);
  const usagePct = limit > 0 ? clamp((balance / limit) * 100) : 0;
  const usageAfterPct = limit > 0 ? clamp((projectedBalance / limit) * 100) : 0;
  const saleFits = limit <= 0 ? true : sale <= available + 0.005;
  const roomAfterSale = Math.max(0, available - sale);
  const overBy = Math.max(0, sale - available);
  const overdueSignal = Number(creditProfile?.diasRetraso || 0) > 0 || (clientRisk.recomendaciones || []).some((r) => /vencid|broken|atras/i.test(String(r)));
  const pagoMinimo = Number(reglasCredito?.pagoMinimoRequerido || reglasCredito?.pagoMinimo || 0);
  const decision = decisionCopy({ nivel, saleFits, usageAfterPct, overdueSignal, reglasCredito });

  const tones = {
    green: {
      wrap: "border-emerald-200 bg-emerald-50",
      header: "bg-emerald-600",
      badge: "bg-emerald-100 text-emerald-800",
      text: "text-emerald-800",
      bar: "bg-emerald-500",
      button: "from-emerald-700 to-slate-900",
    },
    blue: {
      wrap: "border-blue-200 bg-blue-50",
      header: "bg-blue-600",
      badge: "bg-blue-100 text-blue-800",
      text: "text-blue-800",
      bar: "bg-blue-500",
      button: "from-blue-700 to-slate-900",
    },
    amber: {
      wrap: "border-amber-200 bg-amber-50",
      header: "bg-amber-600",
      badge: "bg-amber-100 text-amber-900",
      text: "text-amber-900",
      bar: "bg-amber-500",
      button: "from-amber-700 to-slate-900",
    },
    red: {
      wrap: "border-red-200 bg-red-50",
      header: "bg-red-600",
      badge: "bg-red-100 text-red-800",
      text: "text-red-800",
      bar: "bg-red-500",
      button: "from-red-700 to-slate-900",
    },
  };
  const tone = tones[decision.tone];

  const keyReasons = [
    limit > 0 ? `${Math.round(usagePct)}% used now, ${Math.round(usageAfterPct)}% after sale` : null,
    sale > 0 ? (saleFits ? `${fmt(roomAfterSale)} credit room after this sale` : `${fmt(overBy)} over available credit`) : null,
    pagoMinimo > 0 ? `Minimum payment suggested: ${fmt(pagoMinimo)}` : null,
    clientRisk.frecuencia?.descripcion ? clientRisk.frecuencia.descripcion : null,
    clientRisk.tendenciaConsumo?.tendencia ? `Consumption: ${clientRisk.tendenciaConsumo.tendencia}` : null,
  ].filter(Boolean);

  return (
    <div className={`rounded-2xl overflow-hidden border-2 shadow-md mt-4 ${tone.wrap}`}>
      <div className={`${tone.header} px-4 py-4 text-white`}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-xs font-black uppercase tracking-wide px-2.5 py-1 rounded-full ${tone.badge}`}>
                {decision.label}
              </span>
              <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-full">
                Score {score}/100
              </span>
            </div>
            <div className="text-lg font-black leading-tight">{decision.title}</div>
            <div className="text-sm text-white/90 mt-1">{decision.detail}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase font-bold text-white/70">Sale room</div>
            <div className="text-2xl font-black">{saleFits ? fmt(roomAfterSale) : `-${fmt(overBy)}`}</div>
          </div>
        </div>
      </div>

      <div className="bg-white px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-[10px] uppercase font-bold text-gray-500">Balance</div>
            <div className="text-lg font-black text-gray-900">{fmt(balance)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-[10px] uppercase font-bold text-gray-500">Limit</div>
            <div className="text-lg font-black text-gray-900">{limit > 0 ? fmt(limit) : "Cash"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-[10px] uppercase font-bold text-gray-500">Available</div>
            <div className={`text-lg font-black ${available > 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(available)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-[10px] uppercase font-bold text-gray-500">This Sale</div>
            <div className="text-lg font-black text-blue-700">{fmt(sale)}</div>
          </div>
        </div>

        {limit > 0 && (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase text-gray-500 mb-2">
              <span>Credit usage</span>
              <span className={tone.text}>{Math.round(usageAfterPct)}% after sale</span>
            </div>
            <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
              <div className="absolute left-0 top-0 h-3 bg-slate-300" style={{ width: `${usagePct}%` }} />
              <div className={`absolute left-0 top-0 h-3 ${tone.bar} opacity-80`} style={{ width: `${usageAfterPct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>Current {Math.round(usagePct)}%</span>
              <span>After order {Math.round(usageAfterPct)}%</span>
            </div>
          </div>
        )}

        {keyReasons.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {keyReasons.slice(0, 4).map((reason, idx) => (
              <div key={idx} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                {reason}
              </div>
            ))}
          </div>
        )}

        {(clientRisk.recomendaciones || []).length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
            <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">What to do next</div>
            <div className="space-y-1.5">
              {(clientRisk.recomendaciones || []).slice(0, 4).map((r, i) => (
                <div key={i} className="text-xs text-gray-700 leading-snug">{r}</div>
              ))}
            </div>
          </div>
        )}

        {onRefresh && (
          <button
            onClick={onRefresh}
            className={`w-full py-2.5 rounded-xl font-bold text-white text-sm shadow transition-all active:scale-[0.98] bg-gradient-to-r ${tone.button}`}
          >
            Refresh Analysis
          </button>
        )}
      </div>
    </div>
  );
}
