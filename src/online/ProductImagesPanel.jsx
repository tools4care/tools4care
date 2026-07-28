// src/online/ProductImagesPanel.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

// Util: genera un nombre de archivo seguro
function slugify(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export default function ProductImagesPanel({ open, productoId, productName, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open || !productoId) return;
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productoId]);

  async function fetchRows() {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("product_images")
        .select("id, url, is_primary, sort_order, created_at")
        .eq("producto_id", productoId)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      setRows(data ?? []);
    } catch (e) {
      setErr(e?.message || "No se pudieron cargar las imágenes.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !productoId) return;

    setErr("");
    setLoading(true);
    try {
      const key = `products/${productoId}/${Date.now()}-${slugify(file.name)}`;

      // 1) Subir al bucket (asegúrate de tener un bucket público llamado product-images)
      const { error: upErr } = await supabase
        .storage
        .from("product-images")
        .upload(key, file, { upsert: false, cacheControl: "3600" });
      if (upErr) throw upErr;

      // 2) Obtener URL pública
      const { data: pub, error: pubErr } = supabase
        .storage
        .from("product-images")
        .getPublicUrl(key);
      if (pubErr) throw pubErr;

      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("No se pudo obtener la URL pública");

      // 3) sort_order siguiente + primera imagen como principal
      const nextSort =
        ((rows || []).reduce(
          (m, r) => Math.max(m, Number(r.sort_order ?? 0)),
          0
        ) || 0) + 1;
      const makePrimary = (rows || []).length === 0;

      // 4) Insertar fila
      const { error: insErr } = await supabase.from("product_images").insert({
        producto_id: productoId,
        url: publicUrl,
        sort_order: nextSort,
        is_primary: makePrimary,
      });
      if (insErr) throw insErr;

      await fetchRows();
    } catch (e) {
      setErr(e?.message || "Error subiendo la imagen.");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function setPrimary(id) {
    if (!productoId || !id) return;
    setLoading(true);
    setErr("");
    try {
      // Desmarcar todas
      const { error: e1 } = await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("producto_id", productoId);
      if (e1) throw e1;

      // Marcar esta
      const { error: e2 } = await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", id);
      if (e2) throw e2;

      await fetchRows();
    } catch (e) {
      setErr(e?.message || "No se pudo marcar como principal.");
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(id) {
    if (!id) return;
    // eslint-disable-next-line no-alert
    if (
      !confirm(
        "Delete this product image? This action cannot be undone."
      )
    )
      return;

    setLoading(true);
    setErr("");
    try {
      const { error } = await supabase
        .from("product_images")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await fetchRows();
    } catch (e) {
      setErr(e?.message || "No se pudo eliminar.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b px-6 py-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Product media</p>
              <h2 className="text-xl font-black text-gray-900">{productName || `Product #${productoId}`}</h2>
              <p className="mt-1 text-sm text-gray-500">Click the upload tile to add photos. Choose one as the storefront cover.</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {err && (
            <div className="mt-3 p-3 text-sm rounded bg-rose-50 text-rose-700 border border-rose-200">
              {err}
            </div>
            )}

            {loading && (
              <div className="mb-3 text-sm font-semibold text-blue-600">Processing image…</div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/60 p-5 text-center transition hover:border-blue-400 hover:bg-blue-50">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={loading} />
                <span className="text-4xl text-blue-500">＋</span>
                <span className="mt-3 font-black text-blue-800">Upload product photo</span>
                <span className="mt-1 text-xs text-blue-600">JPG, PNG or WebP</span>
              </label>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border overflow-hidden bg-white"
                >
                  <div className="h-44 bg-gray-50 flex items-center justify-center">
                    <img
                      src={r.url}
                      alt=""
                      className="max-h-44 w-full object-contain"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                  <div className="p-3 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 border text-xs ${
                          r.is_primary
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-gray-50 border-gray-200 text-gray-700"
                        }`}
                      >
                        {r.is_primary ? "Storefront cover" : "Gallery image"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!r.is_primary && (
                        <button
                          className="px-2.5 py-1.5 rounded-lg border hover:bg-gray-50"
                          onClick={() => setPrimary(r.id)}
                          title="Use as storefront cover"
                        >
                          Set as cover
                        </button>
                      )}
                      <button
                        className="px-2.5 py-1.5 rounded-lg border hover:bg-gray-50"
                        onClick={() => removeRow(r.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
