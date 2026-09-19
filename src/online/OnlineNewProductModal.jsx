import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function OnlineNewProductModal({ open, onlineVanId, onClose, onCreated }) {
  const [form, setForm] = useState({ codigo: "", nombre: "", marca: "", categoria: "", costo: "", precio: "", price_online: "", cantidad: "0" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.codigo.trim() || !form.nombre.trim() || Number(form.precio) <= 0) {
      setError("Code, product name, and base price are required.");
      return;
    }
    setSaving(true);
    try {
      const product = {
        codigo: form.codigo.trim(), nombre: form.nombre.trim(), marca: form.marca.trim(),
        categoria: form.categoria.trim(), costo: form.costo === "" ? null : Number(form.costo),
        precio: Number(form.precio), size: null, suplidor_id: null, notas: "",
        descuento_pct: null, bulk_min_qty: null, bulk_unit_price: null,
      };
      const { data: productId, error: productError } = await supabase.rpc("create_product_with_initial_stock", {
        p_product: product,
        p_initial_quantity: Math.max(0, Number(form.cantidad) || 0),
        p_location: "van",
        p_van_id: onlineVanId,
      });
      if (productError) throw productError;
      const onlinePrice = form.price_online === "" ? null : Number(form.price_online);
      const { error: metaError } = await supabase.from("online_product_meta").upsert({
        producto_id: productId, price_online: onlinePrice, visible: true, visible_online: false,
      }, { onConflict: "producto_id" });
      if (metaError) throw metaError;
      onCreated?.(productId);
      onClose();
    } catch (e) {
      setError(e?.message || "Could not create the product.");
    } finally { setSaving(false); }
  }

  const fields = [
    ["codigo", "Code / UPC", true], ["nombre", "Product name", true], ["marca", "Brand", false],
    ["categoria", "Category", false], ["costo", "Cost", false], ["precio", "Base price", true],
    ["price_online", "Online price (optional)", false], ["cantidad", "Initial online stock", false],
  ];
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Online catalog</p><h2 className="text-xl font-black text-slate-900">Add new product</h2><p className="mt-1 text-sm text-slate-500">Creates the master product and assigns it to VAN Online.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm font-bold text-slate-600">Close</button>
        </div>
        {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {fields.map(([key, label, required]) => (
            <label key={key} className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}{required && " *"}</span><input required={required} type={key === "costo" || key === "precio" || key === "price_online" || key === "cantidad" ? "number" : "text"} min={key === "cantidad" ? 0 : key !== "codigo" && key !== "nombre" && key !== "marca" && key !== "categoria" ? 0 : undefined} step="0.01" value={form[key]} onChange={(e) => set(key, e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t pt-4"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? "Creating…" : "Create product"}</button></div>
      </form>
    </div>
  );
}
