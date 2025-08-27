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

export default function ProductImagesPanel({ open, productoId, onClose }) {
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
        "¿Eliminar esta imagen de la base de datos? (el archivo en Storage no se borra en este paso)"
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              Imágenes del producto #{productoId}
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg border px-3 py-1.5 hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>

          <div className="mt-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 cursor-pointer">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
              />
              📤 Subir imagen
            </label>
          </div>

          {err && (
            <div className="mt-3 p-3 text-sm rounded bg-rose-50 text-rose-700 border border-rose-200">
              {err}
            </div>
          )}

          <div className="mt-4">
            {loading && (
              <div className="text-sm text-gray-500">Procesando…</div>
            )}

            {!loading && rows.length === 0 && (
              <div className="text-sm text-gray-500">
                Aún no hay imágenes para este producto.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border overflow-hidden bg-white"
                >
                  <div className="h-40 bg-gray-50 flex items-center justify-center">
                    <img
                      src={r.url}
                      alt=""
                      className="max-h-40 w-full object-contain"
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
                        {r.is_primary ? "Principal" : "Secundaria"}
                      </span>
                      <span className="text-xs text-gray-500">#{r.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!r.is_primary && (
                        <button
                          className="px-2.5 py-1.5 rounded-lg border hover:bg-gray-50"
                          onClick={() => setPrimary(r.id)}
                          title="Marcar como principal"
                        >
                          Hacer principal
                        </button>
                      )}
                      <button
                        className="px-2.5 py-1.5 rounded-lg border hover:bg-gray-50"
                        onClick={() => removeRow(r.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Nota: Por simplicidad, al eliminar aquí solo se borra el registro
              en BD. El borrado del archivo en Storage es opcional y se puede
              añadir después.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
