// src/ListaEmergencia.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import {
  Search, Plus, Trash2, Share2, Copy, Check, X,
  AlertTriangle, ShoppingBag, ChevronDown, ChevronUp,
  Mail, MessageSquare, PackageOpen, ClipboardList
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
  const fecha = new Date().toLocaleDateString("es-PR", {
    year: "numeric", month: "short", day: "numeric",
  });
  const header = `🚨 LISTA DE EMERGENCIA${vanNombre ? " — " + vanNombre : ""}\n📅 ${fecha}\n${"─".repeat(35)}`;
  const lineas = items.map((it, i) => {
    const parts = [
      `${i + 1}. ${it.nombre}`,
      it.marca ? `   Marca: ${it.marca}` : null,
      it.size  ? `   Tamaño: ${it.size}` : null,
      it.codigo ? `   Código: ${it.codigo}` : null,
      `   Cantidad: ${it.cantidad || 1}`,
      it.notas ? `   Nota: ${it.notas}` : null,
    ].filter(Boolean);
    return parts.join("\n");
  });
  return [header, ...lineas, "─".repeat(35)].join("\n\n");
}

export default function ListaEmergencia() {
  const { van } = useVan();

  const [lista, setLista]       = useState(loadFromStorage);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [expandidos, setExpandidos] = useState({});
  const [copiado, setCopiado]   = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [tab, setTab]           = useState("lista"); // "lista" | "buscar"
  const busquedaTimeout = useRef(null);

  useEffect(() => { saveToStorage(lista); }, [lista]);

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
    } catch (_) {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  const handleBusqueda = (val) => {
    setBusqueda(val);
    clearTimeout(busquedaTimeout.current);
    busquedaTimeout.current = setTimeout(() => buscarProductos(val), 300);
  };

  const agregarProducto = (prod) => {
    setLista((prev) => {
      const existe = prev.find((it) => it.id === prod.id);
      if (existe) {
        return prev.map((it) =>
          it.id === prod.id ? { ...it, cantidad: (it.cantidad || 1) + 1 } : it
        );
      }
      return [...prev, { ...prod, cantidad: 1, notas: "" }];
    });
    setTab("lista");
    setBusqueda("");
    setResultados([]);
  };

  const actualizarCantidad = (id, val) => {
    const n = Math.max(1, parseInt(val) || 1);
    setLista((prev) => prev.map((it) => it.id === id ? { ...it, cantidad: n } : it));
  };

  const actualizarNotas = (id, val) => {
    setLista((prev) => prev.map((it) => it.id === id ? { ...it, notas: val } : it));
  };

  const eliminar = (id) => {
    setLista((prev) => prev.filter((it) => it.id !== id));
  };

  const toggleExpandido = (id) => {
    setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const limpiarLista = () => {
    if (window.confirm("¿Borrar toda la lista de emergencia?")) setLista([]);
  };

  const texto = buildTextoLista(lista, van?.nombre_van);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (_) {}
  };

  const compartir = async () => {
    if (navigator.share) {
      try {
        setCompartiendo(true);
        await navigator.share({ title: "Lista de Emergencia", text: texto });
      } catch (_) {}
      finally { setCompartiendo(false); }
    } else {
      copiar();
    }
  };

  const enviarEmail = () => {
    const subject = encodeURIComponent("Lista de Emergencia — " + new Date().toLocaleDateString());
    const body = encodeURIComponent(texto);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const yaEnLista = (id) => lista.some((it) => it.id === id);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-xl">
            <AlertTriangle size={20} className="text-orange-600" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg leading-tight">Emergency List</h1>
            <p className="text-xs text-gray-500">
              {lista.length === 0 ? "No items added yet" : `${lista.length} product${lista.length !== 1 ? "s" : ""} in list`}
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
          <button
            onClick={() => setTab("lista")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "lista" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            <ClipboardList size={15} />
            List {lista.length > 0 && <span className="bg-orange-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{lista.length}</span>}
          </button>
          <button
            onClick={() => setTab("buscar")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "buscar" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            <Search size={15} />
            Add Products
          </button>
        </div>
      </div>

      {/* Search tab */}
      {tab === "buscar" && (
        <div className="flex flex-col flex-1 px-4 pt-4 gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => handleBusqueda(e.target.value)}
              placeholder="Search by name, brand or code..."
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {busqueda && (
              <button onClick={() => { setBusqueda(""); setResultados([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={15} />
              </button>
            )}
          </div>

          {buscando && (
            <div className="text-center py-8 text-gray-400 text-sm">Searching...</div>
          )}

          {!buscando && busqueda && resultados.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">No products found for "{busqueda}"</div>
          )}

          {!buscando && resultados.length > 0 && (
            <div className="flex flex-col gap-2 pb-6">
              {resultados.map((prod) => {
                const agregado = yaEnLista(prod.id);
                return (
                  <button
                    key={prod.id}
                    onClick={() => agregarProducto(prod)}
                    className={`flex items-center gap-3 bg-white rounded-xl border px-4 py-3 text-left transition-all ${
                      agregado ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:border-orange-300"
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${agregado ? "bg-orange-100" : "bg-gray-100"}`}>
                      <ShoppingBag size={16} className={agregado ? "text-orange-600" : "text-gray-500"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm truncate">{prod.nombre}</div>
                      <div className="text-xs text-gray-500 flex gap-2 flex-wrap mt-0.5">
                        {prod.marca && <span>{prod.marca}</span>}
                        {prod.size  && <span>· {prod.size}</span>}
                        {prod.codigo && <span>· #{prod.codigo}</span>}
                      </div>
                    </div>
                    <div className={`flex-shrink-0 rounded-full p-1 ${agregado ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
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
              <p className="text-sm">Type a product name, brand or code to search</p>
            </div>
          )}
        </div>
      )}

      {/* Lista tab */}
      {tab === "lista" && (
        <div className="flex-1 px-4 pt-4 pb-32 flex flex-col gap-3">
          {lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
              <ClipboardList size={48} strokeWidth={1.2} />
              <div className="text-center">
                <p className="font-medium text-gray-600">List is empty</p>
                <p className="text-sm mt-1">Go to "Add Products" to search and add items</p>
              </div>
              <button
                onClick={() => setTab("buscar")}
                className="flex items-center gap-2 bg-orange-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
              >
                <Plus size={16} /> Add Products
              </button>
            </div>
          ) : (
            <>
              {lista.map((item, i) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-xs mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm">{item.nombre}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-x-2 mt-0.5">
                        {item.marca  && <span>{item.marca}</span>}
                        {item.size   && <span>· {item.size}</span>}
                        {item.codigo && <span>· #{item.codigo}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Quantity */}
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => actualizarCantidad(item.id, item.cantidad - 1)}
                          className="px-2 py-1.5 text-gray-500 hover:bg-gray-100 text-sm font-bold leading-none"
                        >−</button>
                        <input
                          type="number"
                          min={1}
                          value={item.cantidad}
                          onChange={(e) => actualizarCantidad(item.id, e.target.value)}
                          className="w-9 text-center text-sm font-semibold text-gray-900 border-x border-gray-200 py-1 focus:outline-none"
                        />
                        <button
                          onClick={() => actualizarCantidad(item.id, item.cantidad + 1)}
                          className="px-2 py-1.5 text-gray-500 hover:bg-gray-100 text-sm font-bold leading-none"
                        >+</button>
                      </div>
                      <button onClick={() => toggleExpandido(item.id)} className="text-gray-400 p-1">
                        {expandidos[item.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <button onClick={() => eliminar(item.id)} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {expandidos[item.id] && (
                    <div className="px-4 pb-3 border-t border-gray-100 pt-2">
                      <input
                        type="text"
                        placeholder="Add note (optional)..."
                        value={item.notas}
                        onChange={(e) => actualizarNotas(item.id, e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50"
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* Quick add */}
              <button
                onClick={() => setTab("buscar")}
                className="flex items-center justify-center gap-2 border-2 border-dashed border-orange-300 text-orange-600 rounded-xl py-3 text-sm font-medium hover:bg-orange-50"
              >
                <Plus size={16} /> Add more products
              </button>
            </>
          )}
        </div>
      )}

      {/* Share bar — fixed bottom, only when list has items */}
      {lista.length > 0 && tab === "lista" && (
        <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 z-20">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-3 flex gap-2">
            <button
              onClick={compartir}
              disabled={compartiendo}
              className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-3 text-sm font-semibold"
            >
              <Share2 size={16} />
              {compartiendo ? "Sharing..." : "Share"}
            </button>
            <button
              onClick={copiar}
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl px-4 py-3 text-sm font-semibold"
            >
              {copiado ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
              {copiado ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={enviarEmail}
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl px-4 py-3 text-sm font-semibold"
            >
              <Mail size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
