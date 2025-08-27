// SelectorFechas.jsx
import { useState } from "react";

export default function SelectorFechas({ fechaInicio, setFechaInicio, fechaFin, setFechaFin }) {
  // Hoy por defecto
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center gap-3 mb-4">
      <label className="font-bold">Desde:</label>
      <input
        type="date"
        className="border p-1 rounded"
        value={fechaInicio}
        max={fechaFin}
        onChange={e => setFechaInicio(e.target.value)}
      />
      <label className="font-bold">Hasta:</label>
      <input
        type="date"
        className="border p-1 rounded"
        value={fechaFin}
        min={fechaInicio}
        max={hoy}
        onChange={e => setFechaFin(e.target.value)}
      />
    </div>
  );
}
