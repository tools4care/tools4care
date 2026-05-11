// src/ListaEmergencia.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import {
  Search, Plus, Trash2, Share2, Copy, Check, X,
  ShoppingBag, PackageOpen, ClipboardList, Mail,
  Sparkles, TrendingUp, RefreshCw,
} from "lucide-react";

const STORAGE_KEY = "lista_emergencia_v1";

function loadFromStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveToStorage(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function buildTextoLista(items, vanNombre) {
  const fecha = new Date().toLocaleDateString("es-PR", { year: "numeric", month: "short", day: "numeric" });
  const header = `📋 LISTA DE COMPRAS ESENCIALES${vanNombre ? " — " + vanNombre : ""}\n📅 ${fecha}\n${"─".repeat(38)}`;
  const lineas = items.map((it, i) => {
    const parts = [
      `${i + 1}. ${it.nombre}`,
      it.marca  ? `   Marca: ${it.marca}`  : null,
      it.size   ? `   Tamaño: ${it.size}`  : null,
      it.codigo ? `   Código: ${it.codigo}` : null,
      it.notas  ? `   Nota: ${it.notas}`   : null,
    ].filter(Boolean);
    return parts.join("\n");
  });
  return [header, ...lineas, "─".repeat(38)].join("\n\n");
}

// ─── Recommendations hook ────────────────────────────────────
function useRecomendaciones(vanId, listaIds) {
  const [recomendaciones, setRecomendaciones] = useState([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!vanId) return;
    setCargando(true);
    try {
      // 1. Ventas de los últimos 7 días en esta van
      const desde = new Date();
      desde.setDate(desde.getDate() - 7);
      const desdeISO = desde.toISOString().slice(0, 10);

      const { data: ventasData } = await supabase
        .from("ventas")
        .select("id")
        .eq("van_id", vanId)
        .gte("fecha", desdeISO);

      const ventaIds = (ventasData || []).map(v => v.id);
      if (!ventaIds.length) { setRecomendaciones([]); setCargando(false); return; }

      // 2. Agregar cantidad vendida por producto (en lotes de 200)
      const qtyMap = new Map();
      for (let i = 0; i < ventaIds.length; i += 200) {
        const lote = ventaIds.slice(i, i + 200);
        const { data: det } = await supabase
          .from("detalle_ventas")
          .select("producto_id, cantidad")
          .in("venta_id", lote);
        (det || []).forEach(d => {
          qtyMap.set(d.producto_id, (qtyMap.get(d.producto_id) || 0) + Number(d.cantidad || 0));
        });
      }
      if (!qtyMap.size) { setRecomendaciones([]); setCargando(false); return; }

      // 3. Top 50 productos más vendidos en esa semana
      const topIds = [...qtyMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([id]) => id);

      // 4. Stock actual en la van para esos productos
      const { data: stockData } = await supabase
        .from("stock_van")
        .select("producto_id, cantidad")
        .eq("van_id", vanId)
        .in("producto_id", topIds);

      const stockMap = new Map((stockData || []).map(s => [s.producto_id, Number(s.cantidad || 0)]));

      // 5. Filtrar: solo los que tienen stock bajo (≤ 3) o que no tienen registro en stock_van
      const candidatos = topIds.filter(id => {
        const qty = stockMap.has(id) ? stockMap.get(id) : 0;
        return qty <= 3;
      });

      if (!candidatos.length) { setRecomendaciones([]); setCargando(false); return; }

      // 6. Datos del producto
      const { data: prods } = await supabase
        .from("productos")
        .select("id, nombre, marca, size, codigo")
        .in("id", candidatos);

      // 7. Excluir los que ya están en la lista
      const result = (prods || [])
        .filter(p => !listaIds.has(p.id))
        .map(p => ({
          ...p,
          vendido7d: qtyMap.get(p.id) || 0,
          stockActual: stockMap.get(p.id) ?? 0,
        }))
        .sort((a, b) => b.vendido7d - a.vendido7d);

      setRecomendaciones(result);
    } catch (_) {
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
  const [tab, setTab]             = useState("lista"); // "lista" | "buscar" | "sugeridos"
  const busquedaTimeout = useRef(null);

  const listaIds = new Set(lista.map(it => it.id));
  const { recomendaciones, cargando: cargandoRec, cargar: cargarRec } = useRecomendaciones(van?.id, listaIds);

  useEffect(() => { saveToStorage(lista); }, [lista]);

  // Cargar sugeridos cuando se abre esa pestaña
  useEffect(() => {
    if (tab === "sugeridos" && recomendaciones.length === 0 && !cargandoRec) {
      cargarRec();
    }
  }, [tab]);

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
    } catch (_) { setResultados([]); }
    finally { setBuscando(false); }
  }, []);

  const handleBusqueda = (val) => {
    setBusqueda(val);
    clearTimeout(busquedaTimeout.current);
    busquedaTimeout.current = setTimeout(() => buscarProductos(val), 300);
  };

  const agregarProducto = (prod) => {
    setLista(prev => {
      if (prev.find(it => it.id === prod.id)) return prev;
      return [...prev, { id: prod.id, nombre: prod.nombre, marca: prod.marca || "", size: prod.size || "", codigo: prod.codigo || "", notas: "" }];
    });
    setTab("lista");
    setBusqueda("");
    setResultados([]);
  };

  const actualizarNotas = (id, val) => {
    setLista(prev => prev.map(it => it.id === id ? { ...it, notas: val } : it));
  };

  const eliminar = (id) => setLista(prev => prev.filter(it => it.id !== id));

  const toggleExpandido = (id) =>
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));

  const limpiarLista = () => {
    if (window.confirm("¿Borrar toda la lista de esenciales?")) setLista([]);
  };

  const texto = buildTextoLista(lista, van?.nombre_van);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch (_) {}
  };

  const compartir = async () => {
    if (navigator.share) {
      try { setCompartiendo(true); await navigator.share({ title: "Lista de Esenciales", text: texto }); }
      catch (_) {} finally { setCompartiendo(false); }
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
              {lista.length === 0 ? "Purchase order list" : `${lista.length} product${lista.length !== 1 ? "s" : ""} to order`}
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
          {tabs.map(({ key, icon: Icon, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              <Icon size={13} />
              {label}
              {badge > 0 && (
                <span className={`text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold ${
                  key === "sugeridos" ? "bg-blue-500 text-white" : "bg-orange-500 text-white"
                }`}>{badge > 9 ? "9+" : badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── SEARCH tab ── */}
      {tab === "buscar" && (
        <div className="flex flex-col flex-1 px-4 pt-4 gap-3">
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
                  <button
                    key={prod.id}
                    onClick={() => agregarProducto(prod)}
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
                    <div className={`flex-shrink-0 rounded-full p-1 ${agregado ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                      {agregado ? <Check size={14} /> : <Plus size={14} />}
                    </div>
                  </button>
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
              <p className="text-sm font-semibold text-gray-800">Best sellers last 7 days</p>
              <p className="text-xs text-gray-400 mt-0.5">Out of stock or nearly gone · not yet in your list</p>
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

          {!cargandoRec && recomendaciones.map(prod => (
            <div key={prod.id} className="bg-white rounded-xl border border-gray-200 flex items-center gap-3 px-4 py-3">
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
                  <span className="text-[11px] text-gray-400">{prod.vendido7d} sold last week</span>
                </div>
              </div>
              <button
                onClick={() => agregarProducto(prod)}
                className="flex-shrink-0 bg-blue-500 hover:bg-blue-600 text-white rounded-xl px-3 py-2 flex items-center gap-1 text-xs font-semibold"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          ))}
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

      {/* Share bar */}
      {lista.length > 0 && tab === "lista" && (
        <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 z-20">
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
