import React, { useMemo, useState } from "react";
import { generarPlanPago } from "../lib/creditRulesEngine";
import { crearAcuerdo } from "../lib/paymentAgreements";

const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Admin/supervisor-only: re-plan a client's current payment agreement with a
// different number of installments. Reuses crearAcuerdo() with montoCredito=0
// — since a client already has an active agreement, that function folds its
// remaining balance into a fresh plan and marks the old one "renegociado"
// (kept for history, not deleted). Same consolidation path used at sale time.
export default function ModifyAgreementModal({
  clienteId,
  clienteName = "",
  vanId = null,
  usuarioId = null,
  montoPendiente = 0,
  numCuotasActual = null,
  onClose,
  onSaved,
}) {
  const [numCuotas, setNumCuotas] = useState(numCuotasActual || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const plan = useMemo(() => {
    if (montoPendiente <= 0) return null;
    try {
      return generarPlanPago(montoPendiente, { numCuotas: numCuotas || undefined });
    } catch {
      return null;
    }
  }, [montoPendiente, numCuotas]);

  const handleConfirm = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await crearAcuerdo({
        clienteId,
        vanId,
        usuarioId,
        montoCredito: 0,
        numCuotas: plan?.num_cuotas || numCuotas || 1,
      });
      if (!result.ok) throw new Error(result.error || "Could not update the plan");
      onSaved?.(result);
      onClose?.();
    } catch (e) {
      setError(e.message || "Could not update the plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="bg-indigo-600 p-4 rounded-t-2xl text-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">✏️ Modify Payment Plan</h2>
            <button onClick={onClose} className="text-white/80 hover:text-white text-xl w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center">✕</button>
          </div>
          <p className="text-sm opacity-90 mt-1">{clienteName} — Current balance: {fmt(montoPendiente)}</p>
        </div>

        <div className="p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">New number of installments:</label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button
                key={n}
                onClick={() => setNumCuotas(n)}
                className={`py-3 rounded-lg text-center font-bold text-lg transition-all border-2 ${
                  (numCuotas || plan?.num_cuotas) === n
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md scale-105"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {!numCuotas && "Auto-selected based on amount"}
            {numCuotas && `${numCuotas} payment${numCuotas > 1 ? "s" : ""} of ${plan?.cuotas?.[0]?.monto ? fmt(plan.cuotas[0].monto) : fmt(montoPendiente / numCuotas)}`}
          </p>
        </div>

        {plan?.cuotas?.length > 0 && (
          <div className="mx-4 mb-4 bg-gray-50 border rounded-lg p-3">
            <div className="text-sm font-semibold text-gray-700 mb-2">📅 New Schedule</div>
            <div className="space-y-1.5">
              {plan.cuotas.map((c) => (
                <div key={c.numero_cuota} className="flex justify-between items-center text-sm bg-white rounded px-3 py-2 border">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">{c.numero_cuota}</span>
                    <span className="text-gray-600">{c.fecha_display}</span>
                  </div>
                  <span className="font-bold text-gray-900">{fmt(c.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="p-4 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || montoPendiente <= 0}
            className="flex-1 py-3 rounded-xl font-bold text-white transition-all bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg disabled:opacity-50"
          >
            {saving ? "Saving..." : "✅ Save New Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
