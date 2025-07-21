import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

export default function AgregarStockModal({
  abierto,
  cerrar,
  tipo = "almacen",
  ubicacionId = null,
  onSuccess,
  modoSuma = false,
}) {
  const [busqueda, setBusqueda] = useState("");
  const [opciones, setOpciones] = useState([]);
  const [seleccion, setSeleccion] = useState(null); // Producto seleccionado
  const [cantidad, setCantidad] = useState(1);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  const timerRef = useRef();

  useEffect(() => {
    if (!abierto) {
      setBusqueda("");
      setOpciones([]);
      setSeleccion(null);
      setCantidad(1);
      setMensaje("");
    }
  }, [abierto]);

  // --- BUSQUEDA DINAMICA: cada vez que escribes
  useEffect(() => {
    if (!abierto) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!busqueda.trim()) {
      setOpciones([]);
      setSeleccion(null);
      setMensaje("");
      return;
    }

    timerRef.current = setTimeout(() => {
      buscarOpciones(busqueda.trim());
    }, 300);

    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line
  }, [busqueda]);

  // Busca tanto en inventario (por ubicacion) como en productos
  async function buscarOpciones(filtro) {
    setLoading(true);
    setOpciones([]);
    setSeleccion(null);
    setMensaje("");

    // Busca en inventario actual
    let tabla = tipo === "almacen" ? "stock_almacen" : "stock_van";
    let query = supabase
      .from(tabla)
      .select("id, cantidad, producto_id, productos(nombre, marca, codigo)")
      .or(
        `productos.codigo.ilike.%${filtro}%,productos.nombre.ilike.%${filtro}%,productos.marca.ilike.%${filtro}%`
      );
    if (tipo === "van") query = query.eq("van_id", ubicacionId);
    let { data: inventarioData } = await query;

    // Busca en productos si no existe o para nuevos
    let { data: productosData } = await supabase
      .from("productos")
      .select("*")
      .or(
        `codigo.ilike.%${filtro}%,nombre.ilike.%${filtro}%,marca.ilike.%${filtro}%`
      );

    // Normaliza para no duplicar (si está ya en inventario, ignora en productos)
    let inventarioIds = (inventarioData || []).map(x => x.producto_id);
    let productosSoloNuevos = (productosData || []).filter(
      p => !inventarioIds.includes(p.id)
    );
    // Junta y normaliza
    let opcionesTodas = [
      ...(inventarioData || []).map(x => ({
        ...x.productos,
        producto_id: x.producto_id,
        enInventario: true,
        cantidad: x.cantidad,
      })),
      ...(productosSoloNuevos || []).map(x => ({
        ...x,
        producto_id: x.id,
        enInventario: false,
        cantidad: 0,
      })),
    ];

    setOpciones(opcionesTodas);
    setLoading(false);

    // Si hay coincidencia exacta, selecciona y muestra mensaje
    let exact = opcionesTodas.find(
      opt =>
        opt.codigo?.toLowerCase() === filtro.toLowerCase() ||
        opt.nombre?.toLowerCase() === filtro.toLowerCase() ||
        opt.marca?.toLowerCase() === filtro.toLowerCase()
    );
    if (exact) {
      setSeleccion(exact);
      setMensaje("¡Coincidencia exacta encontrada! Listo para agregar stock.");
    } else {
      setSeleccion(null);
      setMensaje(
        opcionesTodas.length === 0
          ? "No encontrado. Puedes crearlo en Productos."
          : "Seleccione el producto correcto de la lista."
      );
    }
  }

  async function agregarStock(e) {
    e.preventDefault();
    if (!seleccion || !seleccion.producto_id) return;

    let tabla = tipo === "almacen" ? "stock_almacen" : "stock_van";
    let payload = {
      producto_id: seleccion.producto_id,
      cantidad: Number(cantidad),
    };
    if (tipo === "van") payload.van_id = ubicacionId;

    // Si ya existe en inventario y modo suma, suma stock
    if (seleccion.enInventario && modoSuma) {
      let { error } = await supabase
        .from(tabla)
        .update({ cantidad: seleccion.cantidad + Number(cantidad) })
        .eq("producto_id", seleccion.producto_id)
        .maybeSingle();
      if (!error) {
        onSuccess && onSuccess();
        cerrar();
      }
      return;
    }

    // Si es nuevo en inventario
    let { error } = await supabase.from(tabla).insert([payload]);
    if (!error) {
      onSuccess && onSuccess();
      cerrar();
    }
  }

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <form
        className="bg-white p-6 rounded-xl w-[380px] shadow-xl"
        onSubmit={agregarStock}
        autoComplete="off"
      >
        <h2 className="font-bold mb-2 text-lg">Agregar Stock</h2>
        <input
          className="border p-2 rounded w-full mb-2 font-mono"
          placeholder="Escanea o busca por código, nombre o marca"
          value={busqueda}
          onChange={e => {
            setBusqueda(e.target.value);
            setSeleccion(null);
            setMensaje("");
          }}
          autoFocus
        />

        {/* Lista de opciones */}
        {loading ? (
          <div className="text-blue-500 mb-2">Buscando...</div>
        ) : (
          opciones.length > 0 && (
            <ul className="border rounded max-h-40 overflow-y-auto mb-3 bg-white">
              {opciones.map((opt, idx) => {
                // ¿Coincidencia exacta?
                let isExact =
                  (busqueda &&
                    (opt.codigo?.toLowerCase() === busqueda.toLowerCase() ||
                      opt.nombre?.toLowerCase() === busqueda.toLowerCase() ||
                      opt.marca?.toLowerCase() === busqueda.toLowerCase()));
                return (
                  <li
                    key={opt.producto_id}
                    className={`p-2 border-b cursor-pointer flex flex-col ${
                      isExact
                        ? "bg-green-100 text-green-900 font-bold"
                        : "hover:bg-blue-50"
                    }`}
                    onClick={() => {
                      setSeleccion(opt);
                      setBusqueda(
                        opt.codigo
                          ? opt.codigo
                          : opt.nombre || opt.marca || ""
                      );
                      setMensaje(
                        isExact
                          ? "¡Coincidencia exacta encontrada! Listo para agregar stock."
                          : "Producto seleccionado. Verifica antes de agregar."
                      );
                    }}
                  >
                    <span>
                      <b>{opt.nombre}</b> {opt.marca && <>- {opt.marca}</>}
                    </span>
                    <span className="text-xs text-gray-600 font-mono">
                      Código: {opt.codigo || "-"}
                    </span>
                    <span className="text-xs">
                      {opt.enInventario
                        ? `Inventario actual: ${opt.cantidad}`
                        : "Nuevo en inventario"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {/* Mensaje confirmación */}
        {mensaje && (
          <div
            className={`mb-2 p-2 rounded text-center ${
              seleccion
                ? "bg-green-100 text-green-900"
                : opciones.length === 0
                ? "bg-red-100 text-red-800"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {mensaje}
          </div>
        )}

        <input
          type="number"
          className="border p-2 rounded w-full mb-2"
          min={1}
          value={cantidad}
          onChange={e => setCantidad(e.target.value)}
          disabled={!seleccion}
        />
        <div className="flex gap-2 mt-2">
          <button
            type="submit"
            className="bg-blue-700 text-white px-4 py-2 rounded w-full"
            disabled={!seleccion}
          >
            Agregar
          </button>
          <button
            type="button"
            className="bg-gray-300 px-4 py-2 rounded"
            onClick={cerrar}
          >
            Cancelar
          </button>
        </div>
        {!seleccion && (
          <div className="mt-3 text-xs text-gray-400 text-center">
            ¿No aparece? <b>Primero crea el producto</b> desde el módulo de productos.
          </div>
        )}
      </form>
    </div>
  );
}
