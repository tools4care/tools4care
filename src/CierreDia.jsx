import { useState } from "react";

export default function CierreDia({ resumen, onCerrar, onCancelar }) {
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
          {/* Puedes agregar más datos al resumen según tu flujo */}
        </div>
        <form onSubmit={handleSubmit}>
          <label className="block mb-2">
            Observaciones:
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
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
