// src/AgregarStockModal.jsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";

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
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const timerRef = useRef();

  const navigate = useNavigate();

  // Reset al cerrar
  useEffect(() => {
    if (!abierto) {
      setBusqueda("");
      setOpciones([]);
      setSeleccion(null);
      setCantidad(1);
      setMensaje("");
    }
  }, [abierto]);

  // Debounce de búsqueda
  useEffect(() => {
    if (!abierto) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!busqueda.trim()) {
      setOpciones([]);
      setSeleccion(null);
      setMensaje("");
      return;
    }
    timerRef.current = setTimeout(() => {
      buscarOpciones(busqueda.trim());
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [busqueda, abierto]);

  /* ================== BUSCAR OPCIONES (sin joins embebidos) ==================
     1) Buscar en "productos" con el filtro (codigo/nombre/marca)
     2) Traer inventario de stock_van o stock_almacen para esos IDs
     3) Unir en memoria y marcar si ya está en inventario
  ============================================================================ */
  async function buscarOpciones(filtro) {
    setLoading(true);
    setOpciones([]);
    setSeleccion(null);
    setMensaje("");

    // 1) Productos que matchean
    const { data: productosData, error: prodErr } = await supabase
      .from("productos")
      .select("id, nombre, marca, codigo")
      .or(
        `codigo.ilike.%${filtro}%,nombre.ilike.%${filtro}%,marca.ilike.%${filtro}%`
      );

    if (prodErr) {
      setLoading(false);
      setMensaje("Error buscando productos: " + prodErr.message);
      return;
    }

    const ids = (productosData || []).map((p) => p.id);

    // 2) Inventario para esos productos (si hay alguno)
    let inventarioData = [];
    if (ids.length > 0) {
      const tabla =
        tipo === "almacen" || tipo === "warehouse" ? "stock_almacen" : "stock_van";

      let invQuery = supabase.from(tabla).select("id, cantidad, producto_id");
      if (tipo === "van" && ubicacionId) invQuery = invQuery.eq("van_id", ubicacionId);
      invQuery = invQuery.in("producto_id", ids);

      const { data, error: invErr } = await invQuery;
      if (invErr) {
        setLoading(false);
        setMensaje("Error buscando inventario: " + invErr.message);
        return;
      }
      inventarioData = data || [];
    }

    // 3) Unir en memoria
    const invMap = new Map(inventarioData.map((x) => [x.producto_id, x.cantidad]));
    const opcionesTodas = (productosData || []).map((p) => ({
      ...p,
      producto_id: p.id,
      enInventario: invMap.has(p.id),
      cantidad: invMap.get(p.id) ?? 0,
    }));

    setOpciones(opcionesTodas);
    setLoading(false);

    // 4) Autoselección por match exacto
    const filtroLC = filtro.toLowerCase();
    const exact = opcionesTodas.find(
      (opt) =>
        opt.codigo?.toLowerCase() === filtroLC ||
        opt.nombre?.toLowerCase() === filtroLC ||
        opt.marca?.toLowerCase() === filtroLC
    );

    if (exact) {
      setSeleccion(exact);
      setMensaje("Exact match found! Ready to add stock.");
    } else {
      setSeleccion(null);
      setMensaje(
        opcionesTodas.length === 0
          ? "Not found. You can create it in Products."
          : "Select the correct product from the list."
      );
    }
  }

  /* ====================== AGREGAR / SUMAR STOCK =======================
     VAN → RPC atómico increment_stock_van (uuid, uuid, integer)
     ALMACÉN → update/insert simple en stock_almacen (una sola fila global)
  ======================================================================= */
  async function agregarStock(e) {
    e.preventDefault();
    setMensaje("");

    if (!seleccion?.producto_id) {
      setMensaje("Selecciona un producto.");
      return;
    }
    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      setMensaje("Cantidad inválida.");
      return;
    }

    try {
      if (tipo === "van") {
        if (!ubicacionId) {
          setMensaje("Falta VAN seleccionado.");
          return;
        }

        // 🔒 Incremento atómico en DB vía RPC
        const { error } = await supabase.rpc("increment_stock_van", {
          p_van_id: ubicacionId,                // uuid
          p_producto_id: seleccion.producto_id, // uuid
          p_delta: qty,                         // integer
        });

        if (error) {
          console.error("[RPC increment_stock_van]", error);
          setMensaje("Error guardando: " + error.message);
          return;
        }
      } else {
        // Almacén central (sin almacén_id): upsert manual
        const { data: existente, error: readErr } = await supabase
          .from("stock_almacen")
          .select("id, cantidad")
          .eq("producto_id", seleccion.producto_id)
          .maybeSingle();

        if (readErr) {
          console.error("[Almacen read]", readErr);
          setMensaje("Error leyendo stock: " + readErr.message);
          return;
        }

        if (existente) {
          const nuevaCantidad = Number(existente.cantidad || 0) + qty;
          const { error: updErr } = await supabase
            .from("stock_almacen")
            .update({ cantidad: nuevaCantidad })
            .eq("id", existente.id);
          if (updErr) {
            console.error("[Almacen update]", updErr);
            setMensaje("Error actualizando stock: " + updErr.message);
            return;
          }
        } else {
          const { error: insErr } = await supabase
            .from("stock_almacen")
            .insert({ producto_id: seleccion.producto_id, cantidad: qty });
          if (insErr) {
            console.error("[Almacen insert]", insErr);
            setMensaje("Error insertando stock: " + insErr.message);
            return;
          }
        }
      }

      // Refresca y cierra
      if (onSuccess) await onSuccess();
      cerrar();
    } catch (err) {
      console.error("[AgregarStock:catch]", err);
      setMensaje("Error inesperado: " + (err?.message || String(err)));
    }
  }

  /* =========================== UI =========================== */
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <form
        className="bg-white p-6 rounded-xl w-[380px] shadow-xl"
        onSubmit={agregarStock}
        autoComplete="off"
      >
        <h2 className="font-bold mb-2 text-lg">Add Stock</h2>

        <input
          className="border p-2 rounded w-full mb-2 font-mono"
          placeholder="Scan or search by code, name, or brand"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setSeleccion(null);
            setMensaje("");
          }}
          autoFocus
        />

        {loading ? (
          <div className="text-blue-500 mb-2">Searching...</div>
        ) : (
          opciones.length > 0 && (
            <ul className="border rounded max-h-40 overflow-y-auto mb-3 bg-white">
              {opciones.map((opt) => {
                const isExact =
                  busqueda &&
                  (opt.codigo?.toLowerCase() === busqueda.toLowerCase() ||
                    opt.nombre?.toLowerCase() === busqueda.toLowerCase() ||
                    opt.marca?.toLowerCase() === busqueda.toLowerCase());
                return (
                  <li
                    key={opt.producto_id}
                    className={`p-2 border-b cursor-pointer flex flex-col ${
                      isExact
                        ? "bg-green-100 text-green-900 font-bold"
                        : "hover:bg-blue-50"
                    }`}
                    onClick={() => {
                      setSeleccion(opt);
                      setBusqueda(opt.codigo ? opt.codigo : opt.nombre || opt.marca || "");
                      setMensaje(
                        isExact
                          ? "Exact match found! Ready to add stock."
                          : "Product selected. Check before adding."
                      );
                    }}
                  >
                    <span>
                      <b>{opt.nombre}</b> {opt.marca && <>- {opt.marca}</>}
                    </span>
                    <span className="text-xs text-gray-600 font-mono">
                      Code: {opt.codigo || "-"}
                    </span>
                    <span className="text-xs">
                      {opt.enInventario
                        ? `Current stock: ${opt.cantidad}`
                        : "New in stock"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {mensaje && (
          <div
            className={`mb-2 p-2 rounded text-center ${
              seleccion
                ? "bg-green-100 text-green-900"
                : opciones.length === 0
                ? "bg-red-100 text-red-800"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {mensaje}

            {/* Si no hay resultados, ofrece crear el producto */}
            {!seleccion && opciones.length === 0 && busqueda.trim() && (
              <button
                type="button"
                className="mt-2 bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
                onClick={() => {
                  navigate(
                    `/productos/nuevo?codigo=${encodeURIComponent(busqueda.trim())}`
                  );
                  cerrar();
                }}
              >
                Crear producto con código: {busqueda.trim()}
              </button>
            )}
          </div>
        )}

        <input
          type="number"
          className="border p-2 rounded w-full mb-2"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          disabled={!seleccion}
        />

        <div className="flex gap-2 mt-2">
          <button
            type="submit"
            className="bg-blue-700 text-white px-4 py-2 rounded w-full"
            disabled={!seleccion}
          >
            Add
          </button>
          <button
            type="button"
            className="bg-gray-300 px-4 py-2 rounded"
            onClick={cerrar}
          >
            Cancel
          </button>
        </div>

        {!seleccion && (
          <div className="mt-3 text-xs text-gray-400 text-center">
            Not found? <b>Create the product first</b> in the products module.
          </div>
        )}
      </form>
    </div>
  );
}
