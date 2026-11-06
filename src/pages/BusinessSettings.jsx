// src/pages/BusinessSettings.jsx
// Tenant self-service: the business name, address, phone, and logo that
// appear on this tenant's own invoices (PDF, email, portal) — resolved via
// resolveTenantBrand() in src/lib/tenantBrand.js. Only reachable by a
// tenant's own admin/supervisor (see Sidebar.jsx); the platform owner's
// own business (tenant_id null) keeps the Tools4Care defaults and never
// sees this page.
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { getBusinessInfo, updateBusinessInfo } from "../lib/adminApi";

const EMPTY_FORM = { businessName: "", address: "", phone: "", logoUrl: "" };

export default function BusinessSettings() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    getBusinessInfo()
      .then(({ tenant }) => {
        if (!alive || !tenant) return;
        setForm({
          businessName: tenant.business_name || "",
          address: tenant.address || "",
          phone: tenant.phone || "",
          logoUrl: tenant.logo_url || "",
        });
      })
      .catch((loadError) => { if (alive) setError(loadError.message || "Could not load business info."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  function handleChange(event) {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
    setSaved(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await updateBusinessInfo({
        businessName: form.businessName.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        logoUrl: form.logoUrl.trim(),
      });
      setSaved(true);
    } catch (submitError) {
      setError(submitError.message || "Could not save business info.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm font-bold text-slate-500">
        <Loader2 className="animate-spin" size={18} /> Loading business settings...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-black text-slate-950">Business Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          This is what shows up on your invoices — header, footer, email subject, and the "pay within 30 days" line.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Business name *</span>
            <input name="businessName" value={form.businessName} onChange={handleChange} required disabled={saving} className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Business address</span>
            <input name="address" value={form.address} onChange={handleChange} disabled={saving} placeholder="Appears on every invoice" className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Phone</span>
            <input name="phone" type="tel" value={form.phone} onChange={handleChange} disabled={saving} className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Logo URL</span>
            <input name="logoUrl" type="url" value={form.logoUrl} onChange={handleChange} disabled={saving} placeholder="Optional — leave blank for a text-only invoice header" className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500" />
          </label>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
          {saved && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              <CheckCircle2 size={18} /> Saved — new invoices will use this right away.
            </div>
          )}

          <button type="submit" disabled={saving || !form.businessName.trim()} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 font-black text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : "Save changes"}
          </button>
        </form>
      </section>
    </div>
  );
}
