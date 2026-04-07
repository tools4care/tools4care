import React, { useEffect, useMemo, useState, lazy, Suspense, useCallback } from "react";
import { useSyncGlobal } from "./hooks/SyncContext";
import { supabase } from "./supabaseClient";
import dayjs from "dayjs";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ReferenceLine,
  ComposedChart,
  Cell,
} from "recharts";

const PAGE_SIZE_DEFAULT = 25;
const CXC_SECRET = "#cxcadmin2025";

// Lazy load credit simulator
const SimuladorCredito = lazy(() => import("./CreditoSimulador"));

/* ====================== IMPORTANT: Viewport Meta Tag ====================== 
 * Make sure your HTML includes this meta tag for proper mobile rendering:
 * 
 * <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
 * 
 * This ensures:
 * - Proper scaling on all devices
 * - Safe areas for iOS notch/home indicator
 * - Prevents zoom on input focus
 * ========================================================================= */

/* ====================== Global Styles for Safe Areas ====================== */
const globalStyles = `
  /* iOS Safe Areas - Critical for iPhone X and newer */
  @supports (padding-top: env(safe-area-inset-top)) {
    .pt-safe {
      padding-top: max(1rem, env(safe-area-inset-top));
    }
    .pb-safe {
      padding-bottom: max(1rem, env(safe-area-inset-bottom));
    }
    .pl-safe {
      padding-left: max(0.5rem, env(safe-area-inset-left));
    }
    .pr-safe {
      padding-right: max(0.5rem, env(safe-area-inset-right));
    }
  }

  /* Prevent zoom on iOS inputs - CRITICAL */
  input[type="text"],
  input[type="number"],
  input[type="email"],
  input[type="tel"],
  input[type="search"],
  textarea,
  select {
    font-size: 16px !important;
  }

  /* Smooth scroll for all platforms */
  html {
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
  }

  /* Better touch targets and feedback */
  button, a, [role="button"] {
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
    touch-action: manipulation;
    min-height: 44px; /* iOS Human Interface Guidelines */
  }

  /* Fix for iOS Safari bottom bar */
  body {
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }

  /* Disable pull-to-refresh on mobile */
  body {
    overscroll-behavior-y: contain;
  }

  /* Better modal rendering */
  .modal-backdrop {
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
`;

// Inject styles once
if (typeof document !== 'undefined' && !document.getElementById('mobile-safe-styles')) {
  const styleSheet = document.createElement("style");
  styleSheet.id = 'mobile-safe-styles';
  styleSheet.textContent = globalStyles;
  document.head.appendChild(styleSheet);
}

/* ====================== Helpers ====================== */
function currency(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));
}
function fmt(n) {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function fmtDate(raw) {
  if (!raw) return "—";
  return dayjs(raw).format("MMM D, YYYY");
}
function parseAddr(raw) {
  if (!raw) return "";
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (obj && typeof obj === "object") {
      return [obj.calle, obj.ciudad, obj.estado, obj.zip].filter(Boolean).join(", ");
    }
  } catch {}
  return String(raw);
}
function scoreColor(score) {
  const s = Number(score || 0);
  if (s >= 750) return { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" };
  if (s >= 650) return { bg: "bg-blue-100",  text: "text-blue-800",  border: "border-blue-300"  };
  if (s >= 550) return { bg: "bg-yellow-100",text: "text-yellow-800",border: "border-yellow-300"};
  if (s >= 400) return { bg: "bg-orange-100",text: "text-orange-800",border: "border-orange-300"};
  return              { bg: "bg-red-100",   text: "text-red-800",   border: "border-red-300"   };
}
const normalizePhone = (raw) => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
};
const openWhatsAppWith = (telefono, texto) => {
  const to = normalizePhone(telefono);
  if (!to) { alert("This customer doesn't have a valid phone number."); return; }
  const url = `https://wa.me/${to.replace("+","")}?text=${encodeURIComponent(texto || "")}`;
  window.open(url, "_blank");
};

/* ========= Config ========= */
const COMPANY_NAME  = import.meta.env?.VITE_COMPANY_NAME  || "Care Beauty Supply";
const PAY_URL       = import.meta.env?.VITE_PAY_URL       || "https://carebeautysupply.carrd.co/";
const CONTACT_EMAIL = import.meta.env?.VITE_CONTACT_EMAIL || "tools4care@gmail.com";
const CONTACT_PHONE = import.meta.env?.VITE_CONTACT_PHONE || "+1 (781) 953-1475";

/* ========= Templates ========= */
const DEFAULT_TEMPLATES = [
  {
    key: "en_pro",
    name: "🇺🇸 Professional",
    body: `Hello {cliente}, this is {company}.\nFriendly reminder: Balance {saldo}.\nPay here: {pay_url}\nQuestions? {email} or {phone}\nThank you!`
  },
  {
    key: "en_short",
    name: "🇺🇸 Short",
    body: `{company} — Balance {saldo}. Pay: {pay_url} · Help: {phone}`
  },
  {
    key: "es_pro",
    name: "🇪🇸 Professional",
    body: `Hola {cliente}, le escribe {company}.\nRecordatorio: Saldo {saldo}.\nPagar: {pay_url}\nDudas? {email} o {phone}\n¡Gracias!`
  },
  {
    key: "es_short",
    name: "🇪🇸 Short",
    body: `{company} — Saldo {saldo}. Pagar: {pay_url} · Ayuda: {phone}`
  }
];

function loadUserTemplates() {
  try {
    const raw = localStorage.getItem("cxcTemplatesV2");
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveUserTemplates(list) {
  try { localStorage.setItem("cxcTemplatesV2", JSON.stringify(list)); } catch {}
}

function renderTemplate(tplBody, ctx) {
  const replace = (s, k, v) => s.replaceAll(`{${k}}`, v ?? "");
  let out = tplBody;
  const map = {
    cliente: ctx.cliente,
    saldo: currency(ctx.saldo),
    total: currency(ctx.total_cxc ?? 0),
    company: ctx.company,
    pay_url: ctx.pay_url,
    email: ctx.email,
    phone: ctx.phone,
  };
  Object.entries(map).forEach(([k, v]) => { out = replace(out, k, String(v ?? "")); });
  return out.trim();
}

/* ====================== Icon Components ====================== */
const IconChart = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const IconHistory = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconTrending = ({ up }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {up ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    )}
  </svg>
);

/* ====================== Customer History Modal ====================== */
function CustomerHistoryModal({ cliente, onClose }) {
  const [loading, setLoading] = useState(true);
  const [historyData, setHistoryData] = useState({
    monthlyBalance: [],
    monthlyPurchases: [],
    scoreHistory: [],
    paymentHistory: [],
  });
  const [activeTab, setActiveTab] = useState("balance");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    loadHistoryData();
  }, [cliente?.cliente_id]);

  async function loadHistoryData() {
    if (!cliente?.cliente_id) return;
    setLoading(true);
    try {
      const sixMonthsAgo = dayjs().subtract(6, 'month').format('YYYY-MM-DD');

      // ── Fetch ventas AND direct pagos in parallel ──────────────────────────
      const [ventasRes, pagosRes] = await Promise.all([
        supabase
          .from('ventas')
          .select('id, fecha, total, estado_pago, total_pagado, metodo_pago')
          .eq('cliente_id', cliente.cliente_id)
          .gte('fecha', sixMonthsAgo)
          .order('fecha', { ascending: true }),
        supabase
          .from('pagos')
          .select('id, fecha_pago, monto, metodo_pago')
          .eq('cliente_id', cliente.cliente_id)
          .gte('fecha_pago', sixMonthsAgo)
          .order('fecha_pago', { ascending: true }),
      ]);

      const ventas = ventasRes.data || [];
      const pagos  = pagosRes.data  || [];

      // ── Build monthly buckets ──────────────────────────────────────────────
      const last6Months = [];
      const monthlyData = {};
      for (let i = 5; i >= 0; i--) {
        const key = dayjs().subtract(i, 'month').format('YYYY-MM');
        last6Months.push(key);
        monthlyData[key] = {
          month: dayjs().subtract(i, 'month').format('MMM YY'),
          purchases: 0, payments: 0, transactions: 0, directPayments: 0,
        };
      }

      ventas.forEach(v => {
        const key = dayjs(v.fecha).format('YYYY-MM');
        if (monthlyData[key]) {
          monthlyData[key].purchases  += Number(v.total        || 0);
          monthlyData[key].payments   += Number(v.total_pagado || 0);
          monthlyData[key].transactions += 1;
        }
      });
      pagos.forEach(p => {
        const key = dayjs(p.fecha_pago).format('YYYY-MM');
        if (monthlyData[key]) {
          monthlyData[key].payments       += Number(p.monto || 0);
          monthlyData[key].directPayments += Number(p.monto || 0);
        }
      });

      // ── Monthly balance trend ──────────────────────────────────────────────
      let running = 0;
      const monthlyBalance = last6Months.map(key => {
        const d = monthlyData[key];
        running += d.purchases - d.payments;
        return { ...d, balance: Math.max(0, running) };
      });

      // ── Real Score Factors ─────────────────────────────────────────────────
      const total   = ventas.length;
      const pagadas = ventas.filter(v => v.estado_pago === 'pagado').length;
      const parciales = ventas.filter(v =>
        v.estado_pago !== 'pagado' && Number(v.total_pagado) > 0
      ).length;
      const sinPago = ventas.filter(v => !Number(v.total_pagado)).length;

      const payHistPct = total > 0 ? Math.round((pagadas / total) * 100) : 0;
      const utilPct    = Number(cliente.limite_politica) > 0
        ? Math.min(100, Math.round((Number(cliente.saldo) / Number(cliente.limite_politica)) * 100))
        : 0;
      const monthsWithAct = last6Months.filter(k => monthlyData[k].transactions > 0).length;
      const monthsWithPay = last6Months.filter(k => monthlyData[k].payments > 0).length;
      const activityPct   = Math.round((monthsWithAct / 6) * 100);
      const consistPct    = Math.round((monthsWithPay / 6) * 100);

      const scoreFactors = [
        { label: 'Payment History',    value: payHistPct,          color: 'bg-green-500',  desc: `${pagadas} of ${total} invoices fully paid` },
        { label: 'Credit Utilization', value: Math.max(0, 100 - utilPct), color: 'bg-blue-500', desc: `${utilPct}% of limit currently used` },
        { label: 'Purchase Activity',  value: activityPct,         color: 'bg-purple-500', desc: `Active in ${monthsWithAct} of 6 months` },
        { label: 'Payment Consistency',value: consistPct,          color: 'bg-indigo-500', desc: `Payments in ${monthsWithPay} of 6 months` },
      ];

      // ── Combined payment list (ventas + pagos directos) ───────────────────
      const allPayments = [];
      ventas.filter(v => Number(v.total_pagado) > 0).forEach(v => {
        allPayments.push({
          date:   fmtDate(v.fecha),
          rawDate: v.fecha,
          amount: Number(v.total_pagado),
          total:  Number(v.total),
          method: v.metodo_pago || '—',
          type:   v.estado_pago === 'pagado' ? 'full' : 'partial',
        });
      });
      pagos.forEach(p => {
        allPayments.push({
          date:    fmtDate(p.fecha_pago),
          rawDate: p.fecha_pago,
          amount:  Number(p.monto),
          total:   null,
          method:  p.metodo_pago || '—',
          type:    'direct',
        });
      });
      allPayments.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

      // ── Aggregate stats ────────────────────────────────────────────────────
      const totalPurchases6m = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
      const totalPaid6m      = ventas.reduce((s, v) => s + Number(v.total_pagado || 0), 0)
                             + pagos.reduce((s, p)  => s + Number(p.monto || 0), 0);
      const avgPurchase      = total > 0 ? totalPurchases6m / total : 0;
      const purchaseFreq     = +(total / 6).toFixed(1);
      const recent3  = last6Months.slice(3).reduce((s, k) => s + monthlyData[k].purchases, 0);
      const prev3    = last6Months.slice(0, 3).reduce((s, k) => s + monthlyData[k].purchases, 0);
      const seasonalTrend = prev3 > 0 ? Math.round(((recent3 - prev3) / prev3) * 100) : 0;

      // ── Score History mensual (Health Score 0-100 por mes) ───────────────
      // Calcula comportamiento crediticio mes a mes con los datos disponibles
      const scoreHistory = last6Months.map((key) => {
        const d = monthlyData[key];

        // PPR del mes (pagos ÷ compras)
        const pprMes = d.purchases > 0
          ? Math.min(d.payments / d.purchases, 2)
          : d.payments > 0 ? 2.0 : 0;

        // Health base = 50 neutro
        let h = 50;

        // PPR del mes (peso: 40pts)
        if      (pprMes >= 1.4) h += 40;
        else if (pprMes >= 1.2) h += 32;
        else if (pprMes >= 1.0) h += 22;
        else if (pprMes >= 0.8) h += 12;
        else if (pprMes >= 0.5) h +=  2;
        else if (pprMes >  0  ) h -= 12;
        else                    h -= 25; // sin actividad ni pago

        // Bonus por actividad y consistencia (peso: 10pts)
        if (d.transactions > 0) h += 5;
        if (d.payments > 0)     h += 5;
        // Pago sin compra nueva = señal muy positiva (pagando deuda vieja)
        if (d.payments > 0 && d.transactions === 0) h += 10;

        const health = Math.max(0, Math.min(100, Math.round(h)));
        const label = health >= 80 ? 'Excelente' : health >= 65 ? 'Bueno'
                    : health >= 50 ? 'Estable'   : health >= 35 ? 'Alerta' : 'Crítico';

        return {
          month: d.month,
          health,
          ppr: Number(pprMes.toFixed(2)),
          pagos: d.payments,
          compras: d.purchases,
          label,
        };
      });

      // ── Dynamic recommendations ───────────────────────────────────────────
      const recs = [];
      if (payHistPct >= 80)
        recs.push({ icon: '✅', text: `Strong payment record — ${payHistPct}% of invoices fully paid.` });
      else if (payHistPct >= 50)
        recs.push({ icon: '⚠️', text: `${sinPago} invoices with no payment. Follow up to reduce balance.` });
      else
        recs.push({ icon: '🔴', text: `High unpaid rate (${100 - payHistPct}%). Consider tightening credit terms.` });

      if (utilPct >= 90)
        recs.push({ icon: '⚠️', text: `Credit limit almost exhausted (${utilPct}% used). Prioritize collection.` });
      else if (utilPct <= 30 && total > 0)
        recs.push({ icon: '✅', text: `Good credit headroom — only ${utilPct}% of limit used.` });

      if (seasonalTrend > 10)
        recs.push({ icon: '📈', text: `Purchases up ${seasonalTrend}% vs previous 3 months.` });
      else if (seasonalTrend < -10)
        recs.push({ icon: '📉', text: `Purchases down ${Math.abs(seasonalTrend)}% vs previous 3 months.` });

      if (recs.length === 0)
        recs.push({ icon: '→', text: 'Keep monitoring payment trends each month.' });

      setHistoryData({
        monthlyBalance,
        monthlyPurchases: monthlyBalance,
        scoreFactors,
        scoreHistory,
        paymentHistory: allPayments.slice(0, 20),
        stats: {
          totalPurchases: totalPurchases6m,
          totalPaid: totalPaid6m,
          avgPurchase,
          purchaseFreq,
          seasonalTrend,
          pagadas, parciales, sinPago, total,
        },
        recs,
      });
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { key: 'balance', label: 'Balance History', icon: '💰' },
    { key: 'score', label: 'Credit Score', icon: '📊' },
    { key: 'payments', label: 'Payments', icon: '💳' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center overflow-hidden">
      {/* Mobile: Full screen con safe areas */}
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl shadow-2xl flex flex-col sm:m-4">
        {/* Header - Más grande en móviles con safe area */}
        <div className="flex-shrink-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white pt-safe pb-4 px-4 sm:px-6 sm:py-6 shadow-lg">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 mb-2">
                <IconHistory />
                <div className="font-bold text-xl sm:text-2xl">Customer History</div>
              </div>
              <div className="text-base sm:text-lg text-indigo-100 truncate font-semibold">
                {cliente?.cliente_nombre || cliente?.cliente}
              </div>
              <div className="text-sm text-indigo-200 mt-1">Last 6 months analysis</div>
            </div>
            <button 
              onClick={onClose} 
              className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white text-2xl font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs - Sticky con mejor touch targets */}
        <div className="flex-shrink-0 bg-white border-b-2 border-gray-200 overflow-x-auto">
          <div className="flex gap-1 px-4 min-w-max">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base font-semibold whitespace-nowrap border-b-4 transition-all min-h-[48px] flex items-center gap-2 ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content - Scrollable con padding para safe area */}
        <div className="flex-1 overflow-y-auto pb-safe">
          <div className="p-4 sm:p-6 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-600 border-t-transparent mb-4"></div>
                <div className="text-gray-600 font-semibold text-lg">Loading history...</div>
              </div>
            ) : (
              <>
                {/* Balance Tab */}
                {activeTab === 'balance' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200 rounded-xl p-4 min-h-[100px] flex flex-col justify-center">
                        <div className="text-red-600 text-xs font-bold uppercase mb-2">Current Balance</div>
                        <div className="text-3xl sm:text-4xl font-bold text-red-700">{fmt(cliente?.saldo || 0)}</div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 min-h-[100px] flex flex-col justify-center">
                        <div className="text-blue-600 text-xs font-bold uppercase mb-2">Credit Limit</div>
                        <div className="text-3xl sm:text-4xl font-bold text-blue-700">{fmt(cliente?.limite_politica || 0)}</div>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 min-h-[100px] flex flex-col justify-center">
                        <div className="text-green-600 text-xs font-bold uppercase mb-2">Available</div>
                        <div className="text-3xl sm:text-4xl font-bold text-green-700">{fmt(cliente?.credito_disponible || 0)}</div>
                      </div>
                    </div>

                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6">
                      <div className="flex items-start justify-between mb-4 gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                          <IconChart />
                          Balance Evolution
                        </h3>
                        {Number(cliente?.limite_politica) > 0 && (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 whitespace-nowrap">
                            <svg width="14" height="6" viewBox="0 0 14 6"><line x1="0" y1="3" x2="14" y2="3" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 2"/></svg>
                            Limit {fmt(cliente.limite_politica)}
                          </div>
                        )}
                      </div>
                      <div className="h-72 sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={historyData.monthlyBalance} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.75}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.04}/>
                              </linearGradient>
                              <linearGradient id="gradPayments" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 11, fill: '#9ca3af' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fill: '#9ca3af' }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`}
                              width={54}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                                padding: '10px 14px',
                                fontSize: '12px',
                              }}
                              labelStyle={{ fontWeight: 700, color: '#111827', marginBottom: '6px', fontSize: '13px' }}
                              formatter={(value, name) => {
                                if (name === 'balance')  return [currency(value), '💜 Outstanding Balance'];
                                if (name === 'payments') return [currency(value), '💚 Monthly Payments'];
                                return [currency(value), name];
                              }}
                            />
                            <Legend
                              iconType="circle"
                              iconSize={8}
                              formatter={(name) => name === 'balance' ? 'Outstanding Balance' : 'Monthly Payments'}
                              wrapperStyle={{ paddingTop: '14px', fontSize: '12px', color: '#6b7280' }}
                            />
                            {Number(cliente?.limite_politica) > 0 && (
                              <ReferenceLine
                                y={Number(cliente.limite_politica)}
                                stroke="#f59e0b"
                                strokeDasharray="6 4"
                                strokeWidth={2}
                                label={{ value: 'Credit Limit', fill: '#d97706', fontSize: 10, fontWeight: 600, position: 'insideTopRight', offset: 6 }}
                              />
                            )}
                            <Area
                              type="monotone"
                              dataKey="payments"
                              name="payments"
                              stroke="#10b981"
                              strokeWidth={1.5}
                              fill="url(#gradPayments)"
                              dot={false}
                              activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                            />
                            <Area
                              type="monotone"
                              dataKey="balance"
                              name="balance"
                              stroke="#6366f1"
                              strokeWidth={2.5}
                              fill="url(#gradBalance)"
                              dot={{ r: 3.5, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                              activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6">
                      <div className="mb-4">
                        <h3 className="font-bold text-gray-900 text-lg">Monthly Cash Flow</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Purchases billed vs payments collected each month</p>
                      </div>
                      <div className="h-72 sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={historyData.monthlyPurchases} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gradPurchasesBar" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.9}/>
                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.7}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 11, fill: '#9ca3af' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fill: '#9ca3af' }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`}
                              width={54}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                                padding: '10px 14px',
                                fontSize: '12px',
                              }}
                              labelStyle={{ fontWeight: 700, color: '#111827', marginBottom: '6px', fontSize: '13px' }}
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                const p = payload[0]?.payload || {};
                                const net = (p.purchases || 0) - (p.payments || 0);
                                return (
                                  <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '10px 14px', fontSize: '12px' }}>
                                    <div style={{ fontWeight: 700, color: '#111827', marginBottom: '8px', fontSize: '13px' }}>{label}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '4px' }}>
                                      <span style={{ color: '#6b7280' }}>🛒 Purchases</span>
                                      <span style={{ fontWeight: 600, color: '#3b82f6' }}>{currency(p.purchases || 0)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '4px' }}>
                                      <span style={{ color: '#6b7280' }}>💚 Payments</span>
                                      <span style={{ fontWeight: 600, color: '#10b981' }}>{currency(p.payments || 0)}</span>
                                    </div>
                                    <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                                      <span style={{ color: '#6b7280' }}>{net > 0 ? '📈 Net owed' : '✅ Net paid'}</span>
                                      <span style={{ fontWeight: 700, color: net > 0 ? '#f59e0b' : '#10b981' }}>{currency(Math.abs(net))}</span>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Legend
                              iconType="square"
                              iconSize={10}
                              formatter={(name) => name === 'purchases' ? 'Purchases' : name === 'payments' ? 'Payments' : name}
                              wrapperStyle={{ paddingTop: '14px', fontSize: '12px', color: '#6b7280' }}
                            />
                            <Bar dataKey="purchases" name="purchases" fill="url(#gradPurchasesBar)" radius={[6, 6, 0, 0]} maxBarSize={44} />
                            <Bar dataKey="payments" name="payments" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={44} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Botón Ver más */}
                    <div className="text-center">
                      <button 
                        onClick={() => setShowMore(!showMore)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg transition-all"
                      >
                        {showMore ? (
                          <>
                            <span>Ver menos</span>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </>
                        ) : (
                          <>
                            <span>Ver más detalles</span>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Detailed Analysis — 100% real data */}
                    {showMore && historyData.stats && (
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 space-y-4">
                        <h3 className="font-bold text-gray-900 text-base">Detailed Financial Analysis</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="bg-white rounded-xl p-4 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-3 text-sm">Invoice Behavior</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Fully paid:</span>
                                <span className="font-bold text-green-600">
                                  {historyData.stats.total > 0 ? Math.round((historyData.stats.pagadas / historyData.stats.total) * 100) : 0}%
                                  <span className="font-normal text-gray-400 ml-1">({historyData.stats.pagadas})</span>
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Partial payment:</span>
                                <span className="font-bold text-yellow-600">
                                  {historyData.stats.total > 0 ? Math.round((historyData.stats.parciales / historyData.stats.total) * 100) : 0}%
                                  <span className="font-normal text-gray-400 ml-1">({historyData.stats.parciales})</span>
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">No payment:</span>
                                <span className="font-bold text-red-600">
                                  {historyData.stats.total > 0 ? Math.round((historyData.stats.sinPago / historyData.stats.total) * 100) : 0}%
                                  <span className="font-normal text-gray-400 ml-1">({historyData.stats.sinPago})</span>
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-4 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-3 text-sm">Purchase Patterns</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Avg. invoice value:</span>
                                <span className="font-bold text-blue-600">{fmt(historyData.stats.avgPurchase)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Purchase frequency:</span>
                                <span className="font-bold text-purple-600">{historyData.stats.purchaseFreq}/month</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Trend vs prev 3m:</span>
                                <span className={`font-bold ${historyData.stats.seasonalTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {historyData.stats.seasonalTrend >= 0 ? '+' : ''}{historyData.stats.seasonalTrend}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Recommendations — data-driven */}
                        {(historyData.recs || []).length > 0 && (
                          <div className="bg-white rounded-xl p-4 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-3 text-sm">Insights</h4>
                            <ul className="space-y-2">
                              {(historyData.recs || []).map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                  <span className="flex-shrink-0">{r.icon}</span>
                                  <span>{r.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Score Tab */}
                {activeTab === 'score' && (
                  <div className="space-y-5">

                    {/* ── Gráfica de comportamiento mensual ── */}
                    {historyData.scoreHistory?.length > 0 && (
                      <div className="bg-white border-2 border-gray-200 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-bold text-gray-900 text-sm">Comportamiento Crediticio (6 meses)</h3>
                          {/* Leyenda de zonas */}
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Bueno</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Alerta</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Crítico</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mb-3">Health Score mensual (0–100) basado en PPR y consistencia de pagos</p>
                        <div className="h-52">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={historyData.scoreHistory} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="month" style={{ fontSize: '11px' }} tick={{ fill: '#6b7280' }} />
                              <YAxis domain={[0, 100]} style={{ fontSize: '11px' }} tick={{ fill: '#6b7280' }} />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null;
                                  const d = payload[0].payload;
                                  const color = d.health >= 65 ? '#16a34a' : d.health >= 50 ? '#d97706' : '#dc2626';
                                  return (
                                    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[140px]">
                                      <div className="font-bold text-gray-800 mb-2">{d.month}</div>
                                      <div className="flex items-center justify-between gap-3 mb-1">
                                        <span className="text-gray-500">Health</span>
                                        <span className="font-bold text-base" style={{ color }}>{d.health}/100</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3 mb-1">
                                        <span className="text-gray-500">Estado</span>
                                        <span className="font-semibold" style={{ color }}>{d.label}</span>
                                      </div>
                                      <div className="border-t border-gray-100 mt-2 pt-2 space-y-1">
                                        <div className="flex justify-between"><span className="text-gray-400">PPR mes</span><span className="font-medium">{d.ppr}x</span></div>
                                        <div className="flex justify-between"><span className="text-gray-400">Compras</span><span className="font-medium">${d.compras.toFixed(0)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-400">Pagos</span><span className="font-medium text-green-600">${d.pagos.toFixed(0)}</span></div>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              {/* Zonas de referencia */}
                              <ReferenceLine y={80} stroke="#16a34a" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'Excelente', position: 'right', fontSize: 9, fill: '#16a34a' }} />
                              <ReferenceLine y={65} stroke="#d97706" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'Bueno', position: 'right', fontSize: 9, fill: '#d97706' }} />
                              <ReferenceLine y={35} stroke="#dc2626" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'Crítico', position: 'right', fontSize: 9, fill: '#dc2626' }} />
                              {/* Línea con color dinámico por punto */}
                              <Line
                                type="monotone"
                                dataKey="health"
                                stroke="#8b5cf6"
                                strokeWidth={2.5}
                                dot={(props) => {
                                  const { cx, cy, payload } = props;
                                  const color = payload.health >= 65 ? '#16a34a' : payload.health >= 35 ? '#d97706' : '#dc2626';
                                  return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />;
                                }}
                                activeDot={{ r: 7, stroke: '#8b5cf6', strokeWidth: 2 }}
                                name="Health Score"
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Resumen tendencia */}
                        {(() => {
                          const hist = historyData.scoreHistory;
                          if (hist.length < 2) return null;
                          const ultimo = hist[hist.length - 1].health;
                          const penultimo = hist[hist.length - 2].health;
                          const diff = ultimo - penultimo;
                          const avg = Math.round(hist.reduce((s, d) => s + d.health, 0) / hist.length);
                          return (
                            <div className="mt-3 flex items-center justify-between text-xs px-1">
                              <span className="text-gray-400">Promedio 6m: <span className="font-bold text-gray-700">{avg}/100</span></span>
                              {diff > 0
                                ? <span className="text-green-600 font-semibold">↑ Mejorando +{diff} pts vs mes anterior</span>
                                : diff < 0
                                ? <span className="text-red-500 font-semibold">↓ Empeorando {diff} pts vs mes anterior</span>
                                : <span className="text-gray-400">→ Sin cambio vs mes anterior</span>
                              }
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Score badge */}
                    {(() => { const sc = scoreColor(cliente?.score_base); return (
                    <div className={`${sc.bg} border-2 ${sc.border} rounded-2xl p-6 text-center`}>
                      <div className={`text-xs font-bold uppercase mb-2 ${sc.text}`}>Current Credit Score</div>
                      <div className={`text-8xl font-bold mb-3 ${sc.text}`}>{Number(cliente?.score_base || 0)}</div>
                      <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border-2 ${sc.border} font-bold ${sc.text} text-base`}>
                        <IconTrending up={Number(cliente?.score_base || 0) >= 550} />
                        {Number(cliente?.score_base || 0) >= 750 ? 'Excellent' :
                         Number(cliente?.score_base || 0) >= 650 ? 'Good' :
                         Number(cliente?.score_base || 0) >= 550 ? 'Fair' :
                         Number(cliente?.score_base || 0) >= 400 ? 'Poor' : 'Very Poor'}
                      </span>
                    </div>
                    ); })()}

                    {/* Score Factors — 100% real */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5">
                      <h3 className="font-bold text-gray-900 mb-4 text-base">Score Factors</h3>
                      <div className="space-y-4">
                        {(historyData.scoreFactors || []).map((f, idx) => (
                          <div key={idx}>
                            <div className="flex justify-between items-baseline mb-1">
                              <div>
                                <span className="text-sm font-semibold text-gray-800">{f.label}</span>
                                {f.desc && <span className="ml-2 text-xs text-gray-400">{f.desc}</span>}
                              </div>
                              <span className="text-sm font-bold text-gray-900 ml-2 flex-shrink-0">{f.value}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-3">
                              <div
                                className={`${f.color} h-3 rounded-full transition-all duration-700`}
                                style={{ width: `${f.value}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Invoice breakdown */}
                    {historyData.stats && historyData.stats.total > 0 && (
                      <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <h3 className="font-bold text-gray-900 mb-4 text-base">Invoice Breakdown (6 months)</h3>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                            <div className="text-2xl font-bold text-green-700">{historyData.stats.pagadas}</div>
                            <div className="text-xs text-green-600 font-semibold mt-0.5">Fully Paid</div>
                          </div>
                          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                            <div className="text-2xl font-bold text-yellow-700">{historyData.stats.parciales}</div>
                            <div className="text-xs text-yellow-600 font-semibold mt-0.5">Partial</div>
                          </div>
                          <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                            <div className="text-2xl font-bold text-red-700">{historyData.stats.sinPago}</div>
                            <div className="text-xs text-red-600 font-semibold mt-0.5">Unpaid</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Payments Tab */}
                {activeTab === 'payments' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 min-h-[100px] flex flex-col justify-center">
                        <div className="text-green-600 text-xs font-bold uppercase mb-2">Total Payments (6m)</div>
                        <div className="text-3xl sm:text-4xl font-bold text-green-700">
                          {fmt(historyData.monthlyPurchases.reduce((s, m) => s + m.payments, 0))}
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 min-h-[100px] flex flex-col justify-center">
                        <div className="text-blue-600 text-xs font-bold uppercase mb-2">Payment Count</div>
                        <div className="text-3xl sm:text-4xl font-bold text-blue-700">
                          {historyData.paymentHistory.length}
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-4 min-h-[100px] flex flex-col justify-center">
                        <div className="text-purple-600 text-xs font-bold uppercase mb-2">Avg Payment</div>
                        <div className="text-3xl sm:text-4xl font-bold text-purple-700">
                          {fmt(historyData.paymentHistory.length > 0 
                            ? historyData.paymentHistory.reduce((s, p) => s + p.amount, 0) / historyData.paymentHistory.length 
                            : 0)}
                        </div>
                      </div>
                    </div>

                    {historyData.monthlyPurchases.some(m => m.payments > 0) && (
                      <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6">
                        <h3 className="font-bold text-gray-900 mb-4 text-lg">Payment Rate by Month</h3>
                        <div className="h-72 sm:h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={historyData.monthlyPurchases.map(m => ({
                              ...m,
                              rate: m.purchases > 0 ? (m.payments / m.purchases * 100) : 0
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="month" style={{ fontSize: '11px' }} />
                              <YAxis label={{ value: '% Paid', angle: -90, position: 'insideLeft', style: { fontSize: '11px' } }} style={{ fontSize: '11px' }} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                  border: 'none',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                                }}
                                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Payment Rate']}
                              />
                              <Bar dataKey="rate" fill="#10b981" name="Payment Rate %" radius={[8, 8, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-4 border-b-2 border-gray-200">
                        <h3 className="font-bold text-gray-900 text-lg">Recent Payment Transactions</h3>
                        <p className="text-xs text-gray-500 mt-1">Last {historyData.paymentHistory.length} paid invoices</p>
                      </div>
                      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                        {historyData.paymentHistory.length === 0 ? (
                          <div className="p-10 text-center text-gray-500">
                            <div className="text-5xl mb-3">💳</div>
                            <div className="font-semibold text-gray-700 mb-1">No payments in the last 6 months</div>
                            <div className="text-xs text-gray-400">Payments will appear here once recorded</div>
                          </div>
                        ) : (
                          historyData.paymentHistory.map((payment, idx) => {
                            const isFull   = payment.type === 'full';
                            const isDirect = payment.type === 'direct';
                            return (
                              <div key={idx} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-gray-900">{currency(payment.amount)}</span>
                                      {payment.total && (
                                        <span className="text-xs text-gray-400">of {currency(payment.total)}</span>
                                      )}
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                                        isFull    ? 'bg-green-100 text-green-700 border-green-200' :
                                        isDirect  ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                    'bg-yellow-100 text-yellow-700 border-yellow-200'
                                      }`}>
                                        {isFull ? '✓ Paid' : isDirect ? '→ Direct' : '~ Partial'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                                      <span>📅 {payment.date}</span>
                                      {payment.method && payment.method !== '—' && (
                                        <span>💳 {payment.method}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {historyData.paymentHistory.length > 0 && (
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div>
                            <div className="text-base font-semibold text-green-700 mb-3">Payment Performance</div>
                            <div className="space-y-3">
                              <div className="flex justify-between text-base">
                                <span className="text-gray-600">Total Purchases:</span>
                                <span className="font-bold text-gray-900">
                                  {fmt(historyData.monthlyPurchases.reduce((s, m) => s + m.purchases, 0))}
                                </span>
                              </div>
                              <div className="flex justify-between text-base">
                                <span className="text-gray-600">Total Paid:</span>
                                <span className="font-bold text-green-700">
                                  {fmt(historyData.monthlyPurchases.reduce((s, m) => s + m.payments, 0))}
                                </span>
                              </div>
                              <div className="pt-3 border-t-2 border-green-300">
                                <div className="flex justify-between text-base">
                                  <span className="text-gray-600">Outstanding:</span>
                                  <span className="font-bold text-red-600">
                                    {fmt(Math.max(0, 
                                      historyData.monthlyPurchases.reduce((s, m) => s + m.purchases, 0) - 
                                      historyData.monthlyPurchases.reduce((s, m) => s + m.payments, 0)
                                    ))}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-base font-semibold text-green-700 mb-3">Payment Rate</div>
                            <div className="flex items-center justify-center h-32">
                              <div className="text-center">
                                <div className="text-6xl font-bold text-green-700">
                                  {(() => {
                                    const totalPurchases = historyData.monthlyPurchases.reduce((s, m) => s + m.purchases, 0);
                                    const totalPayments = historyData.monthlyPurchases.reduce((s, m) => s + m.payments, 0);
                                    return totalPurchases > 0 ? Math.round((totalPayments / totalPurchases) * 100) : 0;
                                  })()}%
                                </div>
                                <div className="text-sm text-gray-500 mt-2">of purchases paid</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer - Con safe area bottom */}
        <div className="flex-shrink-0 bg-white border-t-2 border-gray-200 p-4 sm:p-6 pb-safe">
          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg text-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====================== Reminder Modal ====================== */
function DetalleClienteModal({ cliente, onClose }) {
  const [mensaje, setMensaje] = useState("");
  const [tel, setTel] = useState("");
  const [clienteInfo, setClienteInfo] = useState(null);
  const [templates, setTemplates] = useState([...DEFAULT_TEMPLATES, ...loadUserTemplates()]);
  const [tplKey, setTplKey] = useState("en_pro");
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    setClienteInfo({
      telefono: cliente?.telefono || "",
      direccion: cliente?.direccion || "",
      nombre_negocio: cliente?.nombre_negocio || ""
    });
    setTel(cliente?.telefono || "");
  }, [cliente?.cliente_id, cliente?.telefono, cliente?.direccion, cliente?.nombre_negocio]);

  const currentContext = () => {
    const nombre = cliente?.cliente_nombre || cliente?.cliente || "Customer";
    const saldoRow = Number(cliente?.saldo || 0);
    return {
      cliente: nombre,
      saldo: saldoRow,
      total_cxc: saldoRow,
      company: COMPANY_NAME,
      pay_url: PAY_URL,
      email: CONTACT_EMAIL,
      phone: CONTACT_PHONE,
    };
  };

  const applyTemplateAndGenerate = (templateKey) => {
    setTplKey(templateKey);
    const ctx = currentContext();
    const tpl = templates.find(t => t.key === templateKey);
    if (!tpl) return;
    const msg = renderTemplate(tpl.body, { ...ctx });
    setMensaje(msg);
    setGenerated(true);
  };

  const saveCurrentAsTemplate = () => {
    const name = prompt("Template name:", "My template");
    if (!name) return;
    const item = { key: `user_${Date.now()}`, name, body: mensaje || "" };
    const user = loadUserTemplates();
    user.push(item);
    saveUserTemplates(user);
    setTemplates([...DEFAULT_TEMPLATES, ...user]);
    setTplKey(item.key);
    alert("Template saved ✅");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center overflow-hidden">
      {/* Mobile: Full screen con safe areas */}
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl shadow-2xl flex flex-col sm:m-4">
        {/* Header - Con safe area y más grande */}
        <div className="flex-shrink-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white pt-safe pb-4 px-4 sm:px-6 sm:py-6 shadow-lg">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0 pt-1">
              <div className="font-bold text-xl sm:text-2xl truncate mb-2">
                {cliente?.cliente_nombre || cliente?.cliente}
              </div>
              {tel && <div className="text-sm sm:text-base text-green-100 truncate mb-1">📞 {tel}</div>}
              {clienteInfo?.direccion && <div className="text-sm text-green-100 truncate mb-1">📍 {clienteInfo.direccion}</div>}
              {clienteInfo?.nombre_negocio && <div className="text-sm text-green-100 truncate">🏪 {clienteInfo.nombre_negocio}</div>}
              {!tel && !clienteInfo?.direccion && !clienteInfo?.nombre_negocio && (
                <div className="text-xs text-green-200 mt-2 bg-green-700/30 px-3 py-2 rounded-lg">
                  ⚠️ No contact information available
                </div>
              )}
            </div>
            <button 
              onClick={onClose} 
              className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white text-2xl font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto pb-safe">
          <div className="p-4 sm:p-6 space-y-4">
            {/* Reminder */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-bold text-gray-900 text-lg flex items-center gap-2">
                  💬 Reminder Message
                </div>
              </div>

              {!generated && (
                <div className="space-y-3">
                  <label className="block text-base font-semibold text-gray-700 mb-3">
                    Select template and language:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {templates.map(t => (
                      <button
                        key={t.key}
                        onClick={() => applyTemplateAndGenerate(t.key)}
                        className="px-4 py-3 rounded-xl text-base font-medium border-2 transition-all bg-white text-gray-700 border-gray-300 hover:border-green-400 hover:bg-green-50 active:scale-95 min-h-[56px]"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {generated && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                    <div className="text-base font-semibold text-gray-700">
                      Template: <span className="text-green-600">{templates.find(t => t.key === tplKey)?.name}</span>
                    </div>
                    <button
                      onClick={() => setGenerated(false)}
                      className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-700 font-semibold text-sm min-h-[44px]"
                    >
                      Change template
                    </button>
                  </div>

                  <textarea
                    className="w-full border-2 border-gray-300 rounded-xl p-4 text-base min-h-[160px] focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none resize-none"
                    value={mensaje}
                    onChange={e => setMensaje(e.target.value)}
                    placeholder="Edit message here..."
                    style={{ fontSize: '16px' }} // Prevent zoom on iOS
                  />
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={async () => {
                        try { 
                          await navigator.clipboard.writeText(mensaje || ""); 
                          alert("✅ Message copied"); 
                        } catch { 
                          alert("Could not copy"); 
                        }
                      }}
                      className="flex-1 bg-gray-800 hover:bg-gray-900 active:bg-black text-white px-4 py-4 rounded-xl font-semibold shadow-lg text-base min-h-[56px] flex items-center justify-center gap-2"
                    >
                      <span className="text-xl">📋</span>
                      <span>Copy</span>
                    </button>
                    <button 
                      onClick={() => openWhatsAppWith(tel, mensaje)}
                      className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 active:from-green-800 active:to-emerald-800 text-white px-4 py-4 rounded-xl font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-base min-h-[56px] flex items-center justify-center gap-2"
                      disabled={!tel}
                    >
                      <span className="text-xl">💬</span>
                      <span>WhatsApp</span>
                    </button>
                  </div>

                  <div className="bg-white border-2 border-green-200 rounded-xl p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-gray-500 text-sm font-semibold mb-1">Balance</div>
                        <div className="font-bold text-2xl text-red-600">{currency(cliente?.saldo || 0)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-sm font-semibold mb-1">Phone</div>
                        <div className="font-mono text-base truncate text-gray-900">
                          {tel || <span className="text-red-600">⚠️ No phone</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={saveCurrentAsTemplate}
                    className="w-full border-2 border-green-600 text-green-700 hover:bg-green-50 active:bg-green-100 px-4 py-4 rounded-xl font-semibold text-base min-h-[56px]"
                  >
                    💾 Save as template
                  </button>
                </div>
              )}

              {!generated && (
                <div className="text-sm text-gray-600 bg-white border-2 border-green-200 rounded-xl p-4">
                  💡 Click on a template to generate the message automatically
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer - Con safe area */}
        <div className="flex-shrink-0 bg-white border-t-2 border-gray-200 p-4 sm:p-6 pb-safe">
          <button
            onClick={onClose}
            className="w-full bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 px-6 py-4 rounded-xl font-semibold text-lg min-h-[56px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====================== Credit Simulator Modal ====================== */
function SimuladorCreditoModal({ onClose, initialAmount, initialMonths, customerName, customerId }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center overflow-hidden">
      {/* Mobile: Full screen con safe areas */}
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col sm:m-4">
        {/* Header - Con safe area */}
        <div className="flex-shrink-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white pt-safe pb-4 px-4 sm:px-6 sm:py-6 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 pt-1">
              <div className="font-bold text-xl sm:text-2xl mb-2">📈 Credit Simulator</div>
              {customerName && (
                <div className="text-sm sm:text-base text-indigo-100 truncate">
                  Customer: {customerName}
                </div>
              )}
            </div>
            <button 
              onClick={onClose} 
              className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white text-2xl font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto pb-safe">
          <Suspense
            fallback={
              <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-600 border-t-transparent mb-4"></div>
                <div className="text-center text-gray-600 font-semibold text-lg">Loading simulator…</div>
              </div>
            }
          >
            <SimuladorCredito
              onClose={onClose}
              initialAmount={initialAmount}
              initialMonths={initialMonths}
              customerName={customerName}
              customerId={customerId}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/* ====================== Main Component ====================== */
export default function CuentasPorCobrar() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [globalSaldo, setGlobalSaldo] = useState(0);

  const [scoreFilter, setScoreFilter] = useState("ALL");
  const scoreRanges = {
    "0-399": [0, 399],
    "400-549": [400, 549],
    "550-649": [550, 649],
    "650-749": [650, 749],
    "750+": [750, 1000],
  };

  const [adminMode, setAdminMode] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // ── Auto-refresh cuando el sync completa con ventas/pagos offline ──
  const { onSyncComplete } = useSyncGlobal();
  useEffect(() => {
    const unsub = onSyncComplete(({ ventasSubidas, pagosSubidos }) => {
      if (ventasSubidas > 0 || pagosSubidos > 0) {
        console.log('🔄 [CxC] Sync completó — refrescando saldos automáticamente...');
        setReloadTick(t => t + 1);
      }
    });
    return unsub;
  }, [onSyncComplete]);

  const [edit, setEdit] = useState({
    open: false,
    id: null,
    nombre: "",
    actual: 0,
    manual: null,
    input: "",
  });

  const [selected, setSelected] = useState(null);
  const [openReminder, setOpenReminder] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);

  const [openSimulador, setOpenSimulador] = useState(false);
  const [simInit, setSimInit] = useState({
    amount: 0,
    months: 12,
    customerName: "",
    customerId: "",
  });

  // ── Credit Limit Review ──
  const [openCreditReview, setOpenCreditReview] = useState(false);
  const [creditReviewData, setCreditReviewData] = useState([]);
  const [creditReviewLoading, setCreditReviewLoading] = useState(false);
  const [approvingId, setApprovingId] = useState(null);

  async function loadCreditReview() {
    setCreditReviewLoading(true);
    setCreditReviewData([]);
    try {
      // Clientes con score alto
      const { data: candidates } = await supabase
        .from("v_cxc_cliente_detalle_ext")
        .select("cliente_id, cliente_nombre, score_base, limite_politica, limite_manual")
        .gte("score_base", 650)
        .order("score_base", { ascending: false })
        .limit(150);

      if (!candidates?.length) { setCreditReviewData([]); return; }

      // Traer ventas de todos en una sola query
      const ids = candidates.map(c => c.cliente_id);
      const { data: allVentas } = await supabase
        .from("ventas")
        .select("cliente_id, total_venta, created_at")
        .in("cliente_id", ids)
        .order("created_at", { ascending: false });

      // Agrupar y calcular promedio (últimas 10)
      const byClient = {};
      (allVentas || []).forEach(v => {
        if (!byClient[v.cliente_id]) byClient[v.cliente_id] = [];
        if (byClient[v.cliente_id].length < 10)
          byClient[v.cliente_id].push(Number(v.total_venta || 0));
      });

      const results = candidates
        .map(c => {
          const ventas = byClient[c.cliente_id] || [];
          if (ventas.length < 2) return null; // muy poco historial
          const avg = ventas.reduce((s, v) => s + v, 0) / ventas.length;
          const currentLimit = Number(c.limite_manual ?? c.limite_politica ?? 0);
          const scoreMult = c.score_base >= 750 ? 1.3 : 1.1;
          // Sugerir 3 compras promedio ajustado por score, mínimo +25% del actual
          const rawSuggested = Math.max(avg * 3 * scoreMult, currentLimit * 1.25);
          const suggested = Math.round(rawSuggested / 5) * 5; // redondear a múltiplo de 5
          if (suggested <= currentLimit * 1.14) return null; // menos de 15% de aumento, no vale
          return {
            cliente_id: c.cliente_id,
            nombre: c.cliente_nombre,
            score: c.score_base,
            currentLimit,
            suggested,
            avgCompra: Math.round(avg * 100) / 100,
            compras: ventas.length,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      setCreditReviewData(results);
    } catch (e) {
      alert("Error loading review: " + e.message);
    } finally {
      setCreditReviewLoading(false);
    }
  }

  async function approveLimitIncrease(clienteId, newLimit) {
    setApprovingId(clienteId);
    try {
      const { error } = await supabase
        .from("clientes")
        .update({ limite_manual: newLimit })
        .eq("id", clienteId);
      if (error) throw error;
      setCreditReviewData(prev => prev.filter(c => c.cliente_id !== clienteId));
      setReloadTick(t => t + 1);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setApprovingId(null);
    }
  }

  function tryUnlockBySecret(value) {
    const typed = (value || "").trim();
    if (typed === CXC_SECRET) {
      setAdminMode((v) => !v);
      alert(`Admin mode ${!adminMode ? "activated" : "deactivated"}`);
      setQ("");
    }
  }

  function openEditor(row) {
    setEdit({
      open: true,
      id: row.cliente_id,
      nombre: row.cliente_nombre,
      actual: Number(row.limite_politica || 0),
      manual: row.limite_manual,
      input: row.limite_manual != null ? String(row.limite_manual) : "",
    });
  }

  async function saveLimit() {
    if (!edit.id) return;
    const trimmed = (edit.input || "").trim();
    const value = trimmed === "" ? null : Number(trimmed);

    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      alert("Invalid amount");
      return;
    }

    const { error } = await supabase
      .from("clientes")
      .update({ limite_manual: value })
      .eq("id", edit.id);

    if (error) {
      alert("Error saving: " + error.message);
      return;
    }

    setEdit((e) => ({ ...e, open: false }));
    setReloadTick((t) => t + 1);
  }

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        let query = supabase
          .from("v_cxc_cliente_detalle_ext")
          .select("cliente_id, cliente_nombre, saldo, limite_politica, credito_disponible, score_base, limite_manual, telefono, direccion, nombre_negocio", 
            { count: "exact" });

        if (q?.trim()) {
          query = query.ilike("cliente_nombre", `%${q.trim()}%`);
        }

        if (scoreFilter !== "ALL") {
          const [min, max] = scoreRanges[scoreFilter];
          query = query.gte("score_base", min).lte("score_base", max);
        }

        query = query.order("saldo", { ascending: false });

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const result = await query.range(from, to);

        if (!ignore) {
          if (result.error) {
            console.error("Error loading A/R:", result.error);
            alert("Error loading data: " + result.error.message);
            setRows([]);
            setTotal(0);
          } else {
            setRows(result.data || []);
            setTotal(result.count || 0);

            // ✅ FIX: Calcular total global (todos los clientes, no solo la página)
            const { data: allSaldos } = await supabase
              .from("v_cxc_cliente_detalle_ext")
              .select("saldo")
              .gt("saldo", 0);
            if (!ignore) {
              const total = (allSaldos || []).reduce(
                (s, r) => s + Number(r.saldo || 0), 0
              );
              setGlobalSaldo(total);
            }
          }
        }
      } catch (e) {
        if (!ignore) {
          console.error("Error in load:", e);
          alert("Unexpected error: " + e.message);
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [q, page, pageSize, scoreFilter, reloadTick]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const metrics = useMemo(() => {
    const saldoTotal = globalSaldo; // ✅ FIX: total global, no solo la página actual
    const avgScore =
      rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + Number(r.score_base || 0), 0) / rows.length)
        : 0;
    return { saldoTotal, avgScore, clientes: total };
  }, [rows, total, globalSaldo]);

  const openSimuladorGlobal = () => {
    setSimInit({
      amount: 0,
      months: 12,
      customerName: "",
      customerId: "",
    });
    setOpenSimulador(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 pb-20">
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 mb-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                💰 Accounts Receivable
              </h1>
            </div>
            
            {/* Search */}
            <div className="space-y-3">
              <div className="relative">
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      tryUnlockBySecret(e.currentTarget.value);
                      if (e.currentTarget.value.trim() === CXC_SECRET) {
                        e.currentTarget.value = "";
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }
                  }}
                  placeholder="🔍 Search customer..."
                  className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 pr-10 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                />
                {adminMode && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-300 text-xs font-bold">
                      🔒 Admin
                    </span>
                  </div>
                )}
              </div>

              {/* Score Filters */}
              <div className="overflow-x-auto pb-2 -mx-3 px-3">
                <div className="flex gap-2 min-w-max">
                  {["ALL", "0-399", "400-549", "550-649", "650-749", "750+"].map((k) => (
                    <button
                      key={k}
                      className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                        scoreFilter === k
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105"
                          : "bg-white text-gray-700 border-2 border-gray-300 hover:border-blue-400"
                      }`}
                      onClick={() => {
                        setScoreFilter(k);
                        setPage(1);
                      }}
                    >
                      {k === "ALL" ? "📊 All" : `${k}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border-2 border-gray-300 rounded-lg px-3 py-2 text-sm bg-white flex-shrink-0"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n} per page</option>
                  ))}
                </select>
                <button
                  onClick={() => setReloadTick((t) => t + 1)}
                  className="border-2 border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm bg-white hover:bg-gray-50 font-semibold flex-shrink-0"
                >
                  🔄 Reload
                </button>
                <button
                  onClick={openSimuladorGlobal}
                  className="px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-semibold shadow-lg text-sm flex-shrink-0"
                >
                  📈 Simulate Credit
                </button>
                <button
                  onClick={() => { setOpenCreditReview(true); loadCreditReview(); }}
                  className="px-3 sm:px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg font-semibold shadow-lg text-sm flex-shrink-0"
                >
                  ⬆️ Credit Review
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
          <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200 rounded-xl p-4 shadow-lg">
            <div className="text-red-600 text-xs uppercase font-bold mb-1">💸 Total A/R</div>
            <div className="text-2xl sm:text-3xl font-bold text-red-700">{fmt(metrics.saldoTotal)}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 shadow-lg">
            <div className="text-blue-600 text-xs uppercase font-bold mb-1">📊 Avg Score</div>
            <div className="text-2xl sm:text-3xl font-bold text-blue-700">{metrics.avgScore || 0}</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 shadow-lg">
            <div className="text-green-600 text-xs uppercase font-bold mb-1">👥 Customers</div>
            <div className="text-2xl sm:text-3xl font-bold text-green-700">{metrics.clientes}</div>
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {loading && (
            <div className="bg-white rounded-xl p-8 text-center border-2 border-gray-200 shadow-lg">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4"></div>
              <div className="text-gray-500 font-semibold">Loading customers...</div>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center border-2 border-gray-200 shadow-lg">
              <div className="text-6xl mb-4">🎉</div>
              <div className="text-gray-700 font-bold text-lg">Sin cuentas pendientes</div>
              <div className="text-sm text-gray-400 mt-2">
                Todos los clientes están al corriente — no hay saldos por cobrar en este período.
              </div>
            </div>
          )}

          {/* MOBILE: Cards */}
          <div className="block lg:hidden space-y-3">
            {!loading && rows.map((r) => {
              const sc = scoreColor(r.score_base);
              const usePct = r.limite_politica > 0 ? Math.min(100, Math.round((r.saldo / r.limite_politica) * 100)) : 0;
              const addrStr = parseAddr(r.direccion);
              return (
                <div key={r.cliente_id} className="bg-white border border-gray-200 rounded-2xl shadow-md overflow-hidden">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-base leading-tight truncate">{r.cliente_nombre}</div>
                        {r.nombre_negocio && <div className="text-xs text-blue-100 mt-0.5 truncate">🏪 {r.nombre_negocio}</div>}
                      </div>
                      <span className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                        {Number(r.score_base ?? 0)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                      {r.telefono && <span className="text-xs text-blue-100">📞 {r.telefono}</span>}
                      {addrStr && <span className="text-xs text-blue-100 truncate">📍 {addrStr}</span>}
                    </div>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {/* Credit usage bar */}
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Credit used</span>
                        <span className="font-semibold">{usePct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${usePct >= 90 ? "bg-red-500" : usePct >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                          style={{ width: `${usePct}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 text-center">
                        <div className="text-[10px] text-red-500 font-semibold uppercase mb-0.5">Balance</div>
                        <div className="font-bold text-sm text-red-700">{fmt(r.saldo)}</div>
                      </div>
                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center">
                        <div className="text-[10px] text-gray-500 font-semibold uppercase mb-0.5">Limit</div>
                        <div className="font-bold text-sm text-gray-700">{fmt(r.limite_politica)}</div>
                      </div>
                      <div className="bg-green-50 border border-green-100 rounded-xl p-2.5 text-center">
                        <div className="text-[10px] text-green-500 font-semibold uppercase mb-0.5">Available</div>
                        <div className="font-bold text-sm text-green-700">{fmt(r.credito_disponible)}</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-3 py-2.5 rounded-xl text-sm font-semibold shadow-sm"
                        onClick={() => { setSelected(r); setOpenReminder(true); }}
                      >
                        💬 Reminder
                      </button>
                      <button
                        className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-3 py-2.5 rounded-xl text-sm font-semibold shadow-sm"
                        onClick={() => { setSelected(r); setOpenHistory(true); }}
                      >
                        📊 History
                      </button>
                      {adminMode && (
                        <button
                          className="bg-blue-600 text-white px-3 py-2.5 rounded-xl text-sm font-semibold shadow-sm"
                          onClick={() => openEditor(r)}
                        >
                          ✏️
                        </button>
                      )}
                    </div>

                    {r.limite_manual != null && (
                      <span className="inline-flex text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                        ⚠️ Manual override
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP: Table */}
          <div className="hidden lg:block bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Customer</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Balance</th>
                    <th className="text-center px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Score</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Credit Usage</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Available</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!loading && rows.map((r) => {
                    const sc = scoreColor(r.score_base);
                    const usePct = r.limite_politica > 0 ? Math.min(100, Math.round((r.saldo / r.limite_politica) * 100)) : 0;
                    const addrStr = parseAddr(r.direccion);
                    return (
                      <tr key={r.cliente_id} className="hover:bg-blue-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-semibold text-gray-900 leading-tight">{r.cliente_nombre}</div>
                          {r.nombre_negocio && <div className="text-xs text-gray-500 mt-0.5">🏪 {r.nombre_negocio}</div>}
                          {addrStr && <div className="text-xs text-gray-400 mt-0.5">📍 {addrStr}</div>}
                          {r.telefono && <div className="text-xs text-gray-400 mt-0.5">📞 {r.telefono}</div>}
                          <div className="mt-1 flex items-center gap-2">
                            {adminMode && (
                              <button
                                className="text-xs px-2 py-0.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-semibold"
                                onClick={() => openEditor(r)}
                              >
                                ✏️ Edit
                              </button>
                            )}
                            {r.limite_manual != null && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                                override
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 text-base">{fmt(r.saldo)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>
                            {Number(r.score_base ?? 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3 w-40">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${usePct >= 90 ? "bg-red-500" : usePct >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                                style={{ width: `${usePct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 font-medium w-8 text-right">{usePct}%</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5 text-right">{fmt(r.limite_politica)} limit</div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{fmt(r.credito_disponible)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 justify-center">
                            <button
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-xs font-semibold shadow-sm"
                              onClick={() => { setSelected(r); setOpenReminder(true); }}
                            >
                              💬 Reminder
                            </button>
                            <button
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-semibold shadow-sm"
                              onClick={() => { setSelected(r); setOpenHistory(true); }}
                            >
                              📊 History
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 bg-white border-2 border-gray-200 rounded-xl p-4 shadow-lg">
          <button
            className="w-full sm:w-auto px-6 py-3 border-2 border-gray-300 rounded-lg text-sm font-semibold bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Previous
          </button>
          <div className="text-sm text-gray-700 font-semibold">
            Page <span className="text-blue-600">{page}</span> of <span className="text-blue-600">{totalPages}</span>
          </div>
          <button
            className="w-full sm:w-auto px-6 py-3 border-2 border-gray-300 rounded-lg text-sm font-semibold bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Edit Limit Modal */}
      {edit.open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center overflow-hidden">
          {/* Mobile: Full screen con safe areas */}
          <div className="bg-white w-full h-auto sm:max-w-md sm:rounded-2xl shadow-2xl flex flex-col sm:m-4">
            {/* Header - Con safe area */}
            <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white pt-safe pb-4 px-4 sm:px-6 sm:py-6 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 pt-1">
                  <div className="font-bold text-xl sm:text-2xl mb-2">✏️ Edit Limit</div>
                  <div className="text-sm sm:text-base text-blue-100 truncate">
                    {edit.nombre}
                  </div>
                </div>
                <button
                  onClick={() => setEdit((e) => ({ ...e, open: false }))}
                  className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white text-2xl font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content - Con padding bottom para teclado */}
            <div className="flex-1 overflow-y-auto pb-safe">
              <div className="p-4 sm:p-6 space-y-5">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl p-4 sm:p-5">
                  <div className="text-xs text-gray-500 uppercase font-bold mb-2">Current Limit</div>
                  <div className="text-3xl sm:text-4xl font-bold text-gray-900 font-mono">
                    {fmt(Number(edit.actual || 0))}
                  </div>
                </div>

                <div>
                  <label className="block text-base font-bold text-gray-700 mb-3">
                    New Manual Limit
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={edit.input}
                    onChange={(e) => setEdit((x) => ({ ...x, input: e.target.value }))}
                    placeholder="Leave empty to use automatic policy"
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-4 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none min-h-[56px]"
                    style={{ fontSize: '16px' }} // Prevent zoom on iOS
                    autoFocus
                  />
                  <p className="text-sm text-gray-500 mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    💡 Leave empty to return to automatic score-based policy
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    className="flex-1 bg-gray-500 hover:bg-gray-600 active:bg-gray-700 text-white rounded-xl px-6 py-4 font-bold shadow-lg min-h-[56px] text-base"
                    onClick={() => setEdit((e) => ({ ...e, open: false }))}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 text-white rounded-xl px-6 py-4 font-bold shadow-lg min-h-[56px] text-base"
                    onClick={saveLimit}
                  >
                    💾 Save
                  </button>
                </div>

                {edit.manual != null && (
                  <button
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:from-amber-800 active:to-orange-800 text-white rounded-xl px-6 py-4 font-bold shadow-lg min-h-[56px] text-base"
                    onClick={() => setEdit((e) => ({ ...e, input: "" }))}
                  >
                    🔄 Restore Automatic Policy
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {openReminder && selected && (
        <DetalleClienteModal
          cliente={selected}
          onClose={() => { setOpenReminder(false); setSelected(null); }}
        />
      )}

      {openHistory && selected && (
        <CustomerHistoryModal
          cliente={selected}
          onClose={() => { setOpenHistory(false); setSelected(null); }}
        />
      )}

      {openSimulador && (
        <SimuladorCreditoModal
          onClose={() => setOpenSimulador(false)}
          initialAmount={simInit.amount}
          initialMonths={simInit.months}
          customerName={simInit.customerName}
          customerId={simInit.customerId}
        />
      )}

      {/* ── Credit Limit Review Modal ── */}
      {openCreditReview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center overflow-hidden">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:m-4">
            {/* Header */}
            <div className="flex-shrink-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-4 sm:rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-xl">⬆️ Credit Limit Review</div>
                  <div className="text-sm text-emerald-100 mt-0.5">
                    Clientes que califican para un aumento de límite
                  </div>
                </div>
                <button
                  onClick={() => setOpenCreditReview(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white text-xl font-bold"
                >✕</button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {creditReviewLoading && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-emerald-600 mb-4" />
                  <div className="text-gray-500 font-semibold">Analizando historial de clientes...</div>
                </div>
              )}

              {!creditReviewLoading && creditReviewData.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-5xl mb-3">✅</div>
                  <div className="font-bold text-gray-700 text-lg">Todos los límites están al día</div>
                  <div className="text-sm text-gray-400 mt-1">No hay clientes que califiquen para aumento en este momento.</div>
                </div>
              )}

              {!creditReviewLoading && creditReviewData.map(c => {
                const increase = Math.round((c.suggested / c.currentLimit - 1) * 100);
                const scoreBadge = c.score >= 750
                  ? { label: "Excelente", cls: "bg-emerald-100 text-emerald-700" }
                  : { label: "Bueno", cls: "bg-blue-100 text-blue-700" };

                return (
                  <div key={c.cliente_id} className="bg-white border-2 border-gray-200 rounded-xl p-4 shadow-sm hover:border-emerald-300 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 text-base truncate">{c.nombre}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${scoreBadge.cls}`}>
                            Score {c.score} — {scoreBadge.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            Prom. compra: {fmt(c.avgCompra)} ({c.compras} visitas)
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => approveLimitIncrease(c.cliente_id, c.suggested)}
                        disabled={approvingId === c.cliente_id}
                        className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl shadow transition-all"
                      >
                        {approvingId === c.cliente_id ? "..." : "✓ Aprobar"}
                      </button>
                    </div>

                    {/* Límite actual → sugerido */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center">
                        <div className="text-xs text-gray-400 font-medium uppercase">Actual</div>
                        <div className="text-lg font-bold text-gray-700">{fmt(c.currentLimit)}</div>
                      </div>
                      <div className="text-gray-400 text-xl font-light">→</div>
                      <div className="flex-1 bg-emerald-50 border border-emerald-300 rounded-lg p-2.5 text-center">
                        <div className="text-xs text-emerald-600 font-medium uppercase">Sugerido</div>
                        <div className="text-lg font-bold text-emerald-700">{fmt(c.suggested)}</div>
                      </div>
                      <div className="flex-shrink-0 bg-emerald-100 text-emerald-700 font-bold text-sm px-2.5 py-1 rounded-full">
                        +{increase}%
                      </div>
                    </div>

                    {/* Dismiss */}
                    <button
                      onClick={() => setCreditReviewData(prev => prev.filter(x => x.cliente_id !== c.cliente_id))}
                      className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Ignorar este cliente
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            {!creditReviewLoading && creditReviewData.length > 0 && (
              <div className="flex-shrink-0 border-t border-gray-200 px-4 py-3 bg-gray-50 sm:rounded-b-2xl">
                <div className="text-sm text-gray-500 text-center">
                  {creditReviewData.length} cliente{creditReviewData.length !== 1 ? "s" : ""} califican — aprueba o ignora individualmente
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}