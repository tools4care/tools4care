// src/ListaEmergencia.jsx
import { createElement, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import {
  addEssentialProduct,
  buildEssentialsText,
  normalizeEssentialList,
  updateEssentialQuantity,
} from "./lib/essentialsList";
import { loadVanReorderRecommendations } from "./lib/reorderRecommendations";
import {
  Search, Plus, Minus, Trash2, Share2, Copy, Check, X,
  ShoppingBag, PackageOpen, ClipboardList, Mail,
  Sparkles, TrendingUp, RefreshCw, ArrowRight,
} from "lucide-react";

const STORAGE_KEY = "lista_emergencia_v1";

function loadFromStorage() {
  try { return normalizeEssentialList(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); }
  catch { return []; }
}
function saveToStorage(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ─── Recommendations hook ────────────────────────────────────
function useRecomendaciones(vanId, listaIds) {
  const [recomendaciones, setRecomendaciones] = useState([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!vanId) return;
    setCargando(true);
    try {
      const result = await loadVanReorderRecommendations(supabase, vanId);
      setRecomendaciones(
        result
          .filter((product) => !listaIds.has(product.producto_id))
          .map((product) => ({ ...product, id: product.producto_id }))
      );
    } catch (error) {
      console.warn("Could not load Essentials suggestions:", error?.message || error);
      setRecomendaciones([]);
    } finally {
      setCargando(false);
    }
  }, [vanId, listaIds]);

  return { recomendaciones, cargando, cargar };
}

// ─── Main component ──────────────────────────────────────────
export default function ListaEmergencia() {
  const { van } = useVan();

  const [lista, setLista]         = useState(loadFromStorage);
  const [busqueda, setBusqueda]   = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando]   = useState(false);
  const [expandidos, setExpandidos] = useState({});
  const [copiado, setCopiado]     = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [feedback, setFeedback]   = useState(null);
  const [tab, setTab]             = useState("lista"); // "lista" | "buscar" | "sugeridos"
  const busquedaTimeout = useRef(null);
  const feedbackTimeout = useRef(null);
  const suggestionsRequested = useRef(false);

  const listaIds = useMemo(() => new Set(lista.map(it => it.id)), [lista]);
  const { recomendaciones, cargando: cargandoRec, cargar: cargarRec } = useRecomendaciones(van?.id, listaIds);
  const totalUnidades = lista.reduce((sum, item) => sum + Math.max(1, Number(item.cantidad) || 1), 0);

  useEffect(() => { saveToStorage(lista); }, [lista]);
  useEffect(() => () => {
    clearTimeout(busquedaTimeout.current);
    clearTimeout(feedbackTimeout.current);
  }, []);

  // Cargar sugeridos cuando se abre esa pestaña
  useEffect(() => {
    if (tab !== "sugeridos" || suggestionsRequested.current) return;
    suggestionsRequested.current = true;
    cargarRec();
  }, [tab, cargarRec]);

  const buscarProductos = useCallback(async (term) => {
    if (!term.trim()) { setResultados([]); return; }
    setBuscando(true);
    try {
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, marca, size, codigo")
        .or(`nombre.ilike.%${term}%,marca.ilike.%${term}%,codigo.ilike.%${term}%`)
        .limit(30);
      setResultados(data || []);
    } catch (error) {
      console.warn("Could not search Essentials products:", error?.message || error);
      setResultados([]);
    }
    finally { setBuscando(false); }
  }, []);

  const handleBusqueda = (val) => {
    setBusqueda(val);
    clearTimeout(busquedaTimeout.current);
    busquedaTimeout.current = setTimeout(() => buscarProductos(val), 300);
  };

  const mostrarFeedback = (prod, alreadyAdded = false) => {
    clearTimeout(feedbackTimeout.current);
    setFeedback({
      id: prod.id,
      message: alreadyAdded ? `${prod.nombre} is already in the list` : `${prod.nombre} added`,
    });
    feedbackTimeout.current = setTimeout(() => setFeedback(null), 2200);
  };

  const agregarProducto = (prod) => {
    const alreadyAdded = listaIds.has(prod.id);
    setLista(prev => addEssentialProduct(prev, prod).items);
    mostrarFeedback(prod, alreadyAdded);
  };

  const actualizarNotas = (id, val) => {
    setLista(prev => prev.map(it => it.id === id ? { ...it, notas: val } : it));
  };

  const actualizarCantidad = (id, cantidad) => {
    setLista(prev => updateEssentialQuantity(prev, id, cantidad));
  };

  const eliminar = (id) => setLista(prev => prev.filter(it => it.id !== id));

  const toggleExpandido = (id) =>
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));

  const limpiarLista = () => {
    if (window.confirm("¿Borrar toda la lista de esenciales?")) setLista([]);
  };

  const texto = buildEssentialsText(lista, van?.nombre_van);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  };

  const compartir = async () => {
    if (navigator.share) {
      try { setCompartiendo(true); await navigator.share({ title: "Lista de Esenciales", text: texto }); }
      catch {
        // Closing the native share dialog is an expected no-op.
      } finally { setCompartiendo(false); }
    } else { copiar(); }
  };

  const enviarEmail = () => {
    const subject = encodeURIComponent("Lista de Esenciales — " + new Date().toLocaleDateString());
    window.open(`mailto:?subject=${subject}&body=${encodeURIComponent(texto)}`);
  };

  const yaEnLista = (id) => listaIds.has(id);

  // ── Tab bar ───────────────────────────────────────────────
  const tabs = [
    { key: "lista",     icon: ClipboardList, label: "List",      badge: lista.length },
    { key: "sugeridos", icon: Sparkles,      label: "Suggested", badge: recomendaciones.length },
    { key: "buscar",    icon: Search,        label: "Search",    badge: 0 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl">
            <ClipboardList size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg leading-tight">Essentials</h1>
            <p className="text-xs text-gray-500">
              {lista.length === 0
                ? "Purchase order list"
                : `${lista.length} product${lista.length !== 1 ? "s" : ""} · ${totalUnidades} unit${totalUnidades !== 1 ? "s" : ""}`}
            </p>
          </div>
          {lista.length > 0 && (
            <button onClick={limpiarLista} className="ml-auto text-red-400 hover:text-red-600 p-2">
              <Trash2 size={16} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex mt-3 bg-gray-100 rounded-xl p-1 gap-1">
          {tabs.map(({ key, icon: Icon, label, badge }) => {
            const iconElement = createElement(Icon, { size: 13 });
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {iconElement}
                {label}
                {badge > 0 && (
                  <span className={`text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold ${
                    key === "sugeridos" ? "bg-blue-500 text-white" : "bg-orange-500 text-white"
                  }`}>{badge > 9 ? "9+" : badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] rounded-xl bg-emerald-600 text-white shadow-xl px-4 py-3 flex items-center gap-2 text-sm font-semibold"
        >
          <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Check size={15} />
          </span>
          <span className="truncate">{feedback.message}</span>
        </div>
      )}

      {/* ── SEARCH tab ── */}
      {tab === "buscar" && (
        <div className="flex flex-col flex-1 px-4 pt-4 pb-32 gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={busqueda}
              onChange={e => handleBusqueda(e.target.value)}
              placeholder="Search by name, brand or code..."
              className="w-full pl-9 pr-9 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {busqueda && (
              <button onClick={() => { setBusqueda(""); setResultados([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={15} />
              </button>
            )}
          </div>

          {buscando && <div className="text-center py-8 text-gray-400 text-sm">Searching...</div>}
          {!buscando && busqueda && resultados.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">No products found for "{busqueda}"</div>
          )}
          {!buscando && resultados.length > 0 && (
            <div className="flex flex-col gap-2 pb-6">
              {resultados.map(prod => {
                const agregado = yaEnLista(prod.id);
                return (
                  <div
                    key={prod.id}
                    className={`flex items-center gap-3 bg-white rounded-xl border px-4 py-3 text-left transition-all ${
                      agregado ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${agregado ? "bg-blue-100" : "bg-gray-100"}`}>
                      <ShoppingBag size={16} className={agregado ? "text-blue-600" : "text-gray-500"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm truncate">{prod.nombre}</div>
                      <div className="text-xs text-gray-500 flex gap-2 flex-wrap mt-0.5">
                        {prod.marca && <span>{prod.marca}</span>}
                        {prod.size  && <span>· {prod.size}</span>}
                        {prod.codigo && <span>· #{prod.codigo}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => agregarProducto(prod)}
                      disabled={agregado}
                      className={`flex-shrink-0 rounded-xl px-3 py-2 flex items-center gap-1 text-xs font-semibold transition-colors ${
                        agregado
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-500 hover:bg-blue-600 text-white"
                      }`}
                    >
                      {agregado ? <Check size={14} /> : <Plus size={14} />}
                      {agregado ? "Added" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {!busqueda && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <PackageOpen size={40} strokeWidth={1.2} />
              <p className="text-sm">Type a product name, brand or code</p>
            </div>
          )}
        </div>
      )}

      {/* ── SUGGESTED tab ── */}
      {tab === "sugeridos" && (
        <div className="flex-1 px-4 pt-4 pb-28 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Smart reorder recommendations</p>
              <p className="text-xs text-gray-400 mt-0.5">90-day sales velocity · best sellers before they run out</p>
            </div>
            <button onClick={cargarRec} className={`p-2 rounded-xl bg-gray-100 text-gray-500 ${cargandoRec ? "animate-spin" : ""}`}>
              <RefreshCw size={16} />
            </button>
          </div>

          {cargandoRec && (
            <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Analyzing sales data...</p>
            </div>
          )}

          {!cargandoRec && recomendaciones.length === 0 && (
            <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
              <TrendingUp size={40} strokeWidth={1.2} />
              <p className="text-sm text-center">All top sellers are well stocked,<br/>or already in your list</p>
            </div>
          )}

          {!cargandoRec && recomendaciones.map((prod) => {
            const agregado = yaEnLista(prod.id);
            return (
              <div key={prod.id} className={`bg-white rounded-xl border flex items-center gap-3 px-4 py-3 ${agregado ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200"}`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${prod.stockActual === 0 ? "bg-red-100" : "bg-amber-100"}`}>
                  <ShoppingBag size={16} className={prod.stockActual === 0 ? "text-red-600" : "text-amber-600"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm truncate">{prod.nombre}</div>
                  <div className="text-xs text-gray-500 flex gap-2 flex-wrap mt-0.5">
                    {prod.marca && <span>{prod.marca}</span>}
                    {prod.size  && <span>· {prod.size}</span>}
                    {prod.codigo && <span>· #{prod.codigo}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${prod.stockActual === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {prod.stockActual === 0 ? "OUT OF STOCK" : `${prod.stockActual} left`}
                    </span>
                  <span className="text-[11px] text-gray-400">{prod.vendido30d} sold in 30d</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {prod.esMasVendido && (
                    <span className="text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700 px-1.5 py-0.5">
                      BEST SELLER #{prod.rankingVentas}
                    </span>
                  )}
                  <span className="text-[10px] font-bold rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5">
                    ORDER {prod.cantidadRecomendada}
                  </span>
                </div>
              </div>
              <button
                  onClick={() => agregarProducto({ ...prod, cantidad: prod.cantidadRecomendada })}
                  disabled={agregado}
                  className={`flex-shrink-0 rounded-xl px-3 py-2 flex items-center gap-1 text-xs font-semibold ${
                    agregado ? "bg-emerald-100 text-emerald-700" : "bg-blue-500 hover:bg-blue-600 text-white"
                  }`}
                >
                  {agregado ? <Check size={14} /> : <Plus size={14} />}
                  {agregado ? "Added" : `Add ${prod.cantidadRecomendada}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── LIST tab ── */}
      {tab === "lista" && (
        <div className="flex-1 px-4 pt-4 pb-32 flex flex-col gap-3">
          {lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
              <ClipboardList size={48} strokeWidth={1.2} />
              <div className="text-center">
                <p className="font-medium text-gray-600">List is empty</p>
                <p className="text-sm mt-1">Check Suggested or Search to add products</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTab("sugeridos")} className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold">
                  <Sparkles size={15} /> Suggested
                </button>
                <button onClick={() => setTab("buscar")} className="flex items-center gap-2 bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-semibold">
                  <Search size={15} /> Search
                </button>
              </div>
            </div>
          ) : (
            <>
              {lista.map((item, i) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm">{item.nombre}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-x-2 mt-0.5">
                        {item.marca  && <span>{item.marca}</span>}
                        {item.size   && <span>· {item.size}</span>}
                        {item.codigo && <span className="font-mono">· #{item.codigo}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] font-semibold text-gray-500">Qty</span>
                        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                          <button
                            type="button"
                            aria-label={`Decrease quantity for ${item.nombre}`}
                            onClick={() => actualizarCantidad(item.id, Number(item.cantidad || 1) - 1)}
                            disabled={Number(item.cantidad || 1) <= 1}
                            className="w-8 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="min-w-8 text-center text-xs font-bold text-gray-800">{item.cantidad || 1}</span>
                          <button
                            type="button"
                            aria-label={`Increase quantity for ${item.nombre}`}
                            onClick={() => actualizarCantidad(item.id, Number(item.cantidad || 1) + 1)}
                            className="w-8 h-7 flex items-center justify-center text-blue-600 hover:bg-blue-50"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                      {item.notas && (
                        <div className="text-xs text-blue-600 mt-1 italic">"{item.notas}"</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleExpandido(item.id)} className={`text-xs px-2 py-1 rounded-lg border transition-all ${expandidos[item.id] ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-gray-50 border-gray-200 text-gray-400"}`}>
                        Note
                      </button>
                      <button onClick={() => eliminar(item.id)} className="text-red-400 hover:text-red-600 p-1.5">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {expandidos[item.id] && (
                    <div className="px-4 pb-3 border-t border-gray-100 pt-2">
                      <input
                        type="text"
                        placeholder="Add note for purchasing dept..."
                        value={item.notas}
                        onChange={e => actualizarNotas(item.id, e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
                      />
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => setTab("buscar")}
                className="flex items-center justify-center gap-2 border-2 border-dashed border-blue-300 text-blue-600 rounded-xl py-3 text-sm font-medium hover:bg-blue-50"
              >
                <Plus size={16} /> Add more products
              </button>
            </>
          )}
        </div>
      )}

      {/* Keep discovery continuous: only open the finished list when requested. */}
      {lista.length > 0 && tab !== "lista" && (
        <div className="fixed bottom-20 lg:bottom-5 left-4 right-4 lg:left-auto lg:right-6 lg:w-[360px] z-30">
          <button
            type="button"
            onClick={() => setTab("lista")}
            className="w-full rounded-2xl bg-slate-900 hover:bg-slate-800 text-white shadow-xl px-4 py-3 flex items-center gap-3"
          >
            <span className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
              <ClipboardList size={18} />
            </span>
            <span className="text-left flex-1 min-w-0">
              <span className="block text-sm font-bold">View list</span>
              <span className="block text-[11px] text-slate-300">{lista.length} products · {totalUnidades} units</span>
            </span>
            <ArrowRight size={18} className="text-slate-300" />
          </button>
        </div>
      )}

      {/* Share bar */}
      {lista.length > 0 && tab === "lista" && (
        <div className="fixed bottom-16 lg:bottom-0 left-0 lg:left-[248px] xl:left-[268px] right-0 px-4 pb-2 z-20">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-3 flex gap-2">
            <button
              onClick={compartir}
              disabled={compartiendo}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold"
            >
              <Share2 size={16} />
              {compartiendo ? "Sharing..." : "Share"}
            </button>
            <button onClick={copiar} className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl px-4 py-3 text-sm font-semibold">
              {copiado ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
              {copiado ? "Copied!" : "Copy"}
            </button>
            <button onClick={enviarEmail} className="flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl px-4 py-3">
              <Mail size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
