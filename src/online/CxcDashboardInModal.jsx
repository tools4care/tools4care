// src/online/CxcDashboardInModal.jsx
import React from "react";
import CxcDashboard from "./CxcDashboard";

export default function CxcDashboardInModal({ open, onClose, apiBase }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2">
      <div className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="px-4 py-2 border-b flex items-center justify-between">
          <h2 className="font-semibold">Cuentas por Cobrar</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300">
            Cerrar
          </button>
        </div>
        <div className="p-3 overflow-auto grow">
          <CxcDashboard apiBase={apiBase || location.origin} />
        </div>
      </div>
    </div>
  );
}
