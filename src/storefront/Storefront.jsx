// src/storefront/Storefront.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { addToCart, ensureCart, cartCount } from "./cartApi";
import { listCartItems, updateCartItemQty, removeCartItem } from "./cartApi";
import AuthModal from "./AuthModal";

/* -------------------- Helpers -------------------- */
// Get "Online" VAN id (for realtime stock watch)
async function getOnlineVanId() {
  const { data, error } = await supabase
    .from("vans")
    .select("id, nombre_van")
    .ilike("nombre_van", "%online%")
    .maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  return data?.id ?? null;
}

function Price({ value, currency = "USD" }) {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const norm = (s = "") =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/* -------------------- Cart Drawer -------------------- */
function CartDrawer({ open, onClose }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);

  const subtotal = useMemo(
    () => lines.reduce((acc, l) => acc + Number(l.subtotal || 0), 0),
    [lines]
  );

  async function refresh() {
    setLoading(true);
    try {
      const cid = await ensureCart();
      const items = await listCartItems(cid);
      setLines(items);
    } catch (e) {
      console.error(e);
      setLines([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleQty(productoId, next) {
    try {
      await updateCartItemQty(productoId, next);
      await refresh();
    } catch (e) {
      alert(e?.message || "Could not update quantity.");
    }
  }

  async function handleRemove(productoId) {
    try {
      await removeCartItem(productoId);
      await refresh();
    } catch (e) {
      alert(e?.message || "Could not remove item.");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl border-l flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Your cart</h3>
          <button
            className="rounded-lg border px-3 py-1.5 hover:bg-gray-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : lines.length === 0 ? (
            <div className="text-sm text-gray-500">
              Your cart is empty.
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((l) => (
                <div
                  key={l.producto_id}
                  className="flex gap-3 border rounded-xl p-2 bg-white"
                >
                  <div className="w-20">
                    <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                      {l.main_image_url ? (
                        <img
                          src={l.main_image_url}
                          alt=""
                          className="w-full h-full object-contain p-1"
                          loading="lazy"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400">no image</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.nombre}</div>
                    <div className="text-xs text-gray-500">
                      {l.marca || "—"} · {l.codigo}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        className="w-7 h-7 rounded-md border hover:bg-gray-50"
                        onClick={() => handleQty(l.producto_id, Math.max(0, l.qty - 1))}
                        title="Less"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm">{l.qty}</span>
                      <button
                        className="w-7 h-7 rounded-md border hover:bg-gray-50"
                        onClick={() => handleQty(l.producto_id, l.qty + 1)}
                        title="More"
                      >
                        +
                      </button>

                      <button
                        className="ml-2 text-xs text-rose-600 hover:underline"
                        onClick={() => handleRemove(l.producto_id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold">
                      <Price value={l.subtotal} />
                    </div>
                    {Number(l.qty || 0) > 1 && (
                      <div className="text-[11px] text-gray-500">
                        <Price value={l.price} /> each
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t p-3">
          <div className="flex items-center justify-between text-sm">
            <span>Items: {lines.reduce((a, l) => a + Number(l.qty || 0), 0)}</span>
            <span className="font-semibold">
              Subtotal: <Price value={subtotal} />
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="rounded-lg border px-3 py-2 hover:bg-gray-50"
              onClick={onClose}
            >
              Keep shopping
            </button>
            <a
              href="/checkout"
              className="text-center rounded-lg bg-blue-600 text-white px-3 py-2 hover:bg-blue-700"
            >
              Go to checkout
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* -------------------- Storefront -------------------- */
export default function Storefront() {
  const [q, setQ] = useState("");
  const [allRows, setAllRows] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);

  const [brand, setBrand] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("relevance");

  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [cartOpen, setCartOpen] = useState(false);

  const navigate = useNavigate();
  const offersRef = useRef(null);

  // Debounce control for realtime reload (reduce flicker)
  const reloadTimeoutRef = useRef(null);

  // Simple announcement content (editable)
  const announcements = [
    { id: 1, text: "Free pickup at store. New arrivals every week!" },
    { id: 2, text: "Apple Pay & Google Pay at checkout on supported devices." },
  ];

  // session
  useEffect(() => {
    let sub;
    (async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user || null);
      sub = supabase.auth
        .onAuthStateChange((_e, s) => setUser(s?.user || null))
        .data?.subscription;
    })();
    return () => sub?.unsubscribe?.();
  }, []);

  // cart counter
  useEffect(() => {
    (async () => {
      try {
        const cid = await ensureCart();
        const c = await cartCount(cid);
        setCount(c);
      } catch {
        // ignore (RLS/401); will be handled on add
      }
    })();
  }, [user]);

  // load catalog
  async function reloadCatalog() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vw_storefront_catalog")
        .select(
          "id,codigo,nombre,marca,price_base,price_online,descripcion,visible_online,stock"
        )
        .eq("visible_online", true)
        .gt("stock", 0)
        .order("nombre", { ascending: true });
      if (error) throw error;

      // cover images
      const ids = (data || []).map((r) => r.id);
      let coverMap = new Map();
      if (ids.length) {
        const { data: covers, error: cErr } = await supabase
          .from("product_main_image_v")
          .select("producto_id, main_image_url")
          .in("producto_id", ids);
        if (cErr) throw cErr;
        coverMap = new Map(
          (covers || []).map((c) => [c.producto_id, c.main_image_url])
        );
      }

      const enriched = (data || []).map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        marca: p.marca,
        price_base: Number(p.price_base),
        price_online: p.price_online == null ? null : Number(p.price_online),
        price: Number(p.price_online ?? p.price_base),
        stock: Number(p.stock ?? 0),
        descripcion: p.descripcion ?? null,
        main_image_url: coverMap.get(p.id) || null,
      }));

      setAllRows(enriched);
    } catch (err) {
      alert(err?.message || "Could not load products.");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime with debounce to avoid flicker
  useEffect(() => {
    let channel;
    (async () => {
      const onlineVanId = await getOnlineVanId();

      const scheduleReload = () => {
        if (reloadTimeoutRef.current) {
          clearTimeout(reloadTimeoutRef.current);
        }
        reloadTimeoutRef.current = setTimeout(() => {
          reloadCatalog();
        }, 600); // debounce 600ms
      };

      channel = supabase
        .channel("online-catalog-watch")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "stock_van",
            filter: onlineVanId ? `van_id=eq.${onlineVanId}` : undefined,
          },
          scheduleReload
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "productos" },
          scheduleReload
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "online_product_meta" },
          scheduleReload
        )
        .subscribe();
    })();

    return () => {
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // local filters/sort
  useEffect(() => {
    const nq = norm(q);
    let list = [...allRows];

    if (nq)
      list = list.filter((p) =>
        [p.nombre, p.marca, p.codigo].some((f) => norm(f).includes(nq))
      );
    if (brand !== "all")
      list = list.filter((p) => (p.marca || "").toLowerCase() === brand);

    list = list.filter((p) => {
      const price = Number(p.price ?? p.price_online ?? p.price_base ?? 0);
      if (minPrice !== "" && price < Number(minPrice)) return false;
      if (maxPrice !== "" && price > Number(maxPrice)) return false;
      return true;
    });

    if (sort === "price_asc")
      list.sort(
        (a, b) =>
          (a.price ?? a.price_online ?? a.price_base ?? 0) -
          (b.price ?? b.price_online ?? b.price_base ?? 0)
      );
    if (sort === "price_desc")
      list.sort(
        (a, b) =>
          (b.price ?? b.price_online ?? b.price_base ?? 0) -
          (a.price ?? a.price_online ?? a.price_base ?? 0)
      );
    if (sort === "name_asc")
      list.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

    setRows(list);
  }, [q, brand, minPrice, maxPrice, sort, allRows]);

  const total = useMemo(() => rows.length, [rows]);

  async function handleAdd(p) {
    try {
      const newCount = await addToCart(p, 1);
      setCount(newCount);
    } catch (e) {
      const msg = String(e?.message || "");
      const isAuthIssue =
        e?.status === 401 ||
        msg.includes("row-level security") ||
        msg.includes("RLS") ||
        e?.code === "42501";

      if (isAuthIssue) {
        setAuthMode("login");
        setAuthOpen(true);
        alert(
          "Please sign in to use the cart. (Anonymous carts are possible by adding an RLS policy on 'carts')."
        );
        return;
      }

      alert(msg || "Could not add to cart.");
    }
  }

  function ProductCard({ p }) {
    const price = p.price ?? p.price_online ?? p.price_base ?? 0;
    const hasOffer =
      p.price_online != null &&
      p.price_base != null &&
      Number(p.price_online) < Number(p.price_base);
    const outOfStock = Number(p.stock || 0) <= 0;
    return (
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-3">
          <div className="relative">
            <div className="aspect-square bg-white rounded-xl border overflow-hidden flex items-center justify-center">
              {p.main_image_url ? (
                <img
                  src={p.main_image_url}
                  alt={p.nombre}
                  className="w-full h-full object-contain p-2"
                  loading="lazy"
                  onError={(e) => {
                    // Hide broken image to avoid flashing
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span className="text-xs text-gray-400">no image</span>
              )}
            </div>
            {hasOffer && (
              <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                Sale
              </span>
            )}
          </div>

          <div className="mt-3 text-xs text-green-700">Stock: {Number(p.stock || 0)}</div>

          <div className="mt-2 font-medium leading-tight line-clamp-2 min-h-[40px]">
            {p.nombre}
          </div>
          <div className="text-xs text-gray-500">{p.marca || "—"}</div>
          <div className="text-xs text-gray-500">{p.codigo}</div>

          <div className="mt-2 font-semibold">
            <Price value={price} />
            {hasOffer ? (
              <span className="ml-2 text-xs text-gray-500 line-through">
                <Price value={p.price_base} />
              </span>
            ) : null}
          </div>

          <button
            type="button"
            disabled={outOfStock}
            className={`mt-3 w-full rounded-lg px-3 py-2 text-sm ${
              outOfStock
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
            onClick={() => handleAdd(p)}
          >
            {outOfStock ? "Out of stock" : "Add to cart"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Brand */}
          <button
            className="flex items-center gap-2 text-lg font-semibold"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="Home"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" className="text-blue-600">
              <path
                fill="currentColor"
                d="M12 2l3.5 7H22l-6 4.5L19 21l-7-4.5L5 21l3-7.5L2 9h6.5z"
              />
            </svg>
            <span>Tools4care</span>
          </button>

          {/* Quick search */}
          <div className="flex-1">
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Search by code, name, or brand…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* Auth (now visible on mobile too) */}
          {!user ? (
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                onClick={() => {
                  setAuthMode("signup");
                  setAuthOpen(true);
                }}
                title="Create account"
              >
                Sign up
              </button>
              <button
                className="inline-flex items-center px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                onClick={() => {
                  setAuthMode("login");
                  setAuthOpen(true);
                }}
                title="Sign in"
              >
                Sign in
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 truncate max-w-[180px]">
                Hi, {user.email}
              </span>
              <button
                className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                onClick={async () => {
                  await supabase.auth.signOut();
                }}
              >
                Sign out
              </button>
            </div>
          )}

          {/* Cart */}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative ml-1 inline-flex items-center justify-center rounded-lg border px-3 py-2 hover:bg-gray-50"
            title="Open cart"
            aria-label="Cart"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" className="text-gray-700">
              <path
                fill="currentColor"
                d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2m10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2M7.16 14h9.69c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.34 5H6.21l-.94-2H2v2h2l3.6 7.59L6.25 13a2 2 0 0 0 .09 1c.24.61.82 1 1.49 1Z"
              />
            </svg>
            <span className="absolute -top-1 -right-1 text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5">
              {count}
            </span>
          </button>
        </div>

        {/* Payment methods info bar */}
        <div className="bg-gray-50 border-t">
          <div className="max-w-7xl mx-auto px-4 py-2 text-xs flex items-center gap-3 text-gray-700">
            <span>Accepted at checkout (when available):</span>
            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 bg-white">
               Apple&nbsp;Pay
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 bg-white">
              G&nbsp;Google&nbsp;Pay
            </span>
            <span className="text-gray-500">
              Requires HTTPS & verified domain in Stripe.
            </span>
          </div>
        </div>
      </header>

      {/* ANNOUNCEMENT BAR */}
      <div className="bg-blue-50 border-b border-blue-100">
        <div className="max-w-7xl mx-auto px-4 py-2 text-sm text-blue-900 flex gap-6 overflow-x-auto">
          {announcements.map((a) => (
            <div key={a.id} className="shrink-0">
              • {a.text}
            </div>
          ))}
        </div>
      </div>

      {/* HERO */}
      <section className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              Tools4care: Weekly deals & new arrivals
            </h1>
            <p className="mt-2 text-white/90">
              Discover special prices and freshly added products. Grab them before they’re gone!
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => offersRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-lg bg-white text-gray-900 px-4 py-2 font-semibold hover:bg-gray-100"
              >
                View deals
              </button>
              <a
                href="#catalog"
                className="rounded-lg border border-white/30 px-4 py-2 hover:bg-white/10"
              >
                Browse catalog
              </a>
            </div>
          </div>
          <div className="bg-white/10 rounded-2xl p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-2xl font-bold">{allRows.length}</div>
                <div className="text-xs">Products</div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-2xl font-bold">
                  {
                    allRows.filter(
                      (p) =>
                        p.price_online != null &&
                        p.price_base != null &&
                        Number(p.price_online) < Number(p.price_base)
                    ).length
                  }
                </div>
                <div className="text-xs">Deals</div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-2xl font-bold">
                  {[...allRows].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 12).length}
                </div>
                <div className="text-xs">New</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DEALS */}
      <section ref={offersRef} className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">Featured deals</h2>
          <a href="#catalog" className="text-sm text-blue-600 hover:underline">
            See full catalog →
          </a>
        </div>
        {allRows.filter(
          (p) =>
            p.price_online != null &&
            p.price_base != null &&
            Number(p.price_online) < Number(p.price_base)
        ).length ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {allRows
              .filter(
                (p) =>
                  p.price_online != null &&
                  p.price_base != null &&
                  Number(p.price_online) < Number(p.price_base)
              )
              .slice(0, 8)
              .map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
          </div>
        ) : (
          <div className="mt-4 text-gray-500">No deals yet.</div>
        )}
      </section>

      {/* NEW ARRIVALS */}
      <section className="max-w-7xl mx-auto px-4 pb-2">
        <h2 className="text-xl font-bold">New arrivals</h2>
        {[...allRows].length ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...allRows]
              .sort((a, b) => Number(b.id) - Number(a.id))
              .slice(0, 12)
              .map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
          </div>
        ) : (
          <div className="mt-4 text-gray-500">Nothing new for now.</div>
        )}
      </section>

      {/* CATALOG + FILTERS */}
      <section id="catalog" className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xl font-bold">Catalog</h2>
          <div className="text-sm text-gray-600">
            {loading ? "Loading…" : `${total} product${total === 1 ? "" : "s"}`}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-3 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="sm:col-span-2">
              <input
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Search by code, name, or brand…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                title="Brand"
              >
                {["all", ...new Set(allRows.map((p) => (p.marca || "").toLowerCase()))]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .sort()
                  .map((b) => (
                    <option key={b} value={b}>
                      {b === "all" ? "All brands" : b}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Min $"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
              <input
                type="number"
                min="0"
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Max $"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>

            <div>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                title="Sort"
              >
                <option value="relevance">Relevance</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="name_asc">Name A → Z</option>
              </select>
            </div>
          </div>
        </div>

        {!rows.length && !loading && (
          <div className="text-gray-500">No products match your filters.</div>
        )}
        {/* 👉 2 columns on mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {rows.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      <footer className="mt-10 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Tools4care — made with 💙
      </footer>

      {/* Auth modal */}
      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onSignedIn={() => setAuthOpen(false)}
      />

      {/* Cart panel */}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
