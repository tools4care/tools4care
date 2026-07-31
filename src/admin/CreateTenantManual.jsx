import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { createTenant } from "./useCreateTenant";
import { listTenants, resendTenantInvite, setTenantStatus } from "../lib/adminApi";

const PLANS = [
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

const EMPTY_FORM = { businessName: "", ownerName: "", email: "", phone: "", plan: "basic" };

function fmtDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function copyText(value) {
  if (!value) return false;
  await navigator.clipboard.writeText(value);
  return true;
}

export default function CreateTenantManual() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [rowBusy, setRowBusy] = useState("");
  const [notice, setNotice] = useState("");

  const loadTenants = useCallback(async () => {
    setLoadingTenants(true);
    try {
      const response = await listTenants();
      setTenants(response.tenants || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load tenants.");
    } finally {
      setLoadingTenants(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  function handleChange(event) {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("loading");
    setError("");
    setNotice("");
    setResult(null);
    try {
      const response = await createTenant({
        ...form,
        businessName: form.businessName.trim(),
        ownerName: form.ownerName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
      });
      setResult(response);
      setStatus("success");
      setForm(EMPTY_FORM);
      await loadTenants();
    } catch (submitError) {
      setError(submitError.message || "Client could not be created.");
      setStatus("error");
    }
  }

  async function resendInvite(tenantId) {
    setRowBusy(tenantId);
    setError("");
    try {
      const response = await resendTenantInvite(tenantId);
      if (response.setupLink) await copyText(response.setupLink);
      setNotice(`A fresh setup link for ${response.email} was copied.`);
      await loadTenants();
    } catch (inviteError) {
      setError(inviteError.message || "Invitation could not be regenerated.");
    } finally {
      setRowBusy("");
    }
  }

  async function toggleStatus(tenant) {
    const nextStatus = tenant.status === "suspended" ? "active" : "suspended";
    setRowBusy(tenant.id);
    setError("");
    try {
      await setTenantStatus(tenant.id, nextStatus);
      setNotice(`${tenant.business_name} is now ${nextStatus}.`);
      await loadTenants();
    } catch (statusError) {
      setError(statusError.message || "Status could not be changed.");
    } finally {
      setRowBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <ShieldCheck size={25} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-950">New Tools4Care Client</h1>
            <p className="mt-1 text-sm text-slate-500">
              Creates the business workspace, owner account, initial store, access assignment and secure invitation.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Business name *</span>
            <input name="businessName" value={form.businessName} onChange={handleChange} required disabled={status === "loading"} className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Owner name *</span>
            <input name="ownerName" value={form.ownerName} onChange={handleChange} required disabled={status === "loading"} className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Owner email *</span>
            <input name="email" type="email" value={form.email} onChange={handleChange} required disabled={status === "loading"} className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Phone</span>
            <input name="phone" type="tel" value={form.phone} onChange={handleChange} disabled={status === "loading"} className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500" />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Plan</span>
            <select name="plan" value={form.plan} onChange={handleChange} disabled={status === "loading"} className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500">
              {PLANS.map((plan) => <option key={plan.value} value={plan.value}>{plan.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={status === "loading" || !form.businessName.trim() || !form.ownerName.trim() || !form.email.trim()} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 font-black text-white hover:bg-blue-700 disabled:opacity-50 md:col-span-2">
            {status === "loading" ? <><Loader2 size={18} className="animate-spin" /> Provisioning workspace...</> : "Create client workspace"}
          </button>
        </form>

        {result && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex items-center gap-2 font-black"><CheckCircle2 size={19} /> Workspace provisioned</div>
            <p className="mt-1">Invitation created for <strong>{result.email}</strong>. The client must open it and set a password.</p>
            {result.setupLink && (
              <button type="button" onClick={async () => { await copyText(result.setupLink); setNotice("Setup link copied."); }} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white">
                <Copy size={16} /> Copy backup setup link
              </button>
            )}
          </div>
        )}
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        {notice && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">{notice}</div>}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Client workspaces</h2>
            <p className="text-sm text-slate-500">{tenants.length} registered</p>
          </div>
          <button type="button" onClick={loadTenants} disabled={loadingTenants} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <RefreshCw size={18} className={loadingTenants ? "animate-spin" : ""} />
          </button>
        </div>

        {loadingTenants ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm font-bold text-slate-500"><Loader2 className="animate-spin" size={18} /> Loading workspaces...</div>
        ) : tenants.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No client workspaces yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tenants.map((tenant) => (
              <article key={tenant.id} className="grid gap-4 px-6 py-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-slate-950">{tenant.business_name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase ${
                      tenant.status === "active" ? "bg-emerald-100 text-emerald-700" :
                      tenant.status === "suspended" ? "bg-red-100 text-red-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>{tenant.status}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black uppercase text-slate-600">{tenant.plan}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{tenant.owner_name || "Owner"} · {tenant.email}</p>
                </div>
                <div className="text-xs leading-5 text-slate-500">
                  <div>Created: {fmtDate(tenant.created_at)}</div>
                  <div>Activated: {fmtDate(tenant.onboarding_completed_at)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => resendInvite(tenant.id)} disabled={rowBusy === tenant.id} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                    <Send size={14} /> New setup link
                  </button>
                  <button type="button" onClick={() => toggleStatus(tenant)} disabled={rowBusy === tenant.id} className={`rounded-xl px-3 py-2 text-xs font-black text-white disabled:opacity-50 ${tenant.status === "suspended" ? "bg-emerald-600" : "bg-red-600"}`}>
                    {tenant.status === "suspended" ? "Reactivate" : "Suspend"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
