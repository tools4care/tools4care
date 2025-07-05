import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function AgregarStockModal({ abierto, cerrar, tipo, ubicacionId, onSuccess }) {
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(1);

  useEffect(() => {
    if (abierto) {
      cargarProductos();
    }
    // eslint-disable-next-line
  }, [abierto]);

  async function cargarProductos() {
    const { data } = await supabase.from("productos").select("id, nombre, marca");
    setProductos(data || []);
  }

  async function agregarStock(e) {
    e.preventDefault();
    let tabla = tipo === "almacen" ? "stock_almacen" : "stock_van";
    let filtro = tipo === "almacen" ? { producto_id: productoId } : { producto_id: productoId, van_id: ubicacionId };
    // Busca si ya existe
    let { data: existente } = await supabase.from(tabla).select("*").match(filtro).maybeSingle();

    if (existente) {
      await supabase.from(tabla)
        .update({ cantidad: existente.cantidad + Number(cantidad) })
        .match(filtro);
    } else {
      await supabase.from(tabla)
        .insert([{ ...filtro, cantidad: Number(cantidad) }]);
    }
    onSuccess();
    cerrar();
  }

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <form onSubmit={agregarStock} className="bg-white p-6 rounded shadow w-80">
        <h2 className="font-bold mb-4">Agregar Stock</h2>
        <select
          className="w-full border rounded mb-2"
          required
          value={productoId}
          onChange={e => setProductoId(e.target.value)}
        >
          <option value="">Selecciona producto</option>
          {productos.map(p => (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.marca ? `- ${p.marca}` : ""}
            </option>
          ))}
        </select>
        <input
          className="w-full border rounded mb-2 p-2"
          type="number"
          required
          min={1}
          value={cantidad}
          onChange={e => setCantidad(e.target.value)}
        />
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">Agregar</button>
          <button type="button" className="bg-gray-300 px-4 py-1 rounded" onClick={cerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
