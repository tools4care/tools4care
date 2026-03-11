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

/* ─── Main component ─── */
export default function OnlineCatalog() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [onlineVan, setOnlineVan] = useState(null);
  const [expandedDeals, setExpandedDeals] = useState(new Set());

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
          .select("producto_id, price_online, visible, visible_online, descripcion, is_deal, deal_starts_at, deal_ends_at, deal_badge, deal_priority, meta_updated_at")
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
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
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
                      <div className="w-14 h-14 flex-shrink-0 rounded-xl border overflow-hidden bg-gray-50 flex items-center justify-center">
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
                      </div>

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

                        {/* Images button */}
                        <button
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium bg-gray-50 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
                          onClick={() => { setImgPid(r.id); setImgOpen(true); }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                          </svg>
                          Images
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
                          <label className="block text-[10px] text-gray-400 mb-1">Badge text</label>
                          <InlineInput
                            value={r.deal_badge || "Deal"}
                            placeholder="e.g. SUPER DEAL"
                            onSave={async (v) => onUpdate(r.id, { deal_badge: v.trim() || "Deal" })}
                          />
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
      </div>

      <Suspense fallback={null}>
        {imgOpen && (
          <ProductImagesPanel
            open={imgOpen}
            productoId={imgPid}
            onClose={() => { setImgOpen(false); setImgPid(null); }}
          />
        )}
      </Suspense>
    </div>
  );
}
