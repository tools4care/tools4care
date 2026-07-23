// src/storefront/BusinessInfo.jsx
// Public "digital business card" landing page — meant to be linked from a QR
// code on printed business cards. No POS providers/auth needed (routed
// standalone in main.jsx, same as Storefront/Checkout).
import { Instagram, MapPin, MessageCircle, ShoppingBag } from "lucide-react";

const BUSINESS = {
  name: "Tools4Care",
  tagline: "Beauty & Barber Supply",
  address: "108 Lafayette St, Salem, MA 01970",
  instagramHandle: "@tools4care",
  instagramUrl: "https://www.instagram.com/tools4care",
  shopUrl: "/storefront",
  contacts: [
    { name: "Jorge Ortiz", phone: "(781) 953-1475", whatsapp: "17819531475" },
    { name: "Edwin Evangelista", phone: "(857) 856-0030", whatsapp: "18578560030" },
  ],
};

const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(BUSINESS.address)}`;

export default function BusinessInfo() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center px-6 py-14">
      <img
        src="/icons/icon-512.png"
        alt={BUSINESS.name}
        className="h-24 w-24 rounded-2xl shadow-lg shadow-lime-500/20"
      />
      <h1 className="mt-6 text-3xl font-black tracking-tight">{BUSINESS.name}</h1>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-lime-400">
        {BUSINESS.tagline}
      </p>

      <div className="mt-10 w-full max-w-sm space-y-3">
        <a
          href={BUSINESS.shopUrl}
          className="flex items-center justify-center gap-2 rounded-2xl bg-lime-400 py-4 text-lg font-black text-black shadow-lg shadow-lime-500/30 transition-transform active:scale-95"
        >
          <ShoppingBag size={22} /> Shop Now
        </a>

        {BUSINESS.contacts.map((c) => (
          <a
            key={c.whatsapp}
            href={`https://wa.me/${c.whatsapp}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-5 py-4 transition-transform active:scale-95"
          >
            <div>
              <div className="font-bold">{c.name}</div>
              <div className="text-sm text-white/60">{c.phone}</div>
            </div>
            <MessageCircle className="shrink-0 text-lime-400" size={24} />
          </a>
        ))}

        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 transition-transform active:scale-95"
        >
          <MapPin className="shrink-0 text-lime-400" size={24} />
          <span className="text-sm">{BUSINESS.address}</span>
        </a>

        <a
          href={BUSINESS.instagramUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-4 font-bold transition-transform active:scale-95"
        >
          <Instagram className="text-lime-400" size={22} /> {BUSINESS.instagramHandle}
        </a>
      </div>

      <p className="mt-14 text-xs text-white/30">© {new Date().getFullYear()} {BUSINESS.name}</p>
    </main>
  );
}
