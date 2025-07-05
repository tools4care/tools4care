import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function AgregarStockModal({
  abierto,
  cerrar,
  tipo,
  ubicacionId,
  onSuccess,
}) {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtrados, setFiltrados] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cantidad, setCantidad] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  // Cargar productos al abrir el modal
  useEffect(() => {
    if (!abierto) return;
    async function fetchProductos() {
      const { data, error } = await supabase.from("productos").select("id, nombre, codigo, marca");
      setProductos(data || []);
    }
    fetchProductos();
    setBusqueda("");
    setProductoSeleccionado(null);
    setCantidad("");
    setMensaje("");
  }, [abierto]);

  // Filtrado en tiempo real
  useEffect(() => {
    if (!busqueda) {
      setFiltrados([]);
      return;
    }
    const term = busqueda.toLowerCase();
    setFiltrados(
      productos.filter(
        p =>
          p.nombre.toLowerCase().includes(term) ||
          p.codigo?.toLowerCase().includes(term) ||
          p.marca?.toLowerCase().includes(term)
      )
    );
  }, [busqueda, productos]);

  async function handleAgregarStock(e) {
    e.preventDefault();
    setMensaje("");
    if (!productoSeleccionado || !cantidad) {
      setMensaje("Selecciona producto y cantidad");
      return;
    }
    setLoading(true);

    let tabla = tipo === "almacen" ? "stock_almacen" : "stock_van";
    let values =
      tipo === "almacen"
        ? { producto_id: productoSeleccionado.id, cantidad: Number(cantidad) }
        : { producto_id: productoSeleccionado.id, van_id: ubicacionId, cantidad: Number(cantidad) };

    let query =
      tipo === "almacen"
        ? supabase.from("stock_almacen").select("*").eq("producto_id", productoSeleccionado.id)
        : supabase.from("stock_van").select("*").eq("producto_id", productoSeleccionado.id).eq("van_id", ubicacionId);

    let { data: stockExistente, error: errorBuscar } = await query.single();

    let result;
    if (stockExistente) {
      // Sumar a la cantidad actual
      const nuevaCantidad = Number(stockExistente.cantidad) + Number(cantidad);
      result = await supabase
        .from(tabla)
        .update({ cantidad: nuevaCantidad })
        .eq("id", stockExistente.id);
    } else {
      // Insertar nuevo registro
      result = await supabase.from(tabla).insert([values]);
    }

    setLoading(false);

    if (result.error) {
      setMensaje("Error: " + result.error.message);
    } else {
      setMensaje("Stock agregado correctamente.");
      setBusqueda("");
      setProductoSeleccionado(null);
      setCantidad("");
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setMensaje("");
        cerrar();
      }, 800);
    }
  }

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h2 className="text-xl font-bold mb-4 text-blue-900">
          {tipo === "almacen" ? "Agregar Stock al Almacén Central" : "Agregar Stock a la Van"}
        </h2>
        <form onSubmit={handleAgregarStock} className="flex flex-col gap-4">
          <div>
            <label className="block font-semibold">Producto:</label>
            <input
              type="text"
              className="border rounded p-2 w-full"
              placeholder="Busca por nombre, código o marca"
              value={busqueda}
              onChange={e => {
                setBusqueda(e.target.value);
                setProductoSeleccionado(null);
              }}
            />
            {/* Lista de resultados */}
            {busqueda && filtrados.length > 0 && (
              <ul className="border rounded mt-1 max-h-32 overflow-y-auto bg-white shadow z-10 absolute w-full">
                {filtrados.slice(0, 10).map(prod => (
                  <li
                    key={prod.id}
                    className={`px-3 py-2 hover:bg-blue-100 cursor-pointer ${
                      productoSeleccionado && prod.id === productoSeleccionado.id ? "bg-blue-200" : ""
                    }`}
                    onClick={() => {
                      setProductoSeleccionado(prod);
                      setBusqueda(`${prod.nombre} (${prod.codigo})`);
                    }}
                  >
                    {prod.nombre} | {prod.marca} | {prod.codigo}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {productoSeleccionado && (
            <div>
              <div>Seleccionado: <b>{productoSeleccionado.nombre}</b> ({productoSeleccionado.codigo})</div>
              <input
                type="number"
                className="border rounded p-2 w-full mt-2"
                placeholder="Cantidad"
                value={cantidad}
                min={1}
                onChange={e => setCantidad(e.target.value)}
                required
              />
            </div>
          )}

          {mensaje && (
            <div className={mensaje.startsWith("Error") ? "text-red-700" : "text-green-700"}>
              {mensaje}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-blue-700 hover:bg-blue-900 text-white px-4 py-2 rounded flex-1"
              disabled={loading}
            >
              {loading ? "Guardando..." : "Agregar"}
            </button>
            <button
              type="button"
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded flex-1"
              onClick={cerrar}
              disabled={loading}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
