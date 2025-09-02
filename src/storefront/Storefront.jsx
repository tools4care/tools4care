// src/storefront/Storefront.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  addToCart,
  ensureCart,
  cartCount,
  listCartItems,
  updateCartItemQty,
  removeCartItem,
} from "./cartApi";
import AuthModal from "./AuthModal";

/* -------------------- Helpers -------------------- */
// VAN Online (para escuchar cambios de stock)
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

  // --- Optimistic updates para velocidad en +/- qty ---
  function optimisticSet(productoId, nextQty) {
    setLines((prev) => {
      const arr = prev.map((l) =>
        l.producto_id === productoId
          ? {
              ...l,
              qty: nextQty,
              subtotal: Math.max(0, Number(nextQty)) * Number(l.price || 0),
            }
          : l
      );
      return arr.filter((l) => Number(l.qty || 0) > 0);
    });
  }

  async function handleQty(productoId, next) {
    const prev = [...lines];
    optimisticSet(productoId, next);
    try {
      await updateCartItemQty(productoId, next);
    } catch (e) {
      setLines(prev); // rollback si falla
      alert(e?.message || "Could not update quantity.");
    }
  }

  async function handleRemove(productoId) {
    const prev = [...lines];
    setLines(prev.filter((l) => l.producto_id !== productoId));
    try {
      await removeCartItem(productoId);
    } catch (e) {
      setLines(prev); // rollback
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
            <div className="text-sm text-gray-500">Your cart is empty.</div>
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
                    <div className="text-xs text-gray-500">{l.marca || "—"}</div>

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        className="w-7 h-7 rounded-md border hover:bg-gray-50"
                        onClick={() =>
                          handleQty(
                            l.producto_id,
                            Math.max(0, Number(l.qty || 0) - 1)
                          )
                        }
                        title="Less"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm">{l.qty}</span>
                      <button
                        className="w-7 h-7 rounded-md border hover:bg-gray-50"
                        onClick={() =>
                          handleQty(l.producto_id, Number(l.qty || 0) + 1)
                        }
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

/* -------------------- Mini Deal Card (hero) -------------------- */
function DealCardMini({ p, onAdd }) {
  const price = Number(p.price_online ?? p.price_base ?? 0);
  const hasOffer =
    p.price_online != null &&
    p.price_base != null &&
    Number(p.price_online) < Number(p.price_base);
  return (
    <div className="bg-white/95 rounded-xl p-3 border hover:shadow-sm transition">
      <div className="aspect-[4/3] bg-white rounded-lg border overflow-hidden flex items-center justify-center">
        {p.main_image_url ? (
          <img
            src={p.main_image_url}
            alt={p.nombre}
            className="w-full h-full object-contain p-2"
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <span className="text-xs text-gray-400">no image</span>
        )}
      </div>
      <div className="mt-2 font-medium line-clamp-1">{p.nombre}</div>
      <div className="text-xs text-gray-500 line-clamp-1">{p.marca || "—"}</div>
      {p.descripcion ? (
        <div className="text-xs text-gray-600 mt-1 line-clamp-2">{p.descripcion}</div>
      ) : null}
      <div className="mt-2 font-semibold">
        <Price value={price} />
        {hasOffer ? (
          <span className="ml-2 text-xs text-gray-500 line-through">
            <Price value={p.price_base} />
          </span>
        ) : null}
      </div>
      <button
        className="mt-2 w-full rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700"
        onClick={() => onAdd(p)}
      >
        Add to cart
      </button>
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

  const [settings, setSettings] = useState(null); // ← site_settings (logo + nombre)

  const navigate = useNavigate();
  const offersRef = useRef(null);
  const reloadTimeoutRef = useRef(null);

  // sesión (pero el carrito y el catálogo NO requieren login)
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

  // Lee site_settings (logo + nombre público)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("site_name, logo_url")
          .eq("id", 1)
          .maybeSingle();
        if (data) setSettings(data);
      } catch {
        // ignorar: si no existe la tabla/registro igual hay fallback
      }
    })();
  }, []);

  // contador del carrito
  useEffect(() => {
    (async () => {
      try {
        const cid = await ensureCart();
        const c = await cartCount(cid);
        setCount(c);
      } catch {
        // ignorar
      }
    })();
  }, [user]);

  // --------- CARGA DE CATÁLOGO DIRECTO DE BD ----------
  async function reloadCatalog() {
    setLoading(true);
    try {
      const onlineVanId = await getOnlineVanId();
      if (!onlineVanId) throw new Error("Online VAN not found.");

      // 1) Stock del VAN Online + datos base del producto (incluye precio base)
      const { data: stock, error: stErr } = await supabase
        .from("stock_van")
        .select(
          `
          producto_id,
          cantidad,
          productos ( id, codigo, nombre, marca, precio )
        `
        )
        .eq("van_id", onlineVanId)
        .gt("cantidad", 0)
        .order("producto_id", { ascending: true });
      if (stErr) throw stErr;

      const ids = (stock || []).map((r) => r.producto_id);

      // 2) Metas online (precio_online, descripcion, visible_online + DEALS)
      let metasMap = new Map();
      if (ids.length) {
        const { data: metas, error: mErr } = await supabase
          .from("online_product_meta")
          .select(
            "producto_id, price_online, descripcion, visible_online, is_deal, deal_starts_at, deal_ends_at, deal_badge, deal_priority"
          )
          .in("producto_id", ids);
        if (mErr) throw mErr;
        metasMap = new Map((metas || []).map((m) => [m.producto_id, m]));
      }

      // 3) Imagen principal para cards
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

      // 4) Enriquecer y filtrar por visible_online
      const enriched = (stock || [])
        .filter((r) => !!r.productos)
        .map((r) => {
          const m = metasMap.get(r.producto_id) || {};
          const base = Number(r.productos.precio ?? 0);
          const online =
            m.price_online == null ? null : Number(m.price_online);
          return {
            id: r.productos.id,
            codigo: r.productos.codigo,
            nombre: r.productos.nombre,
            marca: r.productos.marca,
            price_base: base,
            price_online: online,
            price: Number(online ?? base), // mostrado en storefront
            stock: Number(r.cantidad ?? 0),
            descripcion: m.descripcion ?? "",
            visible_online: !!m.visible_online,
            main_image_url: coverMap.get(r.producto_id) || null,

            // Ofertas
            is_deal: !!m.is_deal,
            deal_starts_at: m.deal_starts_at || null,
            deal_ends_at: m.deal_ends_at || null,
            deal_badge: m.deal_badge || "Deal",
            deal_priority: Number(m.deal_priority ?? 0),
          };
        })
        .filter((p) => p.visible_online && p.stock > 0)
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

      setAllRows(enriched);
    } catch (err) {
      // Si ves este alert sin estar logeado, es tema de RLS (ver políticas)
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

  // Realtime con debounce (evita flicker)
  useEffect(() => {
    let channel;
    (async () => {
      const onlineVanId = await getOnlineVanId();

      const scheduleReload = () => {
        if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = setTimeout(() => reloadCatalog(), 600);
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

  // filtros/sort locales
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
      setCartOpen(true);
    } catch (e) {
      alert(String(e?.message || "Could not add to cart."));
    }
  }

  function ProductCard({ p }) {
    const price = Number(p.price_online ?? p.price_base ?? 0);
    const hasOffer =
      p.price_online != null &&
      p.price_base != null &&
      Number(p.price_online) < Number(p.price_base);

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
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span className="text-xs text-gray-400">no image</span>
              )}
            </div>
            {(hasOffer || p.is_deal) && (
              <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                {p.deal_badge || "Deal"}
              </span>
            )}
          </div>

          <div className="mt-2 font-medium leading-tight line-clamp-2 min-h-[40px]">
            {p.nombre}
          </div>
          <div className="text-xs text-gray-500">{p.marca || "—"}</div>

          {p.descripcion ? (
            <div className="mt-1 text-xs text-gray-600 line-clamp-2 min-h-[32px]">
              {p.descripcion}
            </div>
          ) : (
            <div className="mt-1 text-xs text-gray-400 min-h-[32px]"> </div>
          )}

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
            className="mt-3 w-full rounded-lg px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => handleAdd(p)}
          >
            Add to cart
          </button>
        </div>
      </div>
    );
  }

  // Featured deals: prioriza lo marcado en inventario y respeta fechas/priority
  const deals = useMemo(() => {
    const now = Date.now();
    const within = (p) => {
      const sOk = !p.deal_starts_at || new Date(p.deal_starts_at).getTime() <= now;
      const eOk = !p.deal_ends_at || new Date(p.deal_ends_at).getTime() >= now;
      return sOk && eOk;
    };

    let pick = allRows.filter((p) => p.is_deal && within(p));
    if (pick.length < 8) {
      const fallback = allRows.filter(
        (p) =>
          !p.is_deal &&
          p.price_online != null &&
          p.price_base != null &&
          Number(p.price_online) < Number(p.price_base)
      );
      pick = [...pick, ...fallback];
    }

    pick.sort((a, b) => {
      if (b.deal_priority !== a.deal_priority) return b.deal_priority - a.deal_priority;
      const da = a.price_base ? 1 - (a.price_online ?? a.price_base) / a.price_base : 0;
      const db = b.price_base ? 1 - (b.price_online ?? b.price_base) / b.price_base : 0;
      return db - da;
    });

    return pick.slice(0, 8);
  }, [allRows]);

  const siteName = settings?.site_name || "Tools4care";
  const logoUrl = settings?.logo_url || null;

  return (
    <div className="min-h-screen bg-gray-50 pb-16 sm:pb-0">
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Brand (logo + fallback a texto) */}
          <button
            className="flex items-center gap-2 text-lg font-semibold"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="Home"
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={siteName}
                className="h-7 w-auto object-contain"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            ) : (
              // Fallback ícono si no hay logo
              <svg width="24" height="24" viewBox="0 0 24 24" className="text-blue-600">
                <path
                  fill="currentColor"
                  d="M12 2l3.5 7H22l-6 4.5L19 21l-7-4.5L5 21l3-7.5L2 9h6.5z"
                />
              </svg>
            )}
            <span className="truncate max-w-[180px]">{siteName}</span>
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

          {/* Auth (botón Login visible en mobile) */}
          {!user ? (
            <>
              <button
                className="sm:hidden inline-flex items-center px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                onClick={() => {
                  setAuthMode("login");
                  setAuthOpen(true);
                }}
                title="Sign in"
              >
                Login
              </button>
              <div className="hidden sm:flex itemseter gap-2">
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
            </>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
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

          {/* Cart (desktop header) */}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative ml-1 hidden sm:inline-flex items-center justify-center rounded-lg border px-3 py-2 hover:bg-gray-50"
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
      </header>

      {/* HERO con ofertas */}
      <section className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-6 items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              Weekly deals & new arrivals
            </h1>
            <p className="mt-2 text-white/90">
              Discover special prices and freshly added products.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() =>
                  offersRef.current?.scrollIntoView({ behavior: "smooth" })
                }
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

          <div className="bg-white/10 rounded-2xl p-3">
            {deals.length ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {deals.slice(0, 6).map((p) => (
                  <DealCardMini key={p.id} p={p} onAdd={handleAdd} />
                ))}
              </div>
            ) : (
              <div className="text-sm text-white/90 p-4">No deals yet.</div>
            )}
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
        {deals.length ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {deals.slice(0, 8).map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className="mt-4 text-gray-500">No deals yet.</div>
        )}
      </section>

      {/* NEW ARRIVALS (simple: top 12 del set) */}
      <section className="max-w-7xl mx-auto px-4 pb-2">
        <h2 className="text-xl font-bold">New arrivals</h2>
        {[...allRows].length ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...allRows].slice(0, 12).map((p) => (
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
        {/* 👉 2 columnas en mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {rows.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      <footer className="mt-10 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} {siteName} — made with 💙
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

      {/* Mobile bottom bar (tipo Amazon, carrito visible siempre) */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t shadow-sm">
        <div className="flex justify-around items-center py-2">
          <button
            className="flex flex-col items-center text-xs"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
            Home
          </button>

          <a href="#catalog" className="flex flex-col items-center text-xs">
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16a6.471 6.471 0 0 0 4.23-1.57l.27.28v.79L20 21.5 21.5 20zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14"
              />
            </svg>
            Search
          </a>

          {/* Login visible en mobile */}
          {!user && (
            <button
              className="flex flex-col items-center text-xs"
              onClick={() => {
                setAuthMode("login");
                setAuthOpen(true);
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M10.09 15.59L8.67 17l-5-5 5-5 1.41 1.41L6.5 11H20v2H6.5l3.59 2.59ZM20 3h-8v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"
                />
              </svg>
              Login
            </button>
          )}

          <button
            className="relative flex flex-col items-center text-xs"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
          >
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2m10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2M7.16 14h9.69c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.34 5H6.21l-.94-2H2v2h2l3.6 7.59L6.25 13a2 2 0 0 0 .09 1c.24.61.82 1 1.49 1Z"
              />
            </svg>
            <span className="absolute -top-2 -right-3 text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5">
              {count}
            </span>
            Cart
          </button>
        </div>
      </nav>
    </div>
  );
}
