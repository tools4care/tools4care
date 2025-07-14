import { useState } from "react";

export default function AjusteStockAlmacen({ producto, onGuardar, onCancelar }) {
  const [cantidad, setCantidad] = useState(producto ? producto.cantidad : 0);

  const handleChange = (e) => {
    const value = e.target.value;
    // Solo permite valores numéricos, incluidos negativos y vacíos temporales
    if (/^-?\d*$/.test(value)) {
      setCantidad(value);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onGuardar(Number(cantidad));
  };

  if (!producto) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
      <div className="bg-white p-6 rounded-lg min-w-[320px] shadow-lg">
        <h2 className="text-lg font-bold mb-4">Ajuste de Stock - {producto.nombre}</h2>
        <form onSubmit={handleSubmit}>
          <label className="block mb-2">
            Nueva cantidad:
            <input
              type="number"
              value={cantidad}
              onChange={handleChange}
              className="border w-full p-2 mt-1"
              autoFocus
              required
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
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
