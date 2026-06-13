import { useState } from "react";
import { ChevronDown, ChevronUp, CreditCard, FileText, Gift, History, RotateCcw, ShoppingBag, Wallet } from "lucide-react";

const money = (value) => {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  const safe = Math.abs(rounded) < 0.005 ? 0 : rounded;
  return `$${safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const configFor = (type) => ({
  purchase_record: { label: "Purchase / invoice", icon: ShoppingBag, color: "bg-indigo-500", amount: "text-indigo-700" },
  sale_payment: { label: "Purchase payment", icon: ShoppingBag, color: "bg-emerald-500", amount: "text-emerald-700" },
  ar_payment: { label: "A/R payment", icon: CreditCard, color: "bg-blue-500", amount: "text-emerald-700" },
  money_refund: { label: "Money refund", icon: RotateCcw, color: "bg-red-500", amount: "text-red-600" },
  ar_increase: { label: "Purchase charged to A/R", icon: FileText, color: "bg-amber-500", amount: "text-red-600" },
  ar_reduction: { label: "A/R reduced", icon: CreditCard, color: "bg-sky-500", amount: "text-blue-700" },
  store_credit_devolucion: { label: "Store credit created", icon: Gift, color: "bg-violet-500", amount: "text-violet-700" },
  store_credit_aplicado_venta: { label: "Store credit used", icon: Gift, color: "bg-purple-500", amount: "text-purple-700" },
  store_credit_ajuste: { label: "Store credit adjustment", icon: Gift, color: "bg-slate-500", amount: "text-slate-700" },
}[type] || { label: String(type || "Movement").replaceAll("_", " "), icon: Wallet, color: "bg-slate-500", amount: "text-slate-700" });

const formatDateTime = (value) => value
  ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  : "Unknown date";

export default function ClientFinancialTimeline({ entries = [], loading = false }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, 20);

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg mb-6 overflow-hidden">
      <div className="px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white flex items-center justify-between gap-3">
        <div>
          <h4 className="font-bold flex items-center gap-2 text-lg"><History size={20} /> Complete Account Timeline</h4>
          <p className="text-xs text-slate-300 mt-0.5">Purchases, payments, returns, A/R and store credit in one place</p>
        </div>
        <span className="text-xs font-bold bg-white/15 px-2.5 py-1 rounded-full">{entries.length} movements</span>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500">Loading account history…</div>
      ) : entries.length === 0 ? (
        <div className="p-8 text-center text-slate-500">No financial movements recorded for this customer.</div>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {visible.map((entry) => {
              const config = configFor(entry.event_type);
              const Icon = config.icon;
              const amount = Number(entry.amount || 0);
              const creditBalance = entry.metadata?.resulting_balance;
              return (
                <div key={entry.entry_key} className="px-4 sm:px-5 py-4 flex gap-3 hover:bg-slate-50 transition-colors">
                  <div className={`w-10 h-10 rounded-xl ${config.color} text-white flex items-center justify-center shrink-0 shadow-sm`}><Icon size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div>
                        <div className="font-bold text-slate-900">{config.label}</div>
                        <div className="text-xs text-slate-500">{formatDateTime(entry.occurred_at)} · {entry.description || entry.source_table}</div>
                      </div>
                      <div className={`font-black text-base ${config.amount}`}>{amount > 0 ? "+" : ""}{money(amount)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {entry.affects_cash && <span className="text-[10px] uppercase font-bold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">Money {amount >= 0 ? "received" : "returned"} · {entry.payment_method || "other"}</span>}
                      {!entry.affects_cash && <span className="text-[10px] uppercase font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">No cash movement</span>}
                      {entry.affects_ar && entry.balance_before != null && <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-full">A/R {money(entry.balance_before)} → {money(entry.balance_after)}</span>}
                      {creditBalance != null && <span className="text-[10px] font-bold bg-violet-50 text-violet-700 px-2 py-1 rounded-full">Store credit after: {money(creditBalance)}</span>}
                      {entry.event_type === "purchase_record" && <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">Paid {money(entry.metadata?.paid || 0)} · {entry.metadata?.status || "pending"}</span>}
                      {entry.source_id && <span className="text-[10px] font-mono text-slate-400 px-1 py-1">#{String(entry.source_id).slice(0, 8)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {entries.length > 20 && (
            <button type="button" onClick={() => setShowAll((value) => !value)} className="w-full py-3.5 bg-slate-50 hover:bg-slate-100 border-t text-sm font-bold text-slate-700 flex items-center justify-center gap-2">
              {showAll ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {showAll ? "Show recent movements" : `View all ${entries.length} movements`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
