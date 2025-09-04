// src/Inventario.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import AgregarStockModal from "./AgregarStockModal";
import ModalTraspasoStock from "./ModalTraspasoStock";

const PAGE_SIZE = 100; // ajusta según necesites

export default function Inventory() {
  const { van } = useVan();

  const [locations, setLocations] = useState([
    { key: "warehouse", id: null, nombre: "Central Warehouse", tipo: "warehouse" },
  ]);
  const [selected, setSelected] = useState({
    key: "warehouse",
    id: null,
    nombre: "Central Warehouse",
    tipo: "warehouse",
  });

  const [inventory, setInventory] = useState([]); // {id?, producto_id, cantidad, productos:{codigo,nombre,marca,size}}
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTransferOpen, setModalTransferOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // paginación
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const offset = page * PAGE_SIZE;

  // ======================== Cargar ubicaciones ========================
  useEffect(() => {
    (async () => {
      const { data: vansData, error: vErr } = await supabase
        .from("vans")
        .select("id, nombre_van")
        .order("id", { ascending: true });

      if (vErr) {
        setError(vErr.message);
        return;
      }

      const vansLocations = (vansData || []).map((v) => ({
        key: `van_${v.id}`,
        id: v.id,
        nombre: v.nombre_van,
        tipo: "van",
      }));

      const warehouse = {
        key: "warehouse",
        id: null,
        nombre: "Central Warehouse",
        tipo: "warehouse",
      };

      setLocations([warehouse, ...vansLocations]);

      // Si hay VAN en contexto, arranca ahí; si no, warehouse.
      if (van?.id) {
        const current = vansLocations.find((x) => x.id === van.id);
        setSelected(current || warehouse);
      } else {
        setSelected(warehouse);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [van?.id]);

  // reset de paginación cada vez que cambia ubicación o refresco
  useEffect(() => {
    setPage(0);
    setHasMore(true);
    setInventory([]);
    setError("");
  }, [selected.key, selected.id, selected.tipo, refresh]);

  // ======================== Cargar inventario (paginado) ========================
  useEffect(() => {
    (async () => {
      if (!selected) return;

      try {
        setError("");

        if (selected.tipo === "warehouse") {
          // Si no tienes tabla de almacén aún, mostramos vacío sin error
          setInventory([]);
          setHasMore(false);
          return;
        }

        // Consulta **única** a stock_van con embed de productos
        // Evita la URL gigante que generaba el .in([...ids])
        const from = offset;
        const to = offset + PAGE_SIZE - 1;

        const { data, error: sErr } = await supabase
          .from("stock_van")
          .select(
            `
            id,
            producto_id,
            cantidad,
            productos:producto_id (
              id, codigo, nombre, marca, size
            )
          `,
            { count: "exact", head: false }
          )
          .eq("van_id", selected.id)
          .order("cantidad", { ascending: false })
          .range(from, to);

        if (sErr) throw sErr;

        const rows =
          (data || []).map((s) => ({
            id: s.id,
            producto_id: s.producto_id,
            cantidad: Number(s.cantidad || 0),
            productos: s.productos || null,
          })) ?? [];

        setInventory((prev) => (page === 0 ? rows : [...prev, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
      } catch (e) {
        setError(e?.message || String(e));
        setHasMore(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id, selected.tipo, offset]);

  // ======================== Filtro de búsqueda ========================
  const filteredInventory = useMemo(() => {
    const f = (search || "").toLowerCase();
    if (!f) return inventory;
    return inventory.filter((it) => {
      const p = it.productos || {};
      return (
        (p.codigo || "").toLowerCase().includes(f) ||
        (p.nombre || "").toLowerCase().includes(f) ||
        (p.marca || "").toLowerCase().includes(f)
      );
    });
  }, [inventory, search]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              📦 VAN Inventory
            </h1>
            <div className="text-sm text-gray-500">{filteredInventory.length} items</div>
          </div>
          <div className="mt-3 text-xs text-gray-600">
            Gestiona existencias por ubicación con una interfaz clara y consistente con Ventas.
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm text-gray-600 whitespace-nowrap">Ubicación</span>
                <select
                  className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  value={selected.key}
                  onChange={(e) => {
                    const sel = locations.find((u) => u.key === e.target.value);
                    setSelected(sel || locations[0]);
                  }}
                >
                  {locations.map((u) => (
                    <option key={u.key} value={u.key}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm text-gray-600 whitespace-nowrap">Buscar</span>
                <input
                  className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  placeholder="🔍 Product, brand, or code"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                onClick={() => setModalOpen(true)}
              >
                ➕ Add Stock
              </button>
              <button
                className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                onClick={() => setModalTransferOpen(true)}
              >
                🔁 Transfer Stock
              </button>
            </div>
          </div>

          {/* Current location pill */}
          <div className="mt-3">
            <span className="inline-flex items-center gap-2 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full">
              📍 {selected?.nombre} · <b className="font-mono">{selected?.tipo}</b>
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-300 text-red-700 px-4 py-3 mb-4 rounded-xl">
            <b>Error loading inventory:</b> {error}
          </div>
        )}

        {/* Inventory Table */}
        <div className="bg-white rounded-xl shadow-lg p-0 overflow-hidden">
          {filteredInventory.length === 0 ? (
            <div className="p-8 text-gray-400 text-center">🗃️ No products in inventory.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100/80 text-gray-700">
                    <th className="p-3 text-left">Code</th>
                    <th className="p-3 text-left">Product</th>
                    <th className="p-3 text-left">Brand</th>
                    <th className="p-3 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInventory.map((item) => (
                    <tr
                      key={`${item.producto_id}_${selected.key}`}
                      className="hover:bg-blue-50 transition-colors"
                    >
                      <td className="p-3 font-mono text-gray-700">{item.productos?.codigo || "-"}</td>
                      <td className="p-3 text-gray-900 font-medium">{item.productos?.nombre || "-"}</td>
                      <td className="p-3 text-gray-700">{item.productos?.marca || "-"}</td>
                      <td className="p-3 text-right">
                        <span className="inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-md bg-gray-50 border border-gray-200 font-semibold text-gray-800">
                          {item.cantidad}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Botón cargar más (paginación simple) */}
          {hasMore && (
            <div className="p-3 border-t flex justify-center">
              <button
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
                onClick={() => setPage((p) => p + 1)}
              >
                Load more
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end gap-2">
          <span className="text-xs text-gray-500">
            Showing <b>{filteredInventory.length}</b> of <b>{inventory.length}</b>
          </span>
        </div>

        {/* Modales */}
        <AgregarStockModal
          abierto={modalOpen}
          cerrar={() => setModalOpen(false)}
          tipo={selected.tipo}          // "van" o "warehouse"
          ubicacionId={selected.id}     // van_id cuando es "van"
          onSuccess={() => setRefresh((r) => r + 1)}
        />
        <ModalTraspasoStock
          abierto={modalTransferOpen}
          cerrar={() => setModalTransferOpen(false)}
          ubicaciones={locations}
          onSuccess={() => setRefresh((r) => r + 1)}
        />
      </div>
    </div>
  );
}
