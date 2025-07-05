import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function StockAlmacen() {
  const [filas, setFilas] = useState([]);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    cargarStock();
  }, []);

  async function cargarStock() {
    setMensaje("");
    const { data, error } = await supabase
      .from("stock_almacen")
      .select(`
        id,
        cantidad,
        producto:producto_id (
          id,
          codigo,
          nombre,
          marca,
          categoria,
          precio
        )
      `)
      .order("id", { ascending: true });
    if (error) setMensaje("Error: " + error.message);
    else setFilas(data || []);
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-blue-900">Stock de Almacén</h2>
      {mensaje && (
        <div className="bg-red-100 text-red-700 p-2 rounded mb-4">{mensaje}</div>
      )}
      <table className="min-w-full bg-white rounded shadow">
        <thead>
          <tr>
            <th className="p-2">Código</th>
            <th className="p-2">Nombre</th>
            <th className="p-2">Marca</th>
            <th className="p-2">Categoría</th>
            <th className="p-2">Precio</th>
            <th className="p-2">Stock almacén</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.id}>
              <td className="p-2">{fila.producto?.codigo}</td>
              <td className="p-2">{fila.producto?.nombre}</td>
              <td className="p-2">{fila.producto?.marca}</td>
              <td className="p-2">{fila.producto?.categoria}</td>
              <td className="p-2">${fila.producto?.precio}</td>
              <td className="p-2 font-bold">{fila.cantidad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
