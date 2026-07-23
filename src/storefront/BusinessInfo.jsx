// src/storefront/BusinessInfo.jsx
// Public "digital business card" landing page — meant to be linked from a QR
// code on printed business cards. No POS providers/auth needed (routed
// standalone in main.jsx, same as Storefront/Checkout).
//
// Renders instantly with DEFAULT_BUSINESS_INFO (no loading spinner), then
// quietly swaps in the live row from Supabase if it differs — content stays
// editable (via the Business Info admin page) without ever blocking the
// first paint on a network round trip.
import { useEffect, useState } from "react";
import {
  Instagram, Mail, MapPin, MessageCircle, MessageSquare, Phone, ShoppingBag, X,
} from "lucide-react";
import { DEFAULT_BUSINESS_INFO, fetchBusinessInfo } from "../lib/businessInfo";

const VenmoIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M19.5 3H4.5A1.5 1.5 0 0 0 3 4.5v15A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 3ZM15.7 8.4c.4.66.58 1.34.58 2.2 0 2.74-2.34 6.3-4.24 8.8H8.16L6.7 8.9l2.98-.28.77 6.24c.72-1.18 1.62-3.02 1.62-4.28 0-.69-.12-1.16-.3-1.55l2.93-.63Z"/></svg>
);
const CashAppIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M17.7 2.4A2 2 0 0 0 16.3 2H7.7a2 2 0 0 0-1.4.6L2.6 6.3A2 2 0 0 0 2 7.7v8.6a2 2 0 0 0 .6 1.4l3.7 3.7a2 2 0 0 0 1.4.6h8.6a2 2 0 0 0 1.4-.6l3.7-3.7a2 2 0 0 0 .6-1.4V7.7a2 2 0 0 0-.6-1.4ZM15 9.6l-.9.9a2.6 2.6 0 0 0-1.8-.8c-.5 0-1 .2-1 .7 0 .5.6.7 1.4 1 1.2.4 2.7.9 2.7 2.7 0 1.5-1.1 2.4-2.5 2.7l-.3 1.2h-1.4l.3-1.2a3.6 3.6 0 0 1-2.3-1.2l1-1a2.6 2.6 0 0 0 2 .9c.6 0 1.1-.3 1.1-.8 0-.6-.6-.8-1.6-1.1-1.2-.4-2.5-1-2.5-2.6 0-1.3 1-2.2 2.3-2.5l.3-1.2h1.4l-.3 1.2c.7.2 1.3.6 1.7 1.1Z"/></svg>
);

const mapsUrl = (address) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

function ActionSheet({ title, options, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-neutral-900 p-2 pb-[max(env(safe-area-inset-bottom),16px)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="text-sm font-bold text-white/60">{title}</span>
          <button onClick={onClose} className="rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-1">
          {options.map((opt) => (
            <a
              key={opt.label}
              href={opt.href}
              target={opt.external ? "_blank" : undefined}
              rel={opt.external ? "noreferrer" : undefined}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 font-semibold text-white transition-colors hover:bg-white/5 active:bg-white/10"
              onClick={onClose}
            >
              {opt.icon}
              {opt.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BusinessInfo() {
  const [info, setInfo] = useState(DEFAULT_BUSINESS_INFO);
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchBusinessInfo().then((live) => {
      if (mounted && live) setInfo(live);
    });
    return () => { mounted = false; };
  }, []);

  const openContactSheet = (c) => setSheet({
    title: c.name,
    options: [
      { label: "Call", href: `tel:+${c.whatsapp}`, icon: <Phone size={20} className="text-lime-400" /> },
      { label: "Text Message", href: `sms:+${c.whatsapp}`, icon: <MessageSquare size={20} className="text-lime-400" /> },
      { label: "WhatsApp", href: `https://wa.me/${c.whatsapp}`, icon: <MessageCircle size={20} className="text-lime-400" />, external: true },
    ],
  });

  const openCashAppSheet = () => setSheet({
    title: "Cash App",
    options: info.cashapp.map((ca) => ({
      label: ca.handle,
      href: ca.url,
      icon: <CashAppIcon className="h-5 w-5 text-lime-400" />,
      external: true,
    })),
  });

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center px-5 py-12 sm:px-6 sm:py-14">
      <img
        src="/icons/icon-512.png"
        alt={info.name}
        className="h-20 w-20 rounded-2xl shadow-lg shadow-lime-500/20 sm:h-24 sm:w-24"
      />
      <h1 className="mt-5 text-2xl font-black tracking-tight sm:mt-6 sm:text-3xl">{info.name}</h1>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-lime-400">
        {info.tagline}
      </p>

      <div className="mt-8 w-full max-w-sm space-y-3 sm:mt-10">
        <a
          href={info.shopUrl}
          className="flex items-center justify-center gap-2 rounded-2xl bg-lime-400 py-4 text-lg font-black text-black shadow-lg shadow-lime-500/30 transition-transform active:scale-95"
        >
          <ShoppingBag size={22} /> Shop Now
        </a>

        {info.contacts.map((c) => (
          <button
            key={c.whatsapp}
            type="button"
            onClick={() => openContactSheet(c)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-left transition-transform active:scale-95"
          >
            <div className="min-w-0">
              <div className="font-bold">{c.name}</div>
              <div className="text-sm text-white/60">{c.phone}</div>
            </div>
            <MessageCircle className="shrink-0 text-lime-400" size={24} />
          </button>
        ))}

        <a
          href={mapsUrl(info.address)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 transition-transform active:scale-95"
        >
          <MapPin className="shrink-0 text-lime-400" size={24} />
          <span className="text-sm">{info.address}</span>
        </a>

        <a
          href={`mailto:${info.email}`}
          className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 transition-transform active:scale-95"
        >
          <Mail className="shrink-0 text-lime-400" size={24} />
          <span className="text-sm break-all">{info.email}</span>
        </a>

        <a
          href={info.instagramUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-4 font-bold transition-transform active:scale-95"
        >
          <Instagram className="text-lime-400" size={22} /> {info.instagramHandle}
        </a>

        <div className="grid grid-cols-2 gap-3">
          <a
            href={info.venmoUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 py-4 font-bold transition-transform active:scale-95"
          >
            <VenmoIcon className="h-6 w-6 text-lime-400" />
            <span className="text-xs text-white/70">{info.venmoHandle}</span>
          </a>
          <button
            type="button"
            onClick={openCashAppSheet}
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 py-4 font-bold transition-transform active:scale-95"
          >
            <CashAppIcon className="h-6 w-6 text-lime-400" />
            <span className="text-xs text-white/70">Cash App</span>
          </button>
        </div>
      </div>

      <p className="mt-12 text-xs text-white/30 sm:mt-14">© {new Date().getFullYear()} {info.name}</p>

      {sheet && <ActionSheet title={sheet.title} options={sheet.options} onClose={() => setSheet(null)} />}
    </main>
  );
}
