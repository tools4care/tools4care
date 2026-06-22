// src/ModalTraspasoStock.jsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { barcodeVariants, isCodeLikeSearch, normalizeSearchTerm } from "./utils/productSearch";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { logAudit } from "./lib/auditLog";

const norm = normalizeSearchTerm;

export default function ModalTraspasoStock({
  abierto,
  cerrar,
  ubicaciones = [],
  ubicacionActual = null,
  onSuccess,
}) {
  const { usuario } = useUsuario();
  const { van } = useVan();
  const [origen, setOrigen] = useState(null);
  const [destino, setDestino] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [opciones, setOpciones] = useState([]);
  const [seleccion, setSeleccion] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [mensaje, setMensaje] = useState(""); // "exact" | "none" | "empty" | "many" | "success" | "err:..."
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const timerRef = useRef();
  const busquedaRef = useRef(null);
  const querySeq = useRef(0);

  /* ── Reset al abrir / cerrar ── */
  useEffect(() => {
    if (!abierto) {
      setBusqueda(""); setOpciones([]); setSeleccion(null); setCantidad(1); setMensaje("");
      setSaving(false);
      querySeq.current = 0;
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      if (ubicacionActual) {
        setOrigen(ubicacionActual);
        const otra = ubicaciones.find((u) => u.key !== ubicacionActual.key);
        setDestino(otra || null);
      }
      setTimeout(() => busquedaRef.current?.focus(), 150);
    }
  }, [abierto, ubicacionActual, ubicaciones]);

  /* ── Debounce búsqueda ── */
  useEffect(() => {
    if (!abierto || !origen) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const term = norm(busqueda);
    if (!term) { setOpciones([]); setSeleccion(null); setMensaje(""); return; }

    const codeLike = isCodeLikeSearch(term);
    timerRef.current = setTimeout(() => buscarProducto(term, codeLike), codeLike ? 45 : 180);

    return () => clearTimeout(timerRef.current);
  }, [busqueda, abierto, origen]);

  /* ── Búsqueda de productos (dos-query para eficiencia) ── */
  async function buscarProducto(filtro, exacto = false) {
    if (!origen) return;
    const qid = ++querySeq.current;
    setLoading(true); setOpciones([]); setSeleccion(null); setMensaje("");

    try {
      const tabla = origen.tipo === "warehouse" ? "stock_almacen" : "stock_van";
      const variants = barcodeVariants(filtro);
      const codeLike = exacto || isCodeLikeSearch(filtro);
      let productosData = [];
      let prodError = null;

      if (codeLike && variants.length > 0) {
        const exactProducts = await supabase
          .from("productos")
          .select("id, codigo, nombre, marca")
          .in("codigo", variants)
          .limit(50);
        prodError = exactProducts.error;
        productosData = exactProducts.data || [];
      }

      if (!prodError && codeLike && productosData.length === 0) {
        const codeFilters = variants.map((code) => `codigo.ilike.${code}%`).join(",");
        const prefixedProducts = await supabase
          .from("productos")
          .select("id, codigo, nombre, marca")
          .or(codeFilters)
          .limit(100);
        prodError = prefixedProducts.error;
        productosData = prefixedProducts.data || [];
      }

      if (!prodError && !codeLike) {
        const textProducts = await supabase
          .from("productos")
          .select("id, codigo, nombre, marca")
          .or(`codigo.ilike.%${filtro}%,nombre.ilike.%${filtro}%,marca.ilike.%${filtro}%`)
          .limit(100);
        prodError = textProducts.error;
        productosData = textProducts.data || [];
      }

      if (qid !== querySeq.current) return;
      if (prodError) throw prodError;

      if (!productosData || productosData.length === 0) {
        setMensaje("none"); setLoading(false); return;
      }

      const productoIds = productosData.map((p) => p.id);
      let stockQuery = supabase.from(tabla).select("id, producto_id, cantidad").in("producto_id", productoIds).gt("cantidad", 0);
      if (origen.tipo === "van" && origen.id) stockQuery = stockQuery.eq("van_id", origen.id);

      const { data: stockData, error: stockError } = await stockQuery;
      if (qid !== querySeq.current) return;
      if (stockError) throw stockError;

      const prodMap = new Map((productosData || []).map((prod) => [prod.id, prod]));
      const results = (stockData || []).map((stock) => {
        const prod = prodMap.get(stock.producto_id);
        return {
          id: stock.id,
          producto_id: stock.producto_id,
          cantidad: Number(stock.cantidad || 0),
          productos: prod,
        };
      }).filter((r) => r.cantidad > 0 && r.productos);

      setOpciones(results);

      if (results.length === 1 && codeLike) {
        setSeleccion(results[0]);
        setCantidad(1); // ✅ fixed: was Math.min(1, opt.cantidad)
        setMensaje("exact");
      } else if (results.length === 0) {
        setMensaje("none");
      } else {
        setMensaje("many");
      }
    } catch (err) {
      console.error("Error searching product:", err);
      setMensaje("err:" + (err?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  /* ── Transferir stock ── */
  function isMissingRpc(error) {
    return error?.code === "42883" || error?.code === "PGRST202" || /function .* does not exist/i.test(error?.message || "");
  }

  async function transferirStock(e) {
    e.preventDefault(); setMensaje("");

    if (!origen || !destino) { setMensaje("err:Select origin and destination."); return; }
    if (origen.key === destino.key) { setMensaje("err:Origin and destination must be different."); return; }
    if (!seleccion?.producto_id) { setMensaje("err:Select a product."); return; }

    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) { setMensaje("err:Invalid quantity."); return; }
    if (qty > seleccion.cantidad) {
      setMensaje(`err:Not enough stock. Available: ${seleccion.cantidad}`); return;
    }

    try {
      setSaving(true);
      const { error: rpcError } = await supabase.rpc("transferir_stock", {
        p_producto_id: seleccion.producto_id,
        p_cantidad: qty,
        p_origen_tipo: origen.tipo === "warehouse" ? "almacen" : origen.tipo,
        p_origen_van_id: origen.tipo === "van" ? origen.id : null,
        p_destino_tipo: destino.tipo === "warehouse" ? "almacen" : destino.tipo,
        p_destino_van_id: destino.tipo === "van" ? destino.id : null,
        p_motivo: `Transfer ${origen.nombre || origen.tipo} -> ${destino.nombre || destino.tipo}`,
        p_usuario_id: usuario?.id || null,
      });

      if (rpcError) {
        if (!isMissingRpc(rpcError)) throw rpcError;
        await transferirStockManual(qty);
      }
      logAudit({
        usuario,
        van,
        accion: "stock_transfer",
        entidadTipo: "producto",
        entidadId: seleccion.producto_id,
        before: {
          origen: origen?.nombre || origen?.tipo,
          origen_tipo: origen?.tipo,
          origen_van_id: origen?.tipo === "van" ? origen.id : null,
        },
        after: {
          destino: destino?.nombre || destino?.tipo,
          destino_tipo: destino?.tipo,
          destino_van_id: destino?.tipo === "van" ? destino.id : null,
          cantidad: qty,
        },
        nota: seleccion.productos?.nombre || "Stock transfer",
      });
      if (onSuccess) await onSuccess();
      setMensaje("success");
      setTimeout(() => cerrar(), 1200);
    } catch (err) {
      console.error("Transfer error:", err);
      setMensaje("err:" + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  /* ── Transferencia manual (deduct → add) ── */
  async function transferirStockManual(qty) {
    // 1. Descontar de origen
    const tablaOrigen = origen.tipo === "warehouse" ? "stock_almacen" : "stock_van";
    const nuevaCantidadOrigen = seleccion.cantidad - qty;

    if (nuevaCantidadOrigen <= 0) {
      const { error: delError } = await supabase.from(tablaOrigen).delete().eq("id", seleccion.id);
      if (delError) throw delError;
    } else {
      const { error: updError } = await supabase.from(tablaOrigen)
        .update({ cantidad: nuevaCantidadOrigen }).eq("id", seleccion.id);
      if (updError) throw updError;
    }

    // 2. Sumar en destino
    const tablaDestino = destino.tipo === "warehouse" ? "stock_almacen" : "stock_van";
    let queryDestino = supabase.from(tablaDestino).select("id, cantidad")
      .eq("producto_id", seleccion.producto_id);
    if (destino.tipo === "van" && destino.id) queryDestino = queryDestino.eq("van_id", destino.id);

    const { data: existeDestino, error: selectError } = await queryDestino.maybeSingle();
    if (selectError) throw selectError;

    if (existeDestino) {
      const { error: updError } = await supabase.from(tablaDestino)
        .update({ cantidad: Number(existeDestino.cantidad) + qty }).eq("id", existeDestino.id);
      if (updError) throw updError;
    } else {
      const insertData = { producto_id: seleccion.producto_id, cantidad: qty };
      if (destino.tipo === "van" && destino.id) insertData.van_id = destino.id;
      const { error: insError } = await supabase.from(tablaDestino).insert([insertData]);
      if (insError) throw insError;
    }
  }

  /* =========================== UI =========================== */
  if (!abierto) return null;

  const renderMensaje = () => {
    if (!mensaje || mensaje === "many") return null;
    if (mensaje === "success") return (
      <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-center">
        ✅ Transfer completed!
      </div>
    );
    if (mensaje === "exact") return (
      <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-center">
        ✅ Exact match found — ready to transfer
      </div>
    );
    if (mensaje === "empty") return (
      <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-center">
        ⚠️ No products with stock at this location
      </div>
    );
    if (mensaje === "none") return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm text-center">
        ❌ No products found matching your search
      </div>
    );
    if (mensaje.startsWith("err:")) return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-center">
        ❌ {mensaje.slice(4)}
      </div>
    );
    return null;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && cerrar()}
    >
      <form
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onSubmit={transferirStock}
        autoComplete="off"
      >
        {/* ── Header ── */}
        <div className="bg-gradient-to-br from-emerald-700 to-teal-800 text-white px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center text-xl">
                🔁
              </div>
              <div>
                <h2 className="text-xl font-bold">Transfer Stock</h2>
                <p className="text-emerald-200 text-xs mt-0.5">Move inventory between locations</p>
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

          {/* ── Origin → Destination ── */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                From
              </label>
              <select
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold focus:border-emerald-500 outline-none bg-white"
                value={origen?.key || ""}
                onChange={(e) => {
                  const sel = ubicaciones.find((u) => u.key === e.target.value);
                  setOrigen(sel || null);
                  setOpciones([]); setSeleccion(null); setBusqueda(""); setMensaje("");
                }}
              >
                <option value="">— Select —</option>
                {ubicaciones.map((u) => (
                  <option key={u.key} value={u.key}>{u.nombre}</option>
                ))}
              </select>
            </div>

            <div className="pb-2.5 text-slate-400 font-bold text-xl text-center select-none">→</div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                To
              </label>
              <select
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold focus:border-emerald-500 outline-none bg-white"
                value={destino?.key || ""}
                onChange={(e) => {
                  const sel = ubicaciones.find((u) => u.key === e.target.value);
                  setDestino(sel || null);
                }}
              >
                <option value="">— Select —</option>
                {ubicaciones.map((u) => (
                  <option key={u.key} value={u.key}>{u.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Product search ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Product
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base select-none pointer-events-none">
                ▌▌▌
              </span>
              <input
                ref={busquedaRef}
                className="w-full border-2 border-slate-200 rounded-xl pl-9 pr-9 py-2.5 font-mono text-sm focus:border-emerald-500 focus:outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                placeholder={origen ? "Scan or search product…" : "Select origin first"}
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setSeleccion(null);
                  setMensaje("");
                }}
                disabled={!origen}
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
          </div>

          {/* ── Loading spinner ── */}
          {loading && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
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
                const isSelected = seleccion?.producto_id === opt.producto_id;
                return (
                  <div
                    key={`${opt.producto_id}_${opt.id || Math.random()}`}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? "bg-emerald-50" : "hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setSeleccion(opt);
                      setCantidad(1);
                      setMensaje("");
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-800 truncate">
                        {opt.productos?.nombre || "No name"}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {opt.productos?.marca && (
                          <span className="mr-2">{opt.productos.marca}</span>
                        )}
                        {opt.productos?.codigo || "—"}
                      </div>
                    </div>
                    <div className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
                      {opt.cantidad} avail.
                    </div>
                    {isSelected && (
                      <div className="text-emerald-500 text-sm font-bold">✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Selected product card ── */}
          {seleccion && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center text-base">
                📦
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-slate-800 truncate">
                  {seleccion.productos?.nombre}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {seleccion.productos?.codigo || seleccion.productos?.marca || "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Available</div>
                <div className="text-sm font-bold text-emerald-700">{seleccion.cantidad}</div>
              </div>
            </div>
          )}

          {/* ── Quantity stepper ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Quantity to transfer
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
                type="number"
                min={1}
                max={seleccion?.cantidad || 1}
                className="flex-1 h-10 text-center border-2 border-slate-200 rounded-xl font-bold text-lg focus:border-emerald-500 focus:outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                disabled={!seleccion}
              />
              <button
                type="button"
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-lg text-slate-600 flex items-center justify-center transition-colors disabled:opacity-30"
                disabled={!seleccion || Number(cantidad) >= (seleccion?.cantidad || 0)}
                onClick={() => setCantidad((v) => Math.min(Number(v) + 1, seleccion?.cantidad || 1))}
              >
                +
              </button>
            </div>
            {seleccion && (
              <div className="text-xs text-slate-400 text-right mt-1">
                Max: {seleccion.cantidad}
              </div>
            )}
          </div>

          {/* ── Status / error message ── */}
          {renderMensaje()}

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
            className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-200 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            disabled={!seleccion || saving || mensaje === "success"}
          >
            {saving ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Transferring…
              </>
            ) : (
              `Transfer ${cantidad > 0 ? cantidad : ""} Unit${Number(cantidad) !== 1 ? "s" : ""}`
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
