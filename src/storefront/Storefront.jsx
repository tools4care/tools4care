// src/storefront/Storefront.jsx
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Home,
  User,
  Images,
  ImageOff,
  Plus,
  Minus,
  Check,
  Loader2,
} from "lucide-react";
import {
  addToCart,
  ensureCart,
  cartCount,
  listCartItems,
  updateCartItemQty,
  removeCartItem,
} from "./cartApi";
import AuthModal from "./AuthModal";
// Lazy: SubscriptionModal eagerly loads Stripe.js at import time, which has
// no business being in every storefront visitor's critical path — only
// shoppers who actually open the subscribe flow should pay for it.
const SubscriptionModal = lazy(() => import("./SubscriptionModal"));

/* ─── env / cache ─── */
const ENV_ONLINE_VAN_ID = import.meta.env.VITE_ONLINE_VAN_ID || null;
let ONLINE_VAN_ID_CACHE = ENV_ONLINE_VAN_ID || null;
let ONLINE_VAN_ID_INFLIGHT = null;

// Reload runs this on mount, and the realtime-subscription effect runs it
// again independently — without sharing the in-flight request both fire
// their own "vans" lookup at once, doubling that round trip for nothing.
async function getOnlineVanId() {
  if (ONLINE_VAN_ID_CACHE) return ONLINE_VAN_ID_CACHE;
  if (ONLINE_VAN_ID_INFLIGHT) return ONLINE_VAN_ID_INFLIGHT;

  ONLINE_VAN_ID_INFLIGHT = (async () => {
    const { data, error } = await supabase
      .from("vans")
      .select("id, nombre_van")
      .ilike("nombre_van", "%online%")
      .maybeSingle();
    if (error) { console.error(error); return null; }
    ONLINE_VAN_ID_CACHE = data?.id ?? null;
    return ONLINE_VAN_ID_CACHE;
  })();

  try {
    return await ONLINE_VAN_ID_INFLIGHT;
  } finally {
    ONLINE_VAN_ID_INFLIGHT = null;
  }
}

async function selectInChunks({ table, columns, key, ids, chunkSize = 150 }) {
  const out = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await supabase.from(table).select(columns).in(key, ids.slice(i, i + chunkSize));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

const toBool = (v) => {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "string") return /^t(rue)?|1$/i.test(v);
  if (typeof v === "number") return v !== 0;
  return false;
};

function fmtPrice(n, currency = "USD") {
  return Number(n || 0).toLocaleString("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const norm = (s = "") =>
  String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/* ─── Image Lightbox con carrusel ─── */
function ImageLightbox({ images, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const touchStartX = useRef(null);

  // sync startIndex cuando cambia
  useEffect(() => setIdx(startIndex), [startIndex]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft")  setIdx((i) => (i - 1 + images.length) % images.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  if (!images.length) return null;

  const prev = () => setIdx((i) => (i - 1 + images.length) % images.length);
  const next = () => setIdx((i) => (i + 1) % images.length);

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/90 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      {/* Cerrar */}
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
        onClick={onClose}
        aria-label="Close"
      ><X size={20} /></button>

      {/* Contador */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Imagen */}
      <div
        className="relative flex items-center justify-center w-full h-full px-16 py-12"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
          touchStartX.current = null;
        }}
      >
        <img
          key={images[idx]}
          src={images[idx]}
          alt=""
          className="max-h-full max-w-full object-contain rounded-xl select-none"
          style={{ animation: "fadeImg 0.18s ease" }}
          onError={(e) => { e.currentTarget.style.opacity = "0.3"; }}
        />
      </div>

      {/* Flechas */}
      {images.length > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Previous"
          ><ChevronLeft size={22} /></button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label="Next"
          ><ChevronRight size={22} /></button>
        </>
      )}

      {/* Thumbnails */}
      {images.length > 1 && (
        <div
          className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((url, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0 transition-all ${
                i === idx ? "border-white scale-110" : "border-white/30 opacity-60 hover:opacity-90"
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-contain bg-white/10" />
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes fadeImg { from { opacity:0; transform:scale(0.97); } to { opacity:1; transform:scale(1); } }`}</style>
    </div>
  );
}

/* ─── Toast flotante ─── */
/* ─── Search overlay — command-palette style live product search ─── */
function SearchOverlay({ open, onClose, products, suggestions = [], onAdd, onSelect }) {
  const [query, setQuery] = useState("");
  const [addedId, setAddedId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setAddedId(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock background scroll while the overlay is open (mobile: prevents the
  // page behind from scrolling under the fixed modal).
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  if (!open) return null;

  const nq = norm(query);
  const results = nq
    ? products.filter((p) => [p.nombre, p.marca, p.codigo].some((f) => norm(f).includes(nq))).slice(0, 8)
    : [];
  const list = nq ? results : suggestions;

  async function quickAdd(e, p) {
    e.stopPropagation();
    try {
      await onAdd(p, 1);
      setAddedId(p.id);
      setTimeout(() => setAddedId(null), 1200);
    } catch (err) {
      alert(String(err?.message || "Could not add to cart."));
    }
  }

  return (
    <div className="fixed inset-0 z-[200]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-[fadeBackdrop_0.2s_ease-out]"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
        <div
          className="flex w-full max-w-lg max-h-[85vh] sm:max-h-[75vh] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 animate-[searchIn_0.25s_cubic-bezier(0.16,1,0.3,1)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-1 sm:px-6 sm:pt-6">
            <Search size={20} className="mt-1.5 text-gray-300 shrink-0" />
            <input
              ref={inputRef}
              className="flex-1 min-w-0 border-0 border-b-2 border-gray-200 bg-transparent pb-3 text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 caret-blue-600 !outline-none transition-colors focus:border-blue-500 placeholder:font-normal placeholder:text-gray-300"
              style={{ boxShadow: "none" }}
              placeholder="What are you looking for today?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {nq && list.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-gray-400">
                No products match "<span className="font-medium text-gray-600">{query}</span>"
              </div>
            )}

            {!nq && list.length > 0 && (
              <div className="px-4 sm:px-5 pt-3.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Popular right now
              </div>
            )}

            {list.map((p, i) => {
              const price = Number(p.price_online ?? p.price_base ?? p.price ?? 0);
              const outOfStock = Number(p.stock) <= 0;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(p)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(p)}
                  className="flex items-center gap-3 px-4 sm:px-5 py-3 cursor-pointer active:bg-blue-50 hover:bg-blue-50/70 transition-colors border-b last:border-b-0 animate-[resultIn_0.25s_ease-out_both]"
                  style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                >
                  <div className="w-12 h-12 shrink-0 rounded-xl border bg-white overflow-hidden flex items-center justify-center">
                    {p.main_image_url ? (
                      <img src={p.main_image_url} alt="" className="w-full h-full object-contain p-1" />
                    ) : (
                      <ImageOff size={14} className="text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{p.nombre}</div>
                    <div className="text-[11px] text-gray-400 truncate">{p.marca || "—"}{p.codigo ? ` · ${p.codigo}` : ""}</div>
                  </div>
                  <div className="text-sm font-bold text-gray-900 shrink-0">{fmtPrice(price)}</div>
                  <button
                    type="button"
                    onClick={(e) => quickAdd(e, p)}
                    disabled={outOfStock}
                    title={outOfStock ? "Out of stock" : "Quick add to cart"}
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
                      addedId === p.id
                        ? "bg-emerald-500 text-white scale-110"
                        : "bg-gray-100 text-gray-600 hover:bg-blue-600 hover:text-white disabled:opacity-30 disabled:hover:bg-gray-100 disabled:hover:text-gray-600"
                    }`}
                  >
                    {addedId === p.id ? <Check size={16} strokeWidth={3} /> : <Plus size={16} />}
                  </button>
                </div>
              );
            })}

            {!nq && list.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-gray-400">Type to search products…</div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes searchIn {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes resultIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function AddedToast({ toasts, onViewCart }) {
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 bg-gray-900 text-white pl-4 pr-2 py-2.5 rounded-2xl shadow-xl text-sm font-medium
                     pointer-events-auto animate-[slideIn_0.25s_ease-out]"
          style={{ animation: "slideIn 0.25s ease-out" }}
        >
          <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-emerald-400/20 text-emerald-400">
            <Check size={13} strokeWidth={3} />
          </span>
          <span className="truncate max-w-[160px]">{t.name}</span>
          <span className="text-gray-400 text-xs hidden sm:inline shrink-0">added</span>
          <button
            type="button"
            onClick={onViewCart}
            className="shrink-0 text-xs font-bold text-blue-300 hover:text-blue-200 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            View cart →
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Cart Drawer ─── */
function CartDrawer({ open, onClose }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const subtotal = useMemo(() => lines.reduce((acc, l) => acc + Number(l.subtotal || 0), 0), [lines]);

  async function refresh(showLoader = true) {
    if (showLoader) setLoading(true);
    try {
      const cid = await ensureCart();
      const items = await listCartItems(cid);
      setLines(items);
    } catch (e) {
      console.error(e);
      setLines([]);
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    if (open) refresh(true);
  }, [open]);

  function optimisticSet(productoId, nextQty) {
    setLines((prev) => {
      const arr = prev.map((l) => {
        if (l.producto_id !== productoId) return l;
        const clamped = Math.max(0, Math.min(Number(nextQty), Number(l.stock ?? Infinity)));
        return { ...l, qty: clamped, subtotal: clamped * Number(l.price || 0) };
      });
      return arr.filter((l) => Number(l.qty || 0) > 0);
    });
  }

  async function handleQty(productoId, next) {
    const prev = [...lines];
    optimisticSet(productoId, next); // instant UI update — no loading flash
    try {
      await updateCartItemQty(productoId, next);
      // ✓ don't call refresh() here — optimistic state is correct, avoids flicker
    } catch (e) {
      setLines(prev); // revert only on error
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
      <aside className="absolute right-0 top-0 h-[100dvh] w-full max-w-[min(100vw,28rem)] bg-white shadow-2xl border-l flex flex-col overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between shrink-0">
          <h3 className="text-lg font-semibold">Your cart</h3>
          <button className="rounded-lg border px-3 py-1.5 hover:bg-gray-50" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 overscroll-contain">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 mt-4 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : lines.length === 0 ? (
            <div className="text-sm text-gray-500 mt-4 text-center">Your cart is empty.</div>
          ) : (
            <div className="space-y-3">
              {lines.map((l) => {
                const qty = Number(l.qty || 0);
                const stock = Number(l.stock || 0);
                const atMax = qty >= stock && stock > 0;
                const left = Math.max(0, stock - qty);
                return (
                  <div key={l.producto_id} className="flex gap-3 border rounded-xl p-2 bg-white">
                    <div className="w-20 shrink-0">
                      <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                        {l.main_image_url ? (
                          <img src={l.main_image_url} alt="" className="w-full h-full object-contain p-1"
                            loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                        ) : (
                          <ImageOff size={16} className="text-gray-300" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">{l.nombre}</div>
                      <div className="text-xs text-gray-500">{l.marca || "—"}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          className="w-8 h-8 rounded-lg border hover:bg-gray-50 flex items-center justify-center disabled:opacity-40"
                          onClick={() => handleQty(l.producto_id, Math.max(0, qty - 1))}
                          title="Less"
                        ><Minus size={14} /></button>
                        <span className="w-8 text-center text-sm font-semibold">{qty}</span>
                        <button
                          className="w-8 h-8 rounded-lg border hover:bg-gray-50 flex items-center justify-center disabled:opacity-40"
                          onClick={() => handleQty(l.producto_id, qty + 1)}
                          disabled={stock > 0 ? atMax : false}
                          title={atMax ? "No more stock" : "More"}
                        ><Plus size={14} /></button>
                        <button
                          className="ml-1 text-xs text-rose-500 hover:text-rose-700 hover:underline"
                          onClick={() => handleRemove(l.producto_id)}
                        >Remove</button>
                        {left <= 3 && stock > 0 && (
                          <span className="text-[11px] text-amber-700">Only {left} left</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm">{fmtPrice(l.subtotal)}</div>
                      {qty > 1 && (
                        <div className="text-[11px] text-gray-400">{fmtPrice(l.price)} each</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t p-3 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-gray-600">Items: {lines.reduce((a, l) => a + Number(l.qty || 0), 0)}</span>
            <span className="font-bold text-lg">{fmtPrice(subtotal)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-xl border px-3 py-3 hover:bg-gray-50 text-sm font-medium" onClick={onClose}>
              Keep shopping
            </button>
            <button
              onClick={() => { onClose(); navigate("/checkout"); }}
              className="rounded-xl bg-emerald-600 text-white px-3 py-3 hover:bg-emerald-700 text-sm font-bold"
            >
              Checkout →
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ─── Deal Card Mini (hero) ─── */
function DealCardMini({ p, onAdd }) {
  const [adding, setAdding] = useState(false);
  const price = Number(p.price_online ?? p.price_base ?? 0);
  const hasOffer = p.price_online != null && p.price_base != null && Number(p.price_online) < Number(p.price_base);

  return (
    <div className="bg-white rounded-xl p-3 border hover:shadow-sm transition text-gray-900">
      <div className="aspect-[4/3] bg-white rounded-lg border overflow-hidden flex items-center justify-center">
        {p.main_image_url ? (
          <img src={p.main_image_url} alt={p.nombre} className="w-full h-full object-contain p-2"
            loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
        ) : (
          <ImageOff size={22} className="text-gray-300" />
        )}
      </div>
      <div className="mt-2 font-semibold line-clamp-1 text-sm text-gray-900">{p.nombre}</div>
      <div className="text-xs text-gray-500 line-clamp-1">{p.marca || "—"}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-bold text-gray-900">{fmtPrice(price)}</span>
        {hasOffer && <span className="text-xs text-gray-400 line-through">{fmtPrice(p.price_base)}</span>}
      </div>
      <button
        className="mt-2 w-full rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        disabled={adding}
        onClick={async () => {
          setAdding(true);
          try { await onAdd(p); } finally { setAdding(false); }
        }}
      >
        {adding ? "Adding…" : "Add to cart"}
      </button>
    </div>
  );
}

/* ─── Product Card — FUERA de Storefront para evitar re-creación en cada render ─── */
function ProductCard({ p, onAdd, onOpenLightbox }) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const hasVariants = (p.variants?.length ?? 0) > 1;
  const [selected, setSelected] = useState(() =>
    hasVariants ? p.variants.find((v) => v.id === p.id) || p.variants[0] : null
  );
  const active = selected || p;

  const price = Number(active.price_online ?? active.price_base ?? active.price ?? 0);
  const hasOffer = active.price_online != null && active.price_base != null && Number(active.price_online) < Number(active.price_base);
  const outOfStock = Number(active.stock) <= 0;
  const lowStock = !outOfStock && active.stock <= 5;
  const mainImage = active.main_image_url ?? p.main_image_url;
  const images = active.images ?? p.images;
  const hasMultiple = (images?.length ?? 0) > 1;

  async function doAdd() {
    if (adding || outOfStock) return;
    setAdding(true);
    try {
      await onAdd({ ...p, id: active.id, price, stock: active.stock, main_image_url: mainImage, images }, 1);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (e) {
      alert(String(e?.message || "Could not add to cart."));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-gray-300">
      <div className="p-3 flex-1 flex flex-col">
        {/* Imagen — clickeable para abrir lightbox */}
        <div className="relative">
          <div
            className="aspect-square bg-white rounded-xl border overflow-hidden flex items-center justify-center cursor-zoom-in"
            onClick={() => mainImage && onOpenLightbox({ ...p, main_image_url: mainImage, images })}
            title="Click to enlarge"
          >
            {mainImage ? (
              <img src={mainImage} alt={p.nombre}
                className="w-full h-full object-contain p-2 hover:scale-105 transition-transform duration-200" loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <ImageOff size={22} className="text-gray-300" />
            )}
          </div>
          {(hasOffer || p.is_deal) && (
            <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 font-medium">
              {p.deal_badge || "Deal"}
            </span>
          )}
          {outOfStock ? (
            <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 border border-gray-300 font-medium">
              Out of stock
            </span>
          ) : lowStock && (
            <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
              {active.stock} left
            </span>
          )}
          {/* Indicador de múltiples fotos */}
          {hasMultiple && (
            <span className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-black/50 text-white font-medium">
              <Images size={10} />
              {images.length}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="mt-2 font-medium leading-tight line-clamp-2 min-h-[40px] text-sm">{p.nombre}</div>
        <div className="text-xs text-gray-500">{p.marca || "—"}</div>
        {p.descripcion
          ? <div className="mt-1 text-xs text-gray-600 line-clamp-2 min-h-[32px]">{p.descripcion}</div>
          : <div className="mt-1 min-h-[32px]" />
        }

        {/* Variant swatches (color/size) */}
        {hasVariants && (
          <div className="mt-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{selected?.axis || "Option"}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {p.variants.map((v) => {
                const isActive = v.id === active.id;
                const isOut = Number(v.stock) <= 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={isOut}
                    title={isOut ? `${v.label} — out of stock` : v.label}
                    onClick={() => setSelected(v)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      isOut
                        ? "border-gray-200 text-gray-300 line-through cursor-not-allowed"
                        : isActive
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 text-gray-700 hover:border-blue-400"
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Precio */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-bold text-gray-900">{fmtPrice(price)}</span>
          {hasOffer && <span className="text-xs text-gray-400 line-through">{fmtPrice(active.price_base)}</span>}
        </div>

        {/* Add one unit; quantity is edited only inside the cart. */}
        <div className="mt-3">
          <button
            type="button"
            onClick={doAdd}
            disabled={adding || outOfStock}
            className={`w-full rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 ${
              added
                ? "bg-emerald-500 text-white scale-[1.02]"
                : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50"
            }`}
          >
            {adding ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                <Loader2 size={16} className="animate-spin" />
              </span>
            ) : added ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                <Check size={15} strokeWidth={3} /> Added!
              </span>
            ) : outOfStock ? (
              "Out of stock"
            ) : (
              "Add to cart"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton card ─── */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden animate-pulse">
      <div className="p-3">
        <div className="aspect-square bg-gray-100 rounded-xl mb-3" />
        <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
        <div className="h-8 bg-gray-100 rounded w-full" />
      </div>
    </div>
  );
}

/* ─── Cart icon animated ─── */
function CartIcon({ count, onClick, bump }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative ml-1 hidden sm:inline-flex items-center justify-center rounded-lg border px-3 py-2 hover:bg-gray-50"
      aria-label="Cart"
    >
      <ShoppingCart size={20} className="text-gray-700" />
      <span
        className={`absolute -top-1 -right-1 text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5 transition-transform ${bump ? "scale-125" : "scale-100"}`}
        style={{ transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)" }}
      >
        {count}
      </span>
    </button>
  );
}

/* ═══════════════════════════════════
   STOREFRONT PRINCIPAL
═══════════════════════════════════ */
export default function Storefront() {
  const [q, setQ] = useState("");
  const [allRows, setAllRows] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [brand, setBrand] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("relevance");

  // Search overlay (modal command-palette)
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [pendingScrollId, setPendingScrollId] = useState(null);

  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [cartOpen, setCartOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [cartBump, setCartBump] = useState(false);

  // Subscriptions
  const [plans, setPlans] = useState([]);
  const [subModal, setSubModal] = useState(null); // plan seleccionado

  // Lightbox
  const [lightbox, setLightbox] = useState(null); // { images: [], idx: 0 }

  const handleOpenLightbox = useCallback((p, startIdx = 0) => {
    const imgs = p.images?.length ? p.images : (p.main_image_url ? [p.main_image_url] : []);
    if (!imgs.length) return;
    setLightbox({ images: imgs, idx: startIdx });
  }, []);

  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const [settings, setSettings] = useState(null);

  const offersRef = useRef(null);
  const rackRef   = useRef(null);
  const reloadTimeoutRef = useRef(null);

  function showToast(name) {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, name }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  }

  function bumpCart() {
    setCartBump(true);
    setTimeout(() => setCartBump(false), 300);
  }

  // sesión
  useEffect(() => {
    let sub;
    (async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user || null);
      sub = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user || null)).data?.subscription;
    })();
    return () => sub?.unsubscribe?.();
  }, []);

  // Cargar planes activos con conteo de spots (requiere auth por RLS)
  useEffect(() => {
    if (!user) { setPlans([]); return; }
    (async () => {
      try {
        const { data: planesData } = await supabase
          .from("subscription_planes")
          .select("*")
          .eq("activo", true)
          .order("precio", { ascending: true });
        const planes = planesData || [];
        if (planes.length) {
          const { data: counts } = await supabase
            .from("subscription_clientes")
            .select("plan_id")
            .in("estado", ["activa", "pendiente"])
            .in("plan_id", planes.map(p => p.id));
          const countMap = {};
          (counts || []).forEach(r => { countMap[r.plan_id] = (countMap[r.plan_id] || 0) + 1; });
          planes.forEach(p => { p._ocupados = countMap[p.id] || 0; });
        }
        setPlans(planes);
      } catch { setPlans([]); }
    })();
  }, [user]);

  // site settings
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("site_settings").select("site_name, logo_url").eq("id", 1).maybeSingle();
        if (data) setSettings(data);
      } catch { /* ignore */ }
    })();
  }, []);

  // Browser tab should read as the customer-facing store, not the internal sales app.
  useEffect(() => {
    const previous = document.title;
    document.title = `${settings?.site_name || "Tools4Care"} Store`;
    return () => { document.title = previous; };
  }, [settings]);

  // contador del carrito
  useEffect(() => {
    (async () => {
      try {
        const cid = await ensureCart();
        setCount(await cartCount(cid));
      } catch { /* ignore */ }
    })();
  }, [user]);

  // carga catálogo
  async function reloadCatalog() {
    setLoading(true);
    try {
      const onlineVanId = await getOnlineVanId();
      if (!onlineVanId) throw new Error("Online VAN not found.");

      const { data: stock, error: stErr } = await supabase
        .from("stock_van")
        .select("producto_id, cantidad, productos ( id, codigo, nombre, marca, precio )")
        .eq("van_id", onlineVanId)
        .gt("cantidad", 0)
        .order("producto_id", { ascending: true });
      if (stErr) throw stErr;

      const ids = (stock || []).map((r) => r.producto_id);

      // These three only depend on `ids`, not on each other — running them
      // sequentially added ~800ms of pure waterfall for no reason.
      async function fetchMetas() {
        const metas = [];
        for (let i = 0; i < ids.length; i += 150) {
          const { data, error } = await supabase
            .from("online_product_meta")
            .select("producto_id, price_online, descripcion, visible_online, is_deal, deal_starts_at, deal_ends_at, deal_badge, deal_priority, variant_group_id, variant_label, variant_axis")
            .eq("visible_online", true)
            .in("producto_id", ids.slice(i, i + 150));
          if (error) throw error;
          metas.push(...(data || []));
        }
        return metas;
      }

      const [metas, covers, imgs] = ids.length
        ? await Promise.all([
            fetchMetas(),
            selectInChunks({ table: "product_main_image_v", columns: "producto_id, main_image_url", key: "producto_id", ids, chunkSize: 150 }),
            selectInChunks({ table: "product_images", columns: "producto_id, url, is_primary, sort_order", key: "producto_id", ids, chunkSize: 150 }),
          ])
        : [[], [], []];

      const metasMap = new Map(metas.map((m) => [m.producto_id, m]));
      const coverMap = new Map(covers.map((c) => [c.producto_id, c.main_image_url]));

      // Cargar todas las imágenes por producto (para el carrusel)
      const imagesMap = new Map();
      imgs
        .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .forEach((img) => {
          const arr = imagesMap.get(img.producto_id) || [];
          arr.push(img.url);
          imagesMap.set(img.producto_id, arr);
        });

      const enriched = (stock || [])
        .filter((r) => !!r.productos)
        .map((r) => {
          const m = metasMap.get(r.producto_id) || {};
          const base = Number(r.productos.precio ?? 0);
          const online = m.price_online == null ? null : Number(m.price_online);
          const mainUrl = coverMap.get(r.producto_id) || null;
          // imágenes del carrusel: si no hay en product_images, usamos la principal
          const allImgs = imagesMap.get(r.producto_id) || (mainUrl ? [mainUrl] : []);
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
            main_image_url: mainUrl,
            images: allImgs,
            is_deal: toBool(m.is_deal),
            deal_starts_at: m.deal_starts_at || null,
            deal_ends_at: m.deal_ends_at || null,
            deal_badge: m.deal_badge || "Deal",
            deal_priority: Number(m.deal_priority ?? 0),
            variant_group_id: m.variant_group_id || null,
            variant_label: m.variant_label || "",
            variant_axis: m.variant_axis || "Option",
          };
        })
        // Grouped variants (colors/sizes of the same item) stay visible even when
        // this particular SKU is out of stock, so the swatch can render disabled
        // instead of the whole card disappearing. Ungrouped products keep the
        // original behavior of hiding once stock hits 0.
        .filter((p) => p.visible_online && (p.stock > 0 || p.variant_group_id))
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

      const groups = new Map();
      const singles = [];
      enriched.forEach((p) => {
        if (!p.variant_group_id) { singles.push(p); return; }
        const arr = groups.get(p.variant_group_id) || [];
        arr.push(p);
        groups.set(p.variant_group_id, arr);
      });

      const grouped = [...groups.values()].map((members) => {
        const primary = members.find((m) => m.stock > 0) || members[0];
        return {
          ...primary,
          variants: members
            .map((m) => ({
              id: m.id,
              label: m.variant_label || m.nombre,
              axis: m.variant_axis || "Option",
              price: m.price,
              price_base: m.price_base,
              price_online: m.price_online,
              stock: m.stock,
              main_image_url: m.main_image_url,
              images: m.images,
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        };
      });

      setAllRows([...singles, ...grouped].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))));
    } catch (err) {
      alert(err?.message || "Could not load products.");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reloadCatalog(); }, []);

  // Realtime con debounce
  useEffect(() => {
    let channel;
    (async () => {
      const onlineVanId = await getOnlineVanId();
      const scheduleReload = () => {
        if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = setTimeout(() => reloadCatalog(), 800);
      };
      channel = supabase.channel("online-catalog-watch")
        .on("postgres_changes", { event: "*", schema: "public", table: "stock_van", filter: onlineVanId ? `van_id=eq.${onlineVanId}` : undefined }, scheduleReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, scheduleReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "online_product_meta" }, scheduleReload)
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
    if (nq) list = list.filter((p) => [p.nombre, p.marca, p.codigo].some((f) => norm(f).includes(nq)));
    if (brand !== "all") list = list.filter((p) => (p.marca || "").toLowerCase() === brand);
    list = list.filter((p) => {
      const pr = Number(p.price ?? p.price_online ?? p.price_base ?? 0);
      if (minPrice !== "" && pr < Number(minPrice)) return false;
      if (maxPrice !== "" && pr > Number(maxPrice)) return false;
      return true;
    });
    if (sort === "price_asc") list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    if (sort === "price_desc") list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    if (sort === "name_asc") list.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    setRows(list);
  }, [q, brand, minPrice, maxPrice, sort, allRows]);

  // Jump to a product picked from the search overlay: clear filters so it's
  // guaranteed to be in `rows`, then scroll to it once it renders and flash it.
  useEffect(() => {
    if (!pendingScrollId) return;
    const el = document.getElementById(`product-${pendingScrollId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(pendingScrollId);
    setPendingScrollId(null);
    const t = setTimeout(() => setHighlightId(null), 1800);
    return () => clearTimeout(t);
  }, [pendingScrollId, rows]);

  const handleSearchSelect = useCallback((product) => {
    setSearchOpen(false);
    setQ("");
    setBrand("all");
    setMinPrice("");
    setMaxPrice("");
    setPendingScrollId(product.id);
  }, []);

  // Callback estable para agregar al carrito — no recrea ProductCard en cada render
  const handleAdd = useCallback(async (p, qty = 1) => {
    setCount((c) => c + (qty || 1));
    bumpCart();
    try {
      const newCount = await addToCart(p, qty);
      setCount(newCount);
      showToast(p.nombre);
    } catch (e) {
      setCount((c) => Math.max(0, c - (qty || 1)));
      throw e;
    }
  }, []);

  const handleAddDeal = useCallback((p) => handleAdd(p, 1), [handleAdd]);

  const deals = useMemo(() => {
    const now = Date.now();
    const within = (p) => {
      const sOk = !p.deal_starts_at || new Date(p.deal_starts_at).getTime() <= now;
      const eOk = !p.deal_ends_at || new Date(p.deal_ends_at).getTime() >= now;
      return sOk && eOk;
    };
    let pick = allRows.filter((p) => p.is_deal && within(p));
    if (pick.length < 8) {
      const fallback = allRows.filter((p) => !p.is_deal && p.price_online != null && p.price_base != null && Number(p.price_online) < Number(p.price_base));
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

  // "The Rack" — máquinas usadas/reacondicionadas/devoluciones (deal_badge = "OUTLET")
  const rackItems = useMemo(() =>
    allRows.filter((p) => p.is_deal && (p.deal_badge || "").toUpperCase() === "OUTLET")
           .sort((a, b) => Number(a.price_online ?? a.price_base ?? 0) - Number(b.price_online ?? b.price_base ?? 0)),
    [allRows]
  );

  const brands = useMemo(() =>
    ["all", ...new Set(allRows.map((p) => (p.marca || "").toLowerCase()).filter(Boolean))].sort(),
    [allRows]
  );

  const siteName = settings?.site_name || "Tools4care";
  const logoUrl = settings?.logo_url || null;

  return (
    <div className="min-h-screen bg-gray-50 pb-16 sm:pb-0">
      {/* Lightbox */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          startIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Toast */}
      <AddedToast toasts={toasts} onViewCart={() => setCartOpen(true)} />

      {/* Search overlay */}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        products={allRows}
        suggestions={deals.slice(0, 6)}
        onAdd={handleAdd}
        onSelect={handleSearchSelect}
      />

      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            className="flex items-center gap-2 text-lg font-semibold shrink-0"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={siteName} className="h-8 w-auto object-contain"
                onError={(e) => (e.currentTarget.style.display = "none")} />
            ) : (
              <img src="/icons/icon-192.png" alt="Tools4Care" className="h-8 w-8 rounded-lg object-contain" />
            )}
            <span className="truncate max-w-[160px] font-bold tracking-tight hidden sm:block bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
              {siteName || "TOOLS4CARE"}
            </span>
          </button>

          <div className="flex-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2.5 rounded-2xl px-4 py-2.5 sm:py-3 text-sm text-left text-gray-700 bg-white shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 animate-[borderFlow_4s_linear_infinite]"
              style={{
                backgroundImage:
                  "linear-gradient(white, white), linear-gradient(90deg, #2563eb, #9333ea, #2563eb, #9333ea, #2563eb)",
                backgroundOrigin: "border-box",
                backgroundClip: "padding-box, border-box",
                backgroundSize: "100% 100%, 300% 100%",
                border: "2px solid transparent",
              }}
            >
              <Search size={19} className="shrink-0 text-blue-600" />
              <span className="flex-1 truncate font-semibold">What are you looking for today?</span>
              <span className="hidden sm:inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 px-2.5 py-1 rounded-full">
                <Search size={11} strokeWidth={3} /> Search
              </span>
            </button>
          </div>

          {!user ? (
            <div className="hidden sm:flex items-center gap-2">
              <button className="text-sm rounded-lg border px-3 py-1.5 hover:bg-gray-50" onClick={() => { setAuthMode("signup"); setAuthOpen(true); }}>Sign up</button>
              <button className="text-sm rounded-lg border px-3 py-1.5 hover:bg-gray-50" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}>Sign in</button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm text-gray-600 truncate max-w-[140px]">{user.email}</span>
              <button className="text-sm rounded-lg border px-3 py-1.5 hover:bg-gray-50" onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>
          )}

          <CartIcon count={count} bump={cartBump} onClick={() => setCartOpen(true)} />
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
        {/* Decorative blurred orbs — pure CSS, no images/JS, cheap to paint */}
        <div className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 w-96 h-96 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-6 items-center">
          <div className="animate-[heroIn_0.5s_ease-out]">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">Weekly deals & new arrivals</h1>
            <p className="mt-2 text-white/90">Discover special prices and freshly added products.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => offersRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-lg bg-white text-gray-900 px-4 py-2 font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                View deals
              </button>
              <a href="#catalog" className="rounded-lg border border-white/30 px-4 py-2 hover:bg-white/10 hover:-translate-y-0.5 transition-all">
                Browse catalog
              </a>
              <a href="#subscriptions" className="rounded-lg border border-white/30 px-4 py-2 hover:bg-white/10 hover:-translate-y-0.5 transition-all">
                📦 Subscriptions
              </a>
              {rackItems.length > 0 && (
                <button onClick={() => rackRef.current?.scrollIntoView({ behavior: "smooth" })}
                  className="rounded-lg bg-yellow-400 text-gray-900 px-4 py-2 font-bold hover:bg-yellow-300 hover:-translate-y-0.5 transition-all flex items-center gap-1 animate-pulse">
                  🏷️ The Rack
                </button>
              )}
            </div>
          </div>
          <div className="relative bg-white/10 rounded-2xl p-3 backdrop-blur-sm ring-1 ring-white/10">
            {deals.length ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {deals.slice(0, 6).map((p) => (
                  <DealCardMini key={p.id} p={p} onAdd={handleAddDeal} />
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
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-600 to-purple-600" />
            Featured deals
          </h2>
          <a href="#catalog" className="text-sm text-blue-600 hover:underline">See full catalog →</a>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : deals.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {deals.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} onAdd={handleAdd} onOpenLightbox={handleOpenLightbox} />)}
          </div>
        ) : (
          <div className="text-gray-500">No deals yet.</div>
        )}
      </section>

      {/* THE RACK — outlet / used / refurb */}
      {(rackItems.length > 0 || loading) && (
        <section ref={rackRef} id="the-rack" className="max-w-7xl mx-auto px-4 py-10">
          {/* Header llamativo */}
          <div className="relative rounded-2xl overflow-hidden mb-6 bg-gradient-to-r from-gray-900 via-zinc-800 to-gray-900 p-6 shadow-2xl">
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)", backgroundSize: "20px 20px" }} />
            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-3xl">🏷️</span>
                  <h2 className="text-3xl font-black text-white tracking-tight">The Rack</h2>
                  <span className="bg-yellow-400 text-gray-900 text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wide">
                    {rackItems.length} items
                  </span>
                </div>
                <p className="text-gray-300 text-sm font-medium max-w-md">
                  Open-box, refurbished & returned machines — professionally inspected, priced to move fast. <span className="text-yellow-400 font-bold">Don't sleep on it.</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-yellow-400 font-black text-lg">Up to 70% off</div>
                <div className="text-gray-400 text-xs mt-0.5">While supplies last</div>
              </div>
            </div>
          </div>

          {/* Products grid */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {rackItems.map((p) => (
                <div key={p.id} className="relative">
                  {/* Badge "The Rack" sobre la tarjeta */}
                  <div className="absolute top-2 left-2 z-10 bg-gray-900 text-yellow-400 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide shadow-lg">
                    🏷️ The Rack
                  </div>
                  <ProductCard p={p} onAdd={handleAdd} onOpenLightbox={handleOpenLightbox} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* NEW ARRIVALS */}
      <section className="max-w-7xl mx-auto px-4 pb-2">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-emerald-500 to-teal-600" />
          New arrivals
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : allRows.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {allRows.slice(0, 12).map((p) => <ProductCard key={p.id} p={p} onAdd={handleAdd} onOpenLightbox={handleOpenLightbox} />)}
          </div>
        ) : (
          <div className="text-gray-500">Nothing new for now.</div>
        )}
      </section>

      {/* SUBSCRIPTION BOXES */}
      <section id="subscriptions" className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold">Subscription Boxes</h2>
            <p className="text-sm text-gray-500 mt-0.5">Curated boxes delivered on your schedule.</p>
          </div>
          {!user && (
            <button
              className="text-sm text-indigo-600 hover:underline font-medium"
              onClick={() => { setAuthMode("login"); setAuthOpen(true); }}
            >
              Sign in to subscribe →
            </button>
          )}
        </div>

        {!user ? (
          <div className="mt-4 border-2 border-dashed border-indigo-200 rounded-2xl p-8 text-center bg-indigo-50">
            <div className="text-4xl mb-3">📦</div>
            <h3 className="font-bold text-indigo-900 mb-1">Subscription boxes available</h3>
            <p className="text-sm text-indigo-600 mb-4">Sign in to view our curated subscription plans and subscribe.</p>
            <div className="flex gap-2 justify-center">
              <button
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                onClick={() => { setAuthMode("login"); setAuthOpen(true); }}
              >Sign in</button>
              <button
                className="px-4 py-2 rounded-xl border border-indigo-300 text-indigo-700 text-sm font-semibold hover:bg-indigo-100"
                onClick={() => { setAuthMode("signup"); setAuthOpen(true); }}
              >Create account</button>
            </div>
          </div>
        ) : plans.length === 0 ? (
          <div className="mt-4 text-gray-400 text-sm">No subscription plans available right now.</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {plans.map((plan) => {
              const CICLO_LABEL = { semana:"Weekly", quincena:"Bi-weekly", mensual:"Monthly", bimestral:"Bi-monthly", trimestral:"Quarterly" };
              const productos = Array.isArray(plan.productos) ? plan.productos : [];
              const isFull = plan.cupo_maximo > 0 && (plan._ocupados || 0) >= plan.cupo_maximo;
              const spotsLeft = plan.cupo_maximo > 0 ? plan.cupo_maximo - (plan._ocupados || 0) : null;
              return (
                <div key={plan.id} className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow flex flex-col">
                  {/* ── Hero: imagen con overlay O degradado puro ── */}
                  <div className={`relative flex flex-col justify-end overflow-hidden ${plan.imagen_url ? "min-h-[220px] sm:min-h-[260px]" : "px-5 py-5"} ${!plan.imagen_url ? (isFull ? "bg-gradient-to-br from-gray-500 to-gray-600" : "bg-gradient-to-br from-indigo-600 to-purple-700") : ""}`}>
                    {/* Foto de fondo */}
                    {plan.imagen_url && (
                      <img
                        src={plan.imagen_url}
                        alt={plan.nombre}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {/* Gradient overlay sobre la foto */}
                    {plan.imagen_url && (
                      <div className={`absolute inset-0 ${isFull ? "bg-gradient-to-t from-gray-900/90 via-gray-800/50 to-transparent" : "bg-gradient-to-t from-indigo-900/90 via-purple-800/40 to-transparent"}`} />
                    )}
                    {/* Texto encima */}
                    <div className="relative z-10 px-5 pb-5 pt-3 text-white">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-black text-xl leading-tight drop-shadow">{plan.nombre}</h3>
                        <span className="shrink-0 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                          {CICLO_LABEL[plan.ciclo] || plan.ciclo}
                        </span>
                      </div>
                      {plan.descripcion && (
                        <p className="text-white/80 text-sm line-clamp-2 drop-shadow-sm">{plan.descripcion}</p>
                      )}
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <div>
                          <span className="text-4xl font-black drop-shadow">
                            ${Number(plan.precio).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-white/70 text-sm ml-1.5">/ {CICLO_LABEL[plan.ciclo]?.toLowerCase() || plan.ciclo}</span>
                        </div>
                        {plan.cupo_maximo > 0 && (
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm ${isFull ? "bg-red-500/80 border border-red-400/50" : "bg-emerald-500/70 border border-emerald-400/50"}`}>
                            {isFull ? "Sold out" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Contenido: productos + botón ── */}
                  <div className="p-5 flex-1 flex flex-col">
                    {productos.length > 0 && (
                      <div className="flex-1 mb-4">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">What's included</p>
                        <ul className="space-y-2">
                          {productos.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="text-indigo-500 shrink-0 mt-0.5 font-bold">✓</span>
                              <span>
                                {item.nombre}
                                {item.nota && <span className="text-gray-400 ml-1">— {item.nota}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all ${isFull ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-md shadow-indigo-200"}`}
                      disabled={isFull}
                      onClick={() => !isFull && setSubModal(plan)}
                    >
                      {isFull ? "Sold out" : "Subscribe now →"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* CATALOG + FILTERS */}
      <section id="catalog" className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-indigo-500 to-blue-600" />
            Catalog
          </h2>
          <span className="text-sm text-gray-500">
            {loading ? "Loading…" : `${rows.length} product${rows.length === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="bg-white border rounded-xl p-3 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="sm:col-span-2">
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Search by code, name, or brand…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div>
              <select className="w-full border rounded-lg px-3 py-2 bg-white text-sm" value={brand} onChange={(e) => setBrand(e.target.value)}>
                {brands.map((b) => <option key={b} value={b}>{b === "all" ? "All brands" : b}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input type="number" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Min $" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
              <input type="number" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Max $" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            </div>
            <div>
              <select className="w-full border rounded-lg px-3 py-2 bg-white text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="relevance">Relevance</option>
                <option value="price_asc">Price: low → high</option>
                <option value="price_desc">Price: high → low</option>
                <option value="name_asc">Name A → Z</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No products match your filters.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {rows.map((p) => (
              <div
                key={p.id}
                id={`product-${p.id}`}
                className={`rounded-xl transition-shadow duration-700 ${highlightId === p.id ? "ring-4 ring-blue-400 ring-offset-2" : ""}`}
              >
                <ProductCard p={p} onAdd={handleAdd} onOpenLightbox={handleOpenLightbox} />
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-10 py-6 text-center text-sm text-gray-400 border-t">
        © {new Date().getFullYear()} {siteName}. All rights reserved.
      </footer>

      {subModal && (
        <Suspense fallback={null}>
          <SubscriptionModal
            plan={subModal}
            user={user}
            onClose={() => setSubModal(null)}
          />
        </Suspense>
      )}

      <AuthModal open={authOpen} mode={authMode} onClose={() => setAuthOpen(false)} onSignedIn={() => setAuthOpen(false)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Mobile bottom bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t shadow-sm">
        <div className="flex justify-around items-center py-2">
          <button className="flex flex-col items-center text-xs gap-0.5" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <Home size={21} />
            Home
          </button>
          <button type="button" className="flex flex-col items-center text-xs gap-0.5" onClick={() => setSearchOpen(true)}>
            <Search size={21} />
            Search
          </button>
          {!user && (
            <button className="flex flex-col items-center text-xs gap-0.5" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}>
              <User size={21} />
              Login
            </button>
          )}
          <button className="relative flex flex-col items-center text-xs gap-0.5" onClick={() => setCartOpen(true)}>
            <ShoppingCart size={21} />
            <span
              className="absolute -top-1 right-0 text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5"
              style={{ transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)", transform: cartBump ? "scale(1.3)" : "scale(1)" }}
            >
              {count}
            </span>
            Cart
          </button>
        </div>
      </nav>

      {/* Keyframes para el toast y el hero */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes heroIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes borderFlow {
          from { background-position: 0 0, 0% 50%; }
          to   { background-position: 0 0, 200% 50%; }
        }
      `}</style>
    </div>
  );
}
