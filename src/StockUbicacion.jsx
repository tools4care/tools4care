import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function StockUbicacion({ tipo, ubicacionId }) {
  const [stock, setStock] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    async function cargarStock() {
      let stockData = [];
      // DEBUG: mostrar tipo e id recibidos
      console.log("[StockUbicacion] tipo:", tipo, "| ubicacionId:", ubicacionId);

      if (tipo === "almacen") {
        const { data } = await supabase
          .from("stock_almacen")
          .select("cantidad, producto_id, productos:producto_id (nombre, codigo, marca, categoria, precio, costo)")
          .order("producto_id");
        stockData = data || [];
        console.log("[StockUbicacion] stock almacen:", stockData);
      } else if (tipo === "van" && ubicacionId) {
        // Nos aseguramos que el filtro usa el uuid como string
        const { data, error } = await supabase
          .from("stock_van")
          .select("cantidad, producto_id, productos:producto_id (nombre, codigo, marca, categoria, precio, costo), van_id")
          .eq("van_id", String(ubicacionId))
          .order("producto_id");
        stockData = data || [];
        console.log("[StockUbicacion] stock van:", stockData, "| error:", error);
      }
      setStock(stockData);
      setCargando(false);
    }
    cargarStock();
  }, [tipo, ubicacionId]);

  if (cargando) return <div className="text-gray-500 py-10 text-center">Cargando inventario...</div>;

  if (!stock.length) return <div className="text-gray-500 p-4">No hay productos registrados.</div>;

  return (
    <div className="overflow-x-auto rounded-2xl shadow">
      <table className="min-w-full bg-white text-xs md:text-sm">
        <thead className="sticky top-0 bg-blue-50 z-10">
          <tr>
            <th className="p-2">Código</th>
            <th className="p-2">Nombre</th>
            <th className="p-2">Marca</th>
            <th className="p-2">Categoría</th>
            <th className="p-2">Costo</th>
            <th className="p-2">Precio</th>
            <th className="p-2">Cantidad</th>
            <th className="p-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {stock.map(({ productos, cantidad, producto_id }) => {
            const bajoStock = cantidad < 5;
            return (
              <tr key={producto_id} className={bajoStock ? "bg-red-50" : ""}>
                <td className="p-2">{productos?.codigo || "-"}</td>
                <td className="p-2">{productos?.nombre || "-"}</td>
                <td className="p-2">{productos?.marca || "-"}</td>
                <td className="p-2">{productos?.categoria || "-"}</td>
                <td className="p-2">${productos?.costo ?? "-"}</td>
                <td className="p-2">${productos?.precio ?? "-"}</td>
                <td className="p-2 font-bold text-center">
                  {cantidad}
                  {bajoStock && (
                    <span className="inline-block ml-2 text-xs bg-red-200 text-red-800 rounded-full px-2 py-0.5 font-semibold">
                      Bajo
                    </span>
                  )}
                </td>
                <td className="p-2">
                  {bajoStock ? (
                    <span className="bg-red-100 text-red-700 px-2 rounded-full text-xs">¡Atención!</span>
                  ) : (
                    <span className="bg-green-100 text-green-700 px-2 rounded-full text-xs">OK</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
