import { useEffect, useMemo, useState } from "react";
import { Maximize2, Monitor, ShoppingBag } from "lucide-react";
import {
  CUSTOMER_DISPLAY_CHANNEL,
  customerDisplayStorageKey,
} from "../lib/customerDisplay";

const money = (value) => Number(value || 0).toLocaleString("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function readSnapshot(locationId) {
  if (!locationId) return null;
  try {
    return JSON.parse(localStorage.getItem(customerDisplayStorageKey(locationId)) || "null");
  } catch {
    return null;
  }
}

export default function CustomerDisplay() {
  const locationId = useMemo(() => new URLSearchParams(window.location.search).get("location"), []);
  const [snapshot, setSnapshot] = useState(() => readSnapshot(locationId));

  useEffect(() => {
    const accept = (next) => {
      if (next?.locationId === locationId) setSnapshot(next);
    };
    const onStorage = (event) => {
      if (event.key !== customerDisplayStorageKey(locationId) || !event.newValue) return;
      try { accept(JSON.parse(event.newValue)); } catch { /* ignore malformed local state */ }
    };
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL)
      : null;
    if (channel) channel.onmessage = (event) => accept(event.data);
    window.addEventListener("storage", onStorage);
    return () => {
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [locationId]);

  const items = snapshot?.items || [];
  const isPaid = snapshot && snapshot.remaining <= 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-4 text-white sm:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col sm:min-h-[calc(100vh-4rem)]">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 ring-1 ring-blue-300/20">
              <Monitor size={25} />
            </span>
            <div>
              <div className="text-xl font-black">TOOLS4CARE</div>
              <div className="text-sm text-blue-200">{snapshot?.locationName || "Customer Display"}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold hover:bg-white/15"
          >
            <Maximize2 size={17} /> Full Screen
          </button>
        </header>

        {!snapshot ? (
          <section className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="mb-5 flex h-24 w-24 items-center justify-center rounded-[30px] bg-white/10 text-blue-200">
              <ShoppingBag size={46} />
            </span>
            <h1 className="text-4xl font-black">Ready for your purchase</h1>
            <p className="mt-3 text-lg text-slate-300">Your items and totals will appear here.</p>
          </section>
        ) : (
          <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[1.35fr_0.65fr]">
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Current Purchase</div>
                  <h1 className="mt-1 text-2xl font-black">{snapshot.customerName}</h1>
                </div>
                <span className="rounded-full bg-blue-400/15 px-3 py-1 text-sm font-bold text-blue-200">
                  {items.reduce((sum, item) => sum + item.quantity, 0)} units
                </span>
              </div>
              <div className="max-h-[65vh] divide-y divide-white/10 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="p-12 text-center text-slate-300">Scan or add the first product.</div>
                ) : items.map((item) => (
                  <div key={item.id} className="flex items-center gap-5 px-6 py-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-lg font-black text-blue-200">
                      {item.quantity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold">{item.name}</div>
                      <div className="text-sm text-slate-400">{item.quantity} × {money(item.unitPrice)}</div>
                    </div>
                    <div className="text-xl font-black">{money(item.lineTotal)}</div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="flex flex-col rounded-3xl bg-white p-6 text-slate-950 shadow-2xl">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Order Summary</div>
              <div className="mt-5 space-y-3 text-lg">
                <div className="flex justify-between gap-4"><span className="text-slate-500">Subtotal</span><b>{money(snapshot.subtotal)}</b></div>
                {snapshot.tax.amount > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">{snapshot.tax.name} ({snapshot.tax.rate}%){snapshot.tax.included ? " included" : ""}</span>
                    <b>{money(snapshot.tax.amount)}</b>
                  </div>
                )}
                <div className="flex justify-between gap-4"><span className="text-slate-500">Purchase Total</span><b>{money(snapshot.purchaseTotal)}</b></div>
                {snapshot.previousBalance > 0 && (
                  <div className="flex justify-between gap-4"><span className="text-slate-500">Previous Balance</span><b>{money(snapshot.previousBalance)}</b></div>
                )}
              </div>
              <div className="my-6 border-t border-slate-200" />
              <div className="flex items-end justify-between gap-4">
                <span className="font-black uppercase tracking-wide text-slate-500">Total Due</span>
                <span className="text-5xl font-black text-blue-700">{money(snapshot.amountDue)}</span>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-100 p-4">
                  <div className="text-xs font-black uppercase text-slate-500">Paid</div>
                  <div className="mt-1 text-2xl font-black">{money(snapshot.paid)}</div>
                </div>
                <div className={`rounded-2xl p-4 ${isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                  <div className="text-xs font-black uppercase">{isPaid ? "Complete" : "Remaining"}</div>
                  <div className="mt-1 text-2xl font-black">{money(snapshot.remaining)}</div>
                </div>
              </div>
              {snapshot.change > 0 && (
                <div className="mt-3 rounded-2xl bg-emerald-600 p-5 text-white">
                  <div className="text-xs font-black uppercase tracking-wide text-emerald-100">Change to Customer</div>
                  <div className="mt-1 text-4xl font-black">{money(snapshot.change)}</div>
                </div>
              )}
              <div className="mt-auto pt-8 text-center text-sm font-semibold text-slate-400">Thank you for shopping with us.</div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
