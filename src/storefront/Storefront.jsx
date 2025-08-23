// src/storefront/Storefront.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase, anonId } from "../supabaseClient";

export default function Storefront() {
  const [loading, setLoading] = useState(true);
  const [catalogo, setCatalogo] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [error, setError] = useState("");

  // UI extra
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevance");
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  /* ================= PWA: botón Instalar ================= */
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  const isiOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;

  useEffect(() => {
    const onBIP = (e) => {
      // Chrome/Android: guardamos el evento para lanzar el prompt cuando el usuario quiera
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    if (isStandalone) setInstalled(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [isStandalone]);

  const handleInstall = async () => {
    // Android/Chrome (hay prompt)
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      setCanInstall(false);
      return;
    }
    // iOS (sin prompt del navegador)
    if (isiOS && !installed) {
      alert(
        "Para instalar en iPhone/iPad:\n\n1) Toca el botón Compartir (cuadrado con flecha hacia arriba)\n2) Elige “Añadir a pantalla de inicio”."
      );
    }
  };

  /* =============== Helpers base (carrito invitado/logueado) ================= */
  async function ensureCart() {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id ?? null;

    let { data: c } = await supabase
      .from("carts")
      .select("id")
      .eq(userId ? "user_id" : "anon_id", userId ?? anonId)
      .maybeSingle();

    if (!c?.id) {
      const { data: nuevo, error: e2 } = await supabase
        .from("carts")
        .insert(userId ? { user_id: userId } : { anon_id: anonId })
        .select("id")
        .single();
      if (e2) throw new Error(e2.message);
      c = nuevo;
    }
    return c.id;
  }

  async function refreshCartCount(cid) {
    const { data, error } = await supabase
      .from("cart_items")
      .select("qty")
      .eq("cart_id", cid);
    if (!error) {
      const total = (data || []).reduce((s, r) => s + Number(r.qty || 0), 0);
      setCartCount(total);
    }
  }

  async function addToCart(producto_id) {
    try {
      const cid = cartId ?? (await ensureCart());
      setCartId(cid);

      const { data: existing } = await supabase
        .from("cart_items")
        .select("qty")
        .eq("cart_id", cid)
        .eq("producto_id", producto_id)
        .maybeSingle();

      if (existing?.qty != null) {
        await supabase
          .from("cart_items")
          .update({ qty: Number(existing.qty) + 1 })
          .eq("cart_id", cid)
          .eq("producto_id", producto_id);
      } else {
        await supabase
          .from("cart_items")
          .insert({ cart_id: cid, producto_id, qty: 1 });
      }

      await refreshCartCount(cid);
      if (cartOpen) await loadCart(cid);
    } catch (e) {
      console.error(e);
      setError(e.message || "Error al agregar al carrito");
    }
  }

  /* =========================== Nuevos helpers UI ============================ */
  const money = (n) =>
    (Number(n) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const loadCart = useCallback(
    async (cid) => {
      if (!cid) return;
      const { data: items, error: e1 } = await supabase
        .from("cart_items")
        .select("producto_id, qty")
        .eq("cart_id", cid);
      if (e1) {
        console.warn(e1);
        return;
      }
      const ids = (items || []).map((i) => i.producto_id);
      if (ids.length === 0) {
        setCartItems([]);
        return;
      }
      const { data: productos, error: e2 } = await supabase
        .from("productos")
        .select("id, codigo, nombre, precio")
        .in("id", ids);
      if (e2) {
        console.warn(e2);
        return;
      }
      const idx = new Map(productos.map((p) => [p.id, p]));
      const merged = (items || [])
        .map((i) => ({
          producto_id: i.producto_id,
          qty: Number(i.qty || 0),
          producto: idx.get(i.producto_id),
        }))
        .filter((x) => !!x.producto);
      setCartItems(merged);
    },
    [setCartItems]
  );

  const updateQty = async (producto_id, delta) => {
    if (!cartId || updating) return;
    setUpdating(true);
    try {
      const existing = cartItems.find((i) => i.producto_id === producto_id);
      const next = Math.max(0, (existing?.qty || 0) + delta);
      if (next === 0) {
        await supabase
          .from("cart_items")
          .delete()
          .eq("cart_id", cartId)
          .eq("producto_id", producto_id);
      } else {
        await supabase
          .from("cart_items")
          .update({ qty: next })
          .eq("cart_id", cartId)
          .eq("producto_id", producto_id);
      }
      await refreshCartCount(cartId);
      await loadCart(cartId);
    } catch (e) {
      console.warn(e);
      setError(e.message || "No se pudo actualizar el carrito");
    } finally {
      setUpdating(false);
    }
  };

  const removeItem = async (producto_id) => {
    if (!cartId || updating) return;
    setUpdating(true);
    try {
      await supabase
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .eq("producto_id", producto_id);
      await refreshCartCount(cartId);
      await loadCart(cartId);
    } catch (e) {
      setError(e.message || "No se pudo eliminar el producto");
    } finally {
      setUpdating(false);
    }
  };

  /* ============================== Checkout ================================ */
  const checkout = async () => {
    if (!cartId || checkingOut) return;
    setCheckingOut(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc("crear_orden_desde_carrito", {
        p_cart_id: cartId,
        p_cliente_id: null,
      });
      if (error) throw error;
      const order = Array.isArray(data) ? data[0] : data;

      await loadCart(cartId);
      await refreshCartCount(cartId);
      setCartOpen(false);

      alert(
        `✅ Pedido creado: #${String(order?.venta_id || "").slice(0, 8)} · Total $${money(
          order?.total
        )}\nLo verás en tu módulo de Ventas (VAN Online).`
      );
    } catch (e) {
      console.error(e);
      setError(e.message || "No se pudo completar el checkout");
    } finally {
      setCheckingOut(false);
    }
  };

  /* ============================== Carga inicial ============================= */
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data: items, error: e1 } = await supabase.rpc("get_catalogo_online");
        if (e1) throw e1;
        if (!cancel) setCatalogo(items || []);
        const cid = await ensureCart();
        if (!cancel) setCartId(cid);
        await refreshCartCount(cid);
      } catch (e) {
        console.warn(e);
        if (!cancel) setError(e.message || "Error cargando catálogo");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => (cancel = true);
  }, []);

  /* ============================= Búsqueda/orden ============================= */
  const q = query.trim().toLowerCase();
  const listFiltrada = useMemo(() => {
    const base = (catalogo || []).filter((p) => Number(p.disponible) > 0);
    const filtrada =
      q.length === 0
        ? base
        : base.filter((p) => {
            const t = `${p.nombre || ""} ${p.codigo || ""} ${p.marca || ""}`.toLowerCase();
            return t.includes(q);
          });

    const arr = [...filtrada];
    if (sort === "price_asc") arr.sort((a, b) => Number(a.precio) - Number(b.precio));
    else if (sort === "price_desc") arr.sort((a, b) => Number(b.precio) - Number(a.precio));
    else if (sort === "name") arr.sort((a, b) => (a?.nombre || "").localeCompare(b?.nombre || ""));

    return arr;
  }, [catalogo, q, sort]);

  /* ================================== UI =================================== */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <h1 className="text-xl font-bold whitespace-nowrap">🛒 Storefront</h1>

          <div className="flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, código o marca…"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            title="Ordenar"
          >
            <option value="relevance">Relevancia</option>
            <option value="price_asc">Precio ↑</option>
            <option value="price_desc">Precio ↓</option>
            <option value="name">Nombre A–Z</option>
          </select>

          {/* Botón Carrito */}
          <button
            onClick={async () => {
              const cid = cartId ?? (await ensureCart());
              setCartId(cid);
              await loadCart(cid);
              setCartOpen(true);
            }}
            className="relative rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-semibold"
          >
            Carrito
            <span className="absolute -top-2 -right-2 min-w-5 rounded-full bg-black/80 text-white text-xs px-1 text-center">
              {cartCount}
            </span>
          </button>

          {/* Botón Instalar app */}
          {!installed && (
            <button
              onClick={handleInstall}
              disabled={!canInstall && !isiOS}
              title={
                isiOS
                  ? "Instalar (iOS: se abrirán instrucciones)"
                  : canInstall
                  ? "Instalar la app"
                  : "Instalación no disponible aún"
              }
              className={`rounded-lg px-3 py-2 text-sm font-semibold border ${
                canInstall || isiOS
                  ? "hover:bg-gray-100"
                  : "opacity-50 cursor-not-allowed"
              }`}
            >
              Instalar app
            </button>
          )}

          <div className="hidden sm:block text-xs text-gray-600">
            Invitado: <code>{anonId?.slice(0, 8)}…</code>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="max-w-6xl mx-auto p-4">
        {loading && <div className="text-blue-700">Cargando catálogo…</div>}
        {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded">{error}</div>}
        {!loading && listFiltrada.length === 0 && (
          <div className="text-gray-500">No hay productos que coincidan.</div>
        )}

        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {listFiltrada.map((p) => (
            <article
              key={p.producto_id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col"
            >
              <div className="aspect-[4/3] w-full mb-3 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-400 text-xs">
                sin imagen
              </div>

              <div className="text-[11px] text-gray-500 font-mono">{p.codigo}</div>
              <h3 className="mt-0.5 font-semibold text-gray-900 line-clamp-2">{p.nombre}</h3>
              <div className="text-xs text-gray-500">{p.marca || "—"}</div>

              <div className="mt-auto pt-2">
                <div className="text-lg font-bold">${money(p.precio)}</div>
                <div className="text-[11px] text-gray-500">Disponible: {Number(p.disponible)}</div>

                <button
                  onClick={() => addToCart(p.producto_id)}
                  className="mt-3 w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm font-semibold"
                >
                  Agregar
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Drawer Carrito */}
      {cartOpen && (
        <div className="fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-bold">Tu carrito</h2>
              <button className="rounded-full w-8 h-8 hover:bg-gray-100" onClick={() => setCartOpen(false)} title="Cerrar">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-3">
              {cartItems.length === 0 ? (
                <div className="text-sm text-gray-500">Tu carrito está vacío.</div>
              ) : (
                cartItems.map((it) => (
                  <div key={it.producto_id} className="border rounded-xl p-3 flex gap-3">
                    <div className="size-14 rounded-lg bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">
                      sin img
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500 font-mono truncate">
                        {it.producto?.codigo}
                      </div>
                      <div className="font-medium text-gray-800 truncate">
                        {it.producto?.nombre}
                      </div>
                      <div className="text-sm text-gray-600">${money(it.producto?.precio)} c/u</div>

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          disabled={updating}
                          onClick={() => updateQty(it.producto_id, -1)}
                          className="w-8 h-8 rounded-lg bg-gray-200 hover:bg-gray-300 font-bold"
                          title="Quitar 1"
                        >
                          −
                        </button>
                        <span className="w-8 text-center">{it.qty}</span>
                        <button
                          disabled={updating}
                          onClick={() => updateQty(it.producto_id, 1)}
                          className="w-8 h-8 rounded-lg bg-gray-200 hover:bg-gray-300 font-bold"
                          title="Agregar 1"
                        >
                          +
                        </button>

                        <button
                          disabled={updating}
                          onClick={() => removeItem(it.producto_id)}
                          className="ml-auto text-sm text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t p-4">
              <Resumen cartItems={cartItems} money={money} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setCartOpen(false)} className="rounded-xl bg-gray-200 hover:bg-gray-300 py-2 font-medium">
                  Seguir comprando
                </button>
                <button
                  onClick={checkout}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-2 font-semibold disabled:opacity-60"
                  disabled={cartItems.length === 0 || checkingOut}
                  title={checkingOut ? "Procesando..." : "Ir al checkout"}
                >
                  {checkingOut ? "Procesando…" : "Checkout ➜"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Resumen({ cartItems, money }) {
  const subtotal = cartItems.reduce(
    (s, it) => s + Number(it.qty) * Number(it.producto?.precio || 0),
    0
  );
  return (
    <div className="text-sm">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <b>${money(subtotal)}</b>
      </div>
      <div className="text-xs text-gray-500">Impuestos y envío se calculan en el checkout.</div>
    </div>
  );
}
