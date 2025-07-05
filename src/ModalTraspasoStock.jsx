import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function ModalTraspasoStock({ abierto, cerrar, ubicaciones, onSuccess }) {
  const [origenKey, setOrigenKey] = useState("");
  const [destinoKey, setDestinoKey] = useState("");
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState("");
  const [productoNombre, setProductoNombre] = useState("");
  const [cantidad, setCantidad] = useState(1);

  // Para autocompletar
  const [filtro, setFiltro] = useState("");
  const [mostrarOpciones, setMostrarOpciones] = useState(false);

  useEffect(() => {
    if (abierto && ubicaciones.length > 1) {
      setOrigenKey(ubicaciones[0].key);
      setDestinoKey(ubicaciones[1].key);
      cargarProductos(ubicaciones[0]);
      setProductoId("");
      setProductoNombre("");
      setFiltro("");
      setCantidad(1);
    }
    // eslint-disable-next-line
  }, [abierto, ubicaciones]);

  async function cargarProductos(ubicacion) {
    if (!ubicacion) return;
    let tabla = ubicacion.tipo === "almacen" ? "stock_almacen" : "stock_van";
    let query = supabase.from(tabla).select("producto_id, cantidad, productos(nombre, marca)");
    if (ubicacion.tipo === "van") {
      query = query.eq("van_id", ubicacion.id);
    }
    const { data } = await query;
    setProductos(data || []);
  }

  async function transferirStock(e) {
    e.preventDefault();
    const origen = ubicaciones.find(u => u.key === origenKey);
    const destino = ubicaciones.find(u => u.key === destinoKey);
    if (!origen || !destino || origen.key === destino.key || !productoId) return;

    let tablaOrigen = origen.tipo === "almacen" ? "stock_almacen" : "stock_van";
    let filtroOrigen = origen.tipo === "almacen" ? { producto_id: productoId } : { producto_id: productoId, van_id: origen.id };
    let { data: stockOrigen } = await supabase.from(tablaOrigen).select("*").match(filtroOrigen).maybeSingle();

    if (!stockOrigen || stockOrigen.cantidad < cantidad) {
      alert("No hay suficiente stock en el origen.");
      return;
    }

    // Descontar en origen
    await supabase.from(tablaOrigen)
      .update({ cantidad: stockOrigen.cantidad - Number(cantidad) })
      .match(filtroOrigen);

    // Sumar en destino
    let tablaDestino = destino.tipo === "almacen" ? "stock_almacen" : "stock_van";
    let filtroDestino = destino.tipo === "almacen" ? { producto_id: productoId } : { producto_id: productoId, van_id: destino.id };
    let { data: stockDestino } = await supabase.from(tablaDestino).select("*").match(filtroDestino).maybeSingle();
    if (stockDestino) {
      await supabase.from(tablaDestino)
        .update({ cantidad: stockDestino.cantidad + Number(cantidad) })
        .match(filtroDestino);
    } else {
      await supabase.from(tablaDestino)
        .insert([{ ...filtroDestino, cantidad: Number(cantidad) }]);
    }
    onSuccess();
    cerrar();
  }

  // Opciones filtradas para el autocompletado
  const opcionesFiltradas = productos.filter(item =>
    (item.productos?.nombre || "").toLowerCase().includes(filtro.toLowerCase()) ||
    (item.productos?.marca || "").toLowerCase().includes(filtro.toLowerCase())
  );

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <form onSubmit={transferirStock} className="bg-white p-6 rounded shadow w-96">
        <h2 className="font-bold mb-4">Transferir Stock</h2>
        <div className="mb-2 flex gap-2">
          <select className="border rounded p-2 flex-1" value={origenKey} onChange={e => {
            setOrigenKey(e.target.value);
            const origen = ubicaciones.find(u => u.key === e.target.value);
            cargarProductos(origen);
            setProductoId("");
            setProductoNombre("");
            setFiltro("");
          }}>
            {ubicaciones.map(u => (
              <option key={u.key} value={u.key}>{u.nombre}</option>
            ))}
          </select>
          <span className="mx-2">→</span>
          <select className="border rounded p-2 flex-1" value={destinoKey} onChange={e => setDestinoKey(e.target.value)}>
            {ubicaciones.map(u => (
              <option key={u.key} value={u.key}>{u.nombre}</option>
            ))}
          </select>
        </div>
        {/* Autocompletar de producto */}
        <div className="relative mb-2">
          <input
            className="border p-2 rounded w-full"
            placeholder="Buscar producto"
            value={filtro || productoNombre}
            onChange={e => {
              setFiltro(e.target.value);
              setProductoNombre("");
              setProductoId("");
              setMostrarOpciones(true);
            }}
            onFocus={() => setMostrarOpciones(true)}
            autoComplete="off"
          />
          {mostrarOpciones && filtro.length > 0 && (
            <ul className="absolute z-10 bg-white border rounded w-full max-h-48 overflow-y-auto mt-1">
              {opcionesFiltradas.length === 0 && (
                <li className="p-2 text-gray-400">No encontrado</li>
              )}
              {opcionesFiltradas.map((item) => (
                <li
                  key={item.producto_id}
                  className="p-2 hover:bg-blue-100 cursor-pointer"
                  onClick={() => {
                    setProductoId(item.producto_id);
                    setProductoNombre(`${item.productos?.nombre}${item.productos?.marca ? " - " + item.productos?.marca : ""}`);
                    setFiltro("");
                    setMostrarOpciones(false);
                  }}
                >
                  {item.productos?.nombre} {item.productos?.marca ? `- ${item.productos?.marca}` : ""} (Disp: {item.cantidad})
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          className="w-full border rounded mb-2 p-2"
          type="number"
          required
          min={1}
          value={cantidad}
          onChange={e => setCantidad(e.target.value)}
        />
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-green-600 text-white px-4 py-1 rounded" disabled={!productoId}>Transferir</button>
          <button type="button" className="bg-gray-300 px-4 py-1 rounded" onClick={cerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
