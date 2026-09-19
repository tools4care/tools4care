import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useToast } from "../hooks/useToast";

const DEFAULTS = {
  origin_name: "Salem, MA",
  origin_lat: 42.5195,
  origin_lng: -70.8967,
  free_delivery_radius_miles: 30,
  local_delivery_fee: 0,
  zone_30_50_fee: 9.99,
  zone_50_100_fee: 14.99,
  outside_zone_fee: 19.99,
  standard_fee: 6.99,
  standard_free_threshold: 75,
  express_fee: 14.99,
  pickup_enabled: true,
  local_delivery_enabled: true,
};

const MONEY_FIELDS = ["local_delivery_fee", "zone_30_50_fee", "zone_50_100_fee", "outside_zone_fee", "standard_fee", "standard_free_threshold", "express_fee"];

export default function ShippingSettings() {
  const { toast } = useToast();
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("online_shipping_settings").select("*").eq("id", true).maybeSingle();
      if (error) {
        // The app remains usable with defaults while the migration is being applied.
        console.warn("Shipping settings table unavailable; using defaults", error.message);
      } else if (data) setForm((current) => ({ ...current, ...data }));
      setLoading(false);
    })();
  }, []);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, id: true, updated_at: new Date().toISOString() };
    for (const key of [...MONEY_FIELDS, "origin_lat", "origin_lng", "free_delivery_radius_miles"]) {
      payload[key] = Number(payload[key]);
      if (!Number.isFinite(payload[key]) || payload[key] < 0) {
        toast.error(`Invalid value for ${key.replaceAll("_", " ")}.`);
        setSaving(false);
        return;
      }
    }
    const { error } = await supabase.from("online_shipping_settings").upsert(payload, { onConflict: "id" });
    if (error) toast.error(error.message);
    else toast.success("Shipping settings saved.");
    setSaving(false);
  }

  if (loading) return <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Loading shipping settings…</div>;

  const money = (key, label, help) => (
    <label className="block rounded-xl border bg-white p-4">
      <span className="block text-sm font-bold text-slate-800">{label}</span>
      {help && <span className="mt-1 block text-xs text-slate-500">{help}</span>}
      <div className="mt-3 flex items-center rounded-lg border bg-slate-50 px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <span className="font-bold text-slate-400">$</span>
        <input type="number" min="0" step="0.01" value={form[key] ?? ""} onChange={(e) => setField(key, e.target.value)} className="w-full bg-transparent px-2 py-2 text-sm font-bold outline-none" />
      </div>
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-black text-slate-900">Shipping settings</h1><p className="mt-1 text-sm text-slate-500">Configure local delivery, free-shipping radius, pickup, and distance-based fees.</p></div>
        <button disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Save settings"}</button>
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Delivery origin</h2>
        <p className="mt-1 text-sm text-slate-500">Distance is measured from this point. Use the exact business location for accurate zone assignment.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="sm:col-span-3"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Origin name</span><input value={form.origin_name} onChange={(e) => setField("origin_name", e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>
          <label><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Latitude</span><input type="number" step="0.000001" value={form.origin_lat} onChange={(e) => setField("origin_lat", e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
          <label><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Longitude</span><input type="number" step="0.000001" value={form.origin_lng} onChange={(e) => setField("origin_lng", e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
          <label><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Free radius (miles)</span><input type="number" min="0" step="0.1" value={form.free_delivery_radius_miles} onChange={(e) => setField("free_delivery_radius_miles", e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
        </div>
      </section>

      <section className="rounded-2xl border bg-slate-50 p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Distance-based delivery</h2>
        <p className="mt-1 text-sm text-slate-500">Recommended defaults: free local delivery up to 30 miles from Salem, then tiered fees.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {money("local_delivery_fee", "Local delivery", "Within the free radius")}
          {money("zone_30_50_fee", "30–50 miles", "North Shore / nearby areas")}
          {money("zone_50_100_fee", "50–100 miles", "Extended Massachusetts")}
          {money("outside_zone_fee", "Over 100 miles", "Fallback local delivery fee")}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Shipping methods</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {money("standard_fee", "Standard shipping", "Free when the order reaches the threshold below")}
          {money("standard_free_threshold", "Standard free threshold", "Order subtotal required")}
          {money("express_fee", "Express shipping", "1–2 business days")}
          <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
            <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-800"><span>Enable local delivery</span><input type="checkbox" checked={!!form.local_delivery_enabled} onChange={(e) => setField("local_delivery_enabled", e.target.checked)} className="h-5 w-5 accent-blue-600" /></label>
            <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-800"><span>Enable pickup in store</span><input type="checkbox" checked={!!form.pickup_enabled} onChange={(e) => setField("pickup_enabled", e.target.checked)} className="h-5 w-5 accent-blue-600" /></label>
          </div>
        </div>
      </section>
    </form>
  );
}
