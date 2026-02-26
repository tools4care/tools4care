// src/Inventario.jsx - VERSIÓN ÓPTIMA CORREGIDA (sin error de búsqueda)
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import AgregarStockModal from "./AgregarStockModal";
import ModalTraspasoStock from "./ModalTraspasoStock";
import { BarcodeScanner } from "./BarcodeScanner";
import { useOffline } from "./hooks/useOffline";
import { guardarInventarioVan, obtenerInventarioVan } from "./utils/offlineDB";

const PAGE_SIZE = 100;

export default function Inventory() {
  const { van } = useVan();
  const { isOnline } = useOffline();

  const [locations, setLocations] = useState([
    { key: "warehouse", id: null, nombre: "Central Warehouse", tipo: "warehouse" },
  ]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineCacheDate, setOfflineCacheDate] = useState(null);
  const [selected, setSelected] = useState({
    key: "warehouse",
    id: null,
    nombre: "Central Warehouse",
    tipo: "warehouse",
  });

  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTransferOpen, setModalTransferOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const [showScanner, setShowScanner] = useState(false);

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const offset = page * PAGE_SIZE;

  // Estados para búsqueda híbrida
  const [isSearchingDB, setIsSearchingDB] = useState(false);
  const [dbSearchResults, setDbSearchResults] = useState(null);
  const searchTimerRef = useRef(null);

  // ======================== Cargar ubicaciones ========================
  useEffect(() => {
    (async () => {
      const warehouse = {
        key: "warehouse",
        id: null,
        nombre: "Central Warehouse",
        tipo: "warehouse",
      };

      // Offline: construir lista desde el van del contexto (ya persiste en localStorage)
      if (!isOnline) {
        if (van?.id) {
          const vanLoc = {
            key: `van_${van.id}`,
            id: van.id,
            nombre: van.nombre || van.nombre_van || `Van ${van.id}`,
            tipo: "van",
          };
          setLocations([vanLoc]);
          setSelected(vanLoc);
        } else {
          setLocations([warehouse]);
          setSelected(warehouse);
        }
        return;
      }

      const { data: vansData, error: vErr } = await supabase
        .from("vans")
        .select("id, nombre_van")
        .order("id", { ascending: true });

      if (vErr) {
        // Si falla online, usar van del contexto como fallback
        if (van?.id) {
          const vanLoc = {
            key: `van_${van.id}`,
            id: van.id,
            nombre: van.nombre || van.nombre_van || `Van ${van.id}`,
            tipo: "van",
          };
          setLocations([vanLoc]);
          setSelected(vanLoc);
        }
        return;
      }

      const vansLocations = (vansData || []).map((v) => ({
        key: `van_${v.id}`,
        id: v.id,
        nombre: v.nombre_van,
        tipo: "van",
      }));

      setLocations([warehouse, ...vansLocations]);

      if (van?.id) {
        const current = vansLocations.find((x) => x.id === van.id);
        setSelected(current || warehouse);
      } else {
        setSelected(warehouse);
      }
    })();
  }, [van?.id, isOnline]);

  // Reset de paginación
  useEffect(() => {
    setPage(0);
    setHasMore(true);
    setInventory([]);
    setError("");
    setDbSearchResults(null);
  }, [selected.key, selected.id, selected.tipo, refresh]);

  // ======================== Cargar inventario (paginado, SIN búsqueda) ========================
  useEffect(() => {
    if (search.trim()) return;

    (async () => {
      if (!selected) return;

      // ── MODO OFFLINE: cargar desde caché ──────────────────────
      if (!isOnline) {
        if (selected.tipo === "van" && selected.id) {
          const cached = await obtenerInventarioVan(selected.id);
          if (cached.length > 0) {
            // El caché usa formato { producto_id, cantidad, productos: {...} }
            // Normalizar al formato que usa Inventario
            const rows = cached.map(c => ({
              id: c.producto_id,
              producto_id: c.producto_id,
              cantidad: Number(c.cantidad || 0),
              productos: c.productos || null,
            }));
            setInventory(rows);
            setHasMore(false);
            setIsOfflineMode(true);
            // Leer fecha del caché
            const cacheEntry = await import('localforage').then(lf =>
              lf.default.getItem(`inventario_van_${selected.id}`)
            ).catch(() => null);
            if (cacheEntry?.timestamp) setOfflineCacheDate(cacheEntry.timestamp);
            return;
          }
        }
        setIsOfflineMode(true);
        setError("Sin conexión. No hay inventario en caché para esta ubicación.");
        setHasMore(false);
        return;
      }

      setIsOfflineMode(false);

      try {
        setError("");

        const from = offset;
        const to = offset + PAGE_SIZE - 1;

        if (selected.tipo === "warehouse") {
          const { data, error: sErr, count } = await supabase
            .from("stock_almacen")
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

          setInventory((prev) => (offset === 0 ? rows : [...prev, ...rows]));
          const loaded = offset + rows.length;
          setHasMore(typeof count === "number" ? loaded < count : rows.length === PAGE_SIZE);
          return;
        }

        const { data, error: sErr, count } = await supabase
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

        setInventory((prev) => (offset === 0 ? rows : [...prev, ...rows]));
        const loaded = offset + rows.length;
        setHasMore(typeof count === "number" ? loaded < count : rows.length === PAGE_SIZE);

        // ── Guardar en caché cuando cargamos la primera página de una van ──
        if (selected.tipo === "van" && selected.id && offset === 0 && rows.length > 0) {
          const allRows = rows.map(r => ({
            producto_id: r.producto_id,
            cantidad: r.cantidad,
            productos: r.productos,
          }));
          // Usamos setTimeout para no bloquear el render
          setTimeout(() => guardarInventarioVan(selected.id, allRows), 0);
        }

      } catch (e) {
        setError(e?.message || String(e));
        setHasMore(false);
      }
    })();
  }, [selected.id, selected.tipo, offset, refresh, search, isOnline]);

  // ======================== Realtime ========================
  useEffect(() => {
    if (selected.tipo === "van" && selected.id) {
      const channel = supabase
        .channel(`inv-van-${selected.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stock_van", filter: `van_id=eq.${selected.id}` },
          () => setRefresh((r) => r + 1)
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }

    if (selected.tipo === "warehouse") {
      const channel = supabase
        .channel(`inv-warehouse`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stock_almacen" },
          () => setRefresh((r) => r + 1)
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selected.tipo, selected.id]);

  const handleBarcodeScanned = (code) => {
    let cleanedCode = code.replace(/^0+/, '');
    if (cleanedCode === '') cleanedCode = '0';
    setSearch(cleanedCode);
    setShowScanner(false);
  };

  // 🔥 BÚSQUEDA EN BASE DE DATOS CORREGIDA (busca productos primero, luego inventario)
  const searchInDatabase = async (searchTerm) => {
    if (!searchTerm.trim()) {
      setDbSearchResults(null);
      return;
    }

    setIsSearchingDB(true);
    setError("");

    try {
      // 1️⃣ Buscar productos que coincidan
      const { data: productos, error: prodErr } = await supabase
        .from("productos")
        .select("id, codigo, nombre, marca, size")
        .or(`codigo.ilike.%${searchTerm}%,nombre.ilike.%${searchTerm}%,marca.ilike.%${searchTerm}%`)
        .limit(100);

      if (prodErr) throw prodErr;

      if (!productos || productos.length === 0) {
        setDbSearchResults([]);
        setIsSearchingDB(false);
        return;
      }

      const productoIds = productos.map(p => p.id);

      // 2️⃣ Buscar en inventario solo esos productos
      const tabla = selected.tipo === "warehouse" ? "stock_almacen" : "stock_van";
      
      let query = supabase
        .from(tabla)
        .select("id, producto_id, cantidad")
        .in("producto_id", productoIds);

      if (selected.tipo === "van") {
        query = query.eq("van_id", selected.id);
      }

      query = query.order("cantidad", { ascending: false });

      const { data: inventario, error: invErr } = await query;

      if (invErr) throw invErr;

      // 3️⃣ Unir productos con inventario
      const productosMap = new Map(productos.map(p => [p.id, p]));
      
      const rows = (inventario || []).map((inv) => ({
        id: inv.id,
        producto_id: inv.producto_id,
        cantidad: Number(inv.cantidad || 0),
        productos: productosMap.get(inv.producto_id) || null,
      }));

      setDbSearchResults(rows);
    } catch (e) {
      console.error("[searchInDatabase]", e);
      setError(e?.message || String(e));
      setDbSearchResults([]);
    } finally {
      setIsSearchingDB(false);
    }
  };

  // 🔥 BÚSQUEDA HÍBRIDA: Primero en memoria, luego en DB con debounce
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    const searchTerm = search.trim();

    if (!searchTerm) {
      setDbSearchResults(null);
      setIsSearchingDB(false);
      return;
    }

    // 1️⃣ Buscar en memoria (instantáneo)
    const memoryResults = inventory.filter((it) => {
      const p = it.productos || {};
      const term = searchTerm.toLowerCase();
      return (
        (p.codigo || "").toLowerCase().includes(term) ||
        (p.nombre || "").toLowerCase().includes(term) ||
        (p.marca || "").toLowerCase().includes(term)
      );
    });

    // 2️⃣ Si encuentra resultados en memoria, NO buscar en DB
    if (memoryResults.length > 0) {
      setDbSearchResults(null);
      return;
    }

    // 3️⃣ Si NO encuentra en memoria, buscar en DB con debounce (solo si hay conexión)
    if (!isOnline) return; // Sin conexión, solo búsqueda en memoria
    searchTimerRef.current = setTimeout(() => {
      searchInDatabase(searchTerm);
    }, 400);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [search, inventory, selected.tipo, selected.id]);

  // 🔥 FILTRADO FINAL
  const filteredInventory = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    if (!searchTerm) {
      return inventory;
    }

    const memoryResults = inventory.filter((it) => {
      const p = it.productos || {};
      return (
        (p.codigo || "").toLowerCase().includes(searchTerm) ||
        (p.nombre || "").toLowerCase().includes(searchTerm) ||
        (p.marca || "").toLowerCase().includes(searchTerm)
      );
    });

    if (memoryResults.length > 0) {
      return memoryResults;
    }

    return dbSearchResults || [];
  }, [inventory, search, dbSearchResults]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2 min-w-0 truncate">
              📦 VAN Inventory
            </h1>
            <div className="text-sm text-gray-500 shrink-0">
              {filteredInventory.length} items
              {isSearchingDB && <span className="ml-2 text-blue-600">🔍</span>}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm text-gray-600 whitespace-nowrap">Location</span>
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
                <span className="text-sm text-gray-600 whitespace-nowrap">Search</span>
                <div className="flex items-center gap-2 w-full">
                  <input
                    className="flex-1 border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    placeholder="🔍 Product, brand, or code"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button
                    onClick={() => setShowScanner(true)}
                    className="lg:hidden bg-purple-600 text-white px-3 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                    title="Scan barcode"
                  >
                    📷
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setModalOpen(true)}
                disabled={!isOnline}
                title={!isOnline ? "Connect to internet to add stock" : ""}
              >
                ➕ Add Stock
              </button>
              <button
                className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setModalTransferOpen(true)}
                disabled={!isOnline}
                title={!isOnline ? "Connect to internet to transfer stock" : ""}
              >
                🔁 Transfer
              </button>
            </div>
          </div>

          {/* Current location pill */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full min-w-0 max-w-full truncate">
              📍 {selected?.nombre} · <b className="font-mono">{selected?.tipo}</b>
            </span>
            {dbSearchResults !== null && (
              <span className="text-xs text-green-600 font-semibold whitespace-nowrap">
                🔍 Extended search active
              </span>
            )}
          </div>
        </div>

        {/* Offline Banner */}
        {isOfflineMode && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 text-amber-800 px-4 py-3 mb-4 rounded-xl flex items-center gap-3">
            <span className="text-2xl">📵</span>
            <div>
              <b>Offline Mode</b> — showing cached inventory
              {offlineCacheDate && (
                <span className="ml-2 text-xs text-amber-600">
                  (saved {new Date(offlineCacheDate).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
                </span>
              )}
              <div className="text-xs mt-0.5 text-amber-700">Changes made offline will NOT be saved. Connect to sync.</div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-300 text-red-700 px-4 py-3 mb-4 rounded-xl">
            <b>Error loading inventory:</b> {error}
          </div>
        )}

        {/* Inventory Table */}
        <div className="bg-white rounded-xl shadow-lg p-0 overflow-hidden">
          {filteredInventory.length === 0 ? (
            <div className="p-8 text-gray-400 text-center">
              {isSearchingDB ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span>Searching in database...</span>
                </div>
              ) : search ? (
                "🔍 No products match your search."
              ) : (
                "🗃️ No products in inventory."
              )}
            </div>
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

          {/* Paginación */}
          {hasMore && !search && (
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
            Showing <b>{filteredInventory.length}</b>
            {dbSearchResults !== null ? (
              <> of <b>all products</b> (extended search)</>
            ) : (
              <> of <b>{inventory.length}</b> loaded</>
            )}
          </span>
        </div>

        {/* Modales */}
        <AgregarStockModal
          abierto={modalOpen}
          cerrar={() => setModalOpen(false)}
          tipo={selected.tipo}
          ubicacionId={selected.id}
          onSuccess={() => {
            setPage(0);
            setRefresh((r) => r + 1);
          }}
        />
        <ModalTraspasoStock
          abierto={modalTransferOpen}
          cerrar={() => setModalTransferOpen(false)}
          ubicaciones={locations}
          ubicacionActual={selected}
          onSuccess={() => {
            setPage(0);
            setRefresh((r) => r + 1);
          }}
        />

        {showScanner && (
          <BarcodeScanner
            onScan={handleBarcodeScanned}
            onClose={() => setShowScanner(false)}
            isActive={showScanner}
          />
        )}
      </div>
    </div>
  );
}