import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function AgregarStockModal({ abierto, cerrar, tipo, ubicacionId, onSuccess }) {
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (abierto) {
      cargarProductos();
      setBusqueda("");
      setProductoId("");
      setCantidad(1);
      setShowDropdown(false);
    }
    // eslint-disable-next-line
  }, [abierto]);

  async function cargarProductos() {
    const { data } = await supabase.from("productos").select("id, nombre, marca, codigo");
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

  // Filtra productos por nombre, marca o código
  const productosFiltrados = productos.filter((p) => {
    const search = busqueda.toLowerCase();
    return (
      (p.nombre || "").toLowerCase().includes(search) ||
      (p.marca || "").toLowerCase().includes(search) ||
      (p.codigo || "").toLowerCase().includes(search)
    );
  });

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <form onSubmit={agregarStock} className="bg-white p-6 rounded shadow w-80">
        <h2 className="font-bold mb-4">Agregar Stock</h2>
        {/* Campo de búsqueda con resultados */}
        <div className="mb-2 relative">
          <input
            type="text"
            className="w-full border rounded p-2"
            placeholder="Buscar producto por nombre, marca o código"
            value={busqueda}
            onChange={e => {
              setBusqueda(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
          />
          {showDropdown && busqueda && (
            <div
              className="absolute z-20 bg-white border rounded shadow max-h-40 w-full overflow-y-auto"
              onMouseLeave={() => setShowDropdown(false)}
            >
              {productosFiltrados.length === 0 && (
                <div className="p-2 text-gray-400">No hay productos.</div>
              )}
              {productosFiltrados.slice(0, 15).map(p => (
                <div
                  key={p.id}
                  className={`p-2 cursor-pointer hover:bg-blue-100 ${productoId === p.id ? "bg-blue-200" : ""}`}
                  onClick={() => {
                    setProductoId(p.id);
                    setBusqueda(
                      `${p.nombre}${p.marca ? " - " + p.marca : ""}${p.codigo ? " (" + p.codigo + ")" : ""}`
                    );
                    setShowDropdown(false);
                  }}
                >
                  <span className="font-bold">{p.nombre}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.marca}</span>
                  <span className="text-xs text-gray-400 ml-2">{p.codigo}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Input hidden para que sea requerido */}
        <input type="hidden" value={productoId} required onChange={() => {}} />
        <input
          className="w-full border rounded mb-2 p-2"
          type="number"
          required
          min={1}
          value={cantidad}
          onChange={e => setCantidad(e.target.value)}
        />
        <div className="flex gap-2 mt-2">
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-1 rounded"
            disabled={!productoId}
          >
            Agregar
          </button>
          <button type="button" className="bg-gray-300 px-4 py-1 rounded" onClick={cerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
