// src/storefront/Storefront.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import AccountPanel from "./AccountPanel";

/* -------------------- Helpers -------------------- */
const ENV_ONLINE_VAN_ID = import.meta.env.VITE_ONLINE_VAN_ID || null;

// Cache local del VAN Online para evitar consultas repetidas
let ONLINE_VAN_ID_CACHE = ENV_ONLINE_VAN_ID || null;

// VAN Online (para escuchar cambios de stock)
async function getOnlineVanId() {
  if (ONLINE_VAN_ID_CACHE) return ONLINE_VAN_ID_CACHE;
  const { data, error } = await supabase
    .from("vans")
    .select("id, nombre_van")
    .ilike("nombre_van", "%online%")
    .maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  ONLINE_VAN_ID_CACHE = data?.id ?? null;
  return ONLINE_VAN_ID_CACHE;
}

// util para consultas .in() en bloques y evitar URLs enormes
async function selectInChunks({ table, columns, key, ids, chunkSize = 150 }) {
  const out = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in(key, slice);
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

// booleano robusto para valores de PG ('t'/'f', 'true'/'false', 1/0, null)
const toBool = (v) => {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "string") return /^t(rue)?|1$/i.test(v);
  if (typeof v === "number") return v !== 0;
  return false;
};

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

/* -------------------- Toast -------------------- */
function Toast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 z-[200] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" className="text-emerald-400 flex-shrink-0">
            <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

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
  }, [open]);

  function optimisticSet(productoId, nextQty) {
    setLines((prev) => {
      const arr = prev.map((l) => {
        if (l.producto_id !== productoId) return l;
        const clamped = Math.max(
          0,
          Math.min(Number(nextQty), Number(l.stock ?? Infinity))
        );
        return { ...l, qty: clamped, subtotal: clamped * Number(l.price || 0) };
      });
      return arr.filter((l) => Number(l.qty || 0) > 0);
    });
  }

  async function handleQty(productoId, next) {
    const prev = [...lines];
    optimisticSet(productoId, next);
    try {
      await updateCartItemQty(productoId, next);
      // No refresh() — the optimistic update already reflects the correct qty/subtotal.
      // Calling refresh() was causing a loading flicker on every quantity change.
    } catch (e) {
      setLines(prev);
      alert(e?.message || "Could not update quantity.");
    }
  }

  async function handleRemove(productoId) {
    const prev = [...lines];
    setLines(prev.filter((l) => l.producto_id !== productoId));
    try {
      await removeCartItem(productoId);
    } catch (e) {
      setLines(prev);
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
              {lines.map((l) => {
                const qty = Number(l.qty || 0);
                const stock = Number(l.stock || 0);
                const atMax = qty >= stock && stock > 0;
                const left = Math.max(0, stock - qty);

                return (
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
                          <span className="text-[10px] text-gray-400">
                            no image
                          </span>
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
                            handleQty(l.producto_id, Math.max(0, qty - 1))
                          }
                          title="Less"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm">{qty}</span>
                        <button
                          className="w-7 h-7 rounded-md border hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => handleQty(l.producto_id, qty + 1)}
                          disabled={stock > 0 ? atMax : false}
                          title={atMax ? "No more stock" : "More"}
                        >
                          +
                        </button>

                        <button
                          className="ml-2 text-xs text-rose-600 hover:underline"
                          onClick={() => handleRemove(l.producto_id)}
                        >
                          Remove
                        </button>

                        {left <= 3 && stock > 0 && (
                          <span className="ml-2 text-[11px] text-amber-700">
                            Only {left} left
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-semibold">
                        <Price value={l.subtotal} />
                      </div>
                      {qty > 1 && (
                        <div className="text-[11px] text-gray-500">
                          <Price value={l.price} /> each
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
            <Link
              to="/storefront/checkout"
              className="text-center rounded-lg bg-blue-600 text-white px-3 py-2 hover:bg-blue-700"
              onClick={onClose}
            >
              Go to checkout
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* -------------------- Product Detail Modal -------------------- */
function ProductDetailModal({ p, onAdd, onClose }) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [images, setImages] = useState(p.main_image_url ? [p.main_image_url] : []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loadingImgs, setLoadingImgs] = useState(false);

  const price = Number(p.price_online ?? p.price_base ?? 0);
  const hasOffer =
    p.price_online != null &&
    p.price_base != null &&
    Number(p.price_online) < Number(p.price_base);

  // Cargar todas las imágenes del producto
  useEffect(() => {
    if (!p.id) return;
    setLoadingImgs(true);
    supabase
      .from("product_images")
      .select("url, is_primary, sort_order")
      .eq("producto_id", p.id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const urls = (data || []).map(r => r.url).filter(Boolean);
        if (urls.length > 0) {
          setImages(urls);
          setActiveIdx(0);
        }
        setLoadingImgs(false);
      });
  }, [p.id]);

  // Cerrar con Escape / swipe navigation con teclado
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setActiveIdx(i => Math.min(i + 1, images.length - 1));
      if (e.key === "ArrowLeft")  setActiveIdx(i => Math.max(i - 1, 0));
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, images.length]);

  // Bloquear scroll del body
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto sm:hidden" />
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Imagen principal (carrusel) */}
        <div className="flex-shrink-0 mx-4">
          <div className="relative bg-gray-50 rounded-xl overflow-hidden aspect-square flex items-center justify-center">
            {loadingImgs ? (
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : images.length > 0 ? (
              <img
                key={images[activeIdx]}
                src={images[activeIdx]}
                alt={p.nombre}
                className="w-full h-full object-contain p-4"
              />
            ) : (
              <span className="text-gray-300 text-6xl">📦</span>
            )}

            {/* Flechas de navegación */}
            {images.length > 1 && (
              <>
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full shadow flex items-center justify-center text-gray-700 disabled:opacity-30 transition-all"
                  onClick={() => setActiveIdx(i => Math.max(i - 1, 0))}
                  disabled={activeIdx === 0}
                >‹</button>
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full shadow flex items-center justify-center text-gray-700 disabled:opacity-30 transition-all"
                  onClick={() => setActiveIdx(i => Math.min(i + 1, images.length - 1))}
                  disabled={activeIdx === images.length - 1}
                >›</button>
                {/* Contador */}
                <span className="absolute bottom-2 right-2 text-xs bg-black/40 text-white px-2 py-0.5 rounded-full">
                  {activeIdx + 1} / {images.length}
                </span>
              </>
            )}
          </div>

          {/* Miniaturas */}
          {images.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={`flex-shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden transition-all ${
                    i === activeIdx ? "border-blue-500 shadow-md" : "border-gray-200 opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detalle scrollable */}
        <div className="overflow-y-auto px-4 py-3 space-y-2 flex-1">
          {(hasOffer || p.is_deal) && (
            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
              {p.deal_badge || "Deal"}
            </span>
          )}
          <h2 className="text-lg font-bold text-gray-900 leading-snug">{p.nombre}</h2>
          {p.marca && <p className="text-sm text-gray-500">{p.marca}</p>}
          {p.descripcion && (
            <p className="text-sm text-gray-700 leading-relaxed">{p.descripcion}</p>
          )}
          <div className="flex items-baseline gap-2 pt-1">
            <span className="text-2xl font-bold text-gray-900"><Price value={price} /></span>
            {hasOffer && (
              <span className="text-sm text-gray-400 line-through"><Price value={p.price_base} /></span>
            )}
          </div>
        </div>

        {/* Botón Add to cart */}
        <div className="px-4 pb-6 pt-2 flex-shrink-0">
          <button
            className={`w-full py-3 rounded-xl font-semibold text-base transition-all ${
              added
                ? "bg-green-500 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            } disabled:opacity-50`}
            disabled={adding}
            onClick={async () => {
              try {
                setAdding(true);
                await onAdd(p);
                setAdded(true);
                setTimeout(() => { setAdded(false); onClose(); }, 800);
              } finally {
                setAdding(false);
              }
            }}
          >
            {adding ? "Adding…" : added ? "✓ Added!" : "Add to cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Product Card -------------------- */
// Definida FUERA de Storefront para tener identidad estable y no violar Rules of Hooks
function ProductCard({ p, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const price = Number(p.price_online ?? p.price_base ?? 0);
  const hasOffer =
    p.price_online != null &&
    p.price_base != null &&
    Number(p.price_online) < Number(p.price_base);

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-3">
          <div className="relative">
            <div
              className="aspect-square bg-white rounded-xl border overflow-hidden flex items-center justify-center cursor-pointer"
              onClick={() => setShowDetail(true)}
            >
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
              {/* Hint de zoom */}
              <span className="absolute bottom-1.5 right-1.5 bg-black/30 text-white text-[10px] px-1.5 py-0.5 rounded-full pointer-events-none">
                🔍
              </span>
            </div>
            {(hasOffer || p.is_deal) && (
              <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                {p.deal_badge || "Deal"}
              </span>
            )}
          </div>

          <div
            className="mt-2 font-medium leading-tight line-clamp-2 min-h-[40px] cursor-pointer hover:text-blue-600 transition-colors"
            onClick={() => setShowDetail(true)}
          >
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
            className="mt-3 w-full rounded-lg px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={adding}
            onClick={async () => {
              try {
                setAdding(true);
                await onAdd(p);
              } finally {
                setAdding(false);
              }
            }}
          >
            {adding ? "Adding…" : "Add to cart"}
          </button>
        </div>
      </div>

      {showDetail && (
        <ProductDetailModal p={p} onAdd={onAdd} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

/* -------------------- Mini Deal Card (hero) -------------------- */
function DealCardMini({ p, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const price = Number(p.price_online ?? p.price_base ?? 0);
  const hasOffer =
    p.price_online != null &&
    p.price_base != null &&
    Number(p.price_online) < Number(p.price_base);
  return (
    <>
      <div className="bg-white rounded-xl p-3 border hover:shadow-sm transition text-gray-900">
        <div
          className="aspect-[4/3] bg-white rounded-lg border overflow-hidden flex items-center justify-center cursor-pointer relative"
          onClick={() => setShowDetail(true)}
        >
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
          <span className="absolute bottom-1.5 right-1.5 bg-black/30 text-white text-[10px] px-1.5 py-0.5 rounded-full pointer-events-none">
            🔍
          </span>
        </div>
        <div
          className="mt-2 font-semibold line-clamp-1 text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
          onClick={() => setShowDetail(true)}
        >
          {p.nombre}
        </div>
        <div className="text-xs text-gray-600 line-clamp-1">{p.marca || "—"}</div>
        {p.descripcion ? (
          <div className="text-xs text-gray-700 mt-1 line-clamp-2">{p.descripcion}</div>
        ) : null}
        <div className="mt-2 font-semibold text-gray-900">
          <Price value={price} />
          {hasOffer ? (
            <span className="ml-2 text-xs text-gray-500 line-through">
              <Price value={p.price_base} />
            </span>
          ) : null}
        </div>
        <button
          className="mt-2 w-full rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50"
          disabled={adding}
          onClick={async () => {
            try {
              setAdding(true);
              await onAdd(p);
            } finally {
              setAdding(false);
            }
          }}
        >
          {adding ? "Adding…" : "Add to cart"}
        </button>
      </div>

      {showDetail && (
        <ProductDetailModal p={p} onAdd={onAdd} onClose={() => setShowDetail(false)} />
      )}
    </>
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
  const [accountOpen, setAccountOpen] = useState(false);

  const [settings, setSettings] = useState(null); // site_settings (logo + nombre)
  const [toasts, setToasts] = useState([]);

  const navigate = useNavigate();
  const offersRef = useRef(null);
  const reloadTimeoutRef = useRef(null);

  function showToast(msg) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  }

  // sesión
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

  // site_settings (logo + nombre público)
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
        // ignore
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
        // ignore
      }
    })();
  }, [user]);

  // --------- CARGA DE CATÁLOGO DIRECTO DE BD ----------
  async function reloadCatalog() {
    setLoading(true);
    try {
      const onlineVanId = await getOnlineVanId();
      if (!onlineVanId) throw new Error("Online VAN not found.");

      // 1) Stock del VAN Online + producto base
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

      // 2) Metas online (solo visibles) en bloques
      let metasMap = new Map();
      if (ids.length) {
        const chunkSize = 150;
        const metas = [];
        for (let i = 0; i < ids.length; i += chunkSize) {
          const slice = ids.slice(i, i + chunkSize);
          const { data, error } = await supabase
            .from("online_product_meta")
            .select(
              "producto_id, price_online, descripcion, visible_online, is_deal, deal_starts_at, deal_ends_at, deal_badge, deal_priority"
            )
            .eq("visible_online", true)
            .in("producto_id", slice);
          if (error) throw error;
          metas.push(...(data || []));
        }
        metas.forEach((m) => metasMap.set(m.producto_id, m));
      }

      // 3) Imagen principal (chunked)
      let coverMap = new Map();
      if (ids.length) {
        const covers = await selectInChunks({
          table: "product_main_image_v",
          columns: "producto_id, main_image_url",
          key: "producto_id",
          ids,
          chunkSize: 150,
        });
        coverMap = new Map(covers.map((c) => [c.producto_id, c.main_image_url]));
      }

      // 4) Enriquecer y filtrar
      const enriched = (stock || [])
        .filter((r) => !!r.productos)
        .map((r) => {
          const m = metasMap.get(r.producto_id) || {};
          const base = Number(r.productos.precio ?? 0);
          const online = m.price_online == null ? null : Number(m.price_online);
          return {
            id: r.productos.id,
            codigo: r.productos.codigo,
            nombre: r.productos.nombre,
            marca: r.productos.marca,
            price_base: base,
            price_online: online,
            price: Number(online ?? base),
            stock: Number(r.cantidad ?? 0),
            descripcion: m.descripcion ?? "",
            visible_online: toBool(m.visible_online),
            main_image_url: coverMap.get(r.producto_id) || null,

            // Ofertas
            is_deal: toBool(m.is_deal),
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
      alert(err?.message || "Could not load products.");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadCatalog();
  }, []);

  // Realtime con debounce
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

  // Optimismo suave + toast
  async function handleAdd(p) {
    setCount((c) => c + 1);
    showToast(`${p.nombre?.slice(0, 28) || "Item"} added to cart`);
    try {
      const newCount = await addToCart(p, 1);
      setCount(newCount);
    } catch (e) {
      setCount((c) => Math.max(0, c - 1));
      alert(String(e?.message || "Could not add to cart."));
    }
  }

  // Featured deals
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
          {/* Brand */}
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
              <svg width="24" height="24" viewBox="0 0 24 24" className="text-blue-600">
                <path
                  fill="currentColor"
                  d="M12 2l3.5 7H22l-6 4.5L19 21l-7-4.5L5 21l3-7.5L2 12h6.5z"
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

          {/* Auth (desktop) */}
          {!user ? (
            <div className="hidden sm:flex items-center gap-2">
              <button
                className="inline-flex items-center px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                onClick={() => { setAuthMode("login"); setAuthOpen(true); }}
              >
                Sign in
              </button>
              <button
                className="inline-flex items-center px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
                onClick={() => { setAuthMode("signup"); setAuthOpen(true); }}
              >
                Sign up
              </button>
            </div>
          ) : (
            <button
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border hover:bg-gray-50 transition-colors"
              onClick={() => setAccountOpen(true)}
              title="My account"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                {(user?.user_metadata?.name || user?.email || "U").charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-gray-700 truncate max-w-[120px]">
                {user?.user_metadata?.name || user?.email?.split("@")[0]}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" className="text-gray-400 flex-shrink-0">
                <path fill="currentColor" d="M7 10l5 5 5-5z"/>
              </svg>
            </button>
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
                d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2M7.16 14h9.69c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.34 5H6.21l-.94-2H2v2h2l3.6 7.59L6.25 13a2 2 0 0 0 .09 1c.24.61.82 1 1.49 1Z"
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
              <ProductCard key={p.id} p={p} onAdd={handleAdd} />
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
            {[...allRows].slice(0, 12).map((p) => (
              <ProductCard key={p.id} p={p} onAdd={handleAdd} />
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
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {rows.map((p) => (
            <ProductCard key={p.id} p={p} onAdd={handleAdd} />
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

      {/* Account panel */}
      <AccountPanel
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        user={user}
      />

      {/* Cart panel */}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Toasts */}
      <Toast toasts={toasts} />

      {/* Mobile bottom bar */}
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

          {/* Account / Login button */}
          {!user ? (
            <button
              className="flex flex-col items-center text-xs text-gray-600"
              onClick={() => { setAuthMode("login"); setAuthOpen(true); }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/>
              </svg>
              Sign in
            </button>
          ) : (
            <button
              className="flex flex-col items-center text-xs text-blue-600"
              onClick={() => setAccountOpen(true)}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
                {(user?.user_metadata?.name || user?.email || "U").charAt(0).toUpperCase()}
              </div>
              Account
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
                d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2M7.16 14h9.69c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.34 5H6.21l-.94-2H2v2h2l3.6 7.59L6.25 13a2 2 0 0 0 .09 1c.24.61.82 1 1.49 1Z"
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
