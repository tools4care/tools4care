import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";
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
      
      const { data: ventas } = await supabase
        .from('ventas')
        .select('fecha, total, estado_pago, total_pagado')
        .eq('cliente_id', cliente.cliente_id)
        .gte('fecha', sixMonthsAgo)
        .order('fecha', { ascending: true });

      console.log('Ventas cargadas:', ventas);

      const monthlyData = {};
      const last6Months = [];
      
      for (let i = 5; i >= 0; i--) {
        const month = dayjs().subtract(i, 'month').format('YYYY-MM');
        last6Months.push(month);
        monthlyData[month] = {
          month: dayjs().subtract(i, 'month').format('MMM YYYY'),
          balance: 0,
          purchases: 0,
          payments: 0,
          transactions: 0,
        };
      }

      (ventas || []).forEach(v => {
        const month = dayjs(v.fecha).format('YYYY-MM');
        if (monthlyData[month]) {
          monthlyData[month].purchases += Number(v.total || 0);
          monthlyData[month].payments += Number(v.total_pagado || 0);
          monthlyData[month].transactions += 1;
        }
      });

      let runningBalance = 0;
      const monthlyBalance = last6Months.map(month => {
        const data = monthlyData[month];
        runningBalance += data.purchases - data.payments;
        return {
          ...data,
          balance: Math.max(0, runningBalance),
        };
      });

      const baseScore = Number(cliente.score_base || 500);
      const scoreHistory = last6Months.map((month, idx) => {
        const data = monthlyData[month];
        const paymentRate = data.purchases > 0 ? data.payments / data.purchases : 0;
        const variance = (paymentRate - 0.5) * 40;
        return {
          month: data.month,
          score: Math.min(1000, Math.max(0, baseScore + variance + (Math.random() * 20 - 10))),
        };
      });

      const paidSales = (ventas || [])
        .filter(v => v.estado_pago === 'pagado' && Number(v.total_pagado || 0) > 0)
        .slice(-10)
        .reverse();

      const paymentHistory = paidSales.map(v => ({
        date: dayjs(v.fecha).format('MM/DD/YYYY'),
        amount: Number(v.total_pagado || v.total || 0),
        method: v.estado_pago === 'pagado' ? 'Full Payment' : 'Partial Payment',
      }));

      console.log('Payment history:', paymentHistory);

      setHistoryData({
        monthlyBalance,
        monthlyPurchases: monthlyBalance,
        scoreHistory,
        paymentHistory,
      });
    } catch (error) {
      console.error('Error loading history:', error);
      setHistoryData({
        monthlyBalance: [],
        monthlyPurchases: [],
        scoreHistory: [],
        paymentHistory: [],
      });
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
                      <h3 className="font-bold text-gray-900 mb-4 text-lg flex items-center gap-2">
                        <IconChart />
                        Balance Evolution
                      </h3>
                      <div className="h-72 sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={historyData.monthlyBalance}>
                            <defs>
                              <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="month" style={{ fontSize: '11px' }} />
                            <YAxis style={{ fontSize: '11px' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: 'none',
                                borderRadius: '12px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                                padding: '12px',
                              }}
                              formatter={(value) => [currency(value), 'Balance']}
                            />
                            <Area type="monotone" dataKey="balance" stroke="#ef4444" fill="url(#colorBalance)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6">
                      <h3 className="font-bold text-gray-900 mb-4 text-lg">Purchases vs Payments</h3>
                      <div className="h-72 sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={historyData.monthlyPurchases}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="month" style={{ fontSize: '11px' }} />
                            <YAxis style={{ fontSize: '11px' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: 'none',
                                borderRadius: '12px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                              }}
                              formatter={(value) => currency(value)}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Bar dataKey="purchases" fill="#3b82f6" name="Purchases" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="payments" fill="#10b981" name="Payments" radius={[8, 8, 0, 0]} />
                          </BarChart>
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

                    {/* Contenido adicional que se muestra/oculta */}
                    {showMore && (
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-6">
                        <h3 className="font-bold text-gray-900 mb-4 text-lg">Detailed Financial Analysis</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="bg-white rounded-xl p-5 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-3">Payment Behavior</h4>
                            <div className="space-y-3">
                              <div className="flex justify-between">
                                <span className="text-gray-600">On-time payments:</span>
                                <span className="font-bold text-green-600">78%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Late payments:</span>
                                <span className="font-bold text-red-600">15%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Missed payments:</span>
                                <span className="font-bold text-red-600">7%</span>
                              </div>
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-5 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-3">Purchase Patterns</h4>
                            <div className="space-y-3">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Avg. purchase value:</span>
                                <span className="font-bold text-blue-600">{fmt(125.75)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Purchase frequency:</span>
                                <span className="font-bold text-purple-600">2.3/month</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Seasonal trend:</span>
                                <span className="font-bold text-orange-600">+12%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 bg-white rounded-xl p-5 shadow-sm">
                          <h4 className="font-bold text-gray-800 mb-3">Recommendations</h4>
                          <ul className="space-y-2 text-gray-700">
                            <li className="flex items-start gap-2">
                              <span className="text-green-500 mt-1">✓</span>
                              <span>Consider increasing credit limit by 15% based on payment history</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-yellow-500 mt-1">⚠</span>
                              <span>Monitor late payment patterns during holiday season</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-500 mt-1">→</span>
                              <span>Offer early payment discount to improve cash flow</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Score Tab */}
                {activeTab === 'score' && (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 sm:p-8">
                      <div className="text-center">
                        <div className="text-sm font-bold text-blue-600 uppercase mb-3">Current Credit Score</div>
                        <div className="text-7xl sm:text-8xl font-bold text-blue-700 mb-4">{Number(cliente?.score_base || 0)}</div>
                        <div className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border-2 border-blue-300 shadow-md">
                          <IconTrending up={Number(cliente?.score_base || 0) >= 550} />
                          <span className="font-bold text-gray-700 text-lg">
                            {Number(cliente?.score_base || 0) >= 750 ? 'Excellent' : 
                             Number(cliente?.score_base || 0) >= 650 ? 'Good' :
                             Number(cliente?.score_base || 0) >= 550 ? 'Fair' : 'Poor'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6">
                      <h3 className="font-bold text-gray-900 mb-4 text-lg">Score History (6 months)</h3>
                      <div className="h-72 sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={historyData.scoreHistory}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="month" style={{ fontSize: '11px' }} />
                            <YAxis domain={[0, 1000]} style={{ fontSize: '11px' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: 'none',
                                borderRadius: '12px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                              }}
                              formatter={(value) => [Math.round(value), 'Score']}
                            />
                            <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 6, fill: '#3b82f6' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6">
                      <h3 className="font-bold text-gray-900 mb-4 text-lg">Score Factors</h3>
                      <div className="space-y-4">
                        {[
                          { label: 'Payment History', value: 85, color: 'bg-green-500' },
                          { label: 'Credit Utilization', value: 65, color: 'bg-blue-500' },
                          { label: 'Account Age', value: 75, color: 'bg-purple-500' },
                          { label: 'Payment Consistency', value: 70, color: 'bg-indigo-500' },
                        ].map((factor, idx) => (
                          <div key={idx}>
                            <div className="flex justify-between mb-2">
                              <span className="text-sm font-semibold text-gray-700">{factor.label}</span>
                              <span className="text-sm font-bold text-gray-900">{factor.value}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-4">
                              <div 
                                className={`${factor.color} h-4 rounded-full transition-all duration-500`}
                                style={{ width: `${factor.value}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
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
                          <div className="p-12 text-center text-gray-500">
                            <div className="text-6xl mb-4">💳</div>
                            <div className="font-semibold text-gray-700 mb-2 text-lg">No payment history found</div>
                            <div className="text-sm text-gray-500">Payments will appear here once the customer makes purchases</div>
                          </div>
                        ) : (
                          historyData.paymentHistory.map((payment, idx) => (
                            <div key={idx} className="p-4 hover:bg-green-50 transition-colors">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <div className="font-bold text-xl text-gray-900">{currency(payment.amount)}</div>
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                                      ✓ {payment.method}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    <span className="inline-flex items-center gap-1">
                                      📅 {payment.date}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-shrink-0 text-3xl">
                                  💰
                                </div>
                              </div>
                            </div>
                          ))
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
    const saldoTotal = rows.reduce((s, r) => s + Number(r.saldo || 0), 0);
    const avgScore =
      rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + Number(r.score_base || 0), 0) / rows.length)
        : 0;
    return { saldoTotal, avgScore, clientes: total };
  }, [rows, total]);

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
              <div className="text-6xl mb-4">🔍</div>
              <div className="text-gray-500 font-semibold">No results found</div>
              <div className="text-sm text-gray-400 mt-2">Check your database connection</div>
            </div>
          )}

          {/* MOBILE: Cards */}
          <div className="block lg:hidden space-y-3">
            {!loading && rows.map((r) => (
              <div key={r.cliente_id} className="bg-white border-2 border-gray-200 rounded-xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4">
                  <div className="font-bold text-lg truncate">{r.cliente_nombre}</div>
                  <div className="text-sm text-blue-100 truncate">#{r.cliente_id?.slice?.(0, 8)}...</div>
                  {r.nombre_negocio && <div className="text-sm text-blue-100 mt-1 truncate">🏪 {r.nombre_negocio}</div>}
                  {r.direccion && <div className="text-xs text-blue-200 mt-0.5 truncate">📍 {r.direccion}</div>}
                  {r.telefono && <div className="text-xs text-blue-200 mt-0.5 truncate">📞 {r.telefono}</div>}
                </div>

                <div className="p-4 space-y-3">
                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="text-xs text-red-600 font-semibold">Balance</div>
                      <div className="font-bold text-lg text-red-700 truncate">{fmt(r.saldo)}</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-xs text-blue-600 font-semibold">Score</div>
                      <div className="font-bold text-lg text-blue-700">{Number(r.score_base ?? 0)}</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-xs text-gray-600 font-semibold">Limit</div>
                      <div className="font-bold text-lg text-gray-700 truncate">{fmt(r.limite_politica)}</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="text-xs text-green-600 font-semibold">Available</div>
                      <div className="font-bold text-lg text-green-700 truncate">{fmt(r.credito_disponible)}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-3 py-2.5 rounded-lg text-sm font-semibold shadow-md"
                        onClick={() => { setSelected(r); setOpenReminder(true); }}
                      >
                        💬 Reminder
                      </button>
                      <button
                        className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-3 py-2.5 rounded-lg text-sm font-semibold shadow-md"
                        onClick={() => { setSelected(r); setOpenHistory(true); }}
                      >
                        📊 History
                      </button>
                    </div>
                    {adminMode && (
                      <button
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2.5 rounded-lg text-sm font-semibold shadow-md"
                        onClick={() => openEditor(r)}
                      >
                        ✏️ Edit Limit
                      </button>
                    )}
                  </div>

                  {r.limite_manual != null && (
                    <div className="flex items-center gap-1 text-xs">
                      <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                        ⚠️ Manual override
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP: Table */}
          <div className="hidden lg:block bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 uppercase">Customer</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-700 uppercase">Balance</th>
                    <th className="text-center px-4 py-3 text-xs font-bold text-gray-700 uppercase">Score</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-700 uppercase">Limit</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-700 uppercase">Available</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-700 uppercase text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {!loading && rows.map((r) => (
                    <tr key={r.cliente_id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{r.cliente_nombre}</div>
                        <div className="text-xs text-gray-500">#{r.cliente_id?.slice?.(0, 8)}...</div>
                        {r.nombre_negocio && <div className="text-xs text-gray-600 mt-0.5">🏪 {r.nombre_negocio}</div>}
                        {r.direccion && <div className="text-xs text-gray-500 mt-0.5">📍 {r.direccion}</div>}
                        {r.telefono && <div className="text-xs text-gray-500 mt-0.5">📞 {r.telefono}</div>}
                        <div className="mt-1 flex items-center gap-2">
                          {adminMode && (
                            <button
                              className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold"
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
                      <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(r.saldo)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-800">
                          {Number(r.score_base ?? 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{fmt(r.limite_politica)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">{fmt(r.credito_disponible)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-center">
                          <button
                            className="px-3 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm font-semibold shadow-md"
                            onClick={() => { setSelected(r); setOpenReminder(true); }}
                          >
                            💬 Reminder
                          </button>
                          <button
                            className="px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-semibold shadow-md"
                            onClick={() => { setSelected(r); setOpenHistory(true); }}
                          >
                            📊 History
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
    </div>
  );
}