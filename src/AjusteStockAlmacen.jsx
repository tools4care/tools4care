import { useState } from "react";
import AjusteStockAlmacen from "./AjusteStockAlmacen";
import { supabase } from "./supabaseClient";

// Ejemplo de productos en inventario actual (puedes obtenerlo de tu fetch)
const inventarioEjemplo = [
  { id: 1, nombre: "Producto A", cantidad: 10, producto_id: 1 },
  { id: 2, nombre: "Producto B", cantidad: 5, producto_id: 2 },
];

export default function InventarioDemo() {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);

  // Simulación de almacén seleccionado (debes usar tu estado real)
  const almacenSeleccionado = { id: 1, nombre: "Central Warehouse" };

  async function handleGuardarStock(nuevaCantidad) {
    // ¡Aquí el truco! Filtra por producto_id Y almacen_id
    await supabase
      .from('stock_almacen')
      .update({ cantidad: nuevaCantidad })
      .eq('producto_id', productoSeleccionado.producto_id)
      .eq('almacen_id', almacenSeleccionado.id);

    setModalAbierto(false);
    // Aquí deberías recargar el inventario real
    // await fetchInventario();
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Inventario</h2>
      <table className="min-w-full border">
        <thead>
          <tr>
            <th className="border p-2">Nombre</th>
            <th className="border p-2">Cantidad</th>
            <th className="border p-2">Acción</th>
          </tr>
        </thead>
        <tbody>
          {inventarioEjemplo.map((prod) => (
            <tr key={prod.id}>
              <td className="border p-2">{prod.nombre}</td>
              <td className="border p-2">{prod.cantidad}</td>
              <td className="border p-2">
                <button
                  className="bg-blue-500 text-white px-2 py-1 rounded"
                  onClick={() => {
                    setProductoSeleccionado(prod);
                    setModalAbierto(true);
                  }}
                >
                  Ajustar stock
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {modalAbierto && productoSeleccionado && (
        <AjusteStockAlmacen
          producto={productoSeleccionado}
          onGuardar={handleGuardarStock}
          onCancelar={() => setModalAbierto(false)}
        />
      )}
    </div>
  );
}
