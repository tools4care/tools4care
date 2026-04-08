// src/Inventario.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import AgregarStockModal from "./AgregarStockModal";
import ModalTraspasoStock from "./ModalTraspasoStock";
import InvoiceImporter from "./InvoiceImporter";
import { BarcodeScanner } from "./BarcodeScanner";
import { useOffline } from "./hooks/useOffline";
import { guardarInventarioVan, obtenerInventarioVan } from "./utils/offlineDB";
import { usePermisos } from "./hooks/usePermisos";

const PAGE_SIZE = 100;

function stockBadge(qty) {
  if (qty === 0)  return "bg-red-100 text-red-700 border-red-200";
  if (qty <= 5)   return "bg-amber-100 text-amber-700 border-amber-200";
  if (qty <= 20)  return "bg-yellow-50 text-yellow-700 border-yellow-200";
  return           "bg-emerald-100 text-emerald-700 border-emerald-200";
}

export default function Inventory() {
  const { van } = useVan();
  const { isOnline } = useOffline();
  const { puedeAgregarAlmacen } = usePermisos();

  const [locations, setLocations] = useState([
    { key: "warehouse", id: null, nombre: "Central Warehouse", tipo: "warehouse" },
  ]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineCacheDate, setOfflineCacheDate] = useState(null);
  const [selected, setSelected] = useState({
    key: "warehouse", id: null, nombre: "Central Warehouse", tipo: "warehouse",
  });

  const [inventory, setInventory]           = useState([]);
  const [search, setSearch]                 = useState("");
  const [error, setError]                   = useState("");
  const [modalOpen, setModalOpen]           = useState(false);
  const [modalTransferOpen, setModalTransferOpen] = useState(false);
  const [invoiceImporterOpen, setInvoiceImporterOpen] = useState(false);
  const [refresh, setRefresh]               = useState(0);
  const [showScanner, setShowScanner]       = useState(false);
  const [page, setPage]                     = useState(0);
  const [hasMore, setHasMore]               = useState(true);
  const [isSearchingDB, setIsSearchingDB]   = useState(false);
  const [dbSearchResults, setDbSearchResults] = useState(null);
  const [editingQty, setEditingQty]         = useState(null); // { producto_id, value }
  const [savingQtyIds, setSavingQtyIds]     = useState(new Set());
  const editQtyInputRef                     = useRef(null);
  const searchTimerRef = useRef(null);
  const offset = page * PAGE_SIZE;

  // ── Guardar conteo físico (SET, no incremento) ───────────
  async function handleSetQty(producto_id, rawValue) {
    const newQty = Math.max(0, parseInt(rawValue, 10));
    if (!Number.isFinite(newQty)) { setEditingQty(null); return; }

    setSavingQtyIds((s) => new Set(s).add(producto_id));
    setEditingQty(null);

    try {
      if (selected.tipo === "van" && selected.id) {
        const { data: existing } = await supabase
          .from("stock_van").select("id").eq("van_id", selected.id).eq("producto_id", producto_id).maybeSingle();
        if (existing) {
          await supabase.from("stock_van").update({ cantidad: newQty }).eq("id", existing.id);
        } else {
          await supabase.from("stock_van").insert({ van_id: selected.id, producto_id, cantidad: newQty });
        }
      } else {
        // warehouse
        const { data: existing } = await supabase
          .from("stock_almacen").select("id").eq("producto_id", producto_id).maybeSingle();
        if (existing) {
          await supabase.from("stock_almacen").update({ cantidad: newQty }).eq("id", existing.id);
        } else {
          await supabase.from("stock_almacen").insert({ producto_id, cantidad: newQty });
        }
      }
      // Actualizar local sin recargar toda la lista
      setInventory((prev) => prev.map((item) =>
        item.producto_id === producto_id ? { ...item, cantidad: newQty } : item
      ));
    } catch (err) {
      setError("Error al guardar: " + err.message);
    } finally {
      setSavingQtyIds((s) => { const n = new Set(s); n.delete(producto_id); return n; });
    }
  }

  // ── Auto-focus inline qty input ──────────────────────────
  useEffect(() => {
    if (editingQty) {
      setTimeout(() => {
        const el = editQtyInputRef.current;
        if (!el) return;
        el.focus();
        el.select();
      }, 50);
    }
  }, [editingQty?.producto_id]);

  // ── Load locations ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: vansData, error: vErr } = await supabase
        .from("vans").select("id, nombre_van").order("id", { ascending: true });
      if (vErr) {
        // Fallback: show current van from context if DB query fails
        if (van?.id) {
          const vanLoc = { key: `van_${van.id}`, id: van.id, nombre: van.nombre_van || van.nombre || `Van ${van.id}`, tipo: "van" };
          setLocations([{ key: "warehouse", id: null, nombre: "Central Warehouse", tipo: "warehouse" }, vanLoc]);
          setSelected(vanLoc);
        }
        return;
      }

      const vansLocations = (vansData || []).map((v) => ({
        key: `van_${v.id}`, id: v.id, nombre: v.nombre_van, tipo: "van",
      }));
      const warehouse = { key: "warehouse", id: null, nombre: "Central Warehouse", tipo: "warehouse" };
      setLocations([warehouse, ...vansLocations]);

      if (van?.id) {
        const current = vansLocations.find((x) => x.id === van.id);
        setSelected(current || warehouse);
      } else {
        setSelected(warehouse);
      }
    })();
  }, [van?.id]);

  // ── Reset on location/refresh change ─────────────────────
  useEffect(() => {
    setPage(0); setHasMore(true); setInventory([]);
    setError(""); setDbSearchResults(null);
  }, [selected.key, selected.id, selected.tipo, refresh]);

  // ── Load inventory (paginated, no search) ─────────────────
  useEffect(() => {
    if (search.trim()) return;
    (async () => {
      if (!selected) return;

      if (!isOnline) {
        if (selected.tipo === "van" && selected.id) {
          const cached = await obtenerInventarioVan(selected.id);
          if (cached.length > 0) {
            setInventory(cached.map(c => ({
              id: c.producto_id, producto_id: c.producto_id,
              cantidad: Number(c.cantidad || 0), productos: c.productos || null,
            })));
            setHasMore(false); setIsOfflineMode(true);
            const cacheEntry = await import('localforage')
              .then(lf => lf.default.getItem(`inventario_van_${selected.id}`)).catch(() => null);
            if (cacheEntry?.timestamp) setOfflineCacheDate(cacheEntry.timestamp);
            return;
          }
        }
        setIsOfflineMode(true);
        setError("Offline — no cached inventory for this location.");
        setHasMore(false); return;
      }

      setIsOfflineMode(false);
      try {
        setError("");
        const from = offset, to = offset + PAGE_SIZE - 1;
        const tabla = selected.tipo === "warehouse" ? "stock_almacen" : "stock_van";
        let query = supabase.from(tabla)
          .select("id, producto_id, cantidad, productos:producto_id(id,codigo,nombre,marca,size)",
            { count: "exact", head: false })
          .order("cantidad", { ascending: false })
          .range(from, to);
        if (selected.tipo === "van") query = query.eq("van_id", selected.id);

        const { data, error: sErr, count } = await query;
        if (sErr) throw sErr;

        const rows = (data || []).map((s) => ({
          id: s.id, producto_id: s.producto_id,
          cantidad: Number(s.cantidad || 0), productos: s.productos || null,
        }));
        setInventory((prev) => (offset === 0 ? rows : [...prev, ...rows]));
        const loaded = offset + rows.length;
        setHasMore(typeof count === "number" ? loaded < count : rows.length === PAGE_SIZE);

        if (selected.tipo === "van" && selected.id && offset === 0 && rows.length > 0) {
          setTimeout(() => guardarInventarioVan(selected.id,
            rows.map(r => ({ producto_id: r.producto_id, cantidad: r.cantidad, productos: r.productos }))), 0);
        }
      } catch (e) { setError(e?.message || String(e)); setHasMore(false); }
    })();
  }, [selected.id, selected.tipo, offset, refresh, search, isOnline]);

  // ── Realtime ──────────────────────────────────────────────
  useEffect(() => {
    const tabla  = selected.tipo === "van" ? "stock_van" : "stock_almacen";
    const filter = selected.tipo === "van" && selected.id
      ? `van_id=eq.${selected.id}` : undefined;
    const channel = supabase.channel(`inv-${selected.key}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tabla, ...(filter ? { filter } : {}) },
        () => setRefresh((r) => r + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected.tipo, selected.key, selected.id]);

  // ── DB search ─────────────────────────────────────────────
  const searchInDatabase = async (term) => {
    if (!term.trim()) { setDbSearchResults(null); return; }
    setIsSearchingDB(true); setError("");
    try {
      const { data: productos, error: pErr } = await supabase.from("productos")
        .select("id,codigo,nombre,marca,size")
        .or(`codigo.ilike.%${term}%,nombre.ilike.%${term}%,marca.ilike.%${term}%`)
        .limit(100);
      if (pErr) throw pErr;
      if (!productos?.length) { setDbSearchResults([]); return; }

      const ids = productos.map(p => p.id);
      const tabla = selected.tipo === "warehouse" ? "stock_almacen" : "stock_van";
      let q = supabase.from(tabla).select("id,producto_id,cantidad").in("producto_id", ids);
      if (selected.tipo === "van") q = q.eq("van_id", selected.id);
      const { data: inv, error: iErr } = await q.order("cantidad", { ascending: false });
      if (iErr) throw iErr;

      const pMap = new Map(productos.map(p => [p.id, p]));
      setDbSearchResults((inv || []).map(r => ({
        id: r.id, producto_id: r.producto_id,
        cantidad: Number(r.cantidad || 0), productos: pMap.get(r.producto_id) || null,
      })));
    } catch (e) { setError(e?.message || String(e)); setDbSearchResults([]); }
    finally { setIsSearchingDB(false); }
  };

  // ── Hybrid search effect ──────────────────────────────────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const term = search.trim();
    if (!term) { setDbSearchResults(null); setIsSearchingDB(false); return; }
    const mem = inventory.filter(it => {
      const p = it.productos || {};
      return (p.codigo || "").toLowerCase().includes(term.toLowerCase())
          || (p.nombre || "").toLowerCase().includes(term.toLowerCase())
          || (p.marca  || "").toLowerCase().includes(term.toLowerCase());
    });
    if (mem.length > 0) { setDbSearchResults(null); return; }
    if (!isOnline) return;
    searchTimerRef.current = setTimeout(() => searchInDatabase(term), 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search, inventory, selected.tipo, selected.id]);

  // ── Final filtered list ───────────────────────────────────
  const filteredInventory = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return inventory;
    const mem = inventory.filter(it => {
      const p = it.productos || {};
      return (p.codigo || "").toLowerCase().includes(term)
          || (p.nombre || "").toLowerCase().includes(term)
          || (p.marca  || "").toLowerCase().includes(term);
    });
    return mem.length > 0 ? mem : (dbSearchResults || []);
  }, [inventory, search, dbSearchResults]);

  const handleBarcodeScanned = (code) => {
    let c = code.replace(/^0+/, ""); if (!c) c = "0";
    setSearch(c); setShowScanner(false);
  };

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 pb-24">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-4 pt-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">📦 Inventory</h1>
              <p className="text-blue-200 text-sm mt-0.5">{selected.nombre}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-extrabold text-white">{filteredInventory.length}</div>
              <div className="text-blue-200 text-xs">items</div>
            </div>
          </div>

          {/* Location tabs (pills) */}
          {locations.length <= 5 ? (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-none">
              {locations.map((loc) => (
                <button
                  key={loc.key}
                  onClick={() => setSelected(loc)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    selected.key === loc.key
                      ? "bg-white text-blue-700 shadow"
                      : "bg-blue-600/50 text-white hover:bg-blue-600/80"
                  }`}
                >
                  {loc.tipo === "warehouse" ? "🏭" : "🚐"} {loc.nombre}
                </button>
              ))}
            </div>
          ) : (
            <select
              className="mt-4 w-full bg-blue-600/60 text-white border border-blue-400 rounded-xl px-3 py-2 text-sm focus:outline-none"
              value={selected.key}
              onChange={(e) => setSelected(locations.find(l => l.key === e.target.value) || locations[0])}
            >
              {locations.map(loc => (
                <option key={loc.key} value={loc.key}>{loc.nombre}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Controls card (overlapping header) ───────────────── */}
      <div className="max-w-4xl mx-auto px-4 -mt-10 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl p-4">
          {/* Search row */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 border-2 border-gray-200 rounded-xl px-3 py-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="flex-1 outline-none text-sm bg-transparent placeholder-gray-400"
                placeholder="Search by name, brand or code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              )}
              {isSearchingDB && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
            </div>
            <button
              onClick={() => setShowScanner(true)}
              className="bg-indigo-600 text-white px-3 py-2 rounded-xl shadow hover:bg-indigo-700 active:scale-95 transition-all"
              title="Scan barcode"
            >📷</button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {/* Add Stock: disabled for vendedores when viewing warehouse */}
            {(puedeAgregarAlmacen || selected?.tipo !== "warehouse") ? (
              <button
                onClick={() => setModalOpen(true)}
                disabled={!isOnline}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-xl font-semibold text-sm shadow disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 active:scale-95 transition-all"
              >
                <span className="text-base">➕</span> Add Stock
              </button>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-400 py-2.5 rounded-xl font-semibold text-sm border border-slate-200 cursor-not-allowed" title="Only admins can add stock to the warehouse">
                <span className="text-base">🔒</span> Add Stock
              </div>
            )}
            <button
              onClick={() => setModalTransferOpen(true)}
              disabled={!isOnline}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white py-2.5 rounded-xl font-semibold text-sm shadow disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700 active:scale-95 transition-all"
            >
              <span className="text-base">🔁</span> Transfer
            </button>
            {puedeAgregarAlmacen && selected?.tipo === "warehouse" && (
              <button
                onClick={() => setInvoiceImporterOpen(true)}
                disabled={!isOnline}
                className="flex-1 flex items-center justify-center gap-2 bg-violet-600 text-white py-2.5 rounded-xl font-semibold text-sm shadow disabled:opacity-40 disabled:cursor-not-allowed hover:bg-violet-700 active:scale-95 transition-all"
              >
                <span className="text-base">📄</span> Import Invoice
              </button>
            )}
          </div>

          {/* Extended search notice */}
          {dbSearchResults !== null && (
            <div className="mt-2 text-xs text-blue-600 font-semibold text-center">
              🔍 Extended search — showing results from all products
            </div>
          )}
        </div>
      </div>

      {/* ── Alerts ───────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 mt-4 space-y-3">
        {isOfflineMode && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">📵</span>
            <div>
              <div className="font-bold text-amber-800 text-sm">Offline Mode</div>
              {offlineCacheDate && (
                <div className="text-xs text-amber-600 mt-0.5">
                  Cached {new Date(offlineCacheDate).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}
                </div>
              )}
              <div className="text-xs text-amber-700 mt-0.5">Changes will not be saved until you reconnect.</div>
            </div>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 text-red-700 text-sm">
            <b>Error:</b> {error}
          </div>
        )}
      </div>

      {/* ── Inventory list ────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 mt-4">
        {filteredInventory.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            {isSearchingDB ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-sm">Searching database…</p>
              </div>
            ) : search ? (
              <>
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-gray-500 text-sm">No products match "<b>{search}</b>"</p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">🗃️</div>
                <p className="text-gray-500 text-sm">No products in this location</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Hint de conteo físico */}
            <p className="text-xs text-slate-400 text-center mb-2">
              Toca el número de cualquier producto para corregir el conteo real
            </p>
            {/* ── Mobile: card list ── */}
            <div className="sm:hidden space-y-2">
              {filteredInventory.map((item) => {
                const p = item.productos || {};
                return (
                  <div key={`${item.producto_id}_${selected.key}`}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm truncate">{p.nombre || "—"}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.codigo && (
                          <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-mono">#{p.codigo}</span>
                        )}
                        {p.marca && (
                          <span className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-full">{p.marca}</span>
                        )}
                        {p.size && (
                          <span className="bg-purple-50 text-purple-700 text-[10px] px-2 py-0.5 rounded-full">{p.size}</span>
                        )}
                      </div>
                    </div>
                    {/* Cantidad editable — toca para corregir conteo */}
                    {editingQty?.producto_id === item.producto_id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <input
                          ref={editQtyInputRef}
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          min="0"
                          autoFocus
                          className="w-16 h-9 text-center border-2 border-blue-500 rounded-xl font-bold text-base focus:outline-none"
                          value={editingQty.value}
                          onChange={(e) => setEditingQty((q) => ({ ...q, value: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSetQty(item.producto_id, editingQty.value);
                            if (e.key === "Escape") setEditingQty(null);
                          }}
                          onBlur={() => handleSetQty(item.producto_id, editingQty.value)}
                        />
                      </div>
                    ) : savingQtyIds.has(item.producto_id) ? (
                      <div className="flex-shrink-0 w-12 h-9 flex items-center justify-center">
                        <svg className="animate-spin w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      </div>
                    ) : (
                      <button
                        className={`flex-shrink-0 min-w-[3.5rem] text-center px-3 py-1.5 rounded-xl border font-bold text-lg active:scale-95 transition-all ${stockBadge(item.cantidad)}`}
                        onClick={() => setEditingQty({ producto_id: item.producto_id, value: String(item.cantidad) })}
                        title="Toca para corregir cantidad"
                      >
                        {item.cantidad}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Desktop: table ── */}
            <div className="hidden sm:block bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Brand</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredInventory.map((item) => {
                    const p = item.productos || {};
                    return (
                      <tr key={`${item.producto_id}_${selected.key}`}
                        className="hover:bg-blue-50/40 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-gray-500 text-xs">{p.codigo || "—"}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{p.nombre || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{p.marca || "—"}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.size || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {editingQty?.producto_id === item.producto_id ? (
                            <input
                              ref={editQtyInputRef}
                              type="number"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              min="0"
                              autoFocus
                              className="w-20 h-8 text-center border-2 border-blue-500 rounded-lg font-bold text-sm focus:outline-none"
                              value={editingQty.value}
                              onChange={(e) => setEditingQty((q) => ({ ...q, value: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSetQty(item.producto_id, editingQty.value);
                                if (e.key === "Escape") setEditingQty(null);
                              }}
                              onBlur={() => handleSetQty(item.producto_id, editingQty.value)}
                            />
                          ) : savingQtyIds.has(item.producto_id) ? (
                            <svg className="animate-spin w-4 h-4 text-blue-500 inline" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                            </svg>
                          ) : (
                            <button
                              className={`inline-flex items-center justify-center min-w-[2.5rem] px-2.5 py-1 rounded-lg border font-bold text-sm hover:ring-2 hover:ring-blue-400 active:scale-95 transition-all cursor-pointer ${stockBadge(item.cantidad)}`}
                              onClick={() => setEditingQty({ producto_id: item.producto_id, value: String(item.cantidad) })}
                              title="Clic para corregir cantidad"
                            >
                              {item.cantidad}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {hasMore && !search && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="px-6 py-2.5 bg-white text-blue-600 font-semibold text-sm rounded-xl shadow border border-blue-100 hover:bg-blue-50 active:scale-95 transition-all"
                >
                  Load more
                </button>
              </div>
            )}

            {/* Footer count */}
            <div className="mt-3 text-center text-xs text-gray-400">
              Showing {filteredInventory.length}
              {dbSearchResults !== null
                ? " (extended search)"
                : ` of ${inventory.length} loaded`}
            </div>
          </>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────── */}
      <AgregarStockModal
        abierto={modalOpen}
        cerrar={() => setModalOpen(false)}
        tipo={selected.tipo}
        ubicacionId={selected.id}
        onSuccess={() => { setPage(0); setRefresh((r) => r + 1); }}
      />
      <ModalTraspasoStock
        abierto={modalTransferOpen}
        cerrar={() => setModalTransferOpen(false)}
        ubicaciones={locations}
        ubicacionActual={selected}
        onSuccess={() => { setPage(0); setRefresh((r) => r + 1); }}
      />
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScanned}
          onClose={() => setShowScanner(false)}
          isActive={showScanner}
        />
      )}
      {invoiceImporterOpen && (
        <InvoiceImporter
          onClose={() => { setInvoiceImporterOpen(false); setPage(0); setRefresh((r) => r + 1); }}
        />
      )}
    </div>
  );
}
