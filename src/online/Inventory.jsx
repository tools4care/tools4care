// src/online/Inventory.jsx
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { supabase } from "../supabaseClient";

// Panel de imágenes (opcional, si administras fotos del storefront)
const ProductImagesPanel = lazy(() => import("./ProductImagesPanel.jsx"));

/* ====================== ModalTraspasoStock (integrado) ====================== */
function ModalTraspasoStock({ abierto, cerrar, ubicaciones, onSuccess }) {
  const [origenKey, setOrigenKey] = useState("");
  const [destinoKey, setDestinoKey] = useState("");
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState("");
  const [productoNombre, setProductoNombre] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [filtro, setFiltro] = useState("");
  const [mostrarOpciones, setMostrarOpciones] = useState(false);

  useEffect(() => {
    if (abierto && (ubicaciones?.length || 0) > 1) {
      setOrigenKey(ubicaciones[0].key);
      setDestinoKey(ubicaciones[1].key);
      cargarProductos(ubicaciones[0]);
      setProductoId("");
      setProductoNombre("");
      setFiltro("");
      setCantidad(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  async function cargarProductos(ubicacion) {
    if (!ubicacion) return;
    const tabla =
      ubicacion.tipo === "warehouse" || ubicacion.tipo === "almacen"
        ? "stock_almacen"
        : "stock_van";

    let q = supabase
      .from(tabla)
      .select("producto_id, cantidad, productos(id, nombre, marca, codigo)")
      .order("producto_id", { ascending: true });

    if (ubicacion.tipo === "van") q = q.eq("van_id", ubicacion.id);

    const { data, error } = await q;
    if (error) {
      alert(error.message);
      return;
    }
    setProductos(data || []);
  }

  async function transferirStock(e) {
    e.preventDefault();
    const origen = ubicaciones.find((u) => u.key === origenKey);
    const destino = ubicaciones.find((u) => u.key === destinoKey);
    if (!origen || !destino || origen.key === destino.key || !productoId) return;

    const tablaOrigen =
      origen.tipo === "warehouse" || origen.tipo === "almacen"
        ? "stock_almacen"
        : "stock_van";
    const filtroOrigen =
      origen.tipo === "warehouse" || origen.tipo === "almacen"
        ? { producto_id: productoId }
        : { producto_id: productoId, van_id: origen.id };

    const { data: sO, error: eSO } = await supabase
      .from(tablaOrigen)
      .select("*")
      .match(filtroOrigen)
      .maybeSingle();
    if (eSO) {
      alert(eSO.message);
      return;
    }
    if (!sO || sO.cantidad < Number(cantidad)) {
      alert("Not enough stock in the origin.");
      return;
    }

    const { error: eUpdO } = await supabase
      .from(tablaOrigen)
      .update({ cantidad: sO.cantidad - Number(cantidad) })
      .match(filtroOrigen);
    if (eUpdO) {
      alert(eUpdO.message);
      return;
    }

    const tablaDestino =
      destino.tipo === "warehouse" || destino.tipo === "almacen"
        ? "stock_almacen"
        : "stock_van";
    const filtroDestino =
      destino.tipo === "warehouse" || destino.tipo === "almacen"
        ? { producto_id: productoId }
        : { producto_id: productoId, van_id: destino.id };

    const { data: sD, error: eSD } = await supabase
      .from(tablaDestino)
      .select("*")
      .match(filtroDestino)
      .maybeSingle();
    if (eSD) {
      alert(eSD.message);
      return;
    }

    if (sD) {
      const { error } = await supabase
        .from(tablaDestino)
        .update({ cantidad: sD.cantidad + Number(cantidad) })
        .match(filtroDestino);
      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from(tablaDestino)
        .insert([{ ...filtroDestino, cantidad: Number(cantidad) }]);
      if (error) {
        alert(error.message);
        return;
      }
    }

    onSuccess && onSuccess();
    cerrar();
  }

  const opcionesFiltradas = productos.filter((it) => {
    const f = (filtro || "").toLowerCase();
    return (
      (it.productos?.nombre || "").toLowerCase().includes(f) ||
      (it.productos?.marca || "").toLowerCase().includes(f) ||
      (it.productos?.codigo || "").toLowerCase().includes(f)
    );
  });

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form onSubmit={transferirStock} className="bg-white p-6 rounded shadow w-96">
        <h2 className="font-bold mb-4">Transfer Stock</h2>

        <div className="mb-2 flex gap-2 items-center">
          <select
            className="border rounded p-2 flex-1"
            value={origenKey}
            onChange={(e) => {
              const k = e.target.value;
              setOrigenKey(k);
              const o = ubicaciones.find((u) => u.key === k);
              cargarProductos(o);
              setProductoId("");
              setProductoNombre("");
              setFiltro("");
            }}
          >
            {ubicaciones.map((u) => (
              <option key={u.key} value={u.key}>
                {u.nombre}
              </option>
            ))}
          </select>
          <span className="mx-2">→</span>
          <select
            className="border rounded p-2 flex-1"
            value={destinoKey}
            onChange={(e) => setDestinoKey(e.target.value)}
          >
            {ubicaciones.map((u) => (
              <option key={u.key} value={u.key}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Autocomplete */}
        <div className="relative mb-2">
          <input
            className="border p-2 rounded w-full"
            placeholder="Search product (name, brand or code)"
            value={filtro || productoNombre}
            onChange={(e) => {
              setFiltro(e.target.value);
              setProductoNombre("");
              setProductoId("");
              setMostrarOpciones(true);
            }}
            onFocus={() => setMostrarOpciones(true)}
            autoComplete="off"
          />
          {mostrarOpciones && (filtro || "").length > 0 && (
            <ul className="absolute z-10 bg-white border rounded w-full max-h-48 overflow-y-auto mt-1">
              {opcionesFiltradas.length === 0 && (
                <li className="p-2 text-gray-400">Not found</li>
              )}
              {opcionesFiltradas.map((it) => (
                <li
                  key={it.producto_id}
                  className="p-2 hover:bg-blue-100 cursor-pointer"
                  onClick={() => {
                    setProductoId(it.producto_id);
                    setProductoNombre(
                      `${it.productos?.nombre || ""}${
                        it.productos?.marca ? " - " + it.productos.marca : ""
                      }${it.productos?.codigo ? " - " + it.productos.codigo : ""}`
                    );
                    setFiltro("");
                    setMostrarOpciones(false);
                  }}
                >
                  {it.productos?.nombre}
                  {it.productos?.marca ? ` - ${it.productos.marca}` : ""}
                  {it.productos?.codigo ? ` - ${it.productos.codigo}` : ""}{" "}
                  (Stock: {it.cantidad})
                </li>
              ))}
            </ul>
          )}
        </div>

        <input
          className="w-full border rounded mb-2 p-2"
          type="number"
          min={1}
          required
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />

        <div className="flex gap-2 mt-2">
          <button
            type="submit"
            className="bg-green-600 text-white px-4 py-1 rounded"
            disabled={!productoId}
          >
            Transfer
          </button>
          <button
            type="button"
            className="bg-gray-300 px-4 py-1 rounded"
            onClick={cerrar}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============================ Inventario (SOLO ONLINE) ============================ */
function Price({ v }) {
  const n = Number(v || 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Inventory() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]); // filas: stock_van (online) + productos + meta
  const [loading, setLoading] = useState(false);
  const [onlineVan, setOnlineVan] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const [imgOpen, setImgOpen] = useState(false);
  const [imgPid, setImgPid] = useState(null);

  const [transferOpen, setTransferOpen] = useState(false);

  async function getOnlineVanId() {
    const { data, error } = await supabase
      .from("vans")
      .select("id, nombre_van")
      .ilike("nombre_van", "%online%")
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  // Carga EXCLUSIVAMENTE desde la BD Online (sin catálogo/vistas)
  async function reload() {
    setLoading(true);
    try {
      let v = onlineVan;
      if (!v) v = await getOnlineVanId();
      setOnlineVan(v);

      // 1) Stock del VAN Online + datos básicos del producto (incluye PRECIO)
      const { data: stock, error: eStock } = await supabase
        .from("stock_van")
        .select(
          `
          producto_id,
          cantidad,
          productos (
            id,
            codigo,
            nombre,
            marca,
            precio
          )
        `
        )
        .eq("van_id", v)
        .order("producto_id", { ascending: true });

      if (eStock) throw eStock;

      const list = (stock || []).filter((r) => !!r.productos);

      // 2) Metas para esos productos
      const ids = list.map((r) => r.producto_id);
      let metasMap = new Map();
      if (ids.length) {
        const { data: metas, error: eMeta } = await supabase
          .from("online_product_meta")
          .select(
            "producto_id, price_online, visible, visible_online, descripcion, meta_updated_at"
          )
          .in("producto_id", ids);
        if (eMeta) throw eMeta;
        (metas || []).forEach((m) => metasMap.set(m.producto_id, m));
      }

      // 3) Combinar
      let combined = list.map((r) => {
        const m = metasMap.get(r.producto_id) || {};
        return {
          id: r.productos.id,
          codigo: r.productos.codigo,
          nombre: r.productos.nombre,
          marca: r.productos.marca,
          stock: Number(r.cantidad || 0),

          // 👇 Base = productos.precio
          precio: r.productos.precio ?? null,
          price_online: m.price_online ?? null,

          visible: m.visible ?? false,
          visible_online: m.visible_online ?? false,
          descripcion: m.descripcion ?? "",
          meta_updated_at: m.meta_updated_at ?? null,
        };
      });

      // 4) Búsqueda en memoria
      if (q.trim()) {
        const term = q.trim().toLowerCase();
        combined = combined.filter(
          (r) =>
            (r.nombre || "").toLowerCase().includes(term) ||
            (r.marca || "").toLowerCase().includes(term) ||
            (r.codigo || "").toLowerCase().includes(term)
        );
      }

      setRows(combined);
      setLastUpdate(new Date());
    } catch (e) {
      alert(e?.message || "Could not load online inventory.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const totalProducts = useMemo(() => rows.length, [rows]);
  const totalUnits = useMemo(
    () => rows.reduce((a, r) => a + Number(r.stock || 0), 0),
    [rows]
  );

  // Actualiza metas (no tocamos 'productos')
  async function updateMeta(producto_id, patch) {
    const { error } = await supabase
      .from("online_product_meta")
      .update(patch)
      .eq("producto_id", producto_id);
    if (error) throw error;
  }

  async function onToggle(producto_id, field, value) {
    try {
      await updateMeta(producto_id, { [field]: value });
      setRows((prev) =>
        prev.map((r) => (r.id === producto_id ? { ...r, [field]: value } : r))
      );
    } catch (e) {
      alert(e?.message || "Update failed.");
    }
  }

  async function onUpdate(producto_id, patch) {
    try {
      await updateMeta(producto_id, patch);
      setRows((prev) =>
        prev.map((r) => (r.id === producto_id ? { ...r, ...patch } : r))
      );
    } catch (e) {
      alert(e?.message || "Update failed.");
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Tienda Online</h1>
      <h2 className="text-lg font-medium mt-1 mb-1">
        Online Inventory (solo BD Online)
      </h2>

      <div className="flex items-center justify-between mt-2 mb-3 text-sm text-gray-500">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="px-2 py-2 rounded-lg border bg-blue-50 text-blue-700">
            Online Store
          </span>

          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Search by product, brand, or code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            onClick={reload}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>

          <button
            className="px-3 py-2 rounded-lg border"
            onClick={() => setTransferOpen(true)}
            disabled={!onlineVan}
            title={
              onlineVan ? "Transfer stock between locations" : "Online VAN not found"
            }
          >
            Transfer Stock
          </button>
        </div>

        <div>
          <span className="text-xs">
            Last update: {lastUpdate ? lastUpdate.toLocaleString() : "—"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div className="border rounded-xl p-3">
          <div className="text-xs text-gray-500">Products</div>
          <div className="text-2xl font-semibold">{totalProducts}</div>
        </div>
        <div className="border rounded-xl p-3">
          <div className="text-xs text-gray-500">Units</div>
          <div className="text-2xl font-semibold">{totalUnits}</div>
        </div>
        <div className="border rounded-xl p-3">
          <div className="text-xs text-gray-500">Online VAN</div>
          <div className="text-base">{onlineVan ? "Online Store" : "—"}</div>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-xl">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Brand</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Online price</th>
              <th className="px-3 py-2 text-center">Visible (admin)</th>
              <th className="px-3 py-2 text-center">Visible online</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-center">Images</th>
              <th className="px-3 py-2 text-right">Meta updated</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-gray-500">
                  {loading ? "Loading…" : "No products found in Online inventory."}
                </td>
              </tr>
            )}

            {rows.map((r) => {
              const shownPrice = Number(
                r.price_online != null ? r.price_online : r.precio
              );
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.codigo}</td>
                  <td className="px-3 py-2">{r.nombre}</td>
                  <td className="px-3 py-2">{r.marca || "—"}</td>
                  <td className="px-3 py-2 text-right">{Number(r.stock || 0)}</td>

                  {/* Precio base = productos.precio */}
                  <td className="px-3 py-2 text-right">
                    <Price v={r.precio} />
                  </td>

                  {/* Online price (editable) */}
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <input
                        className="w-[110px] border rounded-lg px-2 py-1 text-right"
                        placeholder="Online price"
                        defaultValue={r.price_online ?? ""}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val === "") {
                            onUpdate(r.id, { price_online: null });
                          } else {
                            const n = Number(val);
                            onUpdate(r.id, {
                              price_online: Number.isFinite(n) ? n : null,
                            });
                          }
                        }}
                      />
                      <span className="text-xs text-gray-500">
                        Shown: <b><Price v={shownPrice} /></b>
                      </span>
                    </div>
                  </td>

                  {/* Visible admin */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.visible}
                      onChange={(e) => onToggle(r.id, "visible", e.target.checked)}
                    />
                  </td>

                  {/* Visible online */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.visible_online}
                      onChange={(e) =>
                        onToggle(r.id, "visible_online", e.target.checked)
                      }
                    />
                  </td>

                  {/* Descripción */}
                  <td className="px-3 py-2">
                    <input
                      className="w-full border rounded-lg px-2 py-1"
                      placeholder="Description"
                      defaultValue={r.descripcion || ""}
                      onBlur={(e) =>
                        onUpdate(r.id, {
                          descripcion: e.target.value.trim() || "N/A",
                        })
                      }
                    />
                  </td>

                  {/* Imágenes */}
                  <td className="px-3 py-2 text-center">
                    <button
                      className="px-2.5 py-1.5 rounded-lg border hover:bg-gray-50"
                      onClick={() => {
                        setImgPid(r.id);
                        setImgOpen(true);
                      }}
                    >
                      Manage
                    </button>
                  </td>

                  <td className="px-3 py-2 text-right">
                    <span className="text-xs text-gray-500">
                      {r.meta_updated_at
                        ? new Date(r.meta_updated_at).toLocaleString()
                        : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[12px] text-gray-500">
        * Este panel solo usa <code>stock_van</code> (VAN Online) +{" "}
        <code>productos</code> (con <b>precio</b>) + <code>online_product_meta</code>.
        No depende de ningún catálogo/vista.
      </p>

      <Suspense fallback={null}>
        {imgOpen && (
          <ProductImagesPanel
            open={imgOpen}
            productoId={imgPid}
            onClose={() => {
              setImgOpen(false);
              setImgPid(null);
            }}
          />
        )}

        {transferOpen && (
          <ModalTraspasoStock
            abierto={transferOpen}
            cerrar={() => setTransferOpen(false)}
            ubicaciones={[
              { key: "central", id: null, tipo: "almacen", nombre: "Central Warehouse" },
              { key: "online", id: onlineVan, tipo: "van", nombre: "Online Store" },
            ]}
            onSuccess={() => {
              setTransferOpen(false);
              reload();
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
