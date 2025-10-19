// src/ModalTraspasoStock.jsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

const norm = (s) => String(s || "").trim();
const isLikelyScan = (s) => !!s && s.length >= 6 && !/\s/.test(s);

export default function ModalTraspasoStock({
  abierto,
  cerrar,
  ubicaciones = [],
  ubicacionActual = null,
  onSuccess,
}) {
  const [origen, setOrigen] = useState(null);
  const [destino, setDestino] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [opciones, setOpciones] = useState([]);
  const [seleccion, setSeleccion] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const timerRef = useRef();

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!abierto) {
      setBusqueda("");
      setOpciones([]);
      setSeleccion(null);
      setCantidad(1);
      setMensaje("");
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      // Auto-seleccionar ubicación actual como origen
      if (ubicacionActual) {
        setOrigen(ubicacionActual);
        const primeraOtraUbicacion = ubicaciones.find(
          (u) => u.key !== ubicacionActual.key
        );
        setDestino(primeraOtraUbicacion || null);
      }
    }
  }, [abierto, ubicacionActual, ubicaciones]);

  // 🚀 Búsqueda con debounce
  useEffect(() => {
    if (!abierto || !origen) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const term = norm(busqueda);
    if (!term) {
      setOpciones([]);
      setSeleccion(null);
      setMensaje("");
      return;
    }

    // Fast-path para códigos escaneados
    if (isLikelyScan(term)) {
      timerRef.current = setTimeout(() => buscarProducto(term, true), 150);
    } else {
      timerRef.current = setTimeout(() => buscarProducto(term, false), 300);
    }

    return () => clearTimeout(timerRef.current);
  }, [busqueda, abierto, origen]);

  // 🚀 Búsqueda OPTIMIZADA
  async function buscarProducto(filtro, exacto = false) {
    if (!origen) return;

    setLoading(true);
    setOpciones([]);
    setSeleccion(null);
    setMensaje("");

    try {
      const tabla = origen.tipo === "warehouse" ? "stock_almacen" : "stock_van";
      let query = supabase
        .from(tabla)
        .select(
          `
          id,
          producto_id,
          cantidad,
          productos:producto_id (id, codigo, nombre, marca)
        `
        )
        .gt("cantidad", 0)
        .limit(20);

      if (origen.tipo === "van") {
        query = query.eq("van_id", origen.id);
      }

      // 🚀 Búsqueda exacta por código (más rápida)
      if (exacto) {
        query = query.eq("productos.codigo", filtro);
      }

      const { data, error } = await query;

      if (error) throw error;

      let results = (data || []).map((s) => ({
        id: s.id,
        producto_id: s.producto_id,
        cantidad: Number(s.cantidad || 0),
        productos: s.productos || null,
      }));

      // Si no es búsqueda exacta, filtrar en memoria
      if (!exacto && results.length > 0) {
        const f = filtro.toLowerCase();
        results = results.filter((r) => {
          const p = r.productos || {};
          return (
            (p.codigo || "").toLowerCase().includes(f) ||
            (p.nombre || "").toLowerCase().includes(f) ||
            (p.marca || "").toLowerCase().includes(f)
          );
        });
      }

      setOpciones(results);

      if (results.length === 1 && exacto) {
        setSeleccion(results[0]);
        setMensaje("✅ Exact match found!");
      } else if (results.length === 0) {
        setMensaje("❌ No products found in current location.");
      } else {
        setMensaje(`📦 Found ${results.length} products. Select one.`);
      }
    } catch (err) {
      setMensaje("❌ Error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // 🚀 Transferir stock (ATÓMICO)
  async function transferirStock(e) {
    e.preventDefault();
    setMensaje("");

    if (!origen || !destino) {
      setMensaje("❌ Select origin and destination.");
      return;
    }

    if (origen.key === destino.key) {
      setMensaje("❌ Origin and destination must be different.");
      return;
    }

    if (!seleccion?.producto_id) {
      setMensaje("❌ Select a product.");
      return;
    }

    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      setMensaje("❌ Invalid quantity.");
      return;
    }

    if (qty > seleccion.cantidad) {
      setMensaje(`❌ Not enough stock. Available: ${seleccion.cantidad}`);
      return;
    }

    try {
      setLoading(true);

      // 🔒 TRANSFERENCIA ATÓMICA VÍA RPC
      const { error } = await supabase.rpc("transferir_stock", {
        p_producto_id: seleccion.producto_id,
        p_cantidad: qty,
        p_origen_tipo: origen.tipo,
        p_origen_van_id: origen.id,
        p_destino_tipo: destino.tipo,
        p_destino_van_id: destino.id,
      });

      if (error) {
        // Si no existe el RPC, fallback manual
        if (error.code === "42883" || error.message?.includes("does not exist")) {
          await transferirStockManual(qty);
        } else {
          throw error;
        }
      }

      setMensaje("✅ Transfer completed successfully!");
      if (onSuccess) await onSuccess();

      setTimeout(() => {
        cerrar();
      }, 1500);
    } catch (err) {
      setMensaje("❌ Error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Fallback manual si no hay RPC
  async function transferirStockManual(qty) {
    // 1. Descontar de origen
    const tablaOrigen = origen.tipo === "warehouse" ? "stock_almacen" : "stock_van";
    const nuevaCantidadOrigen = seleccion.cantidad - qty;

    if (nuevaCantidadOrigen <= 0) {
      await supabase.from(tablaOrigen).delete().eq("id", seleccion.id);
    } else {
      await supabase
        .from(tablaOrigen)
        .update({ cantidad: nuevaCantidadOrigen })
        .eq("id", seleccion.id);
    }

    // 2. Sumar en destino
    const tablaDestino = destino.tipo === "warehouse" ? "stock_almacen" : "stock_van";
    let queryDestino = supabase
      .from(tablaDestino)
      .select("id, cantidad")
      .eq("producto_id", seleccion.producto_id);

    if (destino.tipo === "van") {
      queryDestino = queryDestino.eq("van_id", destino.id);
    }

    const { data: existeDestino } = await queryDestino.maybeSingle();

    if (existeDestino) {
      await supabase
        .from(tablaDestino)
        .update({ cantidad: Number(existeDestino.cantidad) + qty })
        .eq("id", existeDestino.id);
    } else {
      const insertData = {
        producto_id: seleccion.producto_id,
        cantidad: qty,
      };
      if (destino.tipo === "van") {
        insertData.van_id = destino.id;
      }
      await supabase.from(tablaDestino).insert([insertData]);
    }
  }

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <form
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl"
        onSubmit={transferirStock}
        autoComplete="off"
      >
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4 rounded-t-2xl">
          <h2 className="text-xl font-bold flex items-center gap-2">
            🔁 Transfer Stock
          </h2>
        </div>

        <div className="p-6 space-y-4">
          {/* Origen y Destino */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                From (Origin)
              </label>
              <select
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-green-500 outline-none"
                value={origen?.key || ""}
                onChange={(e) => {
                  const sel = ubicaciones.find((u) => u.key === e.target.value);
                  setOrigen(sel || null);
                  setOpciones([]);
                  setSeleccion(null);
                }}
              >
                <option value="">-- Select --</option>
                {ubicaciones.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                To (Destination)
              </label>
              <select
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-green-500 outline-none"
                value={destino?.key || ""}
                onChange={(e) => {
                  const sel = ubicaciones.find((u) => u.key === e.target.value);
                  setDestino(sel || null);
                }}
              >
                <option value="">-- Select --</option>
                {ubicaciones.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Búsqueda de producto */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Product
            </label>
            <input
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-green-500 outline-none font-mono"
              placeholder="Scan or search product..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setSeleccion(null);
              }}
              disabled={!origen}
            />
          </div>

          {/* Resultados */}
          {loading && (
            <div className="text-blue-500 text-sm">🔍 Searching...</div>
          )}

          {opciones.length > 0 && (
            <div className="max-h-40 overflow-y-auto border-2 border-gray-200 rounded-lg">
              {opciones.map((opt) => (
                <div
                  key={opt.id}
                  className={`p-3 border-b cursor-pointer hover:bg-green-50 ${
                    seleccion?.id === opt.id ? "bg-green-100" : ""
                  }`}
                  onClick={() => {
                    setSeleccion(opt);
                    setCantidad(Math.min(1, opt.cantidad));
                    setMensaje("");
                  }}
                >
                  <div className="font-semibold">{opt.productos?.nombre}</div>
                  <div className="text-xs text-gray-600">
                    Code: {opt.productos?.codigo} | Available: {opt.cantidad}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cantidad */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Quantity to transfer
            </label>
            <input
              type="number"
              min={1}
              max={seleccion?.cantidad || 1}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-green-500 outline-none"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              disabled={!seleccion}
            />
            {seleccion && (
              <div className="text-xs text-gray-600 mt-1">
                Max available: {seleccion.cantidad}
              </div>
            )}
          </div>

          {/* Mensaje */}
          {mensaje && (
            <div
              className={`p-3 rounded-lg text-center font-semibold ${
                mensaje.includes("✅")
                  ? "bg-green-100 text-green-800"
                  : mensaje.includes("❌")
                  ? "bg-red-100 text-red-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {mensaje}
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="flex gap-3 p-6 pt-0">
          <button
            type="button"
            className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-3 rounded-lg font-semibold transition-colors"
            onClick={cerrar}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50"
            disabled={!seleccion || loading}
          >
            {loading ? "Transferring..." : "Transfer"}
          </button>
        </div>
      </form>
    </div>
  );
}