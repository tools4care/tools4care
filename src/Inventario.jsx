import { useState, useEffect } from "react";
import StockUbicacion from "./StockUbicacion";
import AgregarStockModal from "./AgregarStockModal";
import ModalTraspasoStock from "./ModalTraspasoStock";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

export default function Inventory() {
  const { van } = useVan();

  const [locations, setLocations] = useState([
    { key: "warehouse", id: null, nombre: "Central Warehouse", tipo: "warehouse" }
  ]);
  const [selected, setSelected] = useState({ tipo: "warehouse", id: null, nombre: "Central Warehouse" });
  const [refresh, setRefresh] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTransferOpen, setModalTransferOpen] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState(""); // filter/search
  const [error, setError] = useState("");

  // Load locations: warehouse + vans
  useEffect(() => {
    async function fetchLocations() {
      const { data: vansData } = await supabase.from("vans").select("id, nombre_van");
      const vansLocations = (vansData || []).map(v => ({
        key: `van_${v.id}`,
        id: v.id,
        nombre: v.nombre_van,
        tipo: "van"
      }));
      const warehouse = { key: "warehouse", id: null, nombre: "Central Warehouse", tipo: "warehouse" };
      setLocations([warehouse, ...vansLocations]);
      setSelected(warehouse);
    }
    fetchLocations();
  }, []);

  // Load inventory by selection
  useEffect(() => {
    async function fetchInventory() {
      setError("");
      if (!selected) return;
      let table = selected.tipo === "warehouse" ? "stock_almacen" : "stock_van";
      let query = supabase.from(table).select("id, producto_id, cantidad, productos(nombre, marca, codigo)");
      if (selected.tipo === "van") {
        query = query.eq("van_id", selected.id);
      }
      const { data, error } = await query;
      if (error) setError(error.message);
      setInventory(data || []);
    }
    fetchInventory();
  }, [selected, refresh]);

  // Product search (by name, brand, or code)
  const filteredInventory = inventory.filter(item => {
    const name = item.productos?.nombre?.toLowerCase() || "";
    const brand = item.productos?.marca?.toLowerCase() || "";
    const code = item.productos?.codigo?.toLowerCase() || "";
    const filter = search.toLowerCase();
    return (
      name.includes(filter) ||
      brand.includes(filter) ||
      code.includes(filter)
    );
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">VAN Inventory</h2>
      <div className="mb-4 flex items-center gap-4">
        <select
          className="border rounded p-2"
          value={selected.key}
          onChange={e => {
            const sel = locations.find(u => u.key === e.target.value);
            setSelected(sel || locations[0]);
          }}
        >
          {locations.map(u => (
            <option key={u.key} value={u.key}>
              {u.nombre}
            </option>
          ))}
        </select>
        <input
          className="border p-2 rounded"
          placeholder="Search product, brand, or code"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        <button
          className="bg-blue-600 text-white px-3 py-1 rounded"
          onClick={() => setModalOpen(true)}
        >
          Add Stock
        </button>
        <button
          className="bg-green-600 text-white px-3 py-1 rounded"
          onClick={() => setModalTransferOpen(true)}
        >
          Transfer Stock
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 mb-2 rounded">
          <b>Error loading inventory:</b> {error}
        </div>
      )}

      {/* Render inventory */}
      <div className="bg-white rounded shadow p-4">
        {filteredInventory.length === 0 ? (
          <div className="text-gray-400">No products in inventory.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2">Code</th>
                <th className="p-2">Product</th>
                <th className="p-2">Brand</th>
                <th className="p-2">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => (
                <tr key={`${item.producto_id}_${selected.key}`}>
                  <td className="p-2 font-mono">{item.productos?.codigo || "-"}</td>
                  <td className="p-2">{item.productos?.nombre}</td>
                  <td className="p-2">{item.productos?.marca}</td>
                  <td className="p-2">{item.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      <AgregarStockModal
        abierto={modalOpen}
        cerrar={() => setModalOpen(false)}
        tipo={selected.tipo}
        ubicacionId={selected.id}
        onSuccess={() => setRefresh(r => r + 1)}
        modoSuma // <--- Add this prop to indicate stock should be added
      />
      <ModalTraspasoStock
        abierto={modalTransferOpen}
        cerrar={() => setModalTransferOpen(false)}
        ubicaciones={locations}
        onSuccess={() => {
          setModalTransferOpen(false);
          setRefresh(r => r + 1);
        }}
      />
    </div>
  );
}
