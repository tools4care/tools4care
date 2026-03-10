// src/AgregarStockModal.jsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";

/* ===================== Helpers de búsqueda (fast-path escáner) ===================== */
const isLikelyScan = (s) => !!s && s.length >= 6 && !/\s/.test(s);
const norm = (s) => String(s || "").trim();

export default function AgregarStockModal({
  abierto,
  cerrar,
  tipo = "almacen",   // "almacen" | "warehouse" | "van"
  ubicacionId = null, // uuid de van cuando tipo="van"
  onSuccess,
}) {
  const [busqueda, setBusqueda] = useState("");
  const [opciones, setOpciones] = useState([]);
  const [seleccion, setSeleccion] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [mensaje, setMensaje] = useState(""); // "not_found" | "select" | "exact" | "err:..." | ""
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modo, setModo] = useState("auto");

  const timerRef = useRef();
  const busquedaInputRef = useRef(null);
  const cantidadInputRef = useRef(null);
  const querySeq = useRef(0);
  const allocQ = () => ++querySeq.current;
  const isLatest = (id) => id === querySeq.current;
  const exactCacheRef = useRef(new Map());

  const navigate = useNavigate();

  /* ── Reset al abrir / cerrar ── */
  useEffect(() => {
    if (!abierto) {
      setBusqueda(""); setOpciones([]); setSeleccion(null); setCantidad(1);
      setMensaje(""); setModo("auto"); querySeq.current = 0;
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      setTimeout(() => busquedaInputRef.current?.focus(), 80);
    }
  }, [abierto]);

  /* ── Auto-focus en cantidad al seleccionar ── */
  useEffect(() => {
    if (seleccion && cantidadInputRef.current) {
      setTimeout(() => {
        cantidadInputRef.current?.focus();
        cantidadInputRef.current?.select();
      }, 100);
    }
  }, [seleccion]);

  /* ── Debounce / fast-path ── */
  useEffect(() => {
    if (!abierto) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const term = norm(busqueda);
    if (!term) { setOpciones([]); setSeleccion(null); setMensaje(""); return; }

    if ((modo === "auto" || modo === "codigo") && isLikelyScan(term)) {
      (async () => {
        const hit = await buscarExactoPorCodigo(term);
        if (!hit) timerRef.current = setTimeout(() => buscarOpciones(term, modo), 180);
      })();
      return;
    }

    timerRef.current = setTimeout(() => buscarOpciones(term, modo), 300);
    return () => clearTimeout(timerRef.current);
  }, [busqueda, abierto, modo]);

  /* ================== BUSCAR OPCIONES ================== */
  async function buscarOpciones(filtro, modoBusqueda = "auto") {
    const qid = allocQ();
    setLoading(true); setOpciones([]); setSeleccion(null); setMensaje("");

    let prodQuery = supabase.from("productos").select("id, nombre, marca, codigo").limit(50);

    if (modoBusqueda === "codigo")      prodQuery = prodQuery.ilike("codigo", `%${filtro}%`);
    else if (modoBusqueda === "nombre") prodQuery = prodQuery.ilike("nombre", `%${filtro}%`);
    else if (modoBusqueda === "marca")  prodQuery = prodQuery.ilike("marca", `%${filtro}%`);
    else prodQuery = prodQuery.or(`codigo.ilike.%${filtro}%,nombre.ilike.%${filtro}%,marca.ilike.%${filtro}%`);

    const { data: productosData, error: prodErr } = await prodQuery;
    if (!isLatest(qid)) return;
    if (prodErr) { setLoading(false); setMensaje("err:" + prodErr.message); return; }

    const ids = (productosData || []).map((p) => p.id);
    let inventarioData = [];

    if (ids.length > 0) {
      const tabla = tipo === "almacen" || tipo === "warehouse" ? "stock_almacen" : "stock_van";
      let invQuery = supabase.from(tabla).select("id, cantidad, producto_id");
      if (tipo === "van" && ubicacionId) invQuery = invQuery.eq("van_id", ubicacionId);
      invQuery = invQuery.in("producto_id", ids);

      const { data, error: invErr } = await invQuery;
      if (!isLatest(qid)) return;
      if (invErr) { setLoading(false); setMensaje("err:" + invErr.message); return; }
      inventarioData = data || [];
    }

    const invMap = new Map(inventarioData.map((x) => [x.producto_id, x.cantidad]));
    const opcionesTodas = (productosData || []).map((p) => ({
      ...p, producto_id: p.id,
      enInventario: invMap.has(p.id),
      cantidad: invMap.get(p.id) ?? 0,
    }));

    if (!isLatest(qid)) return;
    setOpciones(opcionesTodas);
    setLoading(false);

    const filtroLC = filtro.toLowerCase();
    const exact = opcionesTodas.find((opt) =>
      opt.codigo?.toLowerCase() === filtroLC ||
      opt.nombre?.toLowerCase() === filtroLC ||
      opt.marca?.toLowerCase() === filtroLC
    );

    if (exact) {
      setSeleccion(exact);
      setMensaje("exact");
    } else {
      setMensaje(opcionesTodas.length === 0 ? "not_found" : "select");
    }
  }

  /* ================== BÚSQUEDA EXACTA POR CÓDIGO (fast-path) ================== */
  async function buscarExactoPorCodigo(codeRaw) {
    const code = norm(codeRaw);
    if (!code) return false;

    if (exactCacheRef.current.has(code)) {
      const opt = exactCacheRef.current.get(code);
      setOpciones([opt]); setSeleccion(opt); setMensaje("exact"); setLoading(false);
      return true;
    }

    const qid = allocQ(); setLoading(true);
    const { data: prod, error: prodErr } = await supabase
      .from("productos").select("id, nombre, marca, codigo").eq("codigo", code).maybeSingle();

    if (!isLatest(qid)) return true;
    if (prodErr || !prod) { setLoading(false); return false; }

    const tabla = tipo === "almacen" || tipo === "warehouse" ? "stock_almacen" : "stock_van";
    let invQuery = supabase.from(tabla).select("id, cantidad, producto_id").eq("producto_id", prod.id);
    if (tipo === "van" && ubicacionId) invQuery = invQuery.eq("van_id", ubicacionId);
    const { data: inv, error: invErr } = await invQuery;

    if (!isLatest(qid)) return true;
    if (invErr) { setLoading(false); setMensaje("err:" + invErr.message); return true; }

    const cantidadActual = inv?.[0]?.cantidad ?? 0;
    const opt = {
      ...prod, producto_id: prod.id,
      enInventario: Array.isArray(inv) && inv.length > 0,
      cantidad: cantidadActual,
    };

    exactCacheRef.current.set(code, opt);
    setOpciones([opt]); setSeleccion(opt); setMensaje("exact"); setLoading(false);
    return true;
  }

  /* ====================== AGREGAR STOCK ====================== */
  async function agregarStock(e) {
    e.preventDefault(); setMensaje("");
    if (!seleccion?.producto_id) { setMensaje("err:Select a product first."); return; }
    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) { setMensaje("err:Invalid quantity."); return; }

    try {
      setSaving(true);

      if (tipo === "van") {
        if (!ubicacionId) { setMensaje("err:No van selected."); return; }
        const { error } = await supabase.rpc("increment_stock_van", {
          p_van_id: ubicacionId,
          p_producto_id: seleccion.producto_id,
          p_delta: qty,
        });
        if (error) { setMensaje("err:" + error.message); return; }
      } else {
        const { data: existente, error: readErr } = await supabase
          .from("stock_almacen").select("id, cantidad")
          .eq("producto_id", seleccion.producto_id).maybeSingle();
        if (readErr) { setMensaje("err:" + readErr.message); return; }

        if (existente) {
          const { error: updErr } = await supabase.from("stock_almacen")
            .update({ cantidad: Number(existente.cantidad || 0) + qty }).eq("id", existente.id);
          if (updErr) { setMensaje("err:" + updErr.message); return; }
        } else {
          const { error: insErr } = await supabase.from("stock_almacen")
            .insert({ producto_id: seleccion.producto_id, cantidad: qty });
          if (insErr) { setMensaje("err:" + insErr.message); return; }
        }
      }

      if (onSuccess) await onSuccess();
      cerrar();
    } catch (err) {
      setMensaje("err:" + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  /* =========================== UI =========================== */
  if (!abierto) return null;

  const MODOS = [
    { value: "auto",   label: "All" },
    { value: "codigo", label: "Code" },
    { value: "nombre", label: "Name" },
    { value: "marca",  label: "Brand" },
  ];

  const placeholder =
    modo === "codigo" ? "Scan or type code…" :
    modo === "nombre" ? "Type product name…" :
    modo === "marca"  ? "Type brand…" :
    "Scan barcode or search…";

  const labelTipo = tipo === "van" ? "Van" : "Warehouse";

  const renderMensaje = () => {
    if (!mensaje || mensaje === "select" || mensaje === "exact") return null;
    if (mensaje === "not_found") return null; // handled separately below
    if (mensaje.startsWith("err:")) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-center">
          ❌ {mensaje.slice(4)}
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && cerrar()}
    >
      <form
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onSubmit={agregarStock}
        autoComplete="off"
      >
        {/* ── Header gradient ── */}
        <div className="bg-gradient-to-br from-slate-800 to-blue-900 text-white px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center text-xl">
                📦
              </div>
              <div>
                <h2 className="text-xl font-bold leading-tight">Add Stock</h2>
                <p className="text-blue-200 text-xs mt-0.5">{labelTipo} inventory</p>
              </div>
            </div>
            <button
              type="button"
              onClick={cerrar}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Mode pills ── */}
          <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
            {MODOS.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all ${
                  modo === m.value
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setModo(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* ── Search input ── */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base select-none pointer-events-none">
              ▌▌▌
            </span>
            <input
              ref={busquedaInputRef}
              className="w-full border-2 border-slate-200 rounded-xl pl-9 pr-9 py-2.5 font-mono text-sm focus:border-blue-500 focus:outline-none transition-colors"
              placeholder={placeholder}
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setSeleccion(null);
                setMensaje("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const term = norm(busqueda);
                  if (!term) return;
                  if ((modo === "auto" || modo === "codigo") && isLikelyScan(term))
                    buscarExactoPorCodigo(term);
                  else buscarOpciones(term, modo);
                }
              }}
            />
            {busqueda && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
                onClick={() => { setBusqueda(""); setOpciones([]); setSeleccion(null); setMensaje(""); }}
              >
                ✕
              </button>
            )}
          </div>

          {/* ── Loading spinner ── */}
          {loading && (
            <div className="flex items-center gap-2 text-blue-600 text-sm">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Searching…
            </div>
          )}

          {/* ── Results list ── */}
          {!loading && opciones.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {opciones.map((opt) => {
                const term = norm(busqueda).toLowerCase();
                const isExact =
                  term && (
                    opt.codigo?.toLowerCase() === term ||
                    opt.nombre?.toLowerCase() === term ||
                    opt.marca?.toLowerCase() === term
                  );
                const isSelected = seleccion?.producto_id === opt.producto_id;
                return (
                  <div
                    key={opt.producto_id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-50" : isExact ? "bg-green-50" : "hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setSeleccion(opt);
                      setBusqueda(opt.codigo || opt.nombre || "");
                      setMensaje(isExact ? "exact" : "selected");
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-800 truncate">{opt.nombre}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {opt.marca && <span className="mr-2 text-slate-400">{opt.marca}</span>}
                        {opt.codigo || "—"}
                      </div>
                    </div>
                    <div className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                      opt.enInventario
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {opt.enInventario ? `${opt.cantidad} in stock` : "New"}
                    </div>
                    {isSelected && (
                      <div className="text-blue-500 text-sm font-bold">✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── "Not found" message ── */}
          {mensaje === "not_found" && norm(busqueda) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center space-y-2">
              <div className="text-sm text-amber-700 font-semibold">Product not found</div>
              <button
                type="button"
                className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors"
                onClick={() => {
                  navigate(`/productos/nuevo?codigo=${encodeURIComponent(norm(busqueda))}`);
                  cerrar();
                }}
              >
                + Create "{norm(busqueda)}"
              </button>
            </div>
          )}

          {/* ── Select prompt ── */}
          {mensaje === "select" && opciones.length > 0 && (
            <div className="text-xs text-slate-400 text-center">
              Select a product from the list above
            </div>
          )}

          {/* ── Error message ── */}
          {renderMensaje()}

          {/* ── Selected product card ── */}
          {seleccion && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center text-base">
                📦
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-slate-800 truncate">{seleccion.nombre}</div>
                <div className="text-xs text-slate-500 font-mono">{seleccion.codigo || seleccion.marca || "—"}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">In stock</div>
                <div className="text-sm font-bold text-slate-700">{seleccion.cantidad}</div>
              </div>
            </div>
          )}

          {/* ── Quantity stepper ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Quantity to add
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-lg text-slate-600 flex items-center justify-center transition-colors disabled:opacity-30"
                disabled={!seleccion || Number(cantidad) <= 1}
                onClick={() => setCantidad((v) => Math.max(1, Number(v) - 1))}
              >
                −
              </button>
              <input
                ref={cantidadInputRef}
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                className="flex-1 h-10 text-center border-2 border-slate-200 rounded-xl font-bold text-lg focus:border-blue-500 focus:outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                disabled={!seleccion}
              />
              <button
                type="button"
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-lg text-slate-600 flex items-center justify-center transition-colors disabled:opacity-30"
                disabled={!seleccion}
                onClick={() => setCantidad((v) => Number(v) + 1)}
              >
                +
              </button>
            </div>
          </div>

        </div>

        {/* ── Action buttons ── */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            type="button"
            className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors"
            onClick={cerrar}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-200 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            disabled={!seleccion || saving}
          >
            {saving ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </>
            ) : (
              `Add ${cantidad > 0 ? cantidad : ""} Unit${Number(cantidad) !== 1 ? "s" : ""}`
            )}
          </button>
        </div>

        {!seleccion && (
          <div className="text-center text-xs text-slate-400 pb-4">
            Not found? Create the product in the{" "}
            <span className="text-blue-600 font-semibold">Products</span> module first.
          </div>
        )}
      </form>
    </div>
  );
}
