import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// Tamaño de página
const PAGE_SIZE = 50;

export default function Productos() {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoActual, setProductoActual] = useState(null); // null = nuevo producto
  const [mensaje, setMensaje] = useState("");

  // Cargar productos cada vez que cambian búsqueda o página
  useEffect(() => {
    cargarProductos();
    // eslint-disable-next-line
  }, [busqueda, pagina]);

  async function cargarProductos() {
    setLoading(true);

    let query = supabase
      .from("productos")
      .select("*", { count: "exact" })
      .order("nombre", { ascending: true });

    if (busqueda.trim()) {
      query = query.or(
        `codigo.ilike.%${busqueda}%,nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,categoria.ilike.%${busqueda}%`
      );
    }

    const desde = (pagina - 1) * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;
    query = query.range(desde, hasta);

    const { data, error, count } = await query;
    if (!error) {
      setProductos(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }

  function handleBuscar(e) {
    setPagina(1);
    setBusqueda(e.target.value);
  }

  function handleSiguiente() {
    if (pagina * PAGE_SIZE < total) setPagina(pagina + 1);
  }
  function handleAnterior() {
    if (pagina > 1) setPagina(pagina - 1);
  }

  function abrirModalAgregar() {
    setProductoActual({
      id: null,
      codigo: "",
      nombre: "",
      marca: "",
      categoria: "",
      costo: "",
      precio: ""
    });
    setMensaje("");
    setModalAbierto(true);
  }

  function abrirModalEditar(prod) {
    setProductoActual({
      id: prod.id,
      codigo: prod.codigo || "",
      nombre: prod.nombre || "",
      marca: prod.marca || "",
      categoria: prod.categoria || "",
      costo: prod.costo ?? "",
      precio: prod.precio ?? ""
    });
    setMensaje("");
    setModalAbierto(true);
  }

  function cerrarModal() {
    setModalAbierto(false);
    setProductoActual(null);
    setMensaje("");
  }

  async function guardarProducto(e) {
    e.preventDefault();
    setMensaje("");
    if (!productoActual.codigo || !productoActual.nombre || !productoActual.precio) {
      setMensaje("Completa todos los campos obligatorios.");
      return;
    }
    const dataProducto = {
      codigo: productoActual.codigo,
      nombre: productoActual.nombre,
      marca: productoActual.marca,
      categoria: productoActual.categoria,
      costo: productoActual.costo ? Number(productoActual.costo) : null,
      precio: Number(productoActual.precio),
    };

    let resultado;
    if (productoActual.id) {
      // Editar
      resultado = await supabase.from("productos").update(dataProducto).eq("id", productoActual.id);
      if (!resultado.error) setMensaje("Producto actualizado.");
    } else {
      // Crear
      resultado = await supabase.from("productos").insert([dataProducto]);
      if (!resultado.error) setMensaje("Producto agregado.");
    }
    if (resultado.error) setMensaje("Error: " + resultado.error.message);
    await cargarProductos();
    cerrarModal();
  }

  async function eliminarProducto() {
    if (!productoActual?.id) return;
    if (!window.confirm("¿Seguro que quieres eliminar este producto?")) return;
    const { error } = await supabase.from("productos").delete().eq("id", productoActual.id);
    if (!error) setMensaje("Producto eliminado.");
    else setMensaje("Error: " + error.message);
    await cargarProductos();
    cerrarModal();
  }

  // UI
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Inventario de Productos</h2>

      <div className="max-w-2xl mx-auto mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Buscar por código, nombre, marca, categoría..."
          value={busqueda}
          onChange={handleBuscar}
          className="border rounded p-2 w-full"
        />
        <button
          onClick={abrirModalAgregar}
          className="bg-green-700 text-white font-bold rounded px-5 py-2 whitespace-nowrap"
        >
          + Agregar producto
        </button>
      </div>

      <div className="max-w-4xl mx-auto">
        {loading ? (
          <div className="text-center py-6 text-blue-700 font-bold">Cargando...</div>
        ) : (
          <table className="min-w-full text-sm bg-white rounded shadow">
            <thead>
              <tr>
                <th className="p-2">Código/UPC</th>
                <th className="p-2">Nombre</th>
                <th className="p-2">Marca</th>
                <th className="p-2">Categoría</th>
                <th className="p-2">Costo</th>
                <th className="p-2">Precio</th>
              </tr>
            </thead>
            <tbody>
              {productos.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center text-gray-400 py-5">
                    {busqueda ? "Sin resultados para la búsqueda." : "No hay productos."}
                  </td>
                </tr>
              ) : (
                productos.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-blue-100 cursor-pointer"
                    onClick={() => abrirModalEditar(p)}
                  >
                    <td className="p-2">{p.codigo}</td>
                    <td className="p-2">{p.nombre}</td>
                    <td className="p-2">{p.marca}</td>
                    <td className="p-2">{p.categoria}</td>
                    <td className="p-2">{p.costo}</td>
                    <td className="p-2">{p.precio}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* PAGINACIÓN */}
        <div className="flex justify-between items-center mt-4">
          <button
            className="px-4 py-2 bg-gray-200 rounded"
            onClick={handleAnterior}
            disabled={pagina === 1}
          >
            Anterior
          </button>
          <span>
            Página {pagina} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            className="px-4 py-2 bg-gray-200 rounded"
            onClick={handleSiguiente}
            disabled={pagina * PAGE_SIZE >= total}
          >
            Siguiente
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-2 text-center mb-10">
          Mostrando {productos.length} de {total} productos.
        </div>
      </div>

      {/* --- MODAL AGREGAR/EDITAR --- */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30">
          <form
            onSubmit={guardarProducto}
            className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md relative"
          >
            <button
              type="button"
              className="absolute top-3 right-3 text-2xl text-gray-400 hover:text-black"
              onClick={cerrarModal}
              title="Cerrar"
            >
              ×
            </button>
            <h3 className="text-xl font-bold mb-4">
              {productoActual.id ? "Editar producto" : "Agregar producto"}
            </h3>
            <div className="mb-2">
              <label className="font-bold">Código/UPC*</label>
              <input
                className="border rounded p-2 w-full"
                value={productoActual.codigo}
                onChange={e =>
                  setProductoActual({ ...productoActual, codigo: e.target.value })
                }
                required
                autoFocus
              />
            </div>
            <div className="mb-2">
              <label className="font-bold">Nombre*</label>
              <input
                className="border rounded p-2 w-full"
                value={productoActual.nombre}
                onChange={e =>
                  setProductoActual({ ...productoActual, nombre: e.target.value })
                }
                required
              />
            </div>
            <div className="mb-2">
              <label className="font-bold">Marca</label>
              <input
                className="border rounded p-2 w-full"
                value={productoActual.marca}
                onChange={e =>
                  setProductoActual({ ...productoActual, marca: e.target.value })
                }
              />
            </div>
            <div className="mb-2">
              <label className="font-bold">Categoría</label>
              <input
                className="border rounded p-2 w-full"
                value={productoActual.categoria}
                onChange={e =>
                  setProductoActual({ ...productoActual, categoria: e.target.value })
                }
              />
            </div>
            <div className="mb-2">
              <label className="font-bold">Costo</label>
              <input
                className="border rounded p-2 w-full"
                value={productoActual.costo}
                type="number"
                step="0.01"
                onChange={e =>
                  setProductoActual({ ...productoActual, costo: e.target.value })
                }
              />
            </div>
            <div className="mb-2">
              <label className="font-bold">Precio*</label>
              <input
                className="border rounded p-2 w-full"
                value={productoActual.precio}
                type="number"
                step="0.01"
                onChange={e =>
                  setProductoActual({ ...productoActual, precio: e.target.value })
                }
                required
              />
            </div>
            {mensaje && (
              <div className="text-blue-700 text-center mt-2">{mensaje}</div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                className="flex-1 bg-blue-700 text-white font-bold rounded px-5 py-2"
              >
                {productoActual.id ? "Guardar Cambios" : "Agregar producto"}
              </button>
              {productoActual.id && (
                <button
                  type="button"
                  className="flex-1 bg-red-600 text-white rounded px-5 py-2"
                  onClick={eliminarProducto}
                >
                  Eliminar
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
