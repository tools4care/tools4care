// src/AgregarStockModal.jsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";

/* ===================== Helpers de búsqueda (fast-path escáner) ===================== */
const isLikelyScan = (s) => !!s && s.length >= 6 && !/\s/.test(s); // típico barcode/sku
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
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const timerRef = useRef();

  // modo de búsqueda: "auto" (todos), "codigo", "nombre", "marca"
  const [modo, setModo] = useState("auto");

  // guard para evitar condiciones de carrera (resultados viejos sobrescribiendo nuevos)
  const querySeq = useRef(0);
  const allocQ = () => ++querySeq.current;
  const isLatest = (id) => id === querySeq.current;

  // cache de coincidencias exactas por código para escaneos repetidos
  const exactCacheRef = useRef(new Map());

  const navigate = useNavigate();

  // Reset al cerrar
  useEffect(() => {
    if (!abierto) {
      setBusqueda("");
      setOpciones([]);
      setSeleccion(null);
      setCantidad(1);
      setMensaje("");
      setModo("auto");
      querySeq.current = 0;
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  }, [abierto]);

  // Debounce de búsqueda + fast-path para escáner
  useEffect(() => {
    if (!abierto) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const term = norm(busqueda);
    if (!term) {
      setOpciones([]);
      setSeleccion(null);
      setMensaje("");
      return;
    }

    // FAST-PATH: si parece un código escaneado y el modo lo permite, buscar exacto sin esperar
    if ((modo === "auto" || modo === "codigo") && isLikelyScan(term)) {
      (async () => {
        const hit = await buscarExactoPorCodigo(term);
        if (!hit) {
          // Si no existe exacto, caemos a la búsqueda normal con debounce corto
          timerRef.current = setTimeout(() => buscarOpciones(term, modo), 180);
        }
      })();
      return;
    }

    // Tipeo humano normal → debounce estándar
    timerRef.current = setTimeout(() => buscarOpciones(term, modo), 300);

    return () => clearTimeout(timerRef.current);
  }, [busqueda, abierto, modo]);

  /* ================== BUSCAR OPCIONES (sin joins embebidos) ==================
     1) Buscar en "productos" con el filtro (según modo: codigo/nombre/marca o todos)
     2) Traer inventario de stock_van o stock_almacen para esos IDs
     3) Unir en memoria y marcar si ya está en inventario
  ============================================================================ */
  async function buscarOpciones(filtro, modoBusqueda = "auto") {
    const qid = allocQ();
    setLoading(true);
    setOpciones([]);
    setSeleccion(null);
    setMensaje("");

    // 1) Productos que matchean (limit para respuesta ágil)
    let prodQuery = supabase.from("productos").select("id, nombre, marca, codigo").limit(50);

    if (modoBusqueda === "codigo") {
      prodQuery = prodQuery.ilike("codigo", `%${filtro}%`);
    } else if (modoBusqueda === "nombre") {
      prodQuery = prodQuery.ilike("nombre", `%${filtro}%`);
    } else if (modoBusqueda === "marca") {
      prodQuery = prodQuery.ilike("marca", `%${filtro}%`);
    } else {
      // auto = todos los campos (comportamiento original)
      prodQuery = prodQuery.or(
        `codigo.ilike.%${filtro}%,nombre.ilike.%${filtro}%,marca.ilike.%${filtro}%`
      );
    }

    const { data: productosData, error: prodErr } = await prodQuery;
    if (!isLatest(qid)) return; // ignora si llegó una búsqueda más nueva

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
      if (!isLatest(qid)) return;

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

    if (!isLatest(qid)) return;

    setOpciones(opcionesTodas);
    setLoading(false);

    // 4) Autoselección por match exacto (mantiene comportamiento original)
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

  /* ================== BÚSQUEDA EXACTA POR CÓDIGO (fast-path) ================== */
  async function buscarExactoPorCodigo(codeRaw) {
    const code = norm(codeRaw);
    if (!code) return false;

    // 0) Cache caliente (escaneos repetidos)
    if (exactCacheRef.current.has(code)) {
      const opt = exactCacheRef.current.get(code);
      setOpciones([opt]);
      setSeleccion(opt);
      setMensaje("Exact match found! Ready to add stock.");
      setLoading(false);
      return true;
    }

    const qid = allocQ();
    setLoading(true);

    // 1) Producto exacto por código (rápido y con índice simple)
    const { data: prod, error: prodErr } = await supabase
      .from("productos")
      .select("id, nombre, marca, codigo")
      .eq("codigo", code)
      .maybeSingle();

    if (!isLatest(qid)) return true;

    if (prodErr || !prod) {
      setLoading(false);
      return false; // no exact ⇒ dejar que la búsqueda normal continúe
    }

    // 2) Leer inventario SOLO de ese producto
    const tabla = tipo === "almacen" || tipo === "warehouse" ? "stock_almacen" : "stock_van";
    let invQuery = supabase.from(tabla).select("id, cantidad, producto_id").eq("producto_id", prod.id);
    if (tipo === "van" && ubicacionId) invQuery = invQuery.eq("van_id", ubicacionId);

    const { data: inv, error: invErr } = await invQuery;

    if (!isLatest(qid)) return true;

    if (invErr) {
      setLoading(false);
      setMensaje("Error buscando inventario: " + invErr.message);
      return true;
    }

    const cantidadActual = inv?.[0]?.cantidad ?? 0;
    const opt = {
      ...prod,
      producto_id: prod.id,
      enInventario: Array.isArray(inv) && inv.length > 0,
      cantidad: cantidadActual,
    };

    exactCacheRef.current.set(code, opt);

    setOpciones([opt]);
    setSeleccion(opt);
    setMensaje("Exact match found! Ready to add stock.");
    setLoading(false);
    return true;
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

  const placeholder =
    modo === "codigo"
      ? "Scan or type product code"
      : modo === "nombre"
      ? "Search by product name"
      : modo === "marca"
      ? "Search by brand"
      : "Scan or search by code, name, or brand";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <form
        className="bg-white p-6 rounded-xl w-[380px] shadow-xl"
        onSubmit={agregarStock}
        autoComplete="off"
      >
        <h2 className="font-bold mb-2 text-lg">Add Stock</h2>

        {/* Selector de modo de búsqueda */}
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-gray-600">Search in:</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={modo}
            onChange={(e) => setModo(e.target.value)}
          >
            <option value="auto">All fields</option>
            <option value="codigo">Code</option>
            <option value="nombre">Name</option>
            <option value="marca">Brand</option>
          </select>
        </div>

        <input
          className="border p-2 rounded w-full mb-2 font-mono"
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
              if ((modo === "auto" || modo === "codigo") && isLikelyScan(term)) {
                buscarExactoPorCodigo(term);
              } else {
                buscarOpciones(term, modo);
              }
            }
          }}
          autoFocus
        />

        {loading ? (
          <div className="text-blue-500 mb-2">Searching...</div>
        ) : (
          opciones.length > 0 && (
            <ul className="border rounded max-h-40 overflow-y-auto mb-3 bg-white">
              {opciones.map((opt) => {
                const term = norm(busqueda).toLowerCase();
                const isExact =
                  term &&
                  (opt.codigo?.toLowerCase() === term ||
                    opt.nombre?.toLowerCase() === term ||
                    opt.marca?.toLowerCase() === term);
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
            {!seleccion && opciones.length === 0 && norm(busqueda) && (
              <button
                type="button"
                className="mt-2 bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
                onClick={() => {
                  navigate(
                    `/productos/nuevo?codigo=${encodeURIComponent(norm(busqueda))}`
                  );
                  cerrar();
                }}
              >
                Crear producto con código: {norm(busqueda)}
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
