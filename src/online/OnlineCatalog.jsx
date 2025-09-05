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

function Price({ v }) {
  const n = Number(v || 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function OnlineCatalog() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [onlineVan, setOnlineVan] = useState(null);

  const [imgOpen, setImgOpen] = useState(false);
  const [imgPid, setImgPid] = useState(null);

  const reloadTimeoutRef = useRef(null);

  async function reload() {
    setLoading(true);
    try {
      let v = onlineVan;
      if (!v) v = await getOnlineVanId();
      setOnlineVan(v);

      // 1) SOLO inventario del VAN Online con stock > 0
      const { data: stock, error: stErr } = await supabase
        .from("stock_van")
        .select(
          `
          producto_id,
          cantidad,
          productos ( id, codigo, nombre, marca, precio )
        `
        )
        .eq("van_id", v)
        .gt("cantidad", 0)
        .order("producto_id", { ascending: true });
      if (stErr) throw stErr;

      const ids = (stock || []).map((r) => r.producto_id);

      // 2) meta online
      let metaMap = new Map();
      if (ids.length) {
        const { data: metas, error: mErr } = await supabase
          .from("online_product_meta")
          .select(
            "producto_id, price_online, visible, visible_online, descripcion, is_deal, deal_starts_at, deal_ends_at, deal_badge, deal_priority, meta_updated_at"
          )
          .in("producto_id", ids);
        if (mErr) throw mErr;
        (metas || []).forEach((m) => metaMap.set(m.producto_id, m));
      }

      // 3) combinar
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
          };
        });

      // 4) búsqueda local
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
      alert(err?.message || "Could not load catalog.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // carga inicial
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cambios de búsqueda
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // realtime para refrescar sin recargar la página
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
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stock_van", filter: `van_id=eq.${v}` },
          scheduleReload
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, scheduleReload)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // upsert meta
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
      alert(e?.message || "Update failed.");
    }
  }

  async function onUpdate(id, patch) {
    try {
      await upsertMeta(id, patch);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    } catch (e) {
      alert(e?.message || "Update failed.");
    }
  }

  const total = useMemo(() => rows.length, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                🛍️ Tienda Online
              </h1>
              <p className="text-xs text-gray-600 mt-1">
                Catálogo · solo productos con stock en <b>VAN Online</b>.
              </p>
            </div>

            <OnlineCatalogActions
              onlineVanId={onlineVan}
              onChanged={() => reload()}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="px-2 py-1 rounded-lg border bg-blue-50 text-blue-700">Online Store</span>
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Search by name, brand or code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              className="px-3 py-2 rounded-lg text-white bg-gradient-to-r from-blue-600 to-blue-700 shadow-md hover:shadow-lg"
              onClick={reload}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
            <span className="ml-auto text-xs text-gray-500">
              Last update: {lastUpdate ? lastUpdate.toLocaleString() : "—"}
            </span>
          </div>
        </div>

        {/* Meta info */}
        <div className="text-sm text-gray-600 mb-2 px-1">
          {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`} · VAN: {onlineVan || "—"}
        </div>

        {/* Listado */}
        <div className="space-y-3">
          {rows.map((r) => {
            const shownPrice = Number(r.price_online ?? r.price_base ?? 0);
            const hasOffer =
              r.price_online != null && r.price_base != null && r.price_online < r.price_base;

            return (
              <div key={r.id} className="bg-white border rounded-xl p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium truncate">{r.nombre}</div>
                      <div className="text-right whitespace-nowrap">
                        <div className="font-semibold">
                          <Price v={shownPrice} />
                          {hasOffer && (
                            <span className="ml-2 text-xs text-gray-500 line-through">
                              <Price v={r.price_base} />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          Qty: <b>{r.qty}</b>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.marca} · <span className="font-mono">{r.codigo}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!r.visible}
                          onChange={(e) => onToggle(r.id, "visible", e.target.checked)}
                        />
                        Visible (admin)
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!r.visible_online}
                          onChange={(e) => onToggle(r.id, "visible_online", e.target.checked)}
                        />
                        Visible online
                      </label>

                      <div className="md:col-span-2">
                        <input
                          className="w-full border rounded-lg px-2 py-1"
                          placeholder="Online price"
                          defaultValue={r.price_online ?? ""}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val === "") {
                              onUpdate(r.id, { price_online: null });
                            } else {
                              const n = Number(val);
                              onUpdate(r.id, { price_online: Number.isFinite(n) ? n : null });
                            }
                          }}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <input
                          className="w-full border rounded-lg px-2 py-1"
                          placeholder="Description"
                          defaultValue={r.descripcion || ""}
                          onBlur={(e) =>
                            onUpdate(r.id, { descripcion: e.target.value.trim() || "N/A" })
                          }
                        />
                      </div>
                    </div>

                    {/* deals */}
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2 items-center">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!r.is_deal}
                          onChange={(e) => onToggle(r.id, "is_deal", e.target.checked)}
                        />
                        Deal
                      </label>

                      <input
                        className="border rounded-lg px-2 py-1"
                        placeholder="Badge"
                        defaultValue={r.deal_badge || "Deal"}
                        onBlur={(e) =>
                          onUpdate(r.id, { deal_badge: e.target.value.trim() || "Deal" })
                        }
                      />

                      <input
                        type="datetime-local"
                        className="border rounded-lg px-2 py-1"
                        defaultValue={
                          r.deal_starts_at ? new Date(r.deal_starts_at).toISOString().slice(0, 16) : ""
                        }
                        onBlur={(e) =>
                          onUpdate(r.id, {
                            deal_starts_at: e.target.value
                              ? new Date(e.target.value).toISOString()
                              : null,
                            meta_updated_at: new Date().toISOString(),
                          })
                        }
                      />

                      <input
                        type="datetime-local"
                        className="border rounded-lg px-2 py-1"
                        defaultValue={
                          r.deal_ends_at ? new Date(r.deal_ends_at).toISOString().slice(0, 16) : ""
                        }
                        onBlur={(e) =>
                          onUpdate(r.id, {
                            deal_ends_at: e.target.value
                              ? new Date(e.target.value).toISOString()
                              : null,
                            meta_updated_at: new Date().toISOString(),
                          })
                        }
                      />

                      <input
                        type="number"
                        className="border rounded-lg px-2 py-1"
                        defaultValue={r.deal_priority ?? 0}
                        onBlur={(e) =>
                          onUpdate(r.id, { deal_priority: Number(e.target.value || 0) })
                        }
                      />

                      <button
                        className="px-2.5 py-1.5 rounded-lg border hover:bg-gray-50"
                        onClick={() => {
                          setImgPid(r.id);
                          setImgOpen(true);
                        }}
                      >
                        Images…
                      </button>
                    </div>

                    <div className="mt-1 text-[11px] text-gray-500">
                      Meta updated:{" "}
                      {r.meta_updated_at ? new Date(r.meta_updated_at).toLocaleString() : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
        </Suspense>
      </div>
    </div>
  );
}
