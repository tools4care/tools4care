import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function AgregarStockModal({ abierto, cerrar, tipo, ubicacionId, onSuccess }) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [buscando, setBuscando] = useState(false);

  // Buscar productos en Supabase (por nombre, marca, código)
  async function buscarProductos(texto) {
    setBuscando(true);
    setBusqueda(texto);
    setShowDropdown(true);
    if (!texto.trim()) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    const { data } = await supabase
      .from("productos")
      .select("id, nombre, marca, codigo")
      .or(
        `nombre.ilike.%${texto}%,marca.ilike.%${texto}%,codigo.ilike.%${texto}%`
      )
      .order("nombre")
      .limit(20);
    setResultados(data || []);
    setBuscando(false);
  }

  async function agregarStock(e) {
    e.preventDefault();
    if (!productoSeleccionado?.id) return;
    let tabla = tipo === "almacen" ? "stock_almacen" : "stock_van";
    let filtro = tipo === "almacen"
      ? { producto_id: productoSeleccionado.id }
      : { producto_id: productoSeleccionado.id, van_id: ubicacionId };

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
        <div className="mb-2 relative">
          <input
            type="text"
            className="w-full border rounded p-2"
            placeholder="Buscar producto por nombre, marca o código"
            value={busqueda}
            onChange={e => buscarProductos(e.target.value)}
            onFocus={() => { setShowDropdown(true); if (busqueda) buscarProductos(busqueda); }}
            autoComplete="off"
          />
          {showDropdown && busqueda && (
            <div
              className="absolute z-20 bg-white border rounded shadow max-h-40 w-full overflow-y-auto"
              onMouseLeave={() => setShowDropdown(false)}
            >
              {buscando && <div className="p-2 text-gray-400">Buscando...</div>}
              {!buscando && resultados.length === 0 && (
                <div className="p-2 text-gray-400">No hay productos.</div>
              )}
              {!buscando && resultados.map(p => (
                <div
                  key={p.id}
                  className={`p-2 cursor-pointer hover:bg-blue-100 ${productoSeleccionado?.id === p.id ? "bg-blue-200" : ""}`}
                  onClick={() => {
                    setProductoSeleccionado(p);
                    setBusqueda(`${p.nombre}${p.marca ? " - " + p.marca : ""}${p.codigo ? " (" + p.codigo + ")" : ""}`);
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
        {/* Producto seleccionado */}
        {productoSeleccionado && (
          <div className="text-xs mb-2 text-green-700">
            Seleccionado: <b>{productoSeleccionado.nombre}</b> {productoSeleccionado.marca && `- ${productoSeleccionado.marca}`} {productoSeleccionado.codigo && `(${productoSeleccionado.codigo})`}
          </div>
        )}
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
            disabled={!productoSeleccionado}
          >
            Agregar
          </button>
          <button type="button" className="bg-gray-300 px-4 py-1 rounded" onClick={cerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
