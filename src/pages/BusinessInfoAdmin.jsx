import { useEffect, useState } from "react";
import { Contact, ExternalLink, Plus, Trash2 } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { useToast } from "../hooks/useToast";
import { useUsuario } from "../UsuarioContext";
import { DEFAULT_BUSINESS_INFO, fetchBusinessInfo, saveBusinessInfo } from "../lib/businessInfo";

const FIELDS = [
  ["name", "Business name"],
  ["tagline", "Tagline"],
  ["address", "Address"],
  ["email", "Email"],
  ["shopUrl", "Shop link (e.g. /storefront or a full URL)"],
  ["instagramHandle", "Instagram handle (displayed)"],
  ["instagramUrl", "Instagram URL"],
  ["venmoHandle", "Venmo handle (displayed)"],
  ["venmoUrl", "Venmo URL"],
];

export default function BusinessInfoAdmin() {
  const { usuario } = useUsuario();
  const { toast } = useToast();
  const [info, setInfo] = useState(DEFAULT_BUSINESS_INFO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchBusinessInfo().then((live) => {
      if (mounted) setInfo(live || DEFAULT_BUSINESS_INFO);
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const setField = (key, value) => setInfo((prev) => ({ ...prev, [key]: value }));

  const setContact = (idx, key, value) => setInfo((prev) => ({
    ...prev,
    contacts: prev.contacts.map((c, i) => (i === idx ? { ...c, [key]: value } : c)),
  }));

  const addContact = () => setInfo((prev) => ({
    ...prev,
    contacts: [...prev.contacts, { name: "", phone: "", whatsapp: "" }],
  }));

  const removeContact = (idx) => setInfo((prev) => ({
    ...prev,
    contacts: prev.contacts.filter((_, i) => i !== idx),
  }));

  const setCashapp = (idx, key, value) => setInfo((prev) => ({
    ...prev,
    cashapp: prev.cashapp.map((c, i) => (i === idx ? { ...c, [key]: value } : c)),
  }));

  const addCashapp = () => setInfo((prev) => ({
    ...prev,
    cashapp: [...prev.cashapp, { handle: "", url: "" }],
  }));

  const removeCashapp = (idx) => setInfo((prev) => ({
    ...prev,
    cashapp: prev.cashapp.filter((_, i) => i !== idx),
  }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBusinessInfo(info, usuario?.id);
      toast.success("Business info saved. Live on /info within a few seconds.");
    } catch (error) {
      toast.error(error?.message || "Could not save business info.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader icon={Contact} title="Business Info" subtitle="Edit the public /info landing page" color="purple" />
        <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6">Loading…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        icon={Contact}
        title="Business Info"
        subtitle="Content for the public /info landing page (the QR code on business cards)"
        color="purple"
      />

      <a
        href="/info"
        target="_blank"
        rel="noreferrer"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
      >
        View live page <ExternalLink size={14} />
      </a>

      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
              <input
                type="text"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                value={info[key] ?? ""}
                onChange={(e) => setField(key, e.target.value)}
              />
            </label>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">WhatsApp Contacts</h3>
            <button
              type="button"
              onClick={addContact}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus size={14} /> Add contact
            </button>
          </div>
          <div className="space-y-3">
            {info.contacts.map((c, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input
                  type="text"
                  placeholder="Name"
                  className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500"
                  value={c.name}
                  onChange={(e) => setContact(idx, "name", e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Display phone, e.g. (781) 953-1475"
                  className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500"
                  value={c.phone}
                  onChange={(e) => setContact(idx, "phone", e.target.value)}
                />
                <input
                  type="text"
                  placeholder="WhatsApp digits, e.g. 17819531475"
                  className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500"
                  value={c.whatsapp}
                  onChange={(e) => setContact(idx, "whatsapp", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeContact(idx)}
                  className="flex items-center justify-center rounded-lg bg-red-100 px-3 py-2 text-red-700 hover:bg-red-200"
                  aria-label="Remove contact"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Cash App Options</h3>
            <button
              type="button"
              onClick={addCashapp}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus size={14} /> Add option
            </button>
          </div>
          <div className="space-y-3">
            {info.cashapp.map((c, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  type="text"
                  placeholder="Handle, e.g. $4carebeauty"
                  className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500"
                  value={c.handle}
                  onChange={(e) => setCashapp(idx, "handle", e.target.value)}
                />
                <input
                  type="text"
                  placeholder="URL, e.g. https://cash.app/$4carebeauty"
                  className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500"
                  value={c.url}
                  onChange={(e) => setCashapp(idx, "url", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeCashapp(idx)}
                  className="flex items-center justify-center rounded-lg bg-red-100 px-3 py-2 text-red-700 hover:bg-red-200"
                  aria-label="Remove Cash App option"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400 sm:w-auto sm:px-6"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
