import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

export default function Inventory() {
  const { van } = useVan();
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (van) loadInventory();
    // eslint-disable-next-line
  }, [van]);

  async function loadInventory() {
    setMessage("");
    const { data, error } = await supabase
      .from("inventario") // If your table name is still "inventario", keep it. Change to "inventory" if you also rename in your DB.
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
      .eq("van_id", van.id)
      .order("id", { ascending: true });
    if (error) setMessage("Error: " + error.message);
    else setProducts(data || []);
  }

  if (!van) {
    return <div className="p-6 text-center text-gray-500">Please select a van first.</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-blue-900">Van Inventory</h2>
      {message && (
        <div className="bg-red-100 text-red-700 p-2 rounded mb-4">{message}</div>
      )}
      <table className="min-w-full bg-white rounded shadow">
        <thead>
          <tr>
            <th className="p-2">Code</th>
            <th className="p-2">Name</th>
            <th className="p-2">Brand</th>
            <th className="p-2">Category</th>
            <th className="p-2">Price</th>
            <th className="p-2">Stock</th>
          </tr>
        </thead>
        <tbody>
          {products.map((row) => (
            <tr key={row.id}>
              <td className="p-2">{row.producto?.codigo}</td>
              <td className="p-2">{row.producto?.nombre}</td>
              <td className="p-2">{row.producto?.marca}</td>
              <td className="p-2">{row.producto?.categoria}</td>
              <td className="p-2">${row.producto?.precio}</td>
              <td className="p-2 font-bold">{row.cantidad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
