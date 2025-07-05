import { useState, useEffect } from "react";
import StockUbicacion from "./StockUbicacion";
import AgregarStockModal from "./AgregarStockModal";
import ModalTraspasoStock from "./ModalTraspasoStock";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

export default function Inventario() {
  const { van } = useVan();

  const [ubicaciones, setUbicaciones] = useState([
    { key: "almacen", id: null, nombre: "Almacén Central", tipo: "almacen" }
  ]);
  const [seleccion, setSeleccion] = useState({ tipo: "almacen", id: null, nombre: "Almacén Central" });
  const [refrescar, setRefrescar] = useState(0);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalTraspasoAbierto, setModalTraspasoAbierto] = useState(false);
  const [inventario, setInventario] = useState([]);
  const [busqueda, setBusqueda] = useState(""); // filtro/buscador

  // Cargar ubicaciones: almacén + vans
  useEffect(() => {
    async function fetchUbicaciones() {
      const { data: vansData } = await supabase.from("vans").select("id, nombre_van");
      const vansUbicaciones = (vansData || []).map(v => ({
        key: `van_${v.id}`,
        id: v.id,
        nombre: v.nombre_van,
        tipo: "van"
      }));
      const almacen = { key: "almacen", id: null, nombre: "Almacén Central", tipo: "almacen" };
      setUbicaciones([almacen, ...vansUbicaciones]);
      setSeleccion(almacen);
    }
    fetchUbicaciones();
  }, []);

  // Carga inventario según selección
  useEffect(() => {
    async function fetchInventario() {
      if (!seleccion) return;
      let tabla = seleccion.tipo === "almacen" ? "stock_almacen" : "stock_van";
      let query = supabase.from(tabla).select("id, producto_id, cantidad, productos(nombre, marca)");
      if (seleccion.tipo === "van") {
        query = query.eq("van_id", seleccion.id);
      }
      const { data } = await query;
      setInventario(data || []);
    }
    fetchInventario();
  }, [seleccion, refrescar]);

  // Buscador de producto
  const inventarioFiltrado = inventario.filter(item => {
    const nombre = item.productos?.nombre?.toLowerCase() || "";
    const marca = item.productos?.marca?.toLowerCase() || "";
    return (
      nombre.includes(busqueda.toLowerCase()) ||
      marca.includes(busqueda.toLowerCase())
    );
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Inventario de VAN</h2>
      <div className="mb-4 flex items-center gap-4">
        <select
          className="border rounded p-2"
          value={seleccion.key}
          onChange={e => {
            const sel = ubicaciones.find(u => u.key === e.target.value);
            setSeleccion(sel || ubicaciones[0]);
          }}
        >
          {ubicaciones.map(u => (
            <option key={u.key} value={u.key}>
              {u.nombre}
            </option>
          ))}
        </select>
        <input
          className="border p-2 rounded"
          placeholder="Buscar producto o marca"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        <button
          className="bg-blue-600 text-white px-3 py-1 rounded"
          onClick={() => setModalAbierto(true)}
        >
          Agregar Stock
        </button>
        <button
          className="bg-green-600 text-white px-3 py-1 rounded"
          onClick={() => setModalTraspasoAbierto(true)}
        >
          Transferir Stock
        </button>
      </div>
      {/* Renderiza inventario */}
      <div className="bg-white rounded shadow p-4">
        {inventarioFiltrado.length === 0 ? (
          <div className="text-gray-400">No hay productos en inventario.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2">Producto</th>
                <th className="p-2">Marca</th>
                <th className="p-2">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {inventarioFiltrado.map((item) => (
                <tr key={`${item.producto_id}_${seleccion.key}`}>
                  <td className="p-2">{item.productos?.nombre}</td>
                  <td className="p-2">{item.productos?.marca}</td>
                  <td className="p-2">{item.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modales */}
      <AgregarStockModal
        abierto={modalAbierto}
        cerrar={() => setModalAbierto(false)}
        tipo={seleccion.tipo}
        ubicacionId={seleccion.id}
        onSuccess={() => setRefrescar(r => r + 1)}
        modoSuma // <--- Agrega esta prop para indicar que debe sumar stock
      />
      <ModalTraspasoStock
        abierto={modalTraspasoAbierto}
        cerrar={() => setModalTraspasoAbierto(false)}
        ubicaciones={ubicaciones}
        onSuccess={() => {
          setModalTraspasoAbierto(false);
          setRefrescar(r => r + 1);
        }}
      />
    </div>
  );
}
