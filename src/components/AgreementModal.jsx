// src/components/AgreementModal.jsx
// ============================================================
// Modal para seleccionar cuotas antes de guardar venta con crédito
// ============================================================

import React, { useState, useMemo } from "react";
import { generarPlanPago } from "../lib/creditRulesEngine";

export default function AgreementModal({
  isOpen,
  onClose,
  onConfirm,
  montoCredito = 0,
  clientName = "",
  saldoActual = 0,
  reglasCredito = null,
}) {
  const [numCuotas, setNumCuotas] = useState(null); // null = auto
  const [isException, setIsException] = useState(false);
  const [exceptionNote, setExceptionNote] = useState("");

  // Generar plan según cuotas seleccionadas
  const plan = useMemo(() => {
    if (montoCredito <= 0) return null;
    try {
      return generarPlanPago(montoCredito, {
        numCuotas: numCuotas || undefined,
      });
    } catch (e) {
      console.warn("Error generando plan:", e);
      return null;
    }
  }, [montoCredito, numCuotas]);

  if (!isOpen || montoCredito <= 0) return null;

  const needsException = reglasCredito?.requiereExcepcion || false;
  const warnings = reglasCredito?.advertencias || [];
  const nivel = reglasCredito?.nivel || "verde";

  const handleConfirm = () => {
    onConfirm({
      plan,
      numCuotas: plan?.num_cuotas || numCuotas || 1,
      isException,
      exceptionNote: isException
        ? exceptionNote || `Override at ${new Date().toLocaleString()}`
        : "",
    });
  };

  const canConfirm = needsException ? isException && exceptionNote.trim().length > 0 : true;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div
          className={`p-4 rounded-t-2xl ${
            nivel === "congelado"
              ? "bg-red-600"
              : nivel === "rojo"
              ? "bg-orange-500"
              : nivel === "amarillo"
              ? "bg-yellow-500"
              : "bg-blue-600"
          } text-white`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              📋 Payment Agreement
            </h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-xl w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"
            >
              ✕
            </button>
          </div>
          <p className="text-sm opacity-90 mt-1">
            {clientName} — Credit: ${montoCredito.toFixed(2)}
          </p>
          {saldoActual > 0 && (
            <p className="text-xs opacity-75 mt-0.5">
              Existing balance: ${saldoActual.toFixed(2)}
            </p>
          )}
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mx-4 mt-4 bg-amber-50 border border-amber-300 rounded-lg p-3">
            <div className="font-semibold text-amber-800 text-sm mb-1">⚠️ Warnings:</div>
            {warnings.map((w, i) => (
              <div key={i} className="text-xs text-amber-700 mt-1">
                • {w}
              </div>
            ))}
          </div>
        )}

        {/* Cuotas Selector */}
        <div className="p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Number of Installments:
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button
                key={n}
                onClick={() => setNumCuotas(n)}
                className={`py-3 rounded-lg text-center font-bold text-lg transition-all border-2 ${
                  (numCuotas || plan?.num_cuotas) === n
                    ? "bg-blue-600 text-white border-blue-600 shadow-md scale-105"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {!numCuotas && "Auto-selected based on amount"}
            {numCuotas &&
              `${numCuotas} payment${numCuotas > 1 ? "s" : ""} of $${
                plan?.cuotas?.[0]?.monto?.toFixed(2) || (montoCredito / numCuotas).toFixed(2)
              }`}
          </p>
        </div>

        {/* Plan Preview */}
        {plan && plan.cuotas && plan.cuotas.length > 0 && (
          <div className="mx-4 mb-4 bg-gray-50 border rounded-lg p-3">
            <div className="text-sm font-semibold text-gray-700 mb-2">
              📅 Payment Schedule:
            </div>
            <div className="space-y-1.5">
              {plan.cuotas.map((c, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center text-sm bg-white rounded px-3 py-2 border"
                >
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                      {c.numero_cuota}
                    </span>
                    <span className="text-gray-600">
                      {c.fecha_display || new Date(c.fecha_vencimiento).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="font-bold text-gray-900">${c.monto.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t flex justify-between text-sm font-bold">
              <span>Total:</span>
              <span className="text-blue-700">${montoCredito.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Exception checkbox (si es requerido) */}
        {needsException && (
          <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isException}
                onChange={(e) => setIsException(e.target.checked)}
                className="mt-1 w-4 h-4 accent-red-600"
              />
              <div>
                <div className="text-sm font-semibold text-red-800">
                  🔓 Override — Seller Exception
                </div>
                <div className="text-xs text-red-600 mt-0.5">
                  This sale exceeds normal credit rules. Check to approve with justification.
                </div>
              </div>
            </label>
            {isException && (
              <textarea
                value={exceptionNote}
                onChange={(e) => setExceptionNote(e.target.value)}
                placeholder="Reason for exception..."
                className="w-full mt-2 text-sm border border-red-300 rounded-lg p-2 focus:ring-2 focus:ring-red-400 focus:outline-none"
                rows={2}
              />
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="p-4 border-t flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`flex-1 py-3 rounded-xl font-bold text-white transition-all ${
              canConfirm
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            ✅ Confirm & Save
          </button>
        </div>
      </div>
    </div>
  );
}