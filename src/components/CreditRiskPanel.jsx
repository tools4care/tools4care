import React from "react";

const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CreditRiskPanel({ clientRisk, creditProfile, reglasCredito, cxcBalance, cxcLimit, cxcAvailable, saleTotal, onRefresh }) {
  if (!clientRisk) return null;
  const nivel = clientRisk.nivelRiesgo || "nuevo";
  const score = clientRisk.score ?? 0;
  const scorePercent = Math.min(100, score);
  const aprobado = clientRisk.decision === "aprobar" || clientRisk.decision === "approve";
  const tendencia = clientRisk.tendenciaConsumo;
  const frecuencia = clientRisk.frecuencia;
  const recomendaciones = clientRisk.recomendaciones || [];
  const colors = nivel === "bajo" ? { bg: "from-emerald-500 to-green-600", badge: "bg-emerald-100 text-emerald-800", label: "LOW RISK" } : nivel === "medio" ? { bg: "from-amber-500 to-yellow-600", badge: "bg-amber-100 text-amber-800", label: "MEDIUM RISK" } : nivel === "alto" ? { bg: "from-red-500 to-rose-600", badge: "bg-red-100 text-red-800", label: "HIGH RISK" } : { bg: "from-blue-500 to-indigo-600", badge: "bg-blue-100 text-blue-800", label: "NEW CLIENT" };

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-lg mt-4">
      <div className={"bg-gradient-to-r " + colors.bg + " p-4 text-white"}>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={"text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full " + colors.badge}>{colors.label}</span>
              {aprobado && <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">APPROVED</span>}
            </div>
            <div className="text-sm opacity-90 font-medium mt-1">{clientRisk.descripcion || clientRisk.descripcionNivel || ""}</div>
          </div>
          <div className="relative w-16 h-16 shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="white" strokeWidth="3" strokeDasharray={scorePercent + ", 100"} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-lg font-black leading-none">{score}</div>
              <div className="text-[8px] opacity-70 font-bold">/100</div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-gray-100 bg-white">
        <div className="p-3 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-0.5">Available</div>
          <div className="text-lg font-black text-emerald-600">{fmt(cxcAvailable || 0)}</div>
        </div>
        <div className="p-3 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-0.5">Limit</div>
          <div className="text-lg font-black text-gray-700">{fmt(cxcLimit || 0)}</div>
        </div>
        <div className="p-3 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-0.5">Usage</div>
          <div className={"text-lg font-black " + (cxcLimit > 0 && cxcBalance / cxcLimit > 0.7 ? "text-red-600" : "text-blue-600")}>{cxcLimit > 0 ? Math.round((cxcBalance / cxcLimit) * 100) : 0}%</div>
        </div>
      </div>
      <div className="px-4 py-3 bg-gray-50 space-y-2">
        {reglasCredito?.montoMaximo > 0 && (
          <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
            <span className="text-xs text-gray-600 font-semibold">Max Recommended</span>
            <span className="text-lg font-black text-gray-800">{fmt(reglasCredito.montoMaximo)}</span>
          </div>
        )}
        <div className="flex gap-2">
          {frecuencia && (
            <div className="flex-1 bg-white rounded-lg px-3 py-2 border border-gray-200">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{frecuencia.frecuencia === "muy_alta" ? "🔥" : frecuencia.frecuencia === "alta" ? "⚡" : frecuencia.frecuencia === "normal" ? "🔄" : frecuencia.frecuencia === "baja" ? "⏰" : frecuencia.frecuencia === "muy_baja" ? "😴" : "🆕"}</span>
                <div>
                  <div className="text-xs font-bold text-gray-800 leading-tight">{frecuencia.descripcion || "New"}</div>
                  {frecuencia.diasEntreFechas && <div className="text-[10px] text-gray-500">Every {frecuencia.diasEntreFechas}d</div>}
                </div>
              </div>
            </div>
          )}
          {tendencia && (
            <div className="flex-1 bg-white rounded-lg px-3 py-2 border border-gray-200">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{tendencia.tendencia === "creciente" ? "📈" : tendencia.tendencia === "estable" ? "➡️" : tendencia.tendencia === "decreciente" ? "📉" : "❓"}</span>
                <div>
                  <div className="text-xs font-bold text-gray-800 leading-tight">{tendencia.tendencia === "creciente" ? "Growing" : tendencia.tendencia === "estable" ? "Stable" : tendencia.tendencia === "decreciente" ? "Declining" : "N/A"}</div>
                  {tendencia.promedioReciente !== undefined && <div className="text-[10px] text-gray-500">Avg {fmt(tendencia.promedioReciente)}</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {recomendaciones.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">Agent Recommendations</div>
          <div className="space-y-1.5">
            {recomendaciones.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                <span className="leading-tight">{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {onRefresh && (
        <div className="px-4 pb-4 pt-1">
          <button onClick={onRefresh} className="w-full py-2.5 rounded-xl font-bold text-white text-sm shadow transition-all active:scale-[0.98]" style={{ background: "linear-gradient(135deg, #1a1a2e, #0f3460)" }}>Refresh Analysis</button>
        </div>
      )}
    </div>
  );
}
