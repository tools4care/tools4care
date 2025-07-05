import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function Productos() {
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState({
    id: null,
    codigo: "",
    nombre: "",
    marca: "",
    categoria: "",
    costo: "",
    precio: "",
  });
  const [mensaje, setMensaje] = useState("");
  const [modoEdicion, setModoEdicion] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  // Cargar productos
  useEffect(() => {
    obtenerProductos();
  }, []);

  async function obtenerProductos() {
    const { data, error } = await supabase.from("productos").select("*").order("nombre");
    if (!error) setProductos(data);
  }

  // Limpiar formulario
  function limpiarForm() {
    setForm({
      id: null,
      codigo: "",
      nombre: "",
      marca: "",
      categoria: "",
      costo: "",
      precio: "",
    });
    setModoEdicion(false);
    setMensaje("");
  }

  // Agregar o actualizar producto
  async function guardarProducto(e) {
    e.preventDefault();
    setMensaje("");
    // Validación básica
    if (!form.codigo || !form.nombre || !form.precio) {
      setMensaje("Completa todos los campos obligatorios.");
      return;
    }
    const dataProducto = {
      codigo: form.codigo,
      nombre: form.nombre,
      marca: form.marca,
      categoria: form.categoria,
      costo: form.costo ? Number(form.costo) : null,
      precio: Number(form.precio),
    };

    let resultado;
    if (modoEdicion && form.id) {
      // Editar
      resultado = await supabase.from("productos").update(dataProducto).eq("id", form.id);
      if (!resultado.error) setMensaje("Producto actualizado.");
    } else {
      // Crear
      resultado = await supabase.from("productos").insert([dataProducto]);
      if (!resultado.error) setMensaje("Producto agregado.");
    }
    if (resultado.error) setMensaje("Error: " + resultado.error.message);
    await obtenerProductos();
    limpiarForm();
  }

  // Eliminar producto
  async function eliminarProducto() {
    if (!form.id) return;
    if (!window.confirm("¿Seguro que quieres eliminar este producto?")) return;
    const { error } = await supabase.from("productos").delete().eq("id", form.id);
    if (!error) setMensaje("Producto eliminado.");
    else setMensaje("Error: " + error.message);
    await obtenerProductos();
    limpiarForm();
  }

  // Seleccionar producto de la lista para editar/borrar
  function seleccionarProducto(prod) {
    setForm({
      id: prod.id,
      codigo: prod.codigo || "",
      nombre: prod.nombre || "",
      marca: prod.marca || "",
      categoria: prod.categoria || "",
      costo: prod.costo ?? "",
      precio: prod.precio ?? "",
    });
    setModoEdicion(true);
    setMensaje("");
  }

  // Filtrado en tiempo real
  const productosFiltrados = productos.filter(
    (p) =>
      p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.marca?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.categoria?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Inventario de Productos</h2>
      <form onSubmit={guardarProducto} className="max-w-xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 bg-white shadow p-6 rounded-2xl mb-8">
        <div>
          <label className="font-bold">Código/UPC*</label>
          <input
            value={form.codigo}
            onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
            placeholder="Código/UPC"
            className="border rounded p-2 w-full"
            required
          />
        </div>
        <div>
          <label className="font-bold">Nombre*</label>
          <input
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Nombre del producto"
            className="border rounded p-2 w-full"
            required
          />
        </div>
        <div>
          <label className="font-bold">Marca</label>
          <input
            value={form.marca}
            onChange={e => setForm(f => ({ ...f, marca: e.target.value }))}
            placeholder="Marca"
            className="border rounded p-2 w-full"
          />
        </div>
        <div>
          <label className="font-bold">Categoría</label>
          <input
            value={form.categoria}
            onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
            placeholder="Categoría"
            className="border rounded p-2 w-full"
          />
        </div>
        <div>
          <label className="font-bold">Costo</label>
          <input
            value={form.costo}
            onChange={e => setForm(f => ({ ...f, costo: e.target.value }))}
            placeholder="Costo"
            type="number"
            step="0.01"
            className="border rounded p-2 w-full"
          />
        </div>
        <div>
          <label className="font-bold">Precio*</label>
          <input
            value={form.precio}
            onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
            placeholder="Precio"
            type="number"
            step="0.01"
            className="border rounded p-2 w-full"
            required
          />
        </div>
        <div className="col-span-2 flex gap-2 mt-2">
          <button type="submit" className="bg-blue-700 text-white font-bold rounded px-5 py-2">
            {modoEdicion ? "Guardar Cambios" : "Agregar producto"}
          </button>
          <button type="button" className="bg-gray-500 text-white rounded px-4 py-2" onClick={limpiarForm}>
            Limpiar
          </button>
          {modoEdicion && (
            <button type="button" className="bg-red-600 text-white rounded px-4 py-2 ml-auto" onClick={eliminarProducto}>
              Eliminar producto
            </button>
          )}
        </div>
        {mensaje && <div className="col-span-2 text-center text-blue-800 mt-2">{mensaje}</div>}
      </form>

      <div className="max-w-4xl mx-auto">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="border rounded p-2 mb-3 w-full"
        />
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
            {productosFiltrados.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center text-gray-400 py-5">No hay resultados</td>
              </tr>
            ) : (
              productosFiltrados.map(p => (
                <tr
                  key={p.id}
                  className="hover:bg-blue-100 cursor-pointer"
                  onClick={() => seleccionarProducto(p)}
                >
                  <td className="p-2">{p.codigo}</td>
                  <td className="p-2">{p.nombre}</td>
                  <td className="p-2">{p.marca}</td>
                  <td className="p-2">{p.categoria}</td>
                  <td className="p-2">${p.costo}</td>
                  <td className="p-2">${p.precio}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="text-xs text-gray-400 mt-1 mb-10">
          Haz clic sobre un producto para editar o eliminar.
        </div>
      </div>
    </div>
  );
}
