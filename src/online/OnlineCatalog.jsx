// src/online/OnlineCatalog.jsx
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { supabase } from "../supabaseClient";
import OnlineCatalogActions from "./OnlineCatalogActions.jsx";

const ProductImagesPanel = lazy(() => import("./ProductImagesPanel.jsx"));
const ENV_ONLINE_VAN_ID = import.meta.env.VITE_ONLINE_VAN_ID || null;

async function getOnlineVanId() {
  if (ENV_ONLINE_VAN_ID) return ENV_ONLINE_VAN_ID;
  const { data, error } = await supabase
    .from("vans")
    .select("id, nombre_van")
    .ilike("nombre_van", "%online%")
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

function fmtPrice(n) {
  const v = Number(n || 0);
  return v.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/* ─── Toggle switch (pure CSS) ─── */
function Toggle({ checked, onChange, label, color = "blue" }) {
  const bg = checked
    ? color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-500" : "bg-blue-600"
    : "bg-gray-200";
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${bg}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
      {label && <span className="text-xs text-gray-600 leading-tight">{label}</span>}
    </label>
  );
}

/* ─── Inline text input with save on Enter/blur ─── */
function InlineInput({ value, placeholder, onSave, type = "text", prefix = "", className = "" }) {
  const [local, setLocal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);

  useEffect(() => { setLocal(value ?? ""); dirty.current = false; }, [value]);

  async function commit() {
    if (!dirty.current) return;
    dirty.current = false;
    setSaving(true);
    try {
      await onSave(local);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-2.5 text-xs text-gray-400 pointer-events-none">{prefix}</span>}
      <input
        type={type}
        className={`w-full border rounded-lg text-sm py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50 focus:bg-white transition-colors ${prefix ? "pl-5" : "pl-2.5"} pr-7 ${className}`}
        placeholder={placeholder}
        value={local}
        onChange={(e) => { setLocal(e.target.value); dirty.current = true; setSaved(false); }}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <div className="absolute right-2 pointer-events-none">
        {saving ? (
          <svg className="animate-spin w-3 h-3 text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        ) : saved ? (
          <svg width="12" height="12" viewBox="0 0 24 24" className="text-emerald-500">
            <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Status dot ─── */
function StatusDot({ visible, visibleOnline }) {
  if (visibleOnline) return <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Visible online" />;
  if (visible) return <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Visible in admin only" />;
  return <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" title="Hidden" />;
}

/* ─── Compact search used to link a sibling color/size variant ─── */
function VariantLinkSearch({ excludeId, onPick }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setOpts([]); return; }
    const h = setTimeout(async () => {
      setLoading(true);
      try {
        const like = `%${term}%`;
        const { data, error } = await supabase
          .from("productos")
          .select("id, nombre, marca, codigo")
          .or(`nombre.ilike.${like},marca.ilike.${like},codigo.ilike.${like}`)
          .neq("id", excludeId)
          .limit(15);
        if (error) throw error;
        setOpts(data || []);
      } catch (e) {
        console.error(e);
        setOpts([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q, excludeId]);

  return (
    <div>
      <input
        className="w-full rounded-xl border px-3 py-2 text-sm"
        placeholder="Search the other color/size by name, brand or code…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {loading && <div className="mt-1 text-xs text-gray-400">Searching…</div>}
      {opts.length > 0 && (
        <ul className="mt-2 max-h-40 overflow-auto rounded-xl border divide-y">
          {opts.map((p) => (
            <li
              key={p.id}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => { onPick(p); setQ(""); setOpts([]); }}
            >
              <div className="font-semibold text-gray-800">{p.nombre}</div>
              <div className="text-[11px] text-gray-400">{p.marca || "—"} · <span className="font-mono">{p.codigo}</span></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductEditor({ product, onClose, onToggle, onUpdate, onImages, siblings = [], onLinkVariant, onUnlinkVariant }) {
  const [linkTarget, setLinkTarget] = useState(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkAxis, setLinkAxis] = useState("Color");

  useEffect(() => {
    if (product) setLinkAxis(product.variant_axis || siblings[0]?.variant_axis || "Color");
    setLinkTarget(null);
    setLinkLabel("");
  }, [product?.id]); // eslint-disable-line

  if (!product) return null;

  async function confirmLink() {
    if (!linkTarget || !linkLabel.trim()) return;
    await onLinkVariant({
      productId: product.id,
      targetId: linkTarget.id,
      targetLabel: linkLabel.trim(),
      axis: linkAxis,
    });
    setLinkTarget(null);
    setLinkLabel("");
  }
  return (
    <div className="fixed inset-0 z-[90]">
      <button type="button" aria-label="Close editor" className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Edit online product</p>
            <h2 className="truncate text-xl font-black text-gray-900">{product.nombre}</h2>
            <p className="text-xs text-gray-400">{product.marca} · {product.codigo}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50">Close</button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section className="grid gap-4 sm:grid-cols-[150px_1fr]">
            <button
              type="button"
              onClick={onImages}
              className="group relative flex h-40 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50"
            >
              {product.main_image_url ? (
                <img src={product.main_image_url} alt={product.nombre} className="h-full w-full object-contain p-2" />
              ) : (
                <span className="text-sm font-bold text-gray-400">＋ Add photo</span>
              )}
              <span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/70 px-2 py-1.5 text-xs font-bold text-white">
                Upload or manage photos
              </span>
            </button>
            <div className="space-y-4 rounded-2xl border bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Admin visibility</span>
                <Toggle checked={product.visible} onChange={(value) => onToggle(product.id, "visible", value)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Published online</span>
                <Toggle checked={product.visible_online} onChange={(value) => onToggle(product.id, "visible_online", value)} color="green" />
              </div>
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-gray-500">Available stock</span>
                <span className={`font-black ${product.qty <= 3 ? "text-rose-600" : "text-gray-900"}`}>{product.qty}</span>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border p-4">
            <h3 className="font-black text-gray-900">Store information</h3>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Online price</label>
              <InlineInput
                value={product.price_online != null ? String(product.price_online) : ""}
                placeholder={`Base price: ${fmtPrice(product.price_base)}`}
                type="number"
                prefix="$"
                onSave={async (value) => {
                  const trimmed = value.trim();
                  const amount = trimmed === "" ? null : Number(trimmed);
                  await onUpdate(product.id, { price_online: Number.isFinite(amount) ? amount : null });
                }}
                className="py-2.5"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Short description</label>
              <InlineInput value={product.descripcion} placeholder="Describe the product for customers…" onSave={(value) => onUpdate(product.id, { descripcion: value.trim() })} className="py-2.5" />
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900">Promotion</h3>
                <p className="text-xs text-gray-500">Feature this product as a deal.</p>
              </div>
              <Toggle checked={product.is_deal} onChange={(value) => onToggle(product.id, "is_deal", value)} color="amber" />
            </div>
            {product.is_deal && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500">Badge</label>
                  <select value={product.deal_badge || "Deal"} onChange={(event) => onUpdate(product.id, { deal_badge: event.target.value })} className="w-full rounded-xl border bg-white px-3 py-2 text-sm">
                    <option value="Deal">Deal</option><option value="Sale">Sale</option><option value="Hot">Hot</option>
                    <option value="OUTLET">The Rack (Outlet)</option><option value="Refurb">Refurbished</option><option value="Open Box">Open Box</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500">Display priority</label>
                  <InlineInput value={String(product.deal_priority || 0)} type="number" onSave={(value) => onUpdate(product.id, { deal_priority: Number(value) || 0 })} />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900">Variants (color / size)</h3>
              {product.variant_group_id && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Linked</span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Link this product to the other colors/sizes of the same item so shoppers see one card
              with an option picker online. Stock and orders stay tracked per SKU.
            </p>

            {product.variant_group_id && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                  Option label for this SKU (e.g. "Black")
                </label>
                <InlineInput
                  value={product.variant_label || ""}
                  placeholder="Black, Gold, Large…"
                  onSave={(value) => onUpdate(product.id, { variant_label: value.trim() || null })}
                />
              </div>
            )}

            {siblings.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Linked in this group
                </div>
                {siblings.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border bg-gray-50 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-800">{s.variant_label || "—"}</div>
                      <div className="truncate text-[11px] text-gray-400">{s.nombre} · Stock {s.qty}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {linkTarget ? (
              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="text-sm font-semibold text-gray-800">{linkTarget.nombre}</div>
                <div className="text-[11px] text-gray-500">{linkTarget.marca || "—"} · <span className="font-mono">{linkTarget.codigo}</span></div>
                <input
                  className="w-full rounded-lg border px-2.5 py-1.5 text-sm"
                  placeholder='Label for this SKU (e.g. "Gold")'
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  autoFocus
                />
                <input
                  className="w-full rounded-lg border px-2.5 py-1.5 text-sm"
                  placeholder="Swatch type (e.g. Color, Size)"
                  value={linkAxis}
                  onChange={(e) => setLinkAxis(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="rounded-lg border px-3 py-1.5 text-xs font-bold text-gray-600" onClick={() => setLinkTarget(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    disabled={!linkLabel.trim()}
                    onClick={confirmLink}
                  >
                    Link
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  {product.variant_group_id ? "Link another color/size to this group" : "Link this product to another color/size"}
                </div>
                <VariantLinkSearch excludeId={product.id} onPick={setLinkTarget} />
              </div>
            )}

            {product.variant_group_id && (
              <button
                type="button"
                className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                onClick={() => onUnlinkVariant(product.id)}
              >
                Remove this SKU from the group
              </button>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

/* ─── Main component ─── */
export default function OnlineCatalog() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [onlineVan, setOnlineVan] = useState(null);
  const [expandedDeals, setExpandedDeals] = useState(new Set());
  const [viewMode, setViewMode] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(1);

  const [imgOpen, setImgOpen] = useState(false);
  const [imgPid, setImgPid] = useState(null);

  const reloadTimeoutRef = useRef(null);

  async function reload() {
    setLoading(true);
    try {
      let v = onlineVan;
      if (!v) v = await getOnlineVanId();
      setOnlineVan(v);

      // 1) Stock del VAN Online con cantidad > 0
      const { data: stock, error: stErr } = await supabase
        .from("stock_van")
        .select("producto_id, cantidad, productos ( id, codigo, nombre, marca, precio )")
        .eq("van_id", v)
        .gt("cantidad", 0)
        .order("producto_id", { ascending: true });
      if (stErr) throw stErr;

      const ids = (stock || []).map((r) => r.producto_id);

      // 2) Meta online
      let metaMap = new Map();
      if (ids.length) {
        const { data: metas, error: mErr } = await supabase
          .from("online_product_meta")
          .select("producto_id, price_online, visible, visible_online, descripcion, is_deal, deal_starts_at, deal_ends_at, deal_badge, deal_priority, meta_updated_at, variant_group_id, variant_label, variant_axis")
          .in("producto_id", ids);
        if (mErr) throw mErr;
        (metas || []).forEach((m) => metaMap.set(m.producto_id, m));
      }

      // 3) Imágenes principales
      let coverMap = new Map();
      if (ids.length) {
        const chunkSize = 150;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const slice = ids.slice(i, i + chunkSize);
          const { data: covers } = await supabase
            .from("product_main_image_v")
            .select("producto_id, main_image_url")
            .in("producto_id", slice);
          (covers || []).forEach((c) => coverMap.set(c.producto_id, c.main_image_url));
        }
      }

      // 4) Combinar
      let combined = (stock || [])
        .filter((s) => !!s.productos)
        .map((s) => {
          const m = metaMap.get(s.producto_id) || {};
          const base = Number(s.productos.precio ?? 0);
          const online = m.price_online == null ? null : Number(m.price_online);
          return {
            id: s.productos.id,
            codigo: s.productos.codigo,
            nombre: s.productos.nombre,
            marca: s.productos.marca || "—",
            qty: Number(s.cantidad || 0),
            price_base: base,
            price_online: online,
            descripcion: m.descripcion || "",
            visible: !!m.visible,
            visible_online: !!m.visible_online,
            is_deal: !!m.is_deal,
            deal_starts_at: m.deal_starts_at || null,
            deal_ends_at: m.deal_ends_at || null,
            deal_badge: m.deal_badge || "Deal",
            deal_priority: Number(m.deal_priority ?? 0),
            meta_updated_at: m.meta_updated_at || null,
            main_image_url: coverMap.get(s.producto_id) || null,
            variant_group_id: m.variant_group_id || null,
            variant_label: m.variant_label || "",
            variant_axis: m.variant_axis || "",
          };
        });

      // 5) Filtro local de búsqueda
      const term = q.trim().toLowerCase();
      if (term) {
        combined = combined.filter(
          (r) =>
            (r.nombre || "").toLowerCase().includes(term) ||
            (r.marca || "").toLowerCase().includes(term) ||
            (r.codigo || "").toLowerCase().includes(term)
        );
      }

      setRows(combined);
      setLastUpdate(new Date());
    } catch (err) {
      console.error(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line
  useEffect(() => { reload(); }, [q]); // eslint-disable-line

  // Realtime con debounce
  useEffect(() => {
    let channel;
    (async () => {
      const v = await getOnlineVanId();
      const scheduleReload = () => {
        if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = setTimeout(() => reload(), 600);
      };
      channel = supabase
        .channel("online-catalog-admin-watch")
        .on("postgres_changes", { event: "*", schema: "public", table: "stock_van", filter: `van_id=eq.${v}` }, scheduleReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, scheduleReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "online_product_meta" }, scheduleReload)
        .subscribe();
    })();
    return () => {
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line

  async function upsertMeta(producto_id, patch) {
    const { error } = await supabase
      .from("online_product_meta")
      .upsert({ producto_id, ...patch }, { onConflict: "producto_id" });
    if (error) throw error;
  }

  async function onToggle(id, field, value) {
    try {
      await upsertMeta(id, { [field]: value });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    } catch (e) {
      console.error(e);
    }
  }

  async function onUpdate(id, patch) {
    await upsertMeta(id, patch);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function onLinkVariant({ productId, targetId, targetLabel, axis }) {
    try {
      const { data: targetMeta } = await supabase
        .from("online_product_meta")
        .select("variant_group_id")
        .eq("producto_id", targetId)
        .maybeSingle();

      const current = rows.find((r) => r.id === productId);
      const groupId = current?.variant_group_id || targetMeta?.variant_group_id || crypto.randomUUID();
      const cleanAxis = axis?.trim() || "Color";

      await upsertMeta(productId, { variant_group_id: groupId, variant_axis: cleanAxis });
      await upsertMeta(targetId, { variant_group_id: groupId, variant_label: targetLabel, variant_axis: cleanAxis });

      setRows((prev) => prev.map((r) => {
        if (r.id === productId) return { ...r, variant_group_id: groupId, variant_axis: cleanAxis };
        if (r.id === targetId) return { ...r, variant_group_id: groupId, variant_label: targetLabel, variant_axis: cleanAxis };
        return r;
      }));
      await reload();
    } catch (e) {
      console.error(e);
    }
  }

  async function onUnlinkVariant(id) {
    try {
      await upsertMeta(id, { variant_group_id: null, variant_label: null });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, variant_group_id: null, variant_label: "" } : r)));
    } catch (e) {
      console.error(e);
    }
  }

  function toggleDeal(id) {
    setExpandedDeals((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Stats
  const stats = useMemo(() => ({
    total: rows.length,
    online: rows.filter((r) => r.visible_online).length,
    deals: rows.filter((r) => r.is_deal).length,
    hidden: rows.filter((r) => !r.visible && !r.visible_online).length,
  }), [rows]);
  const selectedProduct = rows.find((row) => row.id === selectedId) || null;
  const siblingProducts = useMemo(() => {
    if (!selectedProduct?.variant_group_id) return [];
    return rows.filter((r) => r.variant_group_id === selectedProduct.variant_group_id && r.id !== selectedProduct.id);
  }, [rows, selectedProduct]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [q]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-5xl mx-auto px-3 py-4 sm:px-6">

        {/* ─── Header ─── */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                🛍️ Online Catalog
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Products with stock in <span className="font-semibold text-gray-700">VAN Online</span>
              </p>
            </div>
            <OnlineCatalogActions onlineVanId={onlineVan} onChanged={reload} />
          </div>

          {/* Stats bar */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { label: "Total", value: stats.total, color: "text-gray-800" },
              { label: "Live online", value: stats.online, color: "text-emerald-600" },
              { label: "Deals", value: stats.deals, color: "text-amber-600" },
              { label: "Hidden", value: stats.hidden, color: "text-gray-400" },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-2.5 border text-center">
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-400 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search + controls */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <svg width="16" height="16" viewBox="0 0 24 24" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16a6.471 6.471 0 004.23-1.57l.27.28v.79L20 21.5 21.5 20zM9.5 14A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"/>
              </svg>
              <input
                className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 focus:bg-white transition-colors"
                placeholder="Search by name, brand or code…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
              onClick={reload}
              disabled={loading}
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
              )}
              Refresh
            </button>
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${viewMode === "list" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}
              >
                ☷ List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("details")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${viewMode === "details" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}
              >
                ▦ Details
              </button>
            </div>
            <span className="text-xs text-gray-400 ml-auto">
              {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : "—"}
            </span>
          </div>
        </div>

        {/* ─── Legend ─── */}
        <div className="flex items-center gap-4 text-[11px] text-gray-500 px-1 mb-3">
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"/> Live online</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"/> Admin only</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300"/> Hidden</div>
          <div className="text-gray-400">{stats.total} item{stats.total !== 1 ? "s" : ""} · VAN: {onlineVan ? onlineVan.slice(0, 8) + "…" : "—"}</div>
        </div>

        {/* ─── Product rows ─── */}
        {loading && rows.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border h-24 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-gray-500">No products found.</div>
          </div>
        ) : viewMode === "list" ? (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="hidden grid-cols-[64px_minmax(260px,1fr)_120px_110px_120px] gap-3 border-b bg-gray-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 md:grid">
              <span>Image</span>
              <span>Product</span>
              <span>Status</span>
              <span>Stock</span>
              <span className="text-right">Price</span>
            </div>
            <div className="divide-y divide-gray-100">
              {visibleRows.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(r.id)}
                  onKeyDown={(event) => event.key === "Enter" && setSelectedId(r.id)}
                  className="grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-blue-50/60 md:grid-cols-[64px_minmax(260px,1fr)_120px_110px_120px] md:px-4"
                >
                  <span
                    role="button"
                    tabIndex={0}
                    title="Manage product images"
                    onClick={(event) => {
                      event.stopPropagation();
                      setImgPid(r.id);
                      setImgOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.stopPropagation();
                        setImgPid(r.id);
                        setImgOpen(true);
                      }
                    }}
                    className="group relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border bg-gray-50"
                  >
                    {r.main_image_url ? (
                      <img src={r.main_image_url} alt={r.nombre} className="h-full w-full object-contain p-1" loading="lazy" />
                    ) : (
                      <span className="text-lg text-gray-300">＋</span>
                    )}
                    <span className="absolute inset-0 hidden items-center justify-center bg-black/55 text-[10px] font-bold text-white group-hover:flex">
                      Photos
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <StatusDot visible={r.visible} visibleOnline={r.visible_online} />
                      <span className="truncate font-bold text-gray-900">{r.nombre}</span>
                      {r.is_deal && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">{r.deal_badge}</span>}
                      {r.variant_group_id && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700" title="Linked to other colors/sizes">🎨 {r.variant_label || "variant"}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-400">{r.marca} · {r.codigo}</span>
                  </span>
                  <span className="hidden text-xs font-semibold text-gray-600 md:block">
                    {r.visible_online ? "Online" : r.visible ? "Admin only" : "Hidden"}
                  </span>
                  <span className={`hidden text-sm font-bold md:block ${r.qty <= 3 ? "text-rose-600" : "text-gray-700"}`}>{r.qty}</span>
                  <span className="text-right">
                    <span className="block text-sm font-black text-gray-900">{fmtPrice(r.price_online ?? r.price_base)}</span>
                    <span className="text-[10px] font-semibold text-blue-600 md:hidden">Edit →</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleRows.map((r) => {
              const hasOffer = r.price_online != null && r.price_base != null && r.price_online < r.price_base;
              const dealExpanded = expandedDeals.has(r.id);

              return (
                <div
                  key={r.id}
                  className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-shadow hover:shadow-md ${r.visible_online ? "" : r.visible ? "opacity-80" : "opacity-60"}`}
                >
                  {/* ── Main row ── */}
                  <div className="p-3 sm:p-4">
                    <div className="flex gap-3">

                      {/* Thumbnail */}
                      <button
                        type="button"
                        onClick={() => { setImgPid(r.id); setImgOpen(true); }}
                        title="Manage product images"
                        className="group relative w-14 h-14 flex-shrink-0 rounded-xl border overflow-hidden bg-gray-50 flex items-center justify-center"
                      >
                        {r.main_image_url ? (
                          <img
                            src={r.main_image_url}
                            alt={r.nombre}
                            className="w-full h-full object-contain p-1"
                            loading="lazy"
                            onError={(e) => (e.currentTarget.style.display = "none")}
                          />
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" className="text-gray-300">
                            <path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                          </svg>
                        )}
                        <span className="absolute inset-0 hidden items-center justify-center bg-black/55 text-[9px] font-bold text-white group-hover:flex">Photos</span>
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <StatusDot visible={r.visible} visibleOnline={r.visible_online} />
                            <div className="font-semibold text-gray-900 truncate">{r.nombre}</div>
                            {r.is_deal && (
                              <span className="flex-shrink-0 text-[10px] bg-rose-100 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-full font-semibold">
                                {r.deal_badge || "Deal"}
                              </span>
                            )}
                            {r.variant_group_id && (
                              <span className="flex-shrink-0 text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full font-semibold" title="Linked to other colors/sizes">
                                🎨 {r.variant_label || "variant"}
                              </span>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="font-bold text-gray-800 text-sm">
                              {fmtPrice(r.price_online ?? r.price_base)}
                            </div>
                            {hasOffer && (
                              <div className="text-[11px] text-gray-400 line-through">{fmtPrice(r.price_base)}</div>
                            )}
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              Stock: <span className={`font-semibold ${r.qty <= 3 ? "text-rose-600" : "text-gray-700"}`}>{r.qty}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <span>{r.marca}</span>
                          <span className="text-gray-300">·</span>
                          <code className="font-mono">{r.codigo}</code>
                        </div>
                      </div>
                    </div>

                    {/* ── Controls row ── */}
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">

                      {/* Toggles */}
                      <div className="flex flex-col gap-2">
                        <Toggle
                          checked={r.visible}
                          onChange={(v) => onToggle(r.id, "visible", v)}
                          label="Visible (admin)"
                        />
                        <Toggle
                          checked={r.visible_online}
                          onChange={(v) => onToggle(r.id, "visible_online", v)}
                          label="Visible online"
                          color="green"
                        />
                      </div>

                      {/* Online price */}
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">Online price</label>
                        <InlineInput
                          value={r.price_online != null ? String(r.price_online) : ""}
                          placeholder={`Base: ${fmtPrice(r.price_base)}`}
                          type="number"
                          prefix="$"
                          onSave={async (val) => {
                            const trimmed = val.trim();
                            const n = trimmed === "" ? null : Number(trimmed);
                            await onUpdate(r.id, { price_online: trimmed === "" ? null : (Number.isFinite(n) ? n : null) });
                          }}
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">Description</label>
                        <InlineInput
                          value={r.descripcion || ""}
                          placeholder="Short description…"
                          onSave={async (val) => onUpdate(r.id, { descripcion: val.trim() || "" })}
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1.5">
                        {/* Deal toggle */}
                        <button
                          className={`flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            r.is_deal
                              ? "bg-rose-50 border-rose-200 text-rose-700"
                              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                          }`}
                          onClick={() => {
                            onToggle(r.id, "is_deal", !r.is_deal);
                            if (!r.is_deal) setExpandedDeals((prev) => new Set([...prev, r.id]));
                          }}
                        >
                          <span>🏷️ {r.is_deal ? "Deal ON" : "Make deal"}</span>
                          {r.is_deal && (
                            <svg
                              width="12" height="12" viewBox="0 0 24 24"
                              className={`transition-transform ${dealExpanded ? "rotate-180" : ""}`}
                              onClick={(e) => { e.stopPropagation(); toggleDeal(r.id); }}
                            >
                              <path fill="currentColor" d="M7 10l5 5 5-5z"/>
                            </svg>
                          )}
                        </button>

                      </div>
                    </div>
                  </div>

                  {/* ── Deal section (expandable) ── */}
                  {r.is_deal && dealExpanded && (
                    <div className="border-t bg-rose-50/40 px-3 sm:px-4 py-3">
                      <div className="text-[10px] text-rose-600 font-semibold uppercase tracking-wide mb-2">Deal settings</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {/* Badge */}
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">Badge / Type</label>
                          <select
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-rose-400"
                            value={r.deal_badge || "Deal"}
                            onChange={(e) => onUpdate(r.id, { deal_badge: e.target.value })}
                          >
                            <option value="Deal">Deal</option>
                            <option value="Sale">Sale</option>
                            <option value="Hot">🔥 Hot</option>
                            <option value="OUTLET">🏷️ The Rack (Outlet)</option>
                            <option value="Refurb">♻️ Refurb</option>
                            <option value="Open Box">📦 Open Box</option>
                          </select>
                        </div>

                        {/* Priority */}
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">Priority (higher = first)</label>
                          <InlineInput
                            value={String(r.deal_priority ?? 0)}
                            placeholder="0"
                            type="number"
                            onSave={async (v) => onUpdate(r.id, { deal_priority: Number(v) || 0 })}
                          />
                        </div>

                        {/* Start date */}
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">Starts at</label>
                          <input
                            type="datetime-local"
                            className="w-full border rounded-lg px-2 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            defaultValue={r.deal_starts_at ? new Date(r.deal_starts_at).toISOString().slice(0, 16) : ""}
                            onBlur={(e) => onUpdate(r.id, {
                              deal_starts_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                              meta_updated_at: new Date().toISOString(),
                            })}
                          />
                        </div>

                        {/* End date */}
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">Ends at</label>
                          <input
                            type="datetime-local"
                            className="w-full border rounded-lg px-2 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            defaultValue={r.deal_ends_at ? new Date(r.deal_ends_at).toISOString().slice(0, 16) : ""}
                            onBlur={(e) => onUpdate(r.id, {
                              deal_ends_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                              meta_updated_at: new Date().toISOString(),
                            })}
                          />
                        </div>
                      </div>

                      {r.meta_updated_at && (
                        <div className="mt-2 text-[10px] text-gray-400">
                          Last updated: {new Date(r.meta_updated_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {rows.length > pageSize && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border bg-white px-4 py-3">
            <span className="text-xs font-semibold text-gray-500">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40">Previous</button>
              <span className="text-xs font-bold text-gray-600">Page {page} of {pageCount}</span>
              <button type="button" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      <ProductEditor
        product={selectedProduct}
        onClose={() => setSelectedId(null)}
        onToggle={onToggle}
        onUpdate={onUpdate}
        siblings={siblingProducts}
        onLinkVariant={onLinkVariant}
        onUnlinkVariant={onUnlinkVariant}
        onImages={() => {
          setImgPid(selectedProduct?.id || null);
          setImgOpen(true);
        }}
      />

      <Suspense fallback={null}>
        {imgOpen && (
          <ProductImagesPanel
            open={imgOpen}
            productoId={imgPid}
            productName={rows.find((row) => row.id === imgPid)?.nombre || ""}
            onClose={() => { setImgOpen(false); setImgPid(null); reload(); }}
          />
        )}
      </Suspense>
    </div>
  );
}
