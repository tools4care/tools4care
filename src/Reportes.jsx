// src/Reportes.jsx - Custom Reports Hub (Fixed)
import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import { useDebouncedEffect } from "./hooks/useDebouncedEffect";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { loadPdfLibs } from "./utils/lazyPdf";
import { CHART_TOOLTIP_STYLE, CHART_LEGEND_STYLE } from "./lib/chartTheme";
import { daysSince, classifyArRisk, buildCollectionMessage, phoneLink } from "./lib/arRisk";
import { paginateRows, REPORT_PAGE_SIZES } from "./lib/pagination";
import { VISIT_LEARNING_START } from "./lib/barberCadence";
import { haversineKm, kmToMiles } from "./lib/geo";
import { aggregateLedgerByWeek, ledgerPeriodPreset } from "./lib/cashFlowReport";
import {
  ShoppingCart, AlertTriangle, Users, Package, TrendingUp,
  RotateCcw, Download, RefreshCw, DollarSign, FileText, Search,
  CreditCard, Filter, ShieldCheck, Wallet, ReceiptText, MapPin, Clock,
  ChevronDown, CheckCircle2,
} from "lucide-react";

/* ========================= Helpers ========================= */
const fmtCurrency = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPercent = (value, digits = 1) =>
  `${Number(value || 0).toFixed(digits)}%`;

const percentOf = (value, total) =>
  Number(total || 0) > 0 ? (Number(value || 0) / Number(total || 0)) * 100 : 0;

const fmtDate = (iso) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

function getToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
function get30DaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function easternDayBounds(isoDay) {
  const date = new Date(isoDay + "T12:00:00"); // noon to avoid DST edge
  const s = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  s.setHours(0, 0, 0, 0);
  const e = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  e.setHours(23, 59, 59, 999);
  return { start: s.toISOString(), end: e.toISOString() };
}
function dateRangeBounds(from, to) {
  const { start } = easternDayBounds(from);
  const { end } = easternDayBounds(to);
  return { start, end };
}

const CHART_COLORS = ["#2196F3", "#4CAF50", "#9C27B0", "#FF9800", "#F44336", "#00BCD4", "#E91E63", "#607D8B"];

/* ========================= Tab Config ========================= */
const TABS = [
  { id: "cierre_diario",    label: "Daily Closeout", icon: DollarSign,   color: "text-indigo-600", description: "Closeout-ready totals, A/R movement, and collection quality by day." },
  { id: "ledger",           label: "Financial Ledger", icon: ShieldCheck, color: "text-emerald-600", description: "Canonical money movement with an audit trail for sales, refunds, expenses, and A/R." },
  { id: "ventas",           label: "Sales Detail",   icon: ShoppingCart, color: "text-green-600", description: "Sales performance, open balances, invoice references, and customer-level details." },
  { id: "pagos_breakdown",  label: "Payments",       icon: CreditCard,   color: "text-blue-600", description: "Payment mix by cash, card, checks, and transfer sub-methods including direct A/R payments." },
  { id: "ar_risk",          label: "A/R Aging",      icon: AlertTriangle,color: "text-rose-600", description: "Customers with balances, credit risk, last activity, and collection priority." },
  { id: "discount_audit",   label: "Discounts",      icon: ReceiptText,   color: "text-orange-600", description: "Discounts and price overrides by invoice, product, customer, and seller." },
  { id: "devoluciones",     label: "Returns",        icon: RotateCcw,    color: "text-red-600", description: "Money refunds versus A/R reductions, with item and reason detail." },
  { id: "top_clientes",     label: "Top Clients",    icon: Users,        color: "text-blue-600", description: "Best customers, balances, purchase frequency, and inactivity signals." },
  { id: "productos",        label: "Top Products",   icon: Package,      color: "text-purple-600", description: "Product demand by units, revenue, and average selling price." },
  { id: "ganancias",        label: "Profit Report",  icon: TrendingUp,   color: "text-emerald-600", description: "Gross profit and margin when product cost data is available." },
  { id: "barberias",        label: "Barbershop Visits", icon: MapPin,    color: "text-teal-600", description: "Automatic visit tracking by barbershop — cadence, last visit, and estimated time on site." },
];

/* ========================= Shared UI ========================= */
function SummaryCard({ label, value, sub, color = "blue", icon: Icon }) {
  const cls = {
    blue:    "from-blue-50 to-blue-100 border-blue-200 text-blue-800",
    green:   "from-green-50 to-green-100 border-green-200 text-green-800",
    red:     "from-red-50 to-red-100 border-red-200 text-red-800",
    amber:   "from-amber-50 to-amber-100 border-amber-200 text-amber-800",
    purple:  "from-purple-50 to-purple-100 border-purple-200 text-purple-800",
    emerald: "from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-800",
  };
  return (
    <div className={`min-w-0 bg-gradient-to-br ${cls[color]} border rounded-xl p-3 sm:p-4 shadow-sm`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="truncate text-xs sm:text-sm font-medium opacity-80">{label}</p>
        {Icon && <Icon size={18} className="shrink-0 opacity-60" />}
      </div>
      <p className="truncate text-lg sm:text-2xl font-bold" title={String(value)}>{value}</p>
      {sub && <p className="truncate text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

function DateFilterBar({ from, to, onFrom, onTo, onSearch, loading, extraLabel }) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>
      <button onClick={onSearch} disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors">
        {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
        {extraLabel || "Search"}
      </button>
    </div>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">{msg}</div>;
}

function ChartPanel({ title, subtitle, children, className = "" }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm ${className}`}>
      <div className="mb-4">
        <p className="font-bold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function TablePagination({ pagination, onPageChange, onPageSizeChange }) {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
        <span>
          Showing <strong className="text-gray-800">{pagination.from}–{pagination.to}</strong> of{" "}
          <strong className="text-gray-800">{pagination.total}</strong>
        </span>
        <label className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pagination.pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Rows per page"
          >
            {REPORT_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="mr-1 text-sm font-semibold text-gray-700">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={!pagination.hasPrevious}
          className="min-h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={!pagination.hasNext}
          className="min-h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function InsightPanel({ title = "Action Insights", insights = [] }) {
  const visible = insights.filter(Boolean);
  if (!visible.length) return null;
  const toneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-green-200 bg-green-50 text-green-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    red: "border-red-200 bg-red-50 text-red-900",
    purple: "border-purple-200 bg-purple-50 text-purple-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-slate-500" />
        <h3 className="font-bold text-slate-800">{title}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {visible.map((item, index) => (
          <div key={`${item.title}-${index}`} className={`border rounded-xl p-4 ${toneClass[item.tone || "slate"]}`}>
            <p className="text-xs font-bold uppercase tracking-wide opacity-70">{item.title}</p>
            <p className="text-xl font-bold mt-1">{item.value}</p>
            {item.body && <p className="text-xs mt-1 opacity-75 leading-relaxed">{item.body}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function paymentStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  return ({
    pagado: "Paid",
    paid: "Paid",
    pendiente: "Pending",
    pending: "Pending",
    parcial: "Partial",
    partial: "Partial",
    credito: "Credit",
    credit: "Credit",
    credito_tienda: "Store Credit",
    reembolsado: "Refunded",
    refunded: "Refunded",
  })[s] || (status ? String(status).replaceAll("_", " ") : "—");
}

function statusPillClass(status) {
  const s = String(status || "").toLowerCase();
  if (["pagado", "paid"].includes(s)) return "bg-green-100 text-green-800";
  if (["parcial", "partial"].includes(s)) return "bg-amber-100 text-amber-800";
  if (["credito", "credit", "pendiente", "pending"].includes(s)) return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

function chunkArray(arr, size = 80) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// daysSince/classifyArRisk/buildCollectionMessage/phoneLink now live in
// ./lib/arRisk so the Dashboard's collections widget shares the exact same
// risk logic instead of a second, driftable copy.

/* ========================= FINANCIAL LEDGER ========================= */
function FinancialLedgerReport({ van }) {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  });
  const [to, setTo] = useState(getToday());
  const [days, setDays] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true); setError(null);
    try {
      const [{ data: daily, error: dailyErr }, { data: detail, error: detailErr }] = await Promise.all([
        supabase.from("v_financial_ledger_daily").select("*")
          .eq("van_id", van.id).gte("business_date", from).lte("business_date", to)
          .order("business_date", { ascending: true }),
        supabase.from("v_financial_ledger").select("entry_key,business_date,occurred_at,event_type,payment_method,amount,direction,affects_cash,description,source_table")
          .eq("van_id", van.id).gte("business_date", from).lte("business_date", to)
          .order("occurred_at", { ascending: false }).limit(500),
      ]);
      if (dailyErr) throw dailyErr;
      if (detailErr) throw detailErr;
      setDays(daily || []);
      setEntries(detail || []);
      setSearched(true);
    } catch (e) {
      setError(e.message || "Could not load financial ledger.");
    } finally {
      setLoading(false);
    }
  };

  useDebouncedEffect(() => { search(); }, [van?.id, from, to]);

  const totals = useMemo(() => days.reduce((a, d) => ({
    moneyIn: a.moneyIn + Number(d.money_in || 0),
    refunds: a.refunds + Number(d.refunds || 0),
    expenses: a.expenses + Number(d.expenses || 0),
    net: a.net + Number(d.net_cash_movement || 0),
    ar: a.ar + Number(d.net_ar_change || 0),
    entries: a.entries + Number(d.cash_entries || 0),
  }), { moneyIn: 0, refunds: 0, expenses: 0, net: 0, ar: 0, entries: 0 }), [days]);

  const weeks = useMemo(() => aggregateLedgerByWeek(days), [days]);

  const applyPreset = (preset) => {
    const range = ledgerPeriodPreset(preset, getToday());
    setFrom(range.from);
    setTo(range.to);
  };

  const exportCsv = () => {
    const header = ["Week starting", "Money in", "Refunds", "Expenses", "Net movement", "Net A/R change", "Entries"];
    const rows = weeks.map((week) => [
      week.week_start, week.money_in, week.refunds, week.expenses,
      week.net_cash_movement, week.net_ar_change, week.cash_entries,
    ]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `cash-flow-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    if (!weeks.length || exportingPdf) return;
    setExportingPdf(true);
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFillColor(5, 150, 105);
      doc.rect(0, 0, 297, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text("Tools4Care - Income and Expense Report", 14, 13);
      doc.setFontSize(10);
      doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)}  |  VAN: ${van?.nombre_van || van?.nombre || "-"}`, 14, 21);

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`, 14, 36);

      const summary = [
        ["TOTAL INCOME", fmtCurrency(totals.moneyIn)],
        ["REFUNDS", fmtCurrency(totals.refunds)],
        ["EXPENSES", fmtCurrency(totals.expenses)],
        ["NET TOTAL", fmtCurrency(totals.net)],
      ];
      autoTable(doc, {
        startY: 42,
        head: [["Period summary", "Amount"]],
        body: summary,
        theme: "grid",
        tableWidth: 100,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: "bold" },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === summary.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = totals.net >= 0 ? [209, 250, 229] : [254, 226, 226];
          }
        },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 9,
        head: [["Week starting", "Income", "Refunds", "Expenses", "Net total", "Net A/R change", "Entries"]],
        body: weeks.map((week) => [
          fmtDate(week.week_start), fmtCurrency(week.money_in), fmtCurrency(week.refunds),
          fmtCurrency(week.expenses), fmtCurrency(week.net_cash_movement),
          fmtCurrency(week.net_ar_change), week.cash_entries,
        ]),
        foot: [[
          "TOTAL", fmtCurrency(totals.moneyIn), fmtCurrency(totals.refunds),
          fmtCurrency(totals.expenses), fmtCurrency(totals.net), fmtCurrency(totals.ar), totals.entries,
        ]],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: "bold" },
        footStyles: { fillColor: [209, 250, 229], textColor: [6, 78, 59], fontStyle: "bold" },
      });

      let noteY = doc.lastAutoTable.finalY + 10;
      if (noteY > 195) {
        doc.addPage();
        noteY = 18;
      }
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("Net total = income - refunds - expenses. A/R change is shown separately because it is not necessarily money received.", 14, noteY);
      doc.save(`Tools4Care_Income_Expenses_${from}_to_${to}.pdf`);
    } catch (pdfError) {
      setError(pdfError?.message || "Could not generate the PDF report.");
    } finally {
      setExportingPdf(false);
    }
  };

  const typeLabel = (type) => ({
    sale_payment: "Sale payment",
    ar_payment: "Direct A/R payment",
    money_refund: "Money refund",
    expense: "Expense",
    ar_increase: "A/R increase",
    ar_reduction: "A/R reduction",
    store_credit_devolucion: "Store credit created",
    store_credit_aplicado_venta: "Store credit applied",
  }[type] || String(type || "").replaceAll("_", " "));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-bold uppercase tracking-wide text-slate-500">Quick period</span>
        {[
          ["this_week", "This week"], ["last_week", "Last week"],
          ["30_days", "Last 30 days"], ["90_days", "Last 90 days"],
        ].map(([value, label]) => (
          <button key={value} type="button" onClick={() => applyPreset(value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
            {label}
          </button>
        ))}
        <button type="button" onClick={exportPdf} disabled={!weeks.length || exportingPdf}
          className="ml-auto flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
          {exportingPdf ? <RefreshCw size={14} className="animate-spin"/> : <Download size={14}/>} Download PDF
        </button>
        <button type="button" onClick={exportCsv} disabled={!weeks.length}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
          <Download size={14}/> Export weekly CSV
        </button>
      </div>
      <DateFilterBar from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={search} loading={loading} />
      <ErrorBox msg={error} />

      <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <div className="font-bold flex items-center gap-2"><ShieldCheck size={17}/> Canonical financial source</div>
        <p className="text-xs mt-1 text-emerald-800">
          Combines sale payments, direct A/R payments, real refunds, expenses and non-cash account movements.
          Payments generated inside a sale are excluded from direct A/R payments to prevent duplication.
        </p>
      </div>

      {searched && (<>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <SummaryCard label="Money In" value={fmtCurrency(totals.moneyIn)} color="green" icon={DollarSign} sub={`${totals.entries} money entries`} />
          <SummaryCard label="Money Refunds" value={fmtCurrency(totals.refunds)} color="red" icon={RotateCcw} />
          <SummaryCard label="Expenses" value={fmtCurrency(totals.expenses)} color="amber" icon={ReceiptText} />
          <SummaryCard label="Net Cash Movement" value={fmtCurrency(totals.net)} color={totals.net >= 0 ? "emerald" : "red"} icon={Wallet} />
          <SummaryCard label="Net A/R Change" value={`${totals.ar > 0 ? "+" : ""}${fmtCurrency(totals.ar)}`} color={totals.ar > 0 ? "red" : "blue"} icon={CreditCard} />
        </div>

        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl mb-6">
          <div className="border-b bg-slate-50 px-4 py-3">
            <h3 className="font-bold text-slate-800">Weekly income and expenses</h3>
            <p className="text-xs text-slate-500">Weeks begin Monday. Net movement = money received − refunds − expenses.</p>
          </div>
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-emerald-50"><tr>{["Week starting", "Income", "Refunds", "Expenses", "Net", "Net A/R", "Entries"].map((heading) =>
              <th key={heading} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-emerald-800">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {weeks.length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-gray-400">No weekly activity found</td></tr> : weeks.map((week) => (
                <tr key={week.week_start} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{fmtDate(week.week_start)}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{fmtCurrency(week.money_in)}</td>
                  <td className="px-4 py-3 text-red-600">{fmtCurrency(week.refunds)}</td>
                  <td className="px-4 py-3 text-amber-700">{fmtCurrency(week.expenses)}</td>
                  <td className={`px-4 py-3 font-bold ${week.net_cash_movement >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtCurrency(week.net_cash_movement)}</td>
                  <td className="px-4 py-3">{fmtCurrency(week.net_ar_change)}</td>
                  <td className="px-4 py-3">{week.cash_entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl mb-6">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-emerald-50">
              <tr>{["Date","Money In","Refunds","Expenses","Net Movement","Cash (net)","Card (net)","Transfer (net)","Checks (net)","Other (net)","Net A/R"].map(h =>
                <th key={h} className="px-3 py-3 text-left text-[11px] font-bold text-emerald-800 uppercase tracking-wide">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {days.length === 0 ? <tr><td colSpan={11} className="py-10 text-center text-gray-400">No ledger entries found</td></tr> :
                days.map(d => <tr key={d.business_date} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-semibold">{fmtDate(d.business_date)}</td>
                  <td className="px-3 py-2.5 text-green-700 font-semibold">{fmtCurrency(d.money_in)}</td>
                  <td className="px-3 py-2.5 text-red-600">{fmtCurrency(d.refunds)}</td>
                  <td className="px-3 py-2.5 text-amber-700">{fmtCurrency(d.expenses)}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-900">{fmtCurrency(d.net_cash_movement)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(d.cash)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(d.card)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(d.transfer)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(d.checks)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(d.other)}</td>
                  <td className={`px-3 py-2.5 font-semibold ${Number(d.net_ar_change) > 0 ? "text-red-600" : "text-blue-700"}`}>{fmtCurrency(d.net_ar_change)}</td>
                </tr>)}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h3 className="font-bold text-slate-800">Audit trail</h3>
            <p className="text-xs text-slate-500">Latest 500 movements in the selected period.</p>
          </div>
          <div className="max-h-[460px] overflow-auto divide-y divide-gray-100">
            {entries.map(e => <div key={e.entry_key} className="px-4 py-3 flex items-center gap-3 text-sm">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${e.affects_cash ? Number(e.amount) >= 0 ? "bg-green-500" : "bg-red-500" : "bg-blue-400"}`} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-800">{typeLabel(e.event_type)}</div>
                <div className="text-xs text-slate-500 truncate">{fmtDateTime(e.occurred_at)} · {e.description || e.source_table}</div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${Number(e.amount) >= 0 ? "text-green-700" : "text-red-600"}`}>{Number(e.amount) > 0 ? "+" : ""}{fmtCurrency(e.amount)}</div>
                <div className="text-[10px] uppercase text-slate-400">{e.payment_method || (e.affects_cash ? "money" : "non-cash")}</div>
              </div>
            </div>)}
          </div>
        </div>
      </>)}
    </div>
  );
}

/* ========================= 0. CIERRE DIARIO REPORT ========================= */
function normMetodo(m) {
  if (!m) return "otro";
  const s = m.toLowerCase();
  if (s.includes("cash app") || s.includes("cashapp") || s.includes("venmo") || s.includes("zelle") || s.includes("paypal") || s.includes("wire") || s.includes("transfer")) return "transferencia";
  if (s.includes("card") || s.includes("tarjeta") || s.includes("credit") || s.includes("debit")) return "tarjeta";
  if (s.includes("cash") || s.includes("efectivo")) return "efectivo";
  return "otro";
}

function CierreDiarioReport({ van }) {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  });
  const [to, setTo] = useState(getToday());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true); setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);

      // 1️⃣ Ventas del período
      const { data: ventas, error: vErr } = await supabase
        .from("ventas")
        .select("id, fecha, total_venta, total_pagado, pago_efectivo, pago_tarjeta, pago_transferencia, pago_otro, pago, tipo")
        .eq("van_id", van.id)
        .gte("fecha", start).lte("fecha", end)
        .neq("tipo", "devolucion");
      if (vErr) throw vErr;

      // Direct A/R payments, excluding payments generated by sales.
      const { data: pagos } = await supabase
        .from("pagos")
        .select("id, monto, metodo_pago, fecha_pago, idem_key")
        .eq("van_id", van.id)
        .is("idem_key", null)
        .gte("fecha_pago", start).lte("fecha_pago", end);

      const [{ data: allDebtPayments }, { data: arReductions }] = await Promise.all([
        supabase.from("pagos")
          .select("monto,fecha_pago").eq("van_id", van.id)
          .gte("fecha_pago", start).lte("fecha_pago", end),
        supabase.from("cxc_movimientos")
          .select("monto,fecha,tipo").eq("van_id", van.id)
          .in("tipo", ["devolucion", "credito_tienda"])
          .gte("fecha", start).lte("fecha", end),
      ]);

      // Only real money refunds affect the closeout. A/R reductions do not.
      const { data: refunds } = await supabase
        .from("ventas")
        .select("id, fecha, created_at, total_venta, metodo_pago")
        .eq("van_id", van.id)
        .eq("tipo", "devolucion")
        .eq("estado_pago", "reembolsado")
        .gte("created_at", start).lte("created_at", end);

      // Build daily map
      const dayMap = {};
      const addDay = (iso) => {
        if (!dayMap[iso]) dayMap[iso] = {
          fecha: iso,
          vendido: 0, ventas_count: 0,
          efectivo: 0, tarjeta: 0, transferencia: 0, otro: 0,
          cxc_efectivo: 0, cxc_tarjeta: 0, cxc_transferencia: 0, cxc_otro: 0,
          reembolsos: 0,
          pendiente_ventas: 0,
          pagos_deuda: 0, reducciones_cxc: 0, cheques: 0,
        };
      };

      (ventas || []).forEach((v) => {
        const iso = String(v.fecha || "").slice(0, 10);
        addDay(iso);
        dayMap[iso].vendido       += Number(v.total_venta   || 0);
        dayMap[iso].efectivo      += Number(v.pago_efectivo  || 0);
        dayMap[iso].tarjeta       += Number(v.pago_tarjeta   || 0);
        dayMap[iso].transferencia += Number(v.pago_transferencia || 0);
        dayMap[iso].otro          += Number(v.pago_otro      || 0);
        const checkAmount = (Array.isArray(v.pago?.metodos) ? v.pago.metodos : [])
          .filter((m) => m.forma === "cheque")
          .reduce((s, m) => s + Number(m.monto || 0), 0);
        dayMap[iso].cheques += checkAmount;
        dayMap[iso].pendiente_ventas += Math.max(0, Number(v.total_venta || 0) - Number(v.total_pagado || 0));
        dayMap[iso].ventas_count  += 1;
      });

      (pagos || []).forEach((p) => {
        const iso = String(p.fecha_pago || "").slice(0, 10);
        addDay(iso);
        const m = Number(p.monto || 0);
        const bucket = normMetodo(p.metodo_pago);
        dayMap[iso][`cxc_${bucket}`] = (dayMap[iso][`cxc_${bucket}`] || 0) + m;
        if (String(p.metodo_pago || "").toLowerCase().includes("check")) dayMap[iso].cheques += m;
      });

      (allDebtPayments || []).forEach((p) => {
        const iso = String(p.fecha_pago || "").slice(0, 10);
        addDay(iso);
        dayMap[iso].pagos_deuda += Number(p.monto || 0);
      });
      (arReductions || []).forEach((m) => {
        const iso = String(m.fecha || "").slice(0, 10);
        addDay(iso);
        dayMap[iso].reducciones_cxc += Number(m.monto || 0);
      });

      (refunds || []).forEach((r) => {
        const iso = String(r.fecha || r.created_at || "").slice(0, 10);
        addDay(iso);
        const amount = Number(r.total_venta || 0);
        const bucket = normMetodo(r.metodo_pago);
        dayMap[iso][bucket] = Number(dayMap[iso][bucket] || 0) - amount;
        dayMap[iso].reembolsos += amount;
      });

      setRows(
        Object.values(dayMap)
          .sort((a, b) => a.fecha.localeCompare(b.fecha))
          .map((d) => {
            const cxc_extra = d.cxc_efectivo + d.cxc_tarjeta + d.cxc_transferencia + d.cxc_otro;
            const total_cobrado = d.efectivo + d.tarjeta + d.transferencia + d.otro + cxc_extra;
            return {
              ...d,
              cxc_extra,
              total_efectivo:      d.efectivo + d.cxc_efectivo,
              total_tarjeta:       d.tarjeta + d.cxc_tarjeta,
              total_transferencia: d.transferencia + d.cxc_transferencia,
              total_cobrado,
              // Pending generated by that day's sales. Payments toward older
              // balances must not distort this figure.
              pendiente_cxc: d.pendiente_ventas,
            };
          })
      );
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useDebouncedEffect(() => { search(); }, [van?.id, from, to]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    vendido:      t.vendido      + r.vendido,
    cobrado:      t.cobrado      + r.total_cobrado,
    // ventas-only (no incluyen abonos CxC independientes)
    efectivo:     t.efectivo     + r.efectivo,
    tarjeta:      t.tarjeta      + r.tarjeta,
    transferencia:t.transferencia+ r.transferencia,
    otro:          t.otro          + r.otro,
    total_efectivo:      t.total_efectivo      + r.total_efectivo,
    total_tarjeta:       t.total_tarjeta       + r.total_tarjeta,
    total_transferencia: t.total_transferencia + r.total_transferencia,
    total_otro:          t.total_otro          + r.otro + r.cxc_otro,
    cxc_extra:    t.cxc_extra    + r.cxc_extra,
    reembolsos:   t.reembolsos   + r.reembolsos,
    cheques:       t.cheques       + r.cheques,
    pagos_deuda:   t.pagos_deuda   + r.pagos_deuda,
    reducciones:   t.reducciones   + r.reducciones_cxc,
    pendiente:    t.pendiente    + r.pendiente_cxc,
  }), { vendido:0, cobrado:0, efectivo:0, tarjeta:0, transferencia:0, otro:0, total_efectivo:0, total_tarjeta:0, total_transferencia:0, total_otro:0, cxc_extra:0, reembolsos:0, cheques:0, pagos_deuda:0, reducciones:0, pendiente:0 }), [rows]);
  const netArChange = totals.pendiente - totals.reducciones - totals.pagos_deuda;
  const closeoutInsights = useMemo(() => {
    if (!rows.length) return [];
    const collectionRate = percentOf(totals.cobrado, totals.vendido + totals.cxc_extra);
    const bestDay = rows.reduce((best, row) => row.vendido > (best?.vendido || 0) ? row : best, null);
    const arRiskDay = rows.reduce((worst, row) => row.pendiente_cxc > (worst?.pendiente_cxc || 0) ? row : worst, null);
    const transferShare = percentOf(totals.total_transferencia, totals.cobrado);
    return [
      {
        title: "Collection Rate",
        value: fmtPercent(collectionRate),
        body: collectionRate >= 95 ? "Most sales were collected during the period." : `${fmtCurrency(Math.max(0, totals.pendiente))} stayed as new A/R from sales.`,
        tone: collectionRate >= 95 ? "green" : "amber",
      },
      {
        title: "Closeout Cash to Verify",
        value: fmtCurrency(totals.total_efectivo),
        body: totals.cheques > 0 ? `${fmtCurrency(totals.cheques)} was recorded as checks inside Other.` : "Use this number against the physical cash count.",
        tone: "green",
      },
      bestDay && {
        title: "Best Sales Day",
        value: `${fmtDate(bestDay.fecha)} · ${fmtCurrency(bestDay.vendido)}`,
        body: `${bestDay.ventas_count} sale${bestDay.ventas_count === 1 ? "" : "s"} recorded that day.`,
        tone: "blue",
      },
      arRiskDay && arRiskDay.pendiente_cxc > 0 && {
        title: "A/R Watch Day",
        value: `${fmtDate(arRiskDay.fecha)} · ${fmtCurrency(arRiskDay.pendiente_cxc)}`,
        body: "Largest new customer balance created in the selected range.",
        tone: "amber",
      },
      totals.total_transferencia > 0 && {
        title: "Transfer Mix",
        value: fmtPercent(transferShare),
        body: `${fmtCurrency(totals.total_transferencia)} collected through transfer methods.`,
        tone: "purple",
      },
    ];
  }, [rows, totals]);

  const exportPDF = async () => {
    const { jsPDF, autoTable } = await loadPdfLibs();
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFillColor(79, 70, 229); doc.rect(0, 0, 297, 22, "F");
    doc.setTextColor(255,255,255); doc.setFontSize(14);
    doc.text(`Tools4Care — Daily Closeout Report  |  ${fmtDate(from)} – ${fmtDate(to)}`, 14, 15);
    doc.setTextColor(0,0,0);
    autoTable(doc, {
      startY: 28,
      head: [["Date","Sales","Sold","Cash","Card","Transfer","Other","A/R Payments","= Total Collected","New A/R"]],
      body: rows.map(r => [
        fmtDate(r.fecha), r.ventas_count,
        fmtCurrency(r.vendido),
        r.efectivo > 0 ? fmtCurrency(r.efectivo) : "—",
        r.tarjeta > 0 ? fmtCurrency(r.tarjeta) : "—",
        r.transferencia > 0 ? fmtCurrency(r.transferencia) : "—",
        r.otro > 0 ? fmtCurrency(r.otro) : "—",
        r.cxc_extra > 0 ? fmtCurrency(r.cxc_extra) : "—",
        fmtCurrency(r.total_cobrado),
        r.pendiente_cxc > 0 ? fmtCurrency(r.pendiente_cxc) : "$0.00",
      ]),
      foot: [["TOTAL", "", fmtCurrency(totals.vendido), fmtCurrency(totals.efectivo),
              fmtCurrency(totals.tarjeta), fmtCurrency(totals.transferencia),
              fmtCurrency(totals.otro), fmtCurrency(totals.cxc_extra), fmtCurrency(totals.cobrado), fmtCurrency(totals.pendiente)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79,70,229], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [238,242,255], fontStyle: "bold" },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Accounts Receivable Movement", "Amount"]],
      body: [
        ["New debt generated by sales", fmtCurrency(totals.pendiente)],
        ["A/R reduced by returns", fmtCurrency(totals.reducciones)],
        ["Payments applied to old debt", fmtCurrency(totals.pagos_deuda)],
        ["Estimated net A/R change", `${netArChange > 0 ? "+" : ""}${fmtCurrency(netArChange)}`],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [67,56,202], textColor: 255, fontStyle: "bold" },
    });
    doc.save(`Daily_Closeout_${from}_${to}.pdf`);
  };

  const chartData = rows.map(r => ({
    day: fmtDate(r.fecha),
    Sold: r.vendido,
    Collected: r.total_cobrado,
    "New A/R": r.pendiente_cxc,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={search} disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
        {searched && rows.length > 0 && (
          <button onClick={exportPDF}
            className="bg-white border border-indigo-300 text-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-indigo-50">
            <Download size={14}/> Export PDF
          </button>
        )}
      </div>

      <ErrorBox msg={error} />

      {searched && (<>
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <SummaryCard label="Total Sold"      value={fmtCurrency(totals.vendido)}      color="blue"    icon={ShoppingCart} />
          <SummaryCard label="Total Collected" value={fmtCurrency(totals.cobrado)}      color="green"   icon={DollarSign} />
          <SummaryCard label="Cash"            value={fmtCurrency(totals.total_efectivo)}     color="emerald" icon={DollarSign} />
          <SummaryCard label="Card"            value={fmtCurrency(totals.total_tarjeta)}      color="purple"  icon={FileText} />
          <SummaryCard label="Transfer"        value={fmtCurrency(totals.total_transferencia)}color="blue"    icon={TrendingUp} />
          <SummaryCard label="Other"           value={fmtCurrency(totals.total_otro)}          color="amber"   icon={FileText}
            sub={totals.cheques > 0 ? `${fmtCurrency(totals.cheques)} in checks` : undefined} />
          <SummaryCard label="New A/R"     value={fmtCurrency(totals.pendiente)}    color="amber"   icon={AlertTriangle}
            sub="from sales only" />
        </div>

        {totals.cobrado > 0 && (
          <ChartPanel title="How Money Came In" subtitle="Collected amount by payment method" className="mb-5">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart margin={{ top: 20, bottom: 20, left: 20, right: 20 }}>
                <Pie
                  data={[
                    { name: "Cash", value: totals.total_efectivo },
                    { name: "Card", value: totals.total_tarjeta },
                    { name: "Transfer", value: totals.total_transferencia },
                    { name: "Other", value: totals.total_otro },
                  ].filter((r) => r.value > 0)}
                  cx="50%" cy="50%" innerRadius={44} outerRadius={68} dataKey="value"
                  label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                >
                  {[
                    { name: "Cash", color: "#10b981" },
                    { name: "Card", color: "#a855f7" },
                    { name: "Transfer", color: "#3b82f6" },
                    { name: "Other", color: "#f59e0b" },
                  ].map((row) => <Cell key={row.name} fill={row.color} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtCurrency(v)} {...CHART_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}

        <div className="bg-slate-50 border border-indigo-200 rounded-xl p-4 mb-5">
          <h3 className="font-bold text-indigo-900 mb-1">Accounts Receivable Movement</h3>
          <p className="text-xs text-gray-500 mb-3">Explains how customer balances changed; it is not added again to money collected.</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="New debt from sales" value={fmtCurrency(totals.pendiente)} color="amber" icon={AlertTriangle} />
            <SummaryCard label="A/R reduced by returns" value={fmtCurrency(totals.reducciones)} color="blue" icon={RotateCcw} />
            <SummaryCard label="Payments to old debt" value={fmtCurrency(totals.pagos_deuda)} color="green" icon={DollarSign} />
            <SummaryCard label="Net A/R change" value={`${netArChange > 0 ? "+" : ""}${fmtCurrency(netArChange)}`}
              color={netArChange > 0 ? "red" : "green"} icon={TrendingUp} />
          </div>
        </div>

        <InsightPanel insights={closeoutInsights} />

        {/* CxC standalone note */}
        {totals.cxc_extra > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-sm text-indigo-800 flex items-start gap-2">
            <span className="text-lg">ℹ️</span>
            <span>Includes <strong>{fmtCurrency(totals.cxc_extra)}</strong> in direct A/R payments recorded outside of sales.</span>
          </div>
        )}
        {totals.reembolsos > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
            Includes <strong>–{fmtCurrency(totals.reembolsos)}</strong> in real money refunds. A/R reductions are excluded because no money left the business.
          </div>
        )}

        {/* Bar chart */}
        {rows.length > 0 && (
          <ChartPanel title="Daily Breakdown" subtitle="Sold vs collected vs newly created A/R" className="mb-6">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => fmtCurrency(v)} {...CHART_TOOLTIP_STYLE} />
                <Legend {...CHART_LEGEND_STYLE} />
                <Bar dataKey="Sold"    fill="#6366f1" radius={[3,3,0,0]} />
                <Bar dataKey="Collected"    fill="#22c55e" radius={[3,3,0,0]} />
                <Bar dataKey="New A/R" fill="#f59e0b" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}

        {/* Daily table */}
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-indigo-50">
              <tr>
                {["Date","# Sales","Sold","Cash (net)","Card (net)","Transfer (net)","Other (net)","A/R Payments","= Total Collected","New A/R"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-indigo-700 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-gray-400">No data found</td></tr>
              ) : rows.map(r => (
                <tr key={r.fecha} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-semibold text-gray-800">{fmtDate(r.fecha)}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-center">{r.ventas_count}</td>
                  <td className="px-4 py-2.5 font-bold text-indigo-700">{fmtCurrency(r.vendido)}</td>
                  <td className="px-4 py-2.5 text-emerald-700">{r.efectivo !== 0 ? fmtCurrency(r.efectivo) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-purple-700">{r.tarjeta !== 0 ? fmtCurrency(r.tarjeta) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-blue-700">{r.transferencia !== 0 ? fmtCurrency(r.transferencia) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-amber-700">{r.otro !== 0 ? fmtCurrency(r.otro) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-indigo-600 font-semibold">
                    {r.cxc_extra > 0 ? fmtCurrency(r.cxc_extra) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-bold text-green-700">{fmtCurrency(r.total_cobrado)}</td>
                  <td className="px-4 py-2.5 font-semibold text-amber-700">
                    {r.pendiente_cxc > 0 ? fmtCurrency(r.pendiente_cxc) : <span className="text-green-600 font-bold">✓ $0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-indigo-50 font-bold">
              <tr>
                <td className="px-4 py-3 text-indigo-800">TOTAL</td>
                <td className="px-4 py-3 text-center text-gray-600">{rows.reduce((s,r) => s+r.ventas_count, 0)}</td>
                <td className="px-4 py-3 text-indigo-700">{fmtCurrency(totals.vendido)}</td>
                <td className="px-4 py-3 text-emerald-700">{fmtCurrency(totals.efectivo)}</td>
                <td className="px-4 py-3 text-purple-700">{fmtCurrency(totals.tarjeta)}</td>
                <td className="px-4 py-3 text-blue-700">{fmtCurrency(totals.transferencia)}</td>
                <td className="px-4 py-3 text-amber-700">{fmtCurrency(totals.otro)}</td>
                <td className="px-4 py-3 text-indigo-600">{fmtCurrency(totals.cxc_extra)}</td>
                <td className="px-4 py-3 text-green-700">{fmtCurrency(totals.cobrado)}</td>
                <td className="px-4 py-3 text-amber-700">{fmtCurrency(totals.pendiente)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </>)}
    </div>
  );
}

/* ========================= 1. VENTAS REPORT ========================= */
function VentasReport({ van, usuario }) {
  const isAdmin = usuario?.rol === "admin" || usuario?.rol === "supervisor";
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo]     = useState(getToday());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [searched, setSearched] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => { setPage(1); }, [data]);

  useEffect(() => {
    if (!isAdmin || !van?.id) return;
    supabase.from("usuarios").select("id, nombre, email, rol").eq("activo", true)
      .then(({ data }) => setUsuarios(data || []));
  }, [isAdmin, van?.id]);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true); setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);
      let rows = [];
      let q = supabase
        .from("ventas")
        .select(`
          id, created_at, numero_factura, total_venta, total_pagado, estado_pago, metodo_pago, tipo,
          cliente_id, clientes:cliente_id(nombre),
          usuario_id, usuarios:usuario_id(nombre)
        `)
        .eq("van_id", van.id)
        .neq("tipo", "devolucion")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });

      if (!isAdmin) q = q.eq("usuario_id", usuario.id);
      else if (filtroUsuario) q = q.eq("usuario_id", filtroUsuario);

      const { data: r1, error: e1 } = await q;
      if (!e1) {
        rows = r1 || [];
      } else {
        let q2 = supabase
          .from("ventas")
          .select(`id, created_at, numero_factura, total_venta, total_pagado, estado_pago, metodo_pago, tipo, cliente_id, clientes:cliente_id(nombre), usuario_id`)
          .eq("van_id", van.id)
          .neq("tipo", "devolucion")
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });
        if (!isAdmin) q2 = q2.eq("usuario_id", usuario.id);
        else if (filtroUsuario) q2 = q2.eq("usuario_id", filtroUsuario);
        const { data: r2, error: e2 } = await q2;
        if (e2) throw e2;
        rows = r2 || [];
      }
      setData(rows);
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useDebouncedEffect(() => { search(); }, [van?.id, from, to, filtroUsuario]);

  const summary = useMemo(() => {
    const total = data.reduce((s, r) => s + Number(r.total_venta || 0), 0);
    const cobrado = data.reduce((s, r) => s + Number(r.total_pagado || 0), 0);
    const pendiente = data.reduce((s, r) => s + Math.max(0, Number(r.total_venta || 0) - Number(r.total_pagado || 0)), 0);
    const openCount = data.filter((r) => Math.max(0, Number(r.total_venta || 0) - Number(r.total_pagado || 0)) > 0.009).length;
    return {
      total,
      cobrado,
      pendiente,
      count: data.length,
      avgTicket: data.length ? total / data.length : 0,
      collectionRate: percentOf(cobrado, total),
      openCount,
    };
  }, [data]);

  const byMethod = useMemo(() => {
    const map = {};
    data.forEach((r) => {
      const m = normMetodoDisplay(r.metodo_pago);
      map[m] = (map[m] || 0) + Number(r.total_venta || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [data]);

  const byDay = useMemo(() => {
    const map = {};
    data.forEach((r) => { const day = String(r.created_at || "").slice(0, 10); map[day] = (map[day] || 0) + Number(r.total_venta || 0); });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([day, total]) => ({ day: fmtDate(day), total }));
  }, [data]);

  const pagination = useMemo(() => paginateRows(data, page, pageSize), [data, page, pageSize]);

  const salesInsights = useMemo(() => {
    if (!data.length) return [];
    const bestDayRaw = Object.entries(data.reduce((map, r) => {
      const day = String(r.created_at || "").slice(0, 10);
      map[day] = (map[day] || 0) + Number(r.total_venta || 0);
      return map;
    }, {})).sort((a, b) => b[1] - a[1])[0];
    const biggestPending = [...data]
      .map((r) => ({ ...r, pending: Math.max(0, Number(r.total_venta || 0) - Number(r.total_pagado || 0)) }))
      .sort((a, b) => b.pending - a.pending)[0];
    const topMethod = [...byMethod].sort((a, b) => b.value - a.value)[0];
    return [
      {
        title: "Average Ticket",
        value: fmtCurrency(summary.avgTicket),
        body: `${summary.count} sale${summary.count === 1 ? "" : "s"} in the selected period.`,
        tone: "blue",
      },
      {
        title: "Collection Quality",
        value: fmtPercent(summary.collectionRate),
        body: summary.openCount ? `${summary.openCount} sale${summary.openCount === 1 ? "" : "s"} still have a balance.` : "All selected sales are fully collected.",
        tone: summary.openCount ? "amber" : "green",
      },
      bestDayRaw && {
        title: "Best Sales Day",
        value: `${fmtDate(bestDayRaw[0])} · ${fmtCurrency(bestDayRaw[1])}`,
        body: "Highest revenue day in this report.",
        tone: "green",
      },
      biggestPending?.pending > 0 && {
        title: "Largest Open Balance",
        value: `${biggestPending.clientes?.nombre || "Customer"} · ${fmtCurrency(biggestPending.pending)}`,
        body: biggestPending.numero_factura ? `Invoice ${biggestPending.numero_factura}` : "Follow up from the sales table.",
        tone: "red",
      },
      topMethod && {
        title: "Top Payment Method",
        value: `${topMethod.name} · ${fmtPercent(percentOf(topMethod.value, summary.total))}`,
        body: `${fmtCurrency(topMethod.value)} of reported sales.`,
        tone: "purple",
      },
    ];
  }, [data, byMethod, summary]);

  const exportPDF = async () => {
    const { jsPDF, autoTable } = await loadPdfLibs();
    const doc = new jsPDF();
    doc.setFillColor(25, 118, 210); doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255,255,255); doc.setFontSize(16);
    doc.text("Tools4Care - Daily Sales Report", 14, 18);
    doc.setTextColor(0,0,0); doc.setFontSize(10);
    doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)} | VAN: ${van?.nombre_van || van?.nombre || "—"} | Generated: ${new Date().toLocaleString()}`, 14, 36);
    autoTable(doc, {
      startY: 44,
      head: [["#","Date/Time","Invoice","Client","Seller","Method","Total","Paid","Pending","Status"]],
      body: data.map((r,i) => {
        const pending = Math.max(0, Number(r.total_venta || 0) - Number(r.total_pagado || 0));
        return [i+1, fmtDateTime(r.created_at), r.numero_factura || "—", r.clientes?.nombre||"—", r.usuarios?.nombre||"—",
          normMetodoDisplay(r.metodo_pago), fmtCurrency(r.total_venta), fmtCurrency(r.total_pagado), fmtCurrency(pending), paymentStatusLabel(r.estado_pago)];
      }),
      styles:{fontSize:8}, headStyles:{fillColor:[25,118,210],textColor:255,fontStyle:"bold"},
      foot:[["","","","","","TOTAL",fmtCurrency(summary.total),fmtCurrency(summary.cobrado),fmtCurrency(summary.pendiente),""]],
      footStyles:{fillColor:[240,248,255],fontStyle:"bold"},
    });
    doc.save(`Sales_Report_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        {isAdmin && usuarios.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Seller</label>
            <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">All sellers</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre || u.email}</option>
              ))}
            </select>
          </div>
        )}
        {!isAdmin && (
          <div className="flex items-end pb-0.5">
            <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg font-medium">
              My sales
            </span>
          </div>
        )}
        <button onClick={search} disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </div>
      <ErrorBox msg={error} />
      {searched && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Sales"   value={fmtCurrency(summary.total)}    sub={`${summary.count} transactions`} color="blue"   icon={ShoppingCart} />
          <SummaryCard label="Collected"     value={fmtCurrency(summary.cobrado)}  sub={`${fmtPercent(summary.collectionRate)} collection rate`} color="green"  icon={DollarSign} />
          <SummaryCard label="Open Balance"  value={fmtCurrency(summary.pendiente)} sub={`${summary.openCount} open sale${summary.openCount === 1 ? "" : "s"}`} color="amber"  icon={AlertTriangle} />
          <SummaryCard label="Average Ticket"  value={fmtCurrency(summary.avgTicket)} sub={`${fmtDate(from)} – ${fmtDate(to)}`} color="purple" icon={FileText} />
        </div>
        <InsightPanel insights={salesInsights} />
        {byDay.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <ChartPanel title="Sales by Day" subtitle="Revenue trend for the selected period">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{fontSize:11}} />
                  <YAxis tickFormatter={(v)=>`$${v}`} tick={{fontSize:11}} />
                  <Tooltip formatter={(v)=>fmtCurrency(v)} {...CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="total" fill="#2563eb" radius={[5,5,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Sales by Payment Method" subtitle="Which methods drive the selected sales">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[...byMethod].sort((a, b) => b.value - a.value)} layout="vertical" margin={{ left: 20, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v)=>`$${v}`} tick={{fontSize:11}} />
                  <YAxis type="category" dataKey="name" width={80} tick={{fontSize:11}} />
                  <Tooltip formatter={(v)=>fmtCurrency(v)} {...CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="value" fill="#10b981" radius={[0,5,5,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        )}
        <div className="flex justify-between items-center mb-3">
          <p className="font-semibold text-gray-700">{data.length} sales found</p>
          <button onClick={exportPDF} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-blue-700">
            <Download size={14}/> Export PDF
          </button>
        </div>
        <div className="overflow-hidden bg-white border border-gray-200 rounded-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>{["Date/Time","Invoice","Client","Seller","Method","Total","Paid","Pending","Status"].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagination.total===0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-400">No sales found for this period</td></tr>
                ) : pagination.rows.map(r=>{
                  const pend=Math.max(0,Number(r.total_venta||0)-Number(r.total_pagado||0));
                  return (<tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap text-gray-600 text-xs">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2 text-gray-600 text-xs font-semibold">{r.numero_factura || "—"}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{r.clientes?.nombre||"—"}</td>
                    <td className="px-4 py-2 text-gray-600">{r.usuarios?.nombre||"—"}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${metodoTag(normMetodoDisplay(r.metodo_pago))}`}>{normMetodoDisplay(r.metodo_pago)}</span></td>
                    <td className="px-4 py-2 font-semibold text-gray-900">{fmtCurrency(r.total_venta)}</td>
                    <td className="px-4 py-2 text-green-700 font-medium">{fmtCurrency(r.total_pagado)}</td>
                    <td className="px-4 py-2 text-amber-700 font-medium">{fmtCurrency(pend)}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPillClass(r.estado_pago)}`}>{paymentStatusLabel(r.estado_pago)}</span>
                    </td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            pagination={pagination}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      </>)}
    </div>
  );
}

/* ========================= A/R AGING REPORT ========================= */
function ARAgingReport({ van, usuario }) {
  const isAdmin = usuario?.rol === "admin" || usuario?.rol === "supervisor";
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [vans, setVans] = useState([]);
  const [vanFiltro, setVanFiltro] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("vans").select("id,nombre_van").order("nombre_van")
      .then(({ data }) => setVans(data || []));
  }, [isAdmin]);

  useEffect(() => {
    if (van?.id && !vanFiltro) setVanFiltro(van.id);
  }, [van?.id, vanFiltro]);

  const effectiveVanId = isAdmin ? (vanFiltro || "ALL") : van?.id;

  const search = async () => {
    if (!effectiveVanId) return;
    setLoading(true); setError(null);
    try {
      // CxC balances are company-wide. For a van view, scope the customer
      // population to that van's assigned route, while retaining customers
      // with recent activity on the van when a route is not configured.
      let scopedClientIds = null;
      if (effectiveVanId !== "ALL") {
        const [{ data: routeRows, error: routeErr }, { data: activityRows, error: activityErr }] = await Promise.all([
          supabase.from("rutas_barberias").select("barberia_id").eq("van_id", effectiveVanId),
          supabase.from("ventas").select("cliente_id").eq("van_id", effectiveVanId).neq("tipo", "devolucion").not("cliente_id", "is", null),
        ]);
        if (routeErr) throw routeErr;
        if (activityErr) throw activityErr;
        const routeShopIds = [...new Set((routeRows || []).map((r) => r.barberia_id).filter(Boolean))];
        if (routeShopIds.length) {
          const { data: routeClients, error: clientErr } = await supabase
            .from("clientes").select("id").in("barberia_id", routeShopIds);
          if (clientErr) throw clientErr;
          scopedClientIds = new Set((routeClients || []).map((r) => r.id));
          // Keep unassigned customers with actual sales on this van visible;
          // do not leak customers assigned to another van's route.
          const activityIds = [...new Set((activityRows || []).map((row) => row.cliente_id).filter(Boolean))];
          if (activityIds.length) {
            const { data: activityClients, error: activityClientErr } = await supabase
              .from("clientes").select("id,barberia_id").in("id", activityIds);
            if (activityClientErr) throw activityClientErr;
            for (const row of activityClients || []) if (!row.barberia_id) scopedClientIds.add(row.id);
          }
        } else {
          scopedClientIds = new Set((activityRows || []).map((r) => r.cliente_id).filter(Boolean));
        }
      }

      let balanceQuery = supabase
        .from("v_cxc_cliente_detalle_ext")
        .select("cliente_id, cliente_nombre, saldo, limite_politica, credito_disponible, score_base, telefono, direccion, nombre_negocio")
        .gt("saldo", 0.01)
        .order("saldo", { ascending: false })
        .limit(250);
      if (scopedClientIds) {
        const ids = [...scopedClientIds];
        if (!ids.length) {
          setData([]); setSearched(true); return;
        }
        balanceQuery = balanceQuery.in("cliente_id", ids);
      }
      const { data: balances, error: balErr } = await balanceQuery;
      if (balErr) throw balErr;

      const clients = balances || [];
      const ids = clients.map((c) => c.cliente_id).filter(Boolean);
      const sales = [];
      const payments = [];

      for (const group of chunkArray(ids, 80)) {
        let salesQuery = supabase.from("ventas")
            .select("cliente_id, created_at, fecha, total_venta, total_pagado, numero_factura")
            .in("cliente_id", group)
            .neq("tipo", "devolucion")
            .order("created_at", { ascending: false });
        let paymentsQuery = supabase.from("pagos")
            .select("cliente_id, fecha_pago, monto, metodo_pago")
            .in("cliente_id", group)
            .order("fecha_pago", { ascending: false });
        if (effectiveVanId !== "ALL") {
          salesQuery = salesQuery.eq("van_id", effectiveVanId);
          paymentsQuery = paymentsQuery.eq("van_id", effectiveVanId);
        }
        const [{ data: saleRows }, { data: paymentRows }] = await Promise.all([salesQuery, paymentsQuery]);
        sales.push(...(saleRows || []));
        payments.push(...(paymentRows || []));
      }

      const saleMap = new Map();
      sales.forEach((sale) => {
        const key = sale.cliente_id;
        const current = saleMap.get(key);
        const date = sale.created_at || sale.fecha;
        if (!current || String(date || "") > String(current.created_at || current.fecha || "")) saleMap.set(key, sale);
      });

      const paymentMap = new Map();
      payments.forEach((payment) => {
        const key = payment.cliente_id;
        const current = paymentMap.get(key);
        if (!current || String(payment.fecha_pago || "") > String(current.fecha_pago || "")) paymentMap.set(key, payment);
      });

      setData(clients.map((c) => {
        const lastSale = saleMap.get(c.cliente_id);
        const lastPayment = paymentMap.get(c.cliente_id);
        const lastActivity = [lastSale?.created_at || lastSale?.fecha, lastPayment?.fecha_pago].filter(Boolean).sort().at(-1) || null;
        const age = daysSince(lastActivity);
        const saldo = Number(c.saldo || 0);
        const limit = Number(c.limite_politica || 0);
        const score = Number(c.score_base || 0);
        const utilization = limit > 0 ? percentOf(saldo, limit) : null;
        const riskInfo = classifyArRisk({ saldo, age, score, utilization });
        return {
          ...c,
          saldo,
          limit,
          score,
          lastSale,
          lastPayment,
          lastActivity,
          age,
          risk: riskInfo.risk,
          riskReason: riskInfo.reason,
          utilization,
        };
      }));
      setSearched(true);
    } catch (e) {
      setError(e.message || "Could not load A/R aging.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { search(); }, [effectiveVanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => ({
    balance: data.reduce((s, r) => s + Number(r.saldo || 0), 0),
    clients: data.length,
    highRisk: data.filter((r) => r.risk === "High").length,
    over30: data.filter((r) => Number(r.age || 0) >= 30).length,
  }), [data]);

  const agingChart = useMemo(() => {
    const buckets = [
      { name: "0-7d", min: 0, max: 7, balance: 0, clients: 0 },
      { name: "8-14d", min: 8, max: 14, balance: 0, clients: 0 },
      { name: "15-30d", min: 15, max: 30, balance: 0, clients: 0 },
      { name: "31-60d", min: 31, max: 60, balance: 0, clients: 0 },
      { name: "60+d", min: 61, max: Infinity, balance: 0, clients: 0 },
      { name: "No activity", min: null, max: null, balance: 0, clients: 0 },
    ];
    data.forEach((row) => {
      const age = row.age;
      const bucket = age == null
        ? buckets[5]
        : buckets.find((b) => b.min != null && age >= b.min && age <= b.max);
      if (!bucket) return;
      bucket.balance += Number(row.saldo || 0);
      bucket.clients += 1;
    });
    return buckets.filter((b) => b.clients > 0 || b.balance > 0);
  }, [data]);

  const riskChart = useMemo(() => {
    const map = { High: 0, Medium: 0, Low: 0 };
    data.forEach((row) => { map[row.risk] = (map[row.risk] || 0) + Number(row.saldo || 0); });
    return Object.entries(map).map(([name, value]) => ({ name, value })).filter((r) => r.value > 0);
  }, [data]);

  const insights = useMemo(() => {
    if (!data.length) return [];
    const largest = [...data].sort((a, b) => b.saldo - a.saldo)[0];
    const oldest = [...data].filter((r) => r.age != null).sort((a, b) => b.age - a.age)[0];
    return [
      largest && {
        title: "Largest Balance",
        value: `${largest.cliente_nombre || "Customer"} · ${fmtCurrency(largest.saldo)}`,
        body: largest.telefono ? `Phone: ${largest.telefono}` : "Highest collection priority by amount.",
        tone: "red",
      },
      oldest && {
        title: "Oldest Activity",
        value: `${oldest.cliente_nombre || "Customer"} · ${oldest.age}d`,
        body: "Days since last sale or payment activity.",
        tone: oldest.age >= 30 ? "amber" : "blue",
      },
      {
        title: "High Risk Accounts",
        value: summary.highRisk,
        body: `${fmtCurrency(data.filter((r) => r.risk === "High").reduce((s, r) => s + r.saldo, 0))} in high-risk balances.`,
        tone: summary.highRisk ? "red" : "green",
      },
      {
        title: "30+ Day Watchlist",
        value: summary.over30,
        body: "Customers with no recent sale/payment activity.",
        tone: summary.over30 ? "amber" : "green",
      },
    ];
  }, [data, summary]);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-end gap-3 mb-6">
        <div>
          <p className="text-sm text-gray-600">Open customer balances ranked by collection priority.</p>
          <p className="text-xs text-gray-400 mt-1">{effectiveVanId === "ALL" ? "All vans · route and activity history combined" : `Route scope: ${van?.nombre_van || van?.nombre || effectiveVanId}`}</p>
        </div>
        {isAdmin && vans.length > 0 && (
          <label className="text-xs font-medium text-gray-600">
            Van
            <select value={vanFiltro} onChange={(e) => setVanFiltro(e.target.value)} className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">All Vans</option>
              {vans.map((v) => <option key={v.id} value={v.id}>{v.nombre_van || v.id}</option>)}
            </select>
          </label>
        )}
        <button onClick={search} disabled={loading}
          className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""}/>
          Refresh
        </button>
      </div>
      <ErrorBox msg={error} />
      {searched && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Open A/R" value={fmtCurrency(summary.balance)} color="red" icon={DollarSign} />
          <SummaryCard label="Clients With Balance" value={summary.clients} color="blue" icon={Users} />
          <SummaryCard label="High Risk" value={summary.highRisk} color="red" icon={AlertTriangle} />
          <SummaryCard label="30+ Days" value={summary.over30} color="amber" icon={FileText} />
        </div>
        <InsightPanel insights={insights} />
        {data.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <ChartPanel title="A/R Aging Buckets" subtitle="Balance by days since last customer activity">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={agingChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                  {/* recharts passes each <Bar>'s `name` prop here, not its
                      dataKey, so this must match "Clients"/"Balance" (as set
                      below) — matching lowercase "clients" never fired,
                      which mislabeled the client-count bar as a dollar
                      "Balance" in the tooltip. */}
                  <Tooltip formatter={(v, name) => name === "Clients" ? [v, "Clients"] : [fmtCurrency(v), "Balance"]} {...CHART_TOOLTIP_STYLE} />
                  <Legend {...CHART_LEGEND_STYLE} />
                  <Bar dataKey="balance" name="Balance" fill="#e11d48" radius={[5,5,0,0]} />
                  <Bar dataKey="clients" name="Clients" fill="#fb923c" radius={[5,5,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Risk Mix" subtitle="Open balance grouped by risk level">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={riskChart} cx="50%" cy="50%" innerRadius={48} outerRadius={82} dataKey="value"
                    label={({ name, percent }) => `${name} ${fmtPercent(percent * 100, 0)}`}>
                    {riskChart.map((row) => (
                      <Cell key={row.name} fill={row.name === "High" ? "#ef4444" : row.name === "Medium" ? "#f59e0b" : "#22c55e"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtCurrency(v)} {...CHART_TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        )}
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-rose-50">
              <tr>
                {["Customer","Business","Phone","Balance","Credit Limit","Utilization","Score","Last Sale","Last Payment","Days","Risk"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-rose-700 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
                <th className="sticky right-0 z-10 bg-rose-50 px-4 py-3 text-left text-xs font-bold text-rose-700 uppercase tracking-wide shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-10 text-gray-400">No open A/R balances found</td></tr>
              ) : data.map((r) => (
                <tr key={r.cliente_id} className="group hover:bg-rose-50">
                  <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{r.cliente_nombre || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.nombre_negocio || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.telefono || "—"}</td>
                  <td className="px-4 py-2.5 font-bold text-red-700 whitespace-nowrap">{fmtCurrency(r.saldo)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.limit > 0 ? fmtCurrency(r.limit) : "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.utilization != null ? fmtPercent(r.utilization, 0) : "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.score > 0 ? r.score : "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.lastSale ? fmtDate(r.lastSale.created_at || r.lastSale.fecha) : "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.lastPayment ? fmtDate(r.lastPayment.fecha_pago) : "—"}</td>
                  <td className="px-4 py-2.5 font-semibold whitespace-nowrap">{r.age == null ? "—" : `${r.age}d`}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span title={r.riskReason} className={`px-2 py-0.5 rounded-full text-xs font-bold cursor-help ${
                      r.risk === "High" ? "bg-red-100 text-red-800" : r.risk === "Medium" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                    }`}>{r.risk}</span>
                  </td>
                  {/* Sticky so Remind/Call stay visible without scrolling through all 11 columns first */}
                  <td className="sticky right-0 z-10 bg-white group-hover:bg-rose-50 px-4 py-2.5 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]">
                    <div className="flex flex-nowrap gap-1.5">
                      {phoneLink(r.telefono, "sms", buildCollectionMessage(r)) && (
                        <a
                          href={phoneLink(r.telefono, "sms", buildCollectionMessage(r))}
                          className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold hover:bg-emerald-200 whitespace-nowrap"
                        >
                          Reminder
                        </a>
                      )}
                      {phoneLink(r.telefono, "tel") && (
                        <a
                          href={phoneLink(r.telefono, "tel")}
                          className="px-2 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-bold hover:bg-blue-200 whitespace-nowrap"
                        >
                          Call
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

/* ========================= DISCOUNTS / PRICE OVERRIDES ========================= */
function DiscountAuditReport({ van, usuario }) {
  const isAdmin = usuario?.rol === "admin" || usuario?.rol === "supervisor";
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo] = useState(getToday());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => { setPage(1); }, [rows]);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true); setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);
      let salesQuery = supabase
        .from("ventas")
        .select("id, created_at, numero_factura, cliente_id, usuario_id, clientes:cliente_id(nombre), usuarios:usuario_id(nombre)")
        .eq("van_id", van.id)
        .neq("tipo", "devolucion")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      if (!isAdmin && usuario?.id) salesQuery = salesQuery.eq("usuario_id", usuario.id);

      const { data: sales, error: saleErr } = await salesQuery;
      if (saleErr) throw saleErr;
      const saleRows = sales || [];
      const saleMap = new Map(saleRows.map((s) => [s.id, s]));
      const ids = saleRows.map((s) => s.id);
      const details = [];

      for (const group of chunkArray(ids, 80)) {
        const { data: detailRows, error: detailErr } = await supabase
          .from("detalle_ventas")
          .select("venta_id, cantidad, precio_unitario, descuento, subtotal, producto_id, productos:producto_id(id, nombre, codigo, precio)")
          .in("venta_id", group);
        if (detailErr) throw detailErr;
        details.push(...(detailRows || []));
      }

      const audited = details.map((d) => {
        const sale = saleMap.get(d.venta_id) || {};
        const qty = Number(d.cantidad || 1);
        const pct = Number(d.descuento || 0);
        const subtotal = Number(d.subtotal || 0);
        const storedUnit = Number(d.precio_unitario || 0);
        const chargedUnit = qty > 0
          ? (pct > 0 ? storedUnit * (1 - pct / 100) : subtotal > 0 ? subtotal / qty : storedUnit)
          : 0;
        const productRegular = Number(d.productos?.precio || 0);
        const percentRegular = pct > 0 && pct < 100 && chargedUnit > 0
          ? chargedUnit / (1 - pct / 100)
          : 0;
        const regularUnit = Math.max(productRegular, storedUnit, percentRegular, chargedUnit);
        const regularTotal = Number((regularUnit * qty).toFixed(2));
        const chargedTotal = Number((chargedUnit * qty).toFixed(2));
        const discountAmount = Number(Math.max(0, regularTotal - chargedTotal).toFixed(2));
        const discountPct = regularTotal > 0 ? percentOf(discountAmount, regularTotal) : 0;
        const hasOverride = discountAmount > 0.009;
        return {
          id: `${d.venta_id}-${d.producto_id}`,
          date: sale.created_at,
          invoice: sale.numero_factura,
          customer: sale.clientes?.nombre || "—",
          seller: sale.usuarios?.nombre || "—",
          product: d.productos?.nombre || "Product",
          code: d.productos?.codigo || "—",
          qty,
          regularUnit,
          chargedUnit,
          regularTotal,
          chargedTotal,
          discountAmount,
          discountPct,
          savedPct: pct,
          hasOverride,
        };
      }).filter((r) => r.hasOverride).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      setRows(audited);
      setSearched(true);
    } catch (e) {
      setError(e.message || "Could not load discounts.");
    } finally {
      setLoading(false);
    }
  };

  useDebouncedEffect(() => { search(); }, [van?.id, from, to]);

  const summary = useMemo(() => ({
    count: rows.length,
    regular: rows.reduce((s, r) => s + r.regularTotal, 0),
    charged: rows.reduce((s, r) => s + r.chargedTotal, 0),
    discounts: rows.reduce((s, r) => s + r.discountAmount, 0),
  }), [rows]);

  const sellerChart = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      const key = row.seller || "Unknown";
      if (!map[key]) map[key] = { name: key, discount: 0, lines: 0 };
      map[key].discount += row.discountAmount;
      map[key].lines += 1;
    });
    return Object.values(map).sort((a, b) => b.discount - a.discount).slice(0, 8);
  }, [rows]);

  const productChart = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      const key = row.product || "Product";
      if (!map[key]) map[key] = { name: key.length > 18 ? `${key.slice(0, 18)}...` : key, discount: 0, lines: 0 };
      map[key].discount += row.discountAmount;
      map[key].lines += 1;
    });
    return Object.values(map).sort((a, b) => b.discount - a.discount).slice(0, 8);
  }, [rows]);

  const pagination = useMemo(() => paginateRows(rows, page, pageSize), [rows, page, pageSize]);

  const insights = useMemo(() => {
    if (!rows.length) return [];
    const largest = [...rows].sort((a, b) => b.discountAmount - a.discountAmount)[0];
    const bySeller = rows.reduce((map, r) => {
      map[r.seller] = (map[r.seller] || 0) + r.discountAmount;
      return map;
    }, {});
    const topSeller = Object.entries(bySeller).sort((a, b) => b[1] - a[1])[0];
    const avgDiscount = rows.length ? summary.discounts / rows.length : 0;
    return [
      {
        title: "Total Discounts",
        value: fmtCurrency(summary.discounts),
        body: `${rows.length} discounted line${rows.length === 1 ? "" : "s"} in this period.`,
        tone: "orange",
      },
      largest && {
        title: "Largest Override",
        value: `${largest.product} · ${fmtCurrency(largest.discountAmount)}`,
        body: `${largest.customer} · Invoice ${largest.invoice || "—"}`,
        tone: "red",
      },
      topSeller && {
        title: "Top Seller Discounts",
        value: `${topSeller[0]} · ${fmtCurrency(topSeller[1])}`,
        body: "Most discounted value by seller.",
        tone: "amber",
      },
      {
        title: "Average Discount",
        value: fmtCurrency(avgDiscount),
        body: `${fmtPercent(percentOf(summary.discounts, summary.regular))} off regular value.`,
        tone: "purple",
      },
    ];
  }, [rows, summary]);

  return (
    <div>
      <DateFilterBar from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={search} loading={loading} />
      <ErrorBox msg={error} />
      {searched && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Discounted Lines" value={summary.count} color="amber" icon={ReceiptText} />
          <SummaryCard label="Regular Value" value={fmtCurrency(summary.regular)} color="blue" icon={DollarSign} />
          <SummaryCard label="Charged Value" value={fmtCurrency(summary.charged)} color="green" icon={DollarSign} />
          <SummaryCard label="Discount Value" value={fmtCurrency(summary.discounts)} color="red" icon={AlertTriangle} />
        </div>
        <InsightPanel insights={insights} />
        {rows.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <ChartPanel title="Discounts by Seller" subtitle="Total discount value and number of discounted lines">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={sellerChart} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, name) => name === "Lines" ? [v, "Lines"] : [fmtCurrency(v), "Discount"]} {...CHART_TOOLTIP_STYLE} />
                  <Legend {...CHART_LEGEND_STYLE} />
                  <Bar dataKey="discount" name="Discount" fill="#f97316" radius={[0,5,5,0]} />
                  <Bar dataKey="lines" name="Lines" fill="#fdba74" radius={[0,5,5,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Most Discounted Products" subtitle="Products with the highest discount value">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={productChart} layout="vertical" margin={{ left: 24, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, name) => name === "Lines" ? [v, "Lines"] : [fmtCurrency(v), "Discount"]} {...CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="discount" name="Discount" fill="#ea580c" radius={[0,5,5,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        )}
        <div className="overflow-hidden bg-white border border-gray-200 rounded-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-orange-50">
                <tr>{["Date","Invoice","Customer","Seller","Product","Qty","Regular","Charged","Discount","Discount %"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-orange-700 uppercase tracking-wide">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagination.total === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10 text-gray-400">No discounts or price overrides found</td></tr>
                ) : pagination.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-orange-50">
                    <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{fmtDateTime(r.date)}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-700">{r.invoice || "—"}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900">{r.customer}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.seller}</td>
                    <td className="px-4 py-2.5 text-gray-900">{r.product}</td>
                    <td className="px-4 py-2.5 text-center">{r.qty}</td>
                    <td className="px-4 py-2.5 text-blue-700">{fmtCurrency(r.regularUnit)}</td>
                    <td className="px-4 py-2.5 text-green-700">{fmtCurrency(r.chargedUnit)}</td>
                    <td className="px-4 py-2.5 font-bold text-red-700">{fmtCurrency(r.discountAmount)}</td>
                    <td className="px-4 py-2.5 font-semibold text-orange-700">{fmtPercent(r.discountPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            pagination={pagination}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      </>)}
    </div>
  );
}

/* ========================= 2. DEVOLUCIONES REPORT ========================= */
function DevolucionesReport({ van, usuario }) {
  const [from, setFrom]         = useState(get30DaysAgo());
  const [to, setTo]             = useState(getToday());
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [searched, setSearched] = useState(false);

  const isAdmin = usuario?.rol === "admin" || usuario?.rol === "supervisor";

  useDebouncedEffect(() => { search(); }, [van?.id, from, to]);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true); setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);

      // ── Primary: ventas with tipo = 'devolucion' (how the app saves them) ──
      let q = supabase
        .from("ventas")
        .select(`
          id, created_at, total_venta, total, total_pagado, estado_pago, metodo_pago, pago_efectivo, pago_tarjeta, pago_transferencia, motivo_devolucion, venta_origen_id, notas,
          cliente_id, clientes:cliente_id(nombre),
          usuario_id, usuarios:usuario_id(nombre),
          detalle_ventas!detalle_ventas_venta_id_fkey(cantidad, precio_unitario, producto_id, productos:producto_id(nombre))
        `)
        .eq("van_id", van.id)
        .eq("tipo", "devolucion")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });

      if (!isAdmin && usuario?.id) q = q.eq("usuario_id", usuario.id);

      const { data: rows, error: qErr } = await q;
      if (qErr) throw new Error(qErr.message);

      // Flatten: one row per product line, group under parent if multiple items
      const flat = (rows || []).map(v => {
        const items = Array.isArray(v.detalle_ventas) ? v.detalle_ventas : [];
        const productNames = items
          .map(d => `${d.productos?.nombre || "Product"} ×${d.cantidad}`)
          .join(", ") || "—";
        const clientName = v.clientes?.nombre || "—";
        return {
          id: v.id,
          created_at: v.created_at,
          monto: Number(v.total_venta || v.total || v.total_pagado ||
            (Number(v.pago_efectivo||0) + Number(v.pago_tarjeta||0) + Number(v.pago_transferencia||0)) || 0),
          motivo: v.motivo_devolucion || v.notas || "—",
          clientName,
          productNames,
          driver: v.usuarios?.nombre || "—",
          venta_origen_id: v.venta_origen_id,
          isMoneyRefund: v.estado_pago === "reembolsado",
          method: v.metodo_pago || null,
        };
      });

      setData(flat);
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const total      = useMemo(() => data.reduce((s, r) => s + r.monto, 0), [data]);
  const moneyRefunded = useMemo(() => data.filter(r => r.isMoneyRefund).reduce((s, r) => s + r.monto, 0), [data]);
  const arReduced = useMemo(() => data.filter(r => !r.isMoneyRefund).reduce((s, r) => s + r.monto, 0), [data]);
  const totalItems = useMemo(() => data.length, [data]);
  const byDayChart = useMemo(() => {
    const map = new Map();
    for (const r of data) {
      const day = String(r.created_at).slice(0, 10);
      map.set(day, (map.get(day) || 0) + r.monto);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, monto]) => ({ day: fmtDate(day), monto }));
  }, [data]);
  const reasonChart = useMemo(() => {
    const map = new Map();
    for (const r of data) map.set(r.motivo, (map.get(r.motivo) || 0) + r.monto);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([motivo, monto]) => ({ motivo: motivo.length > 20 ? `${motivo.slice(0, 20)}…` : motivo, monto }));
  }, [data]);

  const exportPDF = async () => {
    const { jsPDF, autoTable } = await loadPdfLibs();
    const doc = new jsPDF();
    doc.setFillColor(220,38,38); doc.rect(0,0,210,28,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(16);
    doc.text("Tools4Care — Returns Report", 14, 18);
    doc.setTextColor(0,0,0); doc.setFontSize(9);
    doc.text(`Period: ${fmtDate(from)} – ${fmtDate(to)}  |  VAN: ${van?.nombre_van||"—"}  |  Generated: ${new Date().toLocaleString()}`, 14, 36);
    autoTable(doc, {
      startY: 44,
      head:[["Date/Time","Client","Products","Reason","Driver","Amount"]],
      body: data.map(r=>[
        fmtDateTime(r.created_at),
        r.clientName,
        r.productNames,
        r.motivo,
        r.driver,
        fmtCurrency(r.monto),
      ]),
      foot:[["","","","","TOTAL",fmtCurrency(total)]],
      styles:{fontSize:7.5}, headStyles:{fillColor:[220,38,38],textColor:255},
      footStyles:{fontStyle:"bold"},
    });
    doc.save(`Returns_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <DateFilterBar from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={search} loading={loading} />
      <ErrorBox msg={error} />

      {searched && (<>
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Returns"  value={fmtCurrency(total)} sub={`${totalItems} return${totalItems!==1?"s":""}`} color="red"   icon={RotateCcw} />
          <SummaryCard label="Money Refunded" value={fmtCurrency(moneyRefunded)} sub="reduces closeout" color="amber" icon={DollarSign} />
          <SummaryCard label="A/R Reduced" value={fmtCurrency(arReduced)} sub="does not reduce closeout" color="blue" icon={FileText} />
          <SummaryCard label="# of Returns"    value={totalItems}         sub={`${fmtDate(from)} – ${fmtDate(to)}`}           color="amber" icon={FileText}   />
        </div>

        {totalItems > 0 && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <ChartPanel title="Returns by Day" subtitle="Refunded amount trend for the selected period">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byDayChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => fmtCurrency(v)} {...CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="monto" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Top Return Reasons" subtitle="Refunded amount by stated reason">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={reasonChart} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="motivo" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={v => fmtCurrency(v)} {...CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="monto" fill="#f97316" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        )}

        {/* Header row */}
        <div className="flex justify-between items-center mb-3">
          <p className="font-semibold text-gray-700">
            {totalItems} return{totalItems!==1?"s":""} found
          </p>
          <button
            onClick={exportPDF}
            className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-red-700 active:scale-95 transition-all"
          >
            <Download size={14}/> Export PDF
          </button>
        </div>

        {totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <RotateCcw size={40} className="opacity-30" />
            <p className="text-base font-medium">No returns found for this period</p>
            <p className="text-sm">Try expanding the date range</p>
          </div>
        ) : (
          <>
            {/* Card list (mobile-friendly) */}
            <div className="space-y-3 mb-4">
              {data.map(r => (
                <div key={r.id} className="bg-white border border-red-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0" />
                        <span className="font-bold text-gray-900 text-sm truncate">{r.clientName}</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1.5">{fmtDateTime(r.created_at)}</p>
                      <p className="text-xs text-gray-700 font-medium mb-1">
                        📦 {r.productNames}
                      </p>
                      <p className="text-xs text-gray-500 italic">
                        Reason: {r.motivo}
                      </p>
                      {isAdmin && (
                        <p className="text-xs text-gray-400 mt-1">Driver: {r.driver}</p>
                      )}
                      {r.venta_origen_id && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Ref: #{r.venta_origen_id.slice(0,8)}…
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-base font-bold text-red-600">{fmtCurrency(r.monto)}</span>
                      <div className={`text-[10px] mt-0.5 font-semibold ${r.isMoneyRefund ? "text-red-500" : "text-blue-600"}`}>
                        {r.isMoneyRefund ? `money refunded · ${r.method || "cash"}` : "A/R reduced · no money out"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer total */}
            <div className="flex justify-end">
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-right">
                <div className="text-xs text-red-500 font-medium uppercase tracking-wide">Total Refunded</div>
                <div className="text-2xl font-bold text-red-700">{fmtCurrency(total)}</div>
              </div>
            </div>
          </>
        )}
      </>)}
    </div>
  );
}

/* ========================= 3. PAGOS ATRASADOS (FIXED) ========================= */
function PagosAtrasadosReport({ van, usuario }) {
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => { search(); }, [van?.id]); // eslint-disable-line

  const search = async () => {
    if (!van?.id) return;
    setLoading(true); setError(null);
    try {
      const today = getToday();

      // ── Try cuotas_acuerdo ──
      // Column names probed: monto (most common), fecha_vencimiento, estado
      const { data: cuotas, error: err } = await supabase
        .from("cuotas_acuerdo")
        .select(`
          id, fecha_vencimiento, monto, estado,
          acuerdo_id,
          acuerdos_pago:acuerdo_id(
            id, cliente_id, van_id,
            clientes:cliente_id(id, nombre, telefono)
          )
        `)
        .lte("fecha_vencimiento", today)
        .neq("estado", "pagado")
        .order("fecha_vencimiento", { ascending: true });

      if (err) {
        // If column names differ, try with cuota instead of monto
        const { data: cuotas2, error: err2 } = await supabase
          .from("cuotas_acuerdo")
          .select(`
            id, fecha_vencimiento, cuota, estado,
            acuerdo_id,
            acuerdos_pago:acuerdo_id(
              id, cliente_id, van_id,
              clientes:cliente_id(id, nombre, telefono)
            )
          `)
          .lte("fecha_vencimiento", today)
          .neq("estado", "pagado")
          .order("fecha_vencimiento", { ascending: true });
        if (err2) throw new Error(`Cuotas: ${err2.message}`);
        // Normalize column
        setData((cuotas2 || [])
          .filter(c => c.acuerdos_pago?.van_id === van.id)
          .map(c => ({ ...c, monto: c.cuota || 0 })));
      } else {
        setData((cuotas || []).filter(c => c.acuerdos_pago?.van_id === van.id));
      }
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const summary = useMemo(() => {
    const today = new Date();
    return data.reduce((acc, r) => {
      const owed = Number(r.monto || 0);
      const days = Math.floor((today - new Date(r.fecha_vencimiento)) / 86400000);
      acc.totalOwed += owed;
      acc.count     += 1;
      acc.maxDays    = Math.max(acc.maxDays, days);
      return acc;
    }, { totalOwed: 0, count: 0, maxDays: 0 });
  }, [data]);

  const byClient = useMemo(() => {
    const map = {};
    data.forEach(r => {
      const c = r.acuerdos_pago?.clientes;
      if (!c) return;
      if (!map[c.id]) map[c.id] = { nombre: c.nombre, telefono: c.telefono, totalOwed: 0, count: 0 };
      map[c.id].totalOwed += Number(r.monto || 0);
      map[c.id].count++;
    });
    return Object.values(map).sort((a,b) => b.totalOwed - a.totalOwed).slice(0,10);
  }, [data]);

  const exportPDF = async () => {
    const { jsPDF, autoTable } = await loadPdfLibs();
    const doc = new jsPDF();
    doc.setFillColor(217,119,6); doc.rect(0,0,210,28,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(16);
    doc.text("Tools4Care - Late Payments Report", 14, 18);
    doc.setTextColor(0,0,0); doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()} | VAN: ${van?.nombre_van||"—"}`, 14, 36);
    const today = new Date();
    autoTable(doc, {
      startY: 44,
      head:[["Client","Phone","Due Date","Days Overdue","Amount","Status"]],
      body: data.map(r=>{
        const c = r.acuerdos_pago?.clientes;
        const days = Math.floor((today - new Date(r.fecha_vencimiento)) / 86400000);
        return [c?.nombre||"—", c?.telefono||"—", fmtDate(r.fecha_vencimiento), `${days} days`, fmtCurrency(r.monto), r.estado||"—"];
      }),
      foot:[["","","","TOTAL OWED", fmtCurrency(summary.totalOwed),""]],
      styles:{fontSize:8}, headStyles:{fillColor:[217,119,6],textColor:255},
      footStyles:{fontStyle:"bold"},
    });
    doc.save(`Late_Payments_Report_${getToday()}.pdf`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-600">All overdue installments from payment agreements</p>
        <button onClick={search} disabled={loading}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""}/>
          Refresh
        </button>
      </div>
      <ErrorBox msg={error} />
      {searched && (<>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <SummaryCard label="Total Owed"           value={fmtCurrency(summary.totalOwed)} sub={`${summary.count} installments`} color="red"   icon={DollarSign} />
          <SummaryCard label="Overdue Installments" value={summary.count}                                                         color="amber" icon={AlertTriangle} />
          <SummaryCard label="Max Days Overdue"     value={`${summary.maxDays}d`}                                                 color="red"   icon={FileText} />
        </div>
        {byClient.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            <p className="font-semibold text-gray-700 mb-3">Top 10 Clients by Amount Owed</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byClient.map(c=>({ name:(c.nombre||"—").split(" ")[0], owed:c.totalOwed }))}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="name" tick={{fontSize:11}}/>
                <YAxis tickFormatter={v=>`$${v}`} tick={{fontSize:11}}/>
                <Tooltip formatter={v=>fmtCurrency(v)}/>
                <Bar dataKey="owed" fill="#F59E0B" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex justify-between items-center mb-3">
          <p className="font-semibold text-gray-700">{data.length} overdue installments</p>
          <button onClick={exportPDF} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-amber-700">
            <Download size={14}/> Export PDF
          </button>
        </div>
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>{["Client","Phone","Due Date","Days Overdue","Amount","Status"].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length===0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">No overdue payments found</td></tr>
              ) : data.map(r=>{
                const c   = r.acuerdos_pago?.clientes;
                const days = Math.floor((new Date() - new Date(r.fecha_vencimiento)) / 86400000);
                return (<tr key={r.id} className="hover:bg-amber-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{c?.nombre||"—"}</td>
                  <td className="px-4 py-2 text-gray-600">{c?.telefono||"—"}</td>
                  <td className="px-4 py-2 text-gray-700">{fmtDate(r.fecha_vencimiento)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${days>30?"bg-red-100 text-red-800":"bg-amber-100 text-amber-800"}`}>
                      {days}d
                    </span>
                  </td>
                  <td className="px-4 py-2 font-bold text-red-700">{fmtCurrency(r.monto)}</td>
                  <td className="px-4 py-2"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">{r.estado}</span></td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

/* ========================= 4. TOP CLIENTES ========================= */
function TopClientesReport({ van, usuario }) {
  const isAdminTop = usuario?.rol === "admin" || usuario?.rol === "supervisor";
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo]     = useState(getToday());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [searched, setSearched] = useState(false);
  const [sortBy, setSortBy]   = useState("total");

  useDebouncedEffect(() => { search(); }, [van?.id, from, to]);

  const search = async () => {
    if (!van?.id) return;
    setLoading(true); setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);
      let qTop = supabase
        .from("ventas")
        .select(`total_venta, total_pagado, estado_pago, created_at, cliente_id, clientes:cliente_id(id, nombre, telefono)`)
        .eq("van_id", van.id)
        .gte("created_at", start)
        .lte("created_at", end);
      if (!isAdminTop && usuario?.id) qTop = qTop.eq("usuario_id", usuario.id);
      const { data: ventas, error: err } = await qTop;
      if (err) throw err;

      const map = {};
      (ventas || []).forEach(v => {
        const c = v.clientes;
        if (!c) return;
        if (!map[c.id]) map[c.id] = { id:c.id, nombre:c.nombre, telefono:c.telefono, totalCompras:0, totalPagado:0, count:0, lastPurchase:null };
        map[c.id].totalCompras  += Number(v.total_venta  || 0);
        map[c.id].totalPagado   += Number(v.total_pagado || 0);
        map[c.id].count++;
        if (!map[c.id].lastPurchase || v.created_at > map[c.id].lastPurchase) map[c.id].lastPurchase = v.created_at;
      });
      setData(Object.values(map).map(c => ({
        ...c,
        balance:        c.totalCompras - c.totalPagado,
        daysSinceLast:  c.lastPurchase ? Math.floor((new Date()-new Date(c.lastPurchase))/86400000) : 999,
      })));
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const sorted = useMemo(() => [...data].sort((a,b) =>
    sortBy==="total"  ? b.totalCompras - a.totalCompras :
    sortBy==="balance"? b.balance - a.balance :
    b.daysSinceLast - a.daysSinceLast
  ).slice(0,20), [data, sortBy]);

  const top10Chart = sorted.slice(0,10).map(c => ({ name:(c.nombre||"—").split(" ")[0], total:c.totalCompras, balance:c.balance }));
  const clientInsights = useMemo(() => {
    if (!data.length) return [];
    const topBuyer = [...data].sort((a, b) => b.totalCompras - a.totalCompras)[0];
    const biggestBalance = [...data].sort((a, b) => b.balance - a.balance)[0];
    const inactiveHighValue = [...data]
      .filter((c) => c.totalCompras > 0 && c.daysSinceLast > 14)
      .sort((a, b) => b.totalCompras - a.totalCompras)[0];
    const totalRevenue = data.reduce((s, c) => s + c.totalCompras, 0);
    return [
      topBuyer && {
        title: "Best Customer",
        value: `${topBuyer.nombre || "Customer"} · ${fmtCurrency(topBuyer.totalCompras)}`,
        body: `${topBuyer.count} purchase${topBuyer.count === 1 ? "" : "s"} in this period.`,
        tone: "blue",
      },
      biggestBalance?.balance > 0 && {
        title: "Highest Balance",
        value: `${biggestBalance.nombre || "Customer"} · ${fmtCurrency(biggestBalance.balance)}`,
        body: "Prioritize this customer for collection follow-up.",
        tone: "amber",
      },
      inactiveHighValue && {
        title: "Reactivation Target",
        value: `${inactiveHighValue.nombre || "Customer"} · ${inactiveHighValue.daysSinceLast}d`,
        body: `${fmtCurrency(inactiveHighValue.totalCompras)} in recent value but no purchase in more than 14 days.`,
        tone: "purple",
      },
      {
        title: "Client Concentration",
        value: topBuyer ? fmtPercent(percentOf(topBuyer.totalCompras, totalRevenue)) : "0.0%",
        body: "Share of revenue from the top customer.",
        tone: "green",
      },
    ];
  }, [data]);

  const exportPDF = async () => {
    const { jsPDF, autoTable } = await loadPdfLibs();
    const doc = new jsPDF();
    doc.setFillColor(37,99,235); doc.rect(0,0,210,28,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(16);
    doc.text("Tools4Care - Top Clients Report", 14, 18);
    doc.setTextColor(0,0,0); doc.setFontSize(10);
    doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)} | Generated: ${new Date().toLocaleString()}`, 14, 36);
    autoTable(doc, {
      startY:44,
      head:[["#","Client","Phone","Purchases","Total","Balance","Last Purchase"]],
      body: sorted.map((c,i)=>[i+1, c.nombre||"—", c.telefono||"—", c.count, fmtCurrency(c.totalCompras), fmtCurrency(c.balance), fmtDate(c.lastPurchase)]),
      styles:{fontSize:8}, headStyles:{fillColor:[37,99,235],textColor:255},
    });
    doc.save(`Top_Clients_Report_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <DateFilterBar from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={search} loading={loading} />
      <ErrorBox msg={error} />
      {searched && (<>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <SummaryCard label="Unique Clients" value={data.length}                                                    color="blue"  icon={Users} />
          <SummaryCard label="Total Revenue"  value={fmtCurrency(data.reduce((s,c)=>s+c.totalCompras,0))}           color="green" icon={DollarSign} />
          <SummaryCard label="Total Pending"  value={fmtCurrency(data.reduce((s,c)=>s+c.balance,0))}                color="amber" icon={AlertTriangle} />
        </div>
        <InsightPanel insights={clientInsights} />
        {top10Chart.length>0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            <p className="font-semibold text-gray-700 mb-3">Top 10 Clients by Sales</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top10Chart}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="name" tick={{fontSize:11}}/>
                <YAxis tickFormatter={v=>`$${v}`} tick={{fontSize:11}}/>
                <Tooltip formatter={v=>fmtCurrency(v)}/>
                <Bar dataKey="total"   fill="#2563EB" name="Total"   radius={[4,4,0,0]}/>
                <Bar dataKey="balance" fill="#F59E0B" name="Balance" radius={[4,4,0,0]}/>
                <Legend/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex flex-wrap justify-between items-center mb-3 gap-3">
          <div className="flex gap-2">
            {[["total","By Sales"],["balance","By Balance"],["days","By Inactivity"]].map(([val,lbl])=>(
              <button key={val} onClick={()=>setSortBy(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${sortBy===val?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {lbl}
              </button>
            ))}
          </div>
          <button onClick={exportPDF} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-blue-700">
            <Download size={14}/> Export PDF
          </button>
        </div>
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>{["#","Client","Phone","Purchases","Total","Balance","Last Purchase","Days Inactive"].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length===0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">No data for this period</td></tr>
              ) : sorted.map((c,i)=>(
                <tr key={c.id} className="hover:bg-blue-50">
                  <td className="px-4 py-2 font-bold text-gray-400">{i+1}</td>
                  <td className="px-4 py-2 font-semibold text-gray-900">{c.nombre||"—"}</td>
                  <td className="px-4 py-2 text-gray-600">{c.telefono||"—"}</td>
                  <td className="px-4 py-2 text-center">{c.count}</td>
                  <td className="px-4 py-2 font-semibold text-green-700">{fmtCurrency(c.totalCompras)}</td>
                  <td className="px-4 py-2 font-semibold text-amber-700">{fmtCurrency(c.balance)}</td>
                  <td className="px-4 py-2 text-gray-600">{fmtDate(c.lastPurchase)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.daysSinceLast>30?"bg-red-100 text-red-700":"bg-gray-100 text-gray-600"}`}>
                      {c.daysSinceLast===999?"—":`${c.daysSinceLast}d`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

/* ========================= 5. PRODUCTOS MÁS VENDIDOS (FIXED) ========================= */
function ProductosReport({ van, usuario }) {
  const isAdminProd = usuario?.rol === "admin" || usuario?.rol === "supervisor";
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo]     = useState(getToday());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useDebouncedEffect(() => { search(); }, [van?.id, from, to]);
  useEffect(() => { setPage(1); }, [data]);

  const search = async () => {
    if (!van?.id) return;
    setPage(1);
    setLoading(true); setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);

      // ── Step 1: get venta IDs for this van + date range ──
      let qProd = supabase.from("ventas").select("id")
        .eq("van_id", van.id)
        .gte("created_at", start)
        .lte("created_at", end);
      if (!isAdminProd && usuario?.id) qProd = qProd.eq("usuario_id", usuario.id);
      const { data: ventasData, error: vErr } = await qProd;
      if (vErr) throw vErr;

      const ventaIds = (ventasData || []).map(v => v.id);
      if (ventaIds.length === 0) { setData([]); setSearched(true); return; }

      // ── Step 2: get detalle_ventas for those IDs (no ambiguous join) ──
      const { data: detalles, error: dErr } = await supabase
        .from("detalle_ventas")
        .select("cantidad, precio_unitario, descuento, subtotal, producto_id, productos:producto_id(id, nombre)")
        .in("venta_id", ventaIds);
      if (dErr) throw dErr;

      // ── Aggregate by product ──
      const map = {};
      (detalles || []).forEach(r => {
        const p = r.productos;
        if (!p) return;
        if (!map[p.id]) map[p.id] = { id:p.id, nombre:p.nombre, totalQty:0, totalRevenue:0 };
        const qty  = Number(r.cantidad || 0);
        const base = Number(r.precio_unitario || 0);
        const pct  = Number(r.descuento || 0);
        const finalUnit = pct > 0 ? base * (1 - pct / 100) : base;
        // subtotal guardado = precio real; si es NULL (registros viejos) aplica descuento
        const revenue = Number(r.subtotal) > 0
          ? Number(r.subtotal)
          : Number((finalUnit * qty).toFixed(2));
        map[p.id].totalQty     += qty;
        map[p.id].totalRevenue += revenue;
      });
      setData(Object.values(map).sort((a,b) => b.totalQty - a.totalQty));
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const top10 = data.slice(0,10).map(p => ({ name:(p.nombre||"—").slice(0,18), qty:p.totalQty, revenue:p.totalRevenue }));
  const productInsights = useMemo(() => {
    if (!data.length) return [];
    const byRevenue = [...data].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
    const byUnits = [...data].sort((a, b) => b.totalQty - a.totalQty)[0];
    const totalRevenue = data.reduce((s, p) => s + p.totalRevenue, 0);
    const totalUnits = data.reduce((s, p) => s + p.totalQty, 0);
    return [
      byRevenue && {
        title: "Revenue Driver",
        value: `${byRevenue.nombre || "Product"} · ${fmtCurrency(byRevenue.totalRevenue)}`,
        body: `${fmtPercent(percentOf(byRevenue.totalRevenue, totalRevenue))} of product revenue.`,
        tone: "green",
      },
      byUnits && {
        title: "Fastest Mover",
        value: `${byUnits.nombre || "Product"} · ${byUnits.totalQty} units`,
        body: "Keep this item stocked before the next route.",
        tone: "purple",
      },
      {
        title: "Average Unit Price",
        value: totalUnits > 0 ? fmtCurrency(totalRevenue / totalUnits) : "$0.00",
        body: `${totalUnits} unit${totalUnits === 1 ? "" : "s"} sold across ${data.length} product${data.length === 1 ? "" : "s"}.`,
        tone: "blue",
      },
    ];
  }, [data]);
  const pagination = useMemo(() => paginateRows(data, page, pageSize), [data, page, pageSize]);

  const exportPDF = async () => {
    const { jsPDF, autoTable } = await loadPdfLibs();
    const doc = new jsPDF();
    doc.setFillColor(124,58,237); doc.rect(0,0,210,28,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(16);
    doc.text("Tools4Care - Top Products Report", 14, 18);
    doc.setTextColor(0,0,0); doc.setFontSize(10);
    doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)} | Generated: ${new Date().toLocaleString()}`, 14, 36);
    autoTable(doc, {
      startY:44,
      head:[["#","Product","Units Sold","Revenue","Avg Price"]],
      body: data.map((p,i)=>[i+1, p.nombre||"—", p.totalQty, fmtCurrency(p.totalRevenue), p.totalQty>0?fmtCurrency(p.totalRevenue/p.totalQty):"—"]),
      styles:{fontSize:8}, headStyles:{fillColor:[124,58,237],textColor:255},
    });
    doc.save(`Top_Products_Report_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <DateFilterBar
        from={from}
        to={to}
        onFrom={(value) => { setFrom(value); setPage(1); }}
        onTo={(value) => { setTo(value); setPage(1); }}
        onSearch={search}
        loading={loading}
      />
      <ErrorBox msg={error} />
      {searched && (<>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <SummaryCard label="Products Sold" value={data.length}                                            sub="unique products" color="purple" icon={Package} />
          <SummaryCard label="Total Units"   value={data.reduce((s,p)=>s+p.totalQty,0)}                   color="blue"   icon={ShoppingCart} />
          <SummaryCard label="Revenue"       value={fmtCurrency(data.reduce((s,p)=>s+p.totalRevenue,0))}  color="green"  icon={DollarSign} />
        </div>
        <InsightPanel insights={productInsights} />
        {top10.length>0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="font-semibold text-gray-700 mb-3">Top 10 by Units Sold</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top10}>
                  <CartesianGrid strokeDasharray="3 3"/>
                  <XAxis dataKey="name" tick={{fontSize:10}}/>
                  <YAxis tick={{fontSize:11}}/>
                  <Tooltip/>
                  <Bar dataKey="qty" fill="#7C3AED" name="Units" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="font-semibold text-gray-700 mb-3">Top 10 by Revenue</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top10}>
                  <CartesianGrid strokeDasharray="3 3"/>
                  <XAxis dataKey="name" tick={{fontSize:10}}/>
                  <YAxis tickFormatter={v=>`$${v}`} tick={{fontSize:11}}/>
                  <Tooltip formatter={v=>fmtCurrency(v)}/>
                  <Bar dataKey="revenue" fill="#059669" name="Revenue" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center mb-3">
          <p className="font-semibold text-gray-700">{data.length} products</p>
          <button onClick={exportPDF} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-purple-700">
            <Download size={14}/> Export PDF
          </button>
        </div>
        <div className="overflow-hidden bg-white border border-gray-200 rounded-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>{["#","Product","Units Sold","Revenue","Avg Price"].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagination.total===0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-400">No product data for this period</td></tr>
                ) : pagination.rows.map((p,i)=>(
                  <tr key={p.id} className="hover:bg-purple-50">
                    <td className="px-4 py-2 font-bold text-gray-400">{pagination.from+i}</td>
                    <td className="px-4 py-2 font-semibold text-gray-900">{p.nombre||"—"}</td>
                    <td className="px-4 py-2 text-center font-bold text-purple-700">{p.totalQty}</td>
                    <td className="px-4 py-2 font-semibold text-green-700">{fmtCurrency(p.totalRevenue)}</td>
                    <td className="px-4 py-2 text-gray-600">{p.totalQty>0?fmtCurrency(p.totalRevenue/p.totalQty):"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            pagination={pagination}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      </>)}
    </div>
  );
}

/* ========================= 6. GANANCIAS (FIXED) ========================= */
function GananciasReport({ van, usuario }) {
  const isAdminGan = usuario?.rol === "admin" || usuario?.rol === "supervisor";
  const [from, setFrom] = useState(get30DaysAgo());
  const [to, setTo]     = useState(getToday());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [searched, setSearched] = useState(false);
  const [noCostField, setNoCostField] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => { setPage(1); }, [data]);

  const search = async () => {
    if (!van?.id) return;
    setPage(1);
    setLoading(true); setError(null); setNoCostField(false);
    try {
      const { start, end } = dateRangeBounds(from, to);

      // ── Step 1: get venta IDs ──
      let qGan = supabase.from("ventas").select("id")
        .eq("van_id", van.id)
        .gte("created_at", start)
        .lte("created_at", end);
      if (!isAdminGan && usuario?.id) qGan = qGan.eq("usuario_id", usuario.id);
      const { data: ventasData, error: vErr } = await qGan;
      if (vErr) throw vErr;

      const ventaIds = (ventasData || []).map(v => v.id);
      if (ventaIds.length === 0) { setData([]); setSearched(true); return; }

      // ── Step 2: detalle_ventas with product cost ──
      const { data: detalles, error: dErr } = await supabase
        .from("detalle_ventas")
        .select(`
          cantidad, precio_unitario, subtotal, descuento, producto_id,
          productos:producto_id(id, nombre, costo)
        `)
        .in("venta_id", ventaIds);
      if (dErr) throw dErr;

      // ── Aggregate ──
      const map = {};
      let hasCost = false;
      (detalles || []).forEach(r => {
        const p = r.productos;
        if (!p) return;
        const costo = Number(p.costo || 0);
        if (costo > 0) hasCost = true;
        const qty = Number(r.cantidad || 0);
        // Always derive from precio_unitario + descuento — some historical
        // rows have a stored subtotal that never got recalculated after a
        // discount was applied, which understated the discount here.
        const descuentoPct = Number(r.descuento || 0);
        const precioConDescuento = Number(r.precio_unitario || 0) * (1 - descuentoPct / 100);
        const revenue = precioConDescuento * qty;
        if (!map[p.id]) map[p.id] = { id:p.id, nombre:p.nombre, costo, totalQty:0, totalRevenue:0, totalCost:0 };
        map[p.id].totalQty     += qty;
        map[p.id].totalRevenue += revenue;
        map[p.id].totalCost    += qty * costo;
      });
      if (!hasCost) setNoCostField(true);
      setData(Object.values(map).sort((a,b) => (b.totalRevenue-b.totalCost)-(a.totalRevenue-a.totalCost)));
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useDebouncedEffect(() => { search(); }, [van?.id, from, to]);

  const summary = useMemo(() => ({
    revenue: data.reduce((s,p)=>s+p.totalRevenue,0),
    cost:    data.reduce((s,p)=>s+p.totalCost,0),
    profit:  data.reduce((s,p)=>s+(p.totalRevenue-p.totalCost),0),
    margin:  data.reduce((s,p)=>s+p.totalRevenue,0) > 0
      ? (data.reduce((s,p)=>s+(p.totalRevenue-p.totalCost),0) / data.reduce((s,p)=>s+p.totalRevenue,0)) * 100
      : 0,
  }), [data]);

  const top10 = data.slice(0,10).map(p => ({
    name:(p.nombre||"—").slice(0,16),
    profit: p.totalRevenue-p.totalCost,
    revenue:p.totalRevenue,
  }));
  const pagination = useMemo(() => paginateRows(data, page, pageSize), [data, page, pageSize]);

  const exportPDF = async () => {
    const { jsPDF, autoTable } = await loadPdfLibs();
    const doc = new jsPDF();
    doc.setFillColor(5,150,105); doc.rect(0,0,210,28,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(16);
    doc.text("Tools4Care - Profit Report", 14, 18);
    doc.setTextColor(0,0,0); doc.setFontSize(10);
    doc.text(`Period: ${fmtDate(from)} - ${fmtDate(to)} | Generated: ${new Date().toLocaleString()}`, 14, 36);
    autoTable(doc, {
      startY:44,
      head:[["#","Product","Units","Revenue","Cost","Profit","Margin"]],
      body: data.map((p,i)=>{
        const profit = p.totalRevenue-p.totalCost;
        const margin = p.totalRevenue>0?((profit/p.totalRevenue)*100).toFixed(1)+"%" : "—";
        return [i+1, p.nombre||"—", p.totalQty, fmtCurrency(p.totalRevenue), fmtCurrency(p.totalCost), fmtCurrency(profit), margin];
      }),
      foot:[["","TOTALS","",fmtCurrency(summary.revenue),fmtCurrency(summary.cost),fmtCurrency(summary.profit),`${summary.margin.toFixed(1)}%`]],
      styles:{fontSize:8}, headStyles:{fillColor:[5,150,105],textColor:255},
      footStyles:{fontStyle:"bold"},
    });
    doc.save(`Profit_Report_${from}_to_${to}.pdf`);
  };

  return (
    <div>
      <DateFilterBar
        from={from}
        to={to}
        onFrom={(value) => { setFrom(value); setPage(1); }}
        onTo={(value) => { setTo(value); setPage(1); }}
        onSearch={search}
        loading={loading}
      />
      {noCostField && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg p-3 mb-4 text-sm flex items-center gap-2">
          <AlertTriangle size={16}/>
          No cost data found for products. Add a <code className="font-mono bg-amber-100 px-1 rounded">costo</code> or <code className="font-mono bg-amber-100 px-1 rounded">precio_costo</code> column to your products table to enable profit tracking.
        </div>
      )}
      <ErrorBox msg={error} />
      {searched && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Revenue" value={fmtCurrency(summary.revenue)} color="blue"    icon={DollarSign} />
          <SummaryCard label="Total Cost"    value={fmtCurrency(summary.cost)}    color="red"     icon={TrendingUp} />
          <SummaryCard label="Gross Profit"  value={fmtCurrency(summary.profit)}  color="emerald" icon={TrendingUp} />
          <SummaryCard label="Margin"        value={`${summary.margin.toFixed(1)}%`} sub="(Revenue − Cost) ÷ Revenue" color="green" icon={TrendingUp} />
        </div>
        {top10.length>0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            <p className="font-semibold text-gray-700 mb-3">Top 10 Most Profitable Products</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top10}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="name" tick={{fontSize:10}}/>
                <YAxis tickFormatter={v=>`$${v}`} tick={{fontSize:11}}/>
                <Tooltip formatter={v=>fmtCurrency(v)}/>
                <Bar dataKey="profit"  fill="#059669" name="Profit"  radius={[4,4,0,0]}/>
                <Bar dataKey="revenue" fill="#93C5FD" name="Revenue" radius={[4,4,0,0]}/>
                <Legend/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex justify-between items-center mb-3">
          <p className="font-semibold text-gray-700">{data.length} products</p>
          <button onClick={exportPDF} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-emerald-700">
            <Download size={14}/> Export PDF
          </button>
        </div>
        <div className="overflow-hidden bg-white border border-gray-200 rounded-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>{["#","Product","Units","Revenue","Cost","Profit","Margin"].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagination.total===0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No product data for this period</td></tr>
                ) : pagination.rows.map((p,i)=>{
                  const profit = p.totalRevenue - p.totalCost;
                  const margin = p.totalRevenue>0 ? ((profit/p.totalRevenue)*100).toFixed(1) : null;
                  return (<tr key={p.id} className="hover:bg-emerald-50">
                    <td className="px-4 py-2 font-bold text-gray-400">{pagination.from+i}</td>
                    <td className="px-4 py-2 font-semibold text-gray-900">{p.nombre||"—"}</td>
                    <td className="px-4 py-2 text-center">{p.totalQty}</td>
                    <td className="px-4 py-2 font-semibold text-blue-700">{fmtCurrency(p.totalRevenue)}</td>
                    <td className="px-4 py-2 text-red-600">{p.totalCost>0?fmtCurrency(p.totalCost):<span className="text-gray-400 text-xs">No cost</span>}</td>
                    <td className="px-4 py-2 font-bold text-emerald-700">{p.totalCost>0?fmtCurrency(profit):<span className="text-gray-400 text-xs">—</span>}</td>
                    <td className="px-4 py-2">
                      {margin!=null && p.totalCost>0
                        ? <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${Number(margin)>20?"bg-green-100 text-green-800":"bg-amber-100 text-amber-800"}`}>{margin}%</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            pagination={pagination}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      </>)}
    </div>
  );
}

/* ========================= PAYMENT BREAKDOWN REPORT ========================= */

const METODO_OPTIONS = [
  { value: "all",        label: "All",            emoji: "💰", group: "main",     color: "slate"  },
  { value: "efectivo",   label: "Cash",           emoji: "💵", group: "main",     color: "green"  },
  { value: "tarjeta",    label: "Card",           emoji: "💳", group: "main",     color: "purple" },
  { value: "cheque",     label: "Checks",         emoji: "🧾", group: "main",     color: "amber"  },
  { value: "transfer_all", label: "Transfer (All)", emoji: "🏦", group: "transfer", color: "blue"   },
  { value: "zelle",      label: "Zelle",          emoji: "💜", group: "transfer", color: "violet" },
  { value: "cashapp",    label: "Cash App",       emoji: "💚", group: "transfer", color: "green"  },
  { value: "venmo",      label: "Venmo",          emoji: "💙", group: "transfer", color: "sky"    },
  { value: "applepay",   label: "Apple Pay",      emoji: "🍎", group: "transfer", color: "gray"   },
];

const PRESETS = [
  { value: "today",    label: "Today" },
  { value: "yesterday",label: "Yesterday" },
  { value: "thisweek", label: "This Week" },
  { value: "lastweek", label: "Last Week" },
  { value: "last7",    label: "Last 7 Days" },
  { value: "last30",   label: "Last 30 Days" },
  { value: "custom",   label: "Custom" },
];

function applyDatePreset(p) {
  const tz = "America/New_York";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  if (p === "today")     return { from: today, to: today };
  if (p === "yesterday") {
    const d = new Date(); d.setDate(d.getDate() - 1);
    const iso = d.toLocaleDateString("en-CA", { timeZone: tz });
    return { from: iso, to: iso };
  }
  if (p === "thisweek") {
    const d = new Date();
    const day = d.getDay(); // 0=Sun
    const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return { from: mon.toLocaleDateString("en-CA", { timeZone: tz }), to: today };
  }
  if (p === "lastweek") {
    const d = new Date();
    const day = d.getDay();
    const lastMon = new Date(d); lastMon.setDate(d.getDate() - (day === 0 ? 6 : day - 1) - 7);
    const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
    return { from: lastMon.toLocaleDateString("en-CA", { timeZone: tz }), to: lastSun.toLocaleDateString("en-CA", { timeZone: tz }) };
  }
  if (p === "last7")  { const d = new Date(); d.setDate(d.getDate()-6);  return { from: d.toLocaleDateString("en-CA", { timeZone: tz }), to: today }; }
  if (p === "last30") { const d = new Date(); d.setDate(d.getDate()-29); return { from: d.toLocaleDateString("en-CA", { timeZone: tz }), to: today }; }
  return null; // custom
}

function normMetodoDisplay(m) {
  if (!m) return "—";
  const s = m.toLowerCase();
  if (s.includes("zelle"))      return "Zelle";
  if (s.includes("cash app") || s.includes("cashapp")) return "Cash App";
  if (s.includes("venmo"))      return "Venmo";
  if (s.includes("apple pay") || s.includes("applepay")) return "Apple Pay";
  if (s.includes("transfer"))   return "Transfer";
  if (s.includes("cash") || s.includes("efectivo")) return "Cash";
  if (s.includes("card") || s.includes("tarjeta"))  return "Card";
  if (s.includes("check") || s.includes("cheque"))  return m;
  return m;
}

function metodoTag(display) {
  const map = {
    "Zelle":     "bg-violet-100 text-violet-800",
    "Cash App":  "bg-green-100 text-green-800",
    "Venmo":     "bg-sky-100 text-sky-800",
    "Apple Pay": "bg-gray-100 text-gray-800",
    "Transfer":  "bg-blue-100 text-blue-800",
    "Cash":      "bg-emerald-100 text-emerald-800",
    "Card":      "bg-purple-100 text-purple-800",
  };
  return map[display] || "bg-gray-100 text-gray-700";
}

function PaymentBreakdownReport({ van, usuario }) {
  const isAdmin = usuario?.rol === "admin" || usuario?.rol === "supervisor";
  const tz = "America/New_York";
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  /* ── Filters ── */
  const [preset, setPreset]       = useState("last7");
  const [from,   setFrom]         = useState(() => { const d=new Date(); d.setDate(d.getDate()-6); return d.toLocaleDateString("en-CA",{timeZone:tz}); });
  const [to,     setTo]           = useState(todayIso);
  const [metodo, setMetodo]       = useState("all");
  const [vans,   setVans]         = useState([]);
  const [vanFiltro, setVanFiltro] = useState(van?.id || "");
  const [drivers,   setDrivers]   = useState([]);
  const [driverFiltro, setDriverFiltro] = useState("");

  /* ── Results ── */
  const [dayRows, setDayRows] = useState([]);
  const [txRows,  setTxRows]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [searched, setSearched] = useState(false);
  const [showTx,   setShowTx]   = useState(false);

  /* ── Load vans + drivers (admin) ── */
  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("vans").select("id,nombre_van").order("nombre_van")
      .then(({ data }) => setVans(data || []));
    supabase.from("usuarios").select("id,nombre,email").eq("activo", true)
      .then(({ data }) => setDrivers(data || []));
  }, [isAdmin]);

  /* ── Keep vanFiltro in sync with prop ── */
  useEffect(() => { if (van?.id && !vanFiltro) setVanFiltro(van.id); }, [van?.id]);

  /* ── Preset picker ── */
  const pickPreset = (p) => {
    setPreset(p);
    const d = applyDatePreset(p);
    if (d) { setFrom(d.from); setTo(d.to); }
  };

  const effectiveVanId = isAdmin ? (vanFiltro || van?.id) : van?.id;
  const isSubType = ["zelle", "cashapp", "venmo", "applepay"].includes(metodo);
  const subTypeLabel = { zelle: "Zelle", cashapp: "Cash App", venmo: "Venmo", applepay: "Apple Pay" };

  /* ── Main search ── */
  const search = async () => {
    if (!effectiveVanId) return;
    setLoading(true); setError(null);
    try {
      const { start, end } = dateRangeBounds(from, to);
      const dayMap = {};
      const txList = [];

      const addDay = (iso) => {
        if (!dayMap[iso]) dayMap[iso] = {
          fecha: iso,
          cash: 0, card: 0, checks: 0,
          zelle: 0, cashapp: 0, venmo: 0, applepay: 0, transfer_other: 0,
          count: 0,
        };
      };

      /* ─ Step 1: ALL ventas in range (always — we need the pago JSON for sub-types) ─ */
      {
        let q = supabase
          .from("ventas")
          .select("id,created_at,fecha,pago_efectivo,pago_tarjeta,pago_transferencia,pago,total_venta,cliente_id,clientes:cliente_id(nombre),usuario_id,usuarios:usuario_id(nombre)")
          .eq("van_id", effectiveVanId)
          .gte("created_at", start)
          .lte("created_at", end)
          .neq("tipo", "devolucion")
          .order("created_at", { ascending: false });

        if (!isAdmin)          q = q.eq("usuario_id", usuario.id);
        else if (driverFiltro) q = q.eq("usuario_id", driverFiltro);

        const { data: ventas, error: vErr } = await q;
        if (vErr) throw vErr;

        (ventas || []).forEach(v => {
          const iso = String(v.fecha || v.created_at || "").slice(0, 10);
          addDay(iso);

          const cash = Number(v.pago_efectivo     || 0);
          const card = Number(v.pago_tarjeta      || 0);
          const totalTransfer = Number(v.pago_transferencia || 0);
          const checks = (Array.isArray(v.pago?.metodos) ? v.pago.metodos : [])
            .filter(pm => pm.forma === "cheque")
            .reduce((sum, pm) => sum + Number(pm.monto || 0), 0);

          // Extract sub-type amounts — try transferencia_detalle first, then metodos array fallback
          const td = v.pago?.transferencia_detalle || {};
          let zelleAmt    = Number(td.zelle    || 0);
          let cashappAmt  = Number(td.cashapp  || 0);
          let venmoAmt    = Number(td.venmo    || 0);
          let applepayAmt = Number(td.applepay || 0);

          // Fallback: read sub-type from pago.metodos[] when transferencia_detalle has nothing
          const totalFromTd = zelleAmt + cashappAmt + venmoAmt + applepayAmt;
          if (totalFromTd === 0 && totalTransfer > 0) {
            const metodos = Array.isArray(v.pago?.metodos) ? v.pago.metodos : [];
            for (const pm of metodos) {
              if (pm.forma === "transferencia" && pm.subMetodo && Number(pm.monto || 0) > 0) {
                if (pm.subMetodo === "zelle")    zelleAmt    += Number(pm.monto);
                if (pm.subMetodo === "cashapp")  cashappAmt  += Number(pm.monto);
                if (pm.subMetodo === "venmo")    venmoAmt    += Number(pm.monto);
                if (pm.subMetodo === "applepay") applepayAmt += Number(pm.monto);
              }
            }
          }

          // Anything not labelled → "other transfer" (sub-type chip was not selected)
          const classifiedTransfer = zelleAmt + cashappAmt + venmoAmt + applepayAmt;
          const otherTransfer = Math.max(0, totalTransfer - classifiedTransfer);

          // Decide what to count based on active filter
          let shouldCount = false;
          let filteredAmt = 0;

          if (metodo === "all") {
            shouldCount = (cash + card + totalTransfer + checks) > 0;
            dayMap[iso].cash          += cash;
            dayMap[iso].card          += card;
            dayMap[iso].checks        += checks;
            dayMap[iso].zelle         += zelleAmt;
            dayMap[iso].cashapp       += cashappAmt;
            dayMap[iso].venmo         += venmoAmt;
            dayMap[iso].applepay      += applepayAmt;
            dayMap[iso].transfer_other += otherTransfer;
            filteredAmt = cash + card + totalTransfer + checks;
          } else if (metodo === "efectivo") {
            shouldCount = cash > 0;
            dayMap[iso].cash += cash;
            filteredAmt = cash;
          } else if (metodo === "tarjeta") {
            shouldCount = card > 0;
            dayMap[iso].card += card;
            filteredAmt = card;
          } else if (metodo === "cheque") {
            shouldCount = checks > 0;
            dayMap[iso].checks += checks;
            filteredAmt = checks;
          } else if (metodo === "transfer_all") {
            shouldCount = totalTransfer > 0;
            dayMap[iso].zelle         += zelleAmt;
            dayMap[iso].cashapp       += cashappAmt;
            dayMap[iso].venmo         += venmoAmt;
            dayMap[iso].applepay      += applepayAmt;
            dayMap[iso].transfer_other += otherTransfer;
            filteredAmt = totalTransfer;
          } else if (metodo === "zelle") {
            shouldCount = zelleAmt > 0;
            dayMap[iso].zelle += zelleAmt;
            filteredAmt = zelleAmt;
          } else if (metodo === "cashapp") {
            shouldCount = cashappAmt > 0;
            dayMap[iso].cashapp += cashappAmt;
            filteredAmt = cashappAmt;
          } else if (metodo === "venmo") {
            shouldCount = venmoAmt > 0;
            dayMap[iso].venmo += venmoAmt;
            filteredAmt = venmoAmt;
          } else if (metodo === "applepay") {
            shouldCount = applepayAmt > 0;
            dayMap[iso].applepay += applepayAmt;
            filteredAmt = applepayAmt;
          }

          if (shouldCount) dayMap[iso].count++;

          if (filteredAmt > 0) {
            // Build a readable breakdown string for the TX list
            const parts = [];
            if (metodo === "all" || metodo === "efectivo")     { if (cash > 0) parts.push(`💵 ${fmtCurrency(cash)}`); }
            if (metodo === "all" || metodo === "tarjeta")      { if (card > 0) parts.push(`💳 ${fmtCurrency(card)}`); }
            if (metodo === "all" || metodo === "cheque")       { if (checks > 0) parts.push(`🧾 Check ${fmtCurrency(checks)}`); }
            if (metodo === "all" || metodo === "transfer_all" || metodo === "zelle")    { if (zelleAmt > 0)    parts.push(`Zelle ${fmtCurrency(zelleAmt)}`); }
            if (metodo === "all" || metodo === "transfer_all" || metodo === "cashapp")  { if (cashappAmt > 0)  parts.push(`Cash App ${fmtCurrency(cashappAmt)}`); }
            if (metodo === "all" || metodo === "transfer_all" || metodo === "venmo")    { if (venmoAmt > 0)    parts.push(`Venmo ${fmtCurrency(venmoAmt)}`); }
            if (metodo === "all" || metodo === "transfer_all" || metodo === "applepay") { if (applepayAmt > 0) parts.push(`Apple Pay ${fmtCurrency(applepayAmt)}`); }
            if ((metodo === "all" || metodo === "transfer_all") && otherTransfer > 0)  parts.push(`Transfer ${fmtCurrency(otherTransfer)}`);

            txList.push({
              id: v.id,
              fecha: v.created_at || v.fecha,
              tipo: "Sale",
              cliente: v.clientes?.nombre || "—",
              metodo_display: parts.join(" · ") || normMetodoDisplay(v.pago?.metodos?.[0]?.forma || ""),
              amount: filteredAmt,
              driver: v.usuarios?.nombre || "—",
            });
          }
        });
      }

      /* ─ Step 2: Standalone A/R payments, not captured in sales ─ */
      {
        let pq = supabase
          .from("pagos")
          .select("id,monto,metodo_pago,fecha_pago,cliente_id,clientes:cliente_id(nombre),idem_key,usuario_id,usuarios:usuario_id(nombre)")
          .eq("van_id", effectiveVanId)
          .is("idem_key", null)
          .gte("fecha_pago", start)
          .lte("fecha_pago", end);

        if (!isAdmin)          pq = pq.eq("usuario_id", usuario.id);
        else if (driverFiltro) pq = pq.eq("usuario_id", driverFiltro);

        // For sub-type: only include matching ones
        if (isSubType) pq = pq.ilike("metodo_pago", `%${subTypeLabel[metodo]}%`);
        else if (metodo === "cheque") pq = pq.ilike("metodo_pago", "Check%");

        const { data: pagosData } = await pq;

        (pagosData || []).forEach(p => {
          const iso = String(p.fecha_pago || "").slice(0, 10);
          if (!iso) return;

          addDay(iso);
          const monto = Number(p.monto || 0);
          const mp    = (p.metodo_pago || "").toLowerCase();
          const disp  = normMetodoDisplay(p.metodo_pago);

          const isZ  = mp.includes("zelle");
          const isCA = mp.includes("cash app") || mp.includes("cashapp");
          const isV  = mp.includes("venmo");
          const isAP = mp.includes("apple pay") || mp.includes("applepay");
          const isCheck = mp.includes("check") || mp.includes("cheque");
          const isTransfer = isZ || isCA || isV || isAP || mp.includes("transfer");
          const isCash = (mp.includes("cash") || mp.includes("efectivo")) && !isCA;
          const isCard = mp.includes("card") || mp.includes("tarjeta");
          if (metodo === "efectivo" && !isCash) return;
          if (metodo === "tarjeta" && !isCard) return;
          if (isCheck && !["all", "cheque"].includes(metodo)) return;
          if (!isCheck && metodo === "cheque") return;
          if (metodo === "transfer_all" && !isTransfer) return;

          if (isZ)       dayMap[iso].zelle          += monto;
          else if (isCA) dayMap[iso].cashapp        += monto;
          else if (isV)  dayMap[iso].venmo          += monto;
          else if (isAP) dayMap[iso].applepay       += monto;
          else if (isCash) dayMap[iso].cash         += monto;
          else if (isCard) dayMap[iso].card          += monto;
          else if (isCheck) dayMap[iso].checks       += monto;
          else           dayMap[iso].transfer_other += monto;
          dayMap[iso].count++;

          txList.push({
            id: `cxc_${p.id}`,
            fecha: p.fecha_pago,
            tipo: "A/R Payment",
            cliente: p.clientes?.nombre || "—",
            metodo_display: disp,
            amount: monto,
            driver: p.usuarios?.nombre || "—",
          });
        });
      }

      /* ─ Step 3: Build per-day rows ─ */
      const rows = Object.values(dayMap)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map(d => {
          const transferTotal = d.zelle + d.cashapp + d.venmo + d.applepay + d.transfer_other;
          const total =
            metodo === "efectivo"    ? d.cash :
            metodo === "tarjeta"     ? d.card :
            metodo === "cheque"      ? d.checks :
            metodo === "zelle"       ? d.zelle :
            metodo === "cashapp"     ? d.cashapp :
            metodo === "venmo"       ? d.venmo :
            metodo === "applepay"    ? d.applepay :
            metodo === "transfer_all"? transferTotal :
            d.cash + d.card + d.checks + transferTotal; // all
          return { ...d, transferTotal, total };
        });

      setDayRows(rows);
      setTxRows(txList.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")));
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useDebouncedEffect(() => { search(); }, [effectiveVanId, from, to, metodo, driverFiltro]);

  /* ── Totals ── */
  const totals = useMemo(() => ({
    total:    dayRows.reduce((s, r) => s + r.total, 0),
    cash:     dayRows.reduce((s, r) => s + r.cash, 0),
    card:     dayRows.reduce((s, r) => s + r.card, 0),
    checks:   dayRows.reduce((s, r) => s + r.checks, 0),
    zelle:    dayRows.reduce((s, r) => s + r.zelle, 0),
    cashapp:  dayRows.reduce((s, r) => s + r.cashapp, 0),
    venmo:    dayRows.reduce((s, r) => s + r.venmo, 0),
    applepay: dayRows.reduce((s, r) => s + r.applepay, 0),
    transfer: dayRows.reduce((s, r) => s + r.transferTotal, 0),
    transfer_other: dayRows.reduce((s, r) => s + (r.transfer_other || 0), 0),
    count:    dayRows.reduce((s, r) => s + r.count, 0),
  }), [dayRows]);

  const paymentInsights = useMemo(() => {
    if (!dayRows.length) return [];
    const methods = [
      { name: "Cash", value: totals.cash, tone: "green" },
      { name: "Card", value: totals.card, tone: "purple" },
      { name: "Checks", value: totals.checks, tone: "amber" },
      { name: "Zelle", value: totals.zelle, tone: "purple" },
      { name: "Cash App", value: totals.cashapp, tone: "green" },
      { name: "Venmo", value: totals.venmo, tone: "blue" },
      { name: "Apple Pay", value: totals.applepay, tone: "slate" },
      { name: "Other Transfer", value: totals.transfer_other, tone: "blue" },
    ].filter((m) => m.value > 0).sort((a, b) => b.value - a.value);
    const top = methods[0];
    const bestDay = [...dayRows].sort((a, b) => b.total - a.total)[0];
    const transferShare = percentOf(totals.transfer, totals.total);
    return [
      top && {
        title: "Dominant Method",
        value: `${top.name} · ${fmtPercent(percentOf(top.value, totals.total))}`,
        body: `${fmtCurrency(top.value)} collected through this method.`,
        tone: top.tone,
      },
      {
        title: "Transfer Share",
        value: fmtPercent(transferShare),
        body: `${fmtCurrency(totals.transfer)} collected through transfer methods.`,
        tone: transferShare > 50 ? "purple" : "blue",
      },
      bestDay && {
        title: "Best Collection Day",
        value: `${fmtDate(bestDay.fecha)} · ${fmtCurrency(bestDay.total)}`,
        body: `${bestDay.count} transaction${bestDay.count === 1 ? "" : "s"} in this report.`,
        tone: "green",
      },
      totals.transfer_other > 0 && {
        title: "Needs Method Detail",
        value: fmtCurrency(totals.transfer_other),
        body: "Transfers without a selected sub-method. Review if you need exact Zelle/Cash App/Venmo totals.",
        tone: "amber",
      },
    ];
  }, [dayRows, totals]);

  /* ── Chart data ── */
  const chartData = useMemo(() => dayRows.map(r => ({
    day:       fmtDate(r.fecha),
    Cash:      r.cash,
    Card:      r.card,
    Checks:    r.checks,
    Zelle:     r.zelle,
    "Cash App":r.cashapp,
    Venmo:     r.venmo,
    "Apple Pay":r.applepay,
    Transfer:  r.transfer_other,
  })), [dayRows]);

  /* ── Export PDF — a self-contained statement, not just a raw table:
     header, KPI summary, insights, then the daily breakdown ── */
  const exportPDF = async () => {
    const { jsPDF, autoTable } = await loadPdfLibs();
    const doc = new jsPDF({ orientation: "portrait" });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const MARGIN = 14, USABLE_W = PAGE_W - MARGIN * 2;
    const label = METODO_OPTIONS.find(m => m.value === metodo)?.label || "All";
    const vanLabel = vans.find(v => v.id === effectiveVanId)?.nombre_van || van?.nombre_van || van?.nombre || "All Vans";
    const driverLabel = driverFiltro ? (drivers.find(d => d.id === driverFiltro)?.nombre || "—") : "All Drivers";

    doc.setProperties({ title: `Tools4Care Payment Breakdown ${from} to ${to}` });

    // ── Header banner — 3 short lines instead of 2 long ones, so it stays
    // readable on portrait's narrower width regardless of van/driver name length ──
    doc.setFillColor(37, 99, 235); doc.rect(0, 0, PAGE_W, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15); doc.setFont(undefined, "bold");
    doc.text("Tools4Care — Payment Breakdown Report", MARGIN, 11);
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    doc.text(`${label} · ${fmtDate(from)} – ${fmtDate(to)}`, MARGIN, 18);
    doc.setFontSize(8);
    doc.text(`Van: ${vanLabel} · Driver: ${driverLabel}`, MARGIN, 24);
    doc.text(`Generated ${new Date().toLocaleString()}`, PAGE_W - MARGIN, 24, { align: "right" });

    // ── Total Collected bar ──
    let y = 38;
    doc.setFillColor(236, 253, 245); doc.setDrawColor(167, 243, 208);
    doc.roundedRect(MARGIN, y, USABLE_W, 18, 2, 2, "FD");
    doc.setTextColor(6, 95, 70);
    doc.setFontSize(9); doc.setFont(undefined, "bold");
    doc.text("TOTAL COLLECTED", MARGIN + 5, y + 7);
    doc.setFontSize(17);
    doc.text(fmtCurrency(totals.total), MARGIN + 5, y + 15);
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    doc.text(`${totals.count} transaction${totals.count === 1 ? "" : "s"}`, PAGE_W - MARGIN - 5, y + 11, { align: "right" });

    // ── Per-method KPI boxes (only methods with activity) ──
    y += 24;
    const methodBoxes = [
      { label: "Cash", value: totals.cash, fill: [220, 252, 231], text: [22, 101, 52] },
      { label: "Card", value: totals.card, fill: [243, 232, 255], text: [107, 33, 168] },
      { label: "Checks", value: totals.checks, fill: [254, 243, 199], text: [146, 64, 14] },
      { label: "Zelle", value: totals.zelle, fill: [237, 233, 254], text: [91, 33, 182] },
      { label: "Cash App", value: totals.cashapp, fill: [220, 252, 231], text: [22, 101, 52] },
      { label: "Venmo", value: totals.venmo, fill: [219, 234, 254], text: [30, 64, 175] },
      { label: "Apple Pay", value: totals.applepay, fill: [241, 245, 249], text: [51, 65, 85] },
      { label: "Other Transfer", value: totals.transfer_other, fill: [219, 234, 254], text: [30, 64, 175] },
    ].filter((m) => m.value > 0);
    if (methodBoxes.length > 0) {
      const gap = 3, minBoxW = 40, boxH = 16;
      // Portrait is narrower than the old landscape layout, so wrap into
      // multiple rows instead of squeezing every box into one — each box
      // keeps a minimum width wide enough for "Other Transfer" plus a value.
      const perRow = Math.max(1, Math.min(methodBoxes.length, Math.floor((USABLE_W + gap) / (minBoxW + gap))));
      const boxW = (USABLE_W - gap * (perRow - 1)) / perRow;
      methodBoxes.forEach((box, i) => {
        const col = i % perRow, row = Math.floor(i / perRow);
        const x = MARGIN + col * (boxW + gap);
        const boxY = y + row * (boxH + gap);
        doc.setFillColor(...box.fill);
        doc.roundedRect(x, boxY, boxW, boxH, 2, 2, "F");
        doc.setTextColor(...box.text);
        doc.setFontSize(7.5); doc.setFont(undefined, "bold");
        doc.text(box.label.toUpperCase(), x + 3, boxY + 6);
        doc.setFontSize(10.5);
        doc.text(fmtCurrency(box.value), x + 3, boxY + 12.5);
      });
      const rows = Math.ceil(methodBoxes.length / perRow);
      y += rows * boxH + (rows - 1) * gap;
    }

    // ── Insights ──
    const activeInsights = paymentInsights.filter(Boolean);
    if (activeInsights.length > 0) {
      y += 9;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11); doc.setFont(undefined, "bold");
      doc.text("Insights", MARGIN, y);
      y += 6;
      doc.setFontSize(9);
      activeInsights.forEach((insight) => {
        doc.setFont(undefined, "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(`•  ${insight.title}: ${insight.value}`, MARGIN, y);
        y += 4.5;
        doc.setFont(undefined, "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(insight.body, MARGIN + 4, y);
        y += 6;
      });
    }

    // ── Daily breakdown table ──
    autoTable(doc, {
      startY: y + 4,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Date","# Trans","Cash","Card","Checks","Zelle","Cash App","Venmo","Apple Pay","Other","Total"]],
      body: dayRows.map(r => [
        fmtDate(r.fecha), r.count,
        r.cash     > 0 ? fmtCurrency(r.cash)     : "—",
        r.card     > 0 ? fmtCurrency(r.card)     : "—",
        r.checks   > 0 ? fmtCurrency(r.checks)   : "—",
        r.zelle    > 0 ? fmtCurrency(r.zelle)    : "—",
        r.cashapp  > 0 ? fmtCurrency(r.cashapp)  : "—",
        r.venmo    > 0 ? fmtCurrency(r.venmo)    : "—",
        r.applepay > 0 ? fmtCurrency(r.applepay) : "—",
        r.transfer_other > 0 ? fmtCurrency(r.transfer_other) : "—",
        fmtCurrency(r.total),
      ]),
      foot: [["TOTAL", totals.count,
        fmtCurrency(totals.cash), fmtCurrency(totals.card),
        fmtCurrency(totals.checks),
        fmtCurrency(totals.zelle), fmtCurrency(totals.cashapp),
        fmtCurrency(totals.venmo), fmtCurrency(totals.applepay),
        fmtCurrency(totals.transfer_other), fmtCurrency(totals.total)]],
      styles: { fontSize: 7, cellPadding: 1.5, textColor: [30, 41, 59] },
      headStyles: { fillColor: [37,99,235], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
      didDrawPage: () => {
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          "Tools4Care — automatically generated payment report. Reflects sales recorded for the selected period.",
          MARGIN,
          doc.internal.pageSize.getHeight() - 8
        );
      },
    });
    doc.save(`Payments_${metodo}_${from}_${to}.pdf`);
  };

  const activeMetodo = METODO_OPTIONS.find(m => m.value === metodo) || METODO_OPTIONS[0];

  return (
    <div className="space-y-5">

      {/* ── Filters — one compact row of selects instead of stacked pill rows ── */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Filter size={12}/> Date Range</label>
          <select value={preset} onChange={e => pickPreset(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
            {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {preset === "custom" && (<>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
        </>)}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><CreditCard size={12}/> Payment Method</label>
          <select value={metodo} onChange={e => setMetodo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
            {METODO_OPTIONS.filter(m => m.group === "main").map(m => (
              <option key={m.value} value={m.value}>{m.emoji} {m.label}</option>
            ))}
            <optgroup label="Transfer">
              {METODO_OPTIONS.filter(m => m.group === "transfer").map(m => (
                <option key={m.value} value={m.value}>{m.emoji} {m.label}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Van filter (admin) */}
        {isAdmin && vans.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Van</label>
            <select value={vanFiltro} onChange={e => setVanFiltro(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">All Vans</option>
              {vans.map(v => <option key={v.id} value={v.id}>{v.nombre_van || v.nombre || v.id}</option>)}
            </select>
          </div>
        )}

        {/* Driver filter (admin) */}
        {isAdmin && drivers.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Driver</label>
            <select value={driverFiltro} onChange={e => setDriverFiltro(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">All Drivers</option>
              {drivers.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={search} disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 shadow-sm transition-all">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
        {searched && dayRows.length > 0 && (
          <button onClick={exportPDF}
            className="bg-white border border-blue-300 text-blue-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-blue-50">
            <Download size={14}/> Export PDF
          </button>
        )}
        {searched && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-700">
            <span>{activeMetodo.emoji}</span>
            <span>{activeMetodo.label}</span>
            <span className="text-blue-400">·</span>
            <span>{fmtDate(from)} – {fmtDate(to)}</span>
          </div>
        )}
      </div>

      <ErrorBox msg={error} />

      {searched && (<>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <SummaryCard label="Total Collected" value={fmtCurrency(totals.total)} color="blue" icon={DollarSign}
            sub={`${totals.count} transactions`} />
          {(metodo === "all" || metodo === "efectivo") && totals.cash > 0 &&
            <SummaryCard label="💵 Cash" value={fmtCurrency(totals.cash)} color="emerald" />}
          {(metodo === "all" || metodo === "tarjeta") && totals.card > 0 &&
            <SummaryCard label="💳 Card" value={fmtCurrency(totals.card)} color="purple" />}
          {(metodo === "all" || metodo === "cheque") && totals.checks > 0 &&
            <SummaryCard label="🧾 Checks" value={fmtCurrency(totals.checks)} color="amber" />}
          {(metodo === "all" || metodo === "transfer_all" || metodo === "zelle") && totals.zelle > 0 &&
            <SummaryCard label="💜 Zelle" value={fmtCurrency(totals.zelle)} color="purple" />}
          {(metodo === "all" || metodo === "transfer_all" || metodo === "cashapp") && totals.cashapp > 0 &&
            <SummaryCard label="💚 Cash App" value={fmtCurrency(totals.cashapp)} color="green" />}
          {(metodo === "all" || metodo === "transfer_all" || metodo === "venmo") && totals.venmo > 0 &&
            <SummaryCard label="💙 Venmo" value={fmtCurrency(totals.venmo)} color="blue" />}
          {(metodo === "all" || metodo === "transfer_all" || metodo === "applepay") && totals.applepay > 0 &&
            <SummaryCard label="🍎 Apple Pay" value={fmtCurrency(totals.applepay)} color="emerald" />}
          {(metodo === "all" || metodo === "transfer_all") && totals.transfer_other > 0 &&
            <SummaryCard label="🏦 Transfer" value={fmtCurrency(totals.transfer_other)} color="blue"
              sub="unclassified sub-type" />}
        </div>

        <InsightPanel title="Payment Insights" insights={paymentInsights} />

        {/* ── Warning: unclassified transfers exist when filtering by sub-type ── */}
        {isSubType && totals.transfer_other > 0 && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <span className="text-2xl leading-none">⚠️</span>
            <div>
              <p className="font-bold text-amber-800">
                {fmtCurrency(totals.transfer_other)} in unclassified transfers not shown above
              </p>
              <p className="text-amber-700 mt-0.5">
                These are transfer payments where the driver didn't select a sub-type (Zelle / Cash App / Venmo / Apple Pay) when recording the sale.
                Switch to <strong>Transfer (All)</strong> to see the full transfer total including these.
              </p>
            </div>
          </div>
        )}

        {/* ── Bar chart ── */}
        {dayRows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="font-semibold text-gray-700 mb-3 text-sm">Daily breakdown by payment method</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={v => fmtCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(metodo === "all" || metodo === "efectivo") && <Bar dataKey="Cash" fill="#10b981" stackId="a" radius={[0,0,0,0]} />}
                {(metodo === "all" || metodo === "tarjeta") && <Bar dataKey="Card" fill="#8b5cf6" stackId="a" />}
                {(metodo === "all" || metodo === "transfer_all" || metodo === "zelle")    && <Bar dataKey="Zelle"     fill="#7c3aed" stackId="a" />}
                {(metodo === "all" || metodo === "transfer_all" || metodo === "cashapp")  && <Bar dataKey="Cash App"  fill="#16a34a" stackId="a" />}
                {(metodo === "all" || metodo === "transfer_all" || metodo === "venmo")    && <Bar dataKey="Venmo"     fill="#0284c7" stackId="a" />}
                {(metodo === "all" || metodo === "transfer_all" || metodo === "applepay") && <Bar dataKey="Apple Pay" fill="#374151" stackId="a" />}
                {(metodo === "all" || metodo === "transfer_all") && <Bar dataKey="Transfer" fill="#3b82f6" stackId="a" radius={[3,3,0,0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Day-by-day summary table ── */}
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-blue-50">
              <tr>
                {["Date","# Trans",
                  ...(metodo === "all" || metodo === "efectivo"    ? ["💵 Cash"]    : []),
                  ...(metodo === "all" || metodo === "tarjeta"     ? ["💳 Card"]    : []),
                  ...(metodo === "all" || metodo === "transfer_all" || metodo === "zelle"    ? ["💜 Zelle"]    : []),
                  ...(metodo === "all" || metodo === "transfer_all" || metodo === "cashapp"  ? ["💚 Cash App"]  : []),
                  ...(metodo === "all" || metodo === "transfer_all" || metodo === "venmo"    ? ["💙 Venmo"]    : []),
                  ...(metodo === "all" || metodo === "transfer_all" || metodo === "applepay" ? ["🍎 Apple Pay"] : []),
                  ...(metodo === "all" || metodo === "transfer_all" ? ["🏦 Transfer"] : []),
                  "Total",
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-blue-700 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dayRows.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-10 text-gray-400">No data for this range and filter</td></tr>
              ) : dayRows.map(r => (
                <tr key={r.fecha} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{fmtDate(r.fecha)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-center">{r.count}</td>
                  {(metodo === "all" || metodo === "efectivo") && <td className="px-4 py-2.5 text-emerald-700 font-medium">{r.cash > 0 ? fmtCurrency(r.cash) : <span className="text-gray-300">—</span>}</td>}
                  {(metodo === "all" || metodo === "tarjeta") && <td className="px-4 py-2.5 text-purple-700 font-medium">{r.card > 0 ? fmtCurrency(r.card) : <span className="text-gray-300">—</span>}</td>}
                  {(metodo === "all" || metodo === "transfer_all" || metodo === "zelle")    && <td className="px-4 py-2.5 text-violet-700 font-medium">{r.zelle    > 0 ? fmtCurrency(r.zelle)    : <span className="text-gray-300">—</span>}</td>}
                  {(metodo === "all" || metodo === "transfer_all" || metodo === "cashapp")  && <td className="px-4 py-2.5 text-green-700  font-medium">{r.cashapp  > 0 ? fmtCurrency(r.cashapp)  : <span className="text-gray-300">—</span>}</td>}
                  {(metodo === "all" || metodo === "transfer_all" || metodo === "venmo")    && <td className="px-4 py-2.5 text-sky-700    font-medium">{r.venmo    > 0 ? fmtCurrency(r.venmo)    : <span className="text-gray-300">—</span>}</td>}
                  {(metodo === "all" || metodo === "transfer_all" || metodo === "applepay") && <td className="px-4 py-2.5 text-gray-700   font-medium">{r.applepay > 0 ? fmtCurrency(r.applepay) : <span className="text-gray-300">—</span>}</td>}
                  {(metodo === "all" || metodo === "transfer_all") && <td className="px-4 py-2.5 text-blue-700 font-medium">{r.transfer_other > 0 ? fmtCurrency(r.transfer_other) : <span className="text-gray-300">—</span>}</td>}
                  <td className="px-4 py-2.5 font-bold text-blue-800">{fmtCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-blue-50 font-bold">
              <tr>
                <td className="px-4 py-3 text-blue-800">TOTAL</td>
                <td className="px-4 py-3 text-center text-gray-600">{totals.count}</td>
                {(metodo === "all" || metodo === "efectivo") && <td className="px-4 py-3 text-emerald-700">{fmtCurrency(totals.cash)}</td>}
                {(metodo === "all" || metodo === "tarjeta")  && <td className="px-4 py-3 text-purple-700">{fmtCurrency(totals.card)}</td>}
                {(metodo === "all" || metodo === "transfer_all" || metodo === "zelle")    && <td className="px-4 py-3 text-violet-700">{fmtCurrency(totals.zelle)}</td>}
                {(metodo === "all" || metodo === "transfer_all" || metodo === "cashapp")  && <td className="px-4 py-3 text-green-700">{fmtCurrency(totals.cashapp)}</td>}
                {(metodo === "all" || metodo === "transfer_all" || metodo === "venmo")    && <td className="px-4 py-3 text-sky-700">{fmtCurrency(totals.venmo)}</td>}
                {(metodo === "all" || metodo === "transfer_all" || metodo === "applepay") && <td className="px-4 py-3 text-gray-700">{fmtCurrency(totals.applepay)}</td>}
                {(metodo === "all" || metodo === "transfer_all") && <td className="px-4 py-3 text-blue-700">{fmtCurrency(totals.transfer_other)}</td>}
                <td className="px-4 py-3 text-blue-800 text-base">{fmtCurrency(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Transaction detail toggle ── */}
        <button
          onClick={() => setShowTx(x => !x)}
          className="flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900 transition-colors border border-blue-200 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl"
        >
          <FileText size={14}/>
          {showTx ? "Hide" : "Show"} transaction detail ({txRows.length})
        </button>

        {showTx && txRows.length > 0 && (
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>{["Date / Time","Customer","Type","Method","Amount","Driver"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {txRows.map((r, i) => (
                  <tr key={`${r.id}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500">{fmtDateTime(r.fecha)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.cliente}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.tipo === "Sale" ? "bg-blue-100 text-blue-800" : "bg-indigo-100 text-indigo-800"}`}>
                        {r.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${metodoTag(normMetodoDisplay(r.metodo_display))}`}>
                        {r.metodo_display}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-blue-700">{fmtCurrency(r.amount)}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{r.driver}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </>)}
    </div>
  );
}

/* ========================= Barbershop Visits ========================= */
function easternDay(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function mondayOfWeek(dayStr) {
  const d = new Date(`${dayStr}T12:00:00`);
  const diffToMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}
const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function weekdayName(dayStr) {
  return new Date(`${dayStr}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}
async function fetchAllVentasSince(cutoffIso, vanId = "ALL") {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  // A year-plus of company-wide sales can exceed PostgREST's per-request
  // row cap, so page through it instead of assuming one request covers it.
  while (true) {
    let query = supabase
      .from("ventas")
      .select("fecha,cliente_id,total_venta")
      .gte("fecha", cutoffIso)
      .neq("tipo", "devolucion")
      .order("fecha", { ascending: true })
      .range(from, from + pageSize - 1);
    if (vanId && vanId !== "ALL") query = query.eq("van_id", vanId);
    const { data, error } = await query;
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function BarberiaVisitsReport({ van, usuario }) {
  const isAdmin = usuario?.rol === "admin" || usuario?.rol === "supervisor";
  const [resumen, setResumen] = useState([]);
  const [weeklySeries, setWeeklySeries] = useState([]);
  const [pace, setPace] = useState({ perDay: 0, perWeek: 0, perMonth: 0 });
  const [pendientes, setPendientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [growthCandidates, setGrowthCandidates] = useState([]);
  const [vans, setVans] = useState([]);
  const [vanFiltro, setVanFiltro] = useState("");
  const effectiveVanId = isAdmin ? (vanFiltro || "ALL") : van?.id;

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("vans").select("id,nombre_van").order("nombre_van")
      .then(({ data }) => setVans(data || []));
  }, [isAdmin]);

  useEffect(() => {
    if (van?.id && !vanFiltro) setVanFiltro(van.id);
  }, [van?.id, vanFiltro]);

  async function cargar() {
    if (!effectiveVanId) return;
    setLoading(true);
    try {
      const [{ data: clientesLinked }, ventasRows, { data: pendData }, { data: settingsRow }, { data: allShops }] = await Promise.all([
        supabase.from("clientes").select("id,barberia_id,barberias:barberia_id(nombre,es_negocio)").not("barberia_id", "is", null),
        fetchAllVentasSince(`${VISIT_LEARNING_START}T00:00:00-04:00`, effectiveVanId),
        supabase.from("barberias").select("id, nombre, direccion, duplicado_de").eq("revisar_duplicado", true),
        supabase.from("site_settings").select("barberia_visit_buffer_minutes").eq("id", 1).maybeSingle(),
        supabase.from("barberias").select("id,nombre,direccion,latitude,longitude,es_negocio"),
      ]);
      const bufferMinutes = Number(settingsRow?.barberia_visit_buffer_minutes ?? 12);
      // Only count shops flagged as real businesses (persisted in
      // barberias.es_negocio — see 202608112) toward cadence/pace/growth
      // reporting. A lot of "barberia" rows are actually a client's own
      // name saved into that field by habit; those aren't route stops.
      const clienteShop = new Map(
        (clientesLinked || [])
          .filter((c) => c.barberias?.es_negocio !== false)
          .map((c) => [c.id, { barberia_id: c.barberia_id, nombre: c.barberias?.nombre || "Barbershop" }])
      );

      // How many linked barbers (= clients) each shop has, used as a rough
      // revenue-potential proxy for shops with no sales history yet.
      const shopClientCount = new Map();
      for (const c of clientesLinked || []) {
        shopClientCount.set(c.barberia_id, (shopClientCount.get(c.barberia_id) || 0) + 1);
      }
      const shopCoords = new Map((allShops || []).map((s) => [s.id, s]));

      // One entry per shop+day the shop was actually visited, with the
      // earliest/latest sale timestamp that day (used for the time estimate).
      const shopDays = new Map(); // barberia_id -> Map(day -> {min,max})
      const shopNombre = new Map();
      const shopRevenue = new Map(); // barberia_id -> total $ sold since VISIT_LEARNING_START
      const shopWeekdayCounts = new Map(); // barberia_id -> Map(weekday -> count) — which day this shop usually gets visited on
      for (const row of ventasRows) {
        const info = clienteShop.get(row.cliente_id);
        if (!info?.barberia_id) continue;
        const day = easternDay(row.fecha);
        shopNombre.set(info.barberia_id, info.nombre);
        if (!shopDays.has(info.barberia_id)) shopDays.set(info.barberia_id, new Map());
        const days = shopDays.get(info.barberia_id);
        const t = new Date(row.fecha).getTime();
        const prev = days.get(day);
        days.set(day, prev ? { min: Math.min(prev.min, t), max: Math.max(prev.max, t) } : { min: t, max: t });
        shopRevenue.set(info.barberia_id, (shopRevenue.get(info.barberia_id) || 0) + Number(row.total_venta || 0));
        if (!prev) {
          // Only count each shop+day once toward the weekday tally, not once per sale that day.
          const wd = weekdayName(day);
          if (!shopWeekdayCounts.has(info.barberia_id)) shopWeekdayCounts.set(info.barberia_id, new Map());
          const wdMap = shopWeekdayCounts.get(info.barberia_id);
          wdMap.set(wd, (wdMap.get(wd) || 0) + 1);
        }
      }
      function dominantWeekday(barberiaId) {
        const wdMap = shopWeekdayCounts.get(barberiaId);
        if (!wdMap || wdMap.size === 0) return null;
        return [...wdMap.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }

      const resumenData = [];
      const weekCounts = new Map();
      let totalVisitDays = 0;
      for (const [barberiaId, days] of shopDays.entries()) {
        const sortedDays = [...days.keys()].sort();
        totalVisitDays += sortedDays.length;
        for (const day of sortedDays) weekCounts.set(mondayOfWeek(day), (weekCounts.get(mondayOfWeek(day)) || 0) + 1);
        const gaps = sortedDays.slice(1).map((day, i) => {
          const prev = new Date(`${sortedDays[i]}T12:00:00`);
          const cur = new Date(`${day}T12:00:00`);
          return Math.round((cur - prev) / 86400000);
        }).filter((g) => g > 0);
        const avgGap = gaps.length ? Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 10) / 10 : null;
        const lastDay = sortedDays[sortedDays.length - 1];
        const daysSince = Math.round((Date.now() - new Date(`${lastDay}T12:00:00`).getTime()) / 86400000);
        const estimatedMinutesPerVisit = sortedDays.map((day) => {
          const { min, max } = days.get(day);
          return (max - min) / 60000 + bufferMinutes;
        });
        const avgMinutes = Math.round(estimatedMinutesPerVisit.reduce((s, m) => s + m, 0) / estimatedMinutesPerVisit.length);
        const totalRevenue = shopRevenue.get(barberiaId) || 0;
        const avgRevenuePerVisit = totalRevenue / sortedDays.length;
        resumenData.push({
          barberia_id: barberiaId,
          barberia_nombre: shopNombre.get(barberiaId),
          total_visits: sortedDays.length,
          last_visit_date: lastDay,
          days_since_last_visit: daysSince,
          avg_days_between_visits: avgGap,
          avg_estimated_minutes: avgMinutes,
          total_revenue: totalRevenue,
          avg_revenue_per_visit: avgRevenuePerVisit,
          revenue_per_minute: avgMinutes > 0 ? avgRevenuePerVisit / avgMinutes : null,
          dominant_weekday: dominantWeekday(barberiaId),
        });
      }
      setResumen(resumenData);

      const weeks = [...weekCounts.keys()].sort().slice(-12);
      setWeeklySeries(weeks.map((week) => ({
        week: new Date(`${week}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        visits: weekCounts.get(week),
      })));

      const daysElapsed = Math.max(1, Math.round((Date.now() - new Date(`${VISIT_LEARNING_START}T00:00:00`).getTime()) / 86400000));
      setPace({
        perDay: Math.round((totalVisitDays / daysElapsed) * 10) / 10,
        perWeek: Math.round((totalVisitDays / (daysElapsed / 7)) * 10) / 10,
        perMonth: Math.round((totalVisitDays / (daysElapsed / 30.44)) * 10) / 10,
      });

      // Growth candidates: shops with linked barbers but zero recorded
      // visits in the tracked window, ranked by distance to the nearest
      // shop that IS already on the route — the closer that distance, the
      // more it's basically a free stop to bolt onto an existing day.
      // Only shops visited 2+ times count as "on the route" here — a single
      // visit doesn't prove it's a real recurring stop worth anchoring to.
      const routeRefs = resumenData
        .filter((r) => r.total_visits >= 2)
        .map((r) => ({ ...r, coords: shopCoords.get(r.barberia_id) }))
        .filter((r) => r.coords?.latitude != null && r.coords?.longitude != null);
      const visitedIds = new Set(shopDays.keys());
      const candidates = (allShops || [])
        .filter((s) =>
          !visitedIds.has(s.id)
          && s.latitude != null && s.longitude != null
          && (shopClientCount.get(s.id) || 0) > 0
          && s.es_negocio !== false
        )
        .map((s) => {
          let nearest = null;
          for (const ref of routeRefs) {
            const km = haversineKm(s.latitude, s.longitude, ref.coords.latitude, ref.coords.longitude);
            if (km != null && (nearest == null || km < nearest.km)) nearest = { km, name: ref.barberia_nombre, weekday: ref.dominant_weekday };
          }
          return {
            id: s.id,
            nombre: s.nombre,
            direccion: s.direccion,
            barberCount: shopClientCount.get(s.id) || 0,
            nearestKm: nearest?.km ?? null,
            nearestName: nearest?.name ?? null,
            nearestWeekday: nearest?.weekday ?? null,
          };
        })
        .filter((c) => c.nearestKm != null)
        .sort((a, b) => a.nearestKm - b.nearestKm)
        .slice(0, 30);
      setGrowthCandidates(candidates);

      // Resolve each flagged shop's suggested match name/address for display.
      const targetIds = [...new Set((pendData || []).map((p) => p.duplicado_de).filter(Boolean))];
      let targetsMap = new Map();
      if (targetIds.length) {
        const { data: targets } = await supabase.from("barberias").select("id, nombre, direccion").in("id", targetIds);
        targetsMap = new Map((targets || []).map((t) => [t.id, t]));
      }
      setPendientes((pendData || []).map((p) => ({ ...p, target: targetsMap.get(p.duplicado_de) || null })));
    } catch (err) {
      console.error("Error loading barbershop visits report:", err);
      setResumen([]);
      setWeeklySeries([]);
      setPendientes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, [effectiveVanId]);

  async function fusionar(flagged) {
    if (!flagged.target) return;
    setBusyId(flagged.id);
    try {
      const { error: e1 } = await supabase.from("clientes").update({ barberia_id: flagged.target.id }).eq("barberia_id", flagged.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("barberias").delete().eq("id", flagged.id);
      if (e2) throw e2;
      await cargar();
    } catch (err) {
      alert("Could not merge: " + (err?.message || err));
    } finally {
      setBusyId(null);
    }
  }

  async function mantenerSeparada(flagged) {
    setBusyId(flagged.id);
    try {
      const { error } = await supabase.from("barberias").update({ revisar_duplicado: false }).eq("id", flagged.id);
      if (error) throw error;
      await cargar();
    } catch (err) {
      alert("Could not update: " + (err?.message || err));
    } finally {
      setBusyId(null);
    }
  }

  // A shop only has a meaningful cadence once it's been visited 2+ times —
  // a single visit gives no gap to compare against, so those shops are
  // "not enough history yet," not overdue or on track. Splitting them out
  // (and ranking by how far past cadence a shop is, not raw days-since)
  // keeps the one truly-established monthly shop from being buried under a
  // wall of one-time stops that don't need a route decision.
  const { established, oneTime, totals } = useMemo(() => {
    const withStatus = resumen.map((r) => {
      const avgGap = r.avg_days_between_visits != null ? Number(r.avg_days_between_visits) : null;
      const daysSince = r.days_since_last_visit;
      const hasCadence = r.total_visits >= 2 && avgGap != null;
      let status = "new";
      let overdueBy = -Infinity;
      if (hasCadence && daysSince != null) {
        overdueBy = daysSince - avgGap;
        status = daysSince > avgGap * 1.3 ? "overdue" : daysSince > avgGap ? "due" : "ok";
      }
      return { ...r, avgGap, daysSince, hasCadence, status, overdueBy };
    });
    const established = withStatus.filter((r) => r.hasCadence).sort((a, b) => b.overdueBy - a.overdueBy);
    const oneTime = withStatus.filter((r) => !r.hasCadence);
    const totalRevenueAll = resumen.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
    const totals = {
      shops: resumen.length,
      visits: resumen.reduce((s, r) => s + Number(r.total_visits || 0), 0),
      avgMinutes: established.length
        ? Math.round(established.reduce((s, r) => s + Number(r.avg_estimated_minutes || 0), 0) / established.length)
        : 0,
      overdue: established.filter((r) => r.status === "overdue").length,
      due: established.filter((r) => r.status === "due").length,
      ok: established.filter((r) => r.status === "ok").length,
      totalRevenue: totalRevenueAll,
      avgRevenuePerVisit: resumen.reduce((s, r) => s + Number(r.total_visits || 0), 0)
        ? totalRevenueAll / resumen.reduce((s, r) => s + Number(r.total_visits || 0), 0)
        : 0,
    };
    return { established, oneTime, totals };
  }, [resumen]);
  const [showOneTime, setShowOneTime] = useState(false);
  const [sortMode, setSortMode] = useState("overdue"); // overdue | revenuePerMinute | revenuePerVisit

  const sortedEstablished = useMemo(() => {
    const list = [...established];
    if (sortMode === "revenuePerMinute") {
      list.sort((a, b) => Number(b.revenue_per_minute || 0) - Number(a.revenue_per_minute || 0));
    } else if (sortMode === "revenuePerVisit") {
      list.sort((a, b) => Number(b.avg_revenue_per_visit || 0) - Number(a.avg_revenue_per_visit || 0));
    } else {
      list.sort((a, b) => b.overdueBy - a.overdueBy);
    }
    return list;
  }, [established, sortMode]);

  // Suggested stops: one ranked list instead of two tables to cross-reference
  // by hand, grouped by the weekday you actually tend to run that part of
  // the route (from real visit history — see dominant_weekday). Proven
  // shops that are overdue/due come first within each day (money already
  // being left on the table), then the closest never-visited real shops to
  // bolt onto that same day's trip. Not turn-by-turn — there's no live van
  // location to sequence against — just which day to add each stop to.
  const suggestedStopsByDay = useMemo(() => {
    const dueItems = established
      .filter((r) => r.status === "overdue" || r.status === "due")
      .map((r) => ({
        key: `due-${r.barberia_id}`,
        nombre: r.barberia_nombre,
        why: r.status === "overdue"
          ? `Overdue by ${Math.round(r.overdueBy)}d (usual cadence ~${r.avgGap}d)`
          : `Due soon (usual cadence ~${r.avgGap}d)`,
        valueLabel: `~${fmtCurrency(r.avg_revenue_per_visit)}/visit`,
        kind: "proven",
        weekday: r.dominant_weekday,
      }));
    const growthItems = growthCandidates.slice(0, 20).map((c) => ({
      key: `growth-${c.id}`,
      nombre: c.nombre,
      why: `Never visited — ${kmToMiles(c.nearestKm).toFixed(1)} mi from ${c.nearestName}`,
      valueLabel: `${c.barberCount} barber${c.barberCount === 1 ? "" : "s"} linked`,
      kind: "new",
      weekday: c.nearestWeekday,
    }));
    const byDay = new Map();
    for (const item of [...dueItems, ...growthItems]) {
      const day = item.weekday || "Unscheduled";
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(item);
    }
    for (const items of byDay.values()) {
      items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "proven" ? -1 : 1));
    }
    const order = [...WEEKDAY_ORDER, "Unscheduled"];
    return order
      .filter((day) => byDay.has(day))
      .map((day) => ({ day, items: byDay.get(day) }));
  }, [established, growthCandidates]);

  if (loading) {
    return <div className="py-16 text-center text-sm text-gray-400">Loading…</div>;
  }

  const STATUS_STYLE = {
    overdue: { label: "Overdue", pill: "bg-red-100 text-red-700", text: "text-red-600" },
    due: { label: "Due soon", pill: "bg-amber-100 text-amber-700", text: "text-amber-600" },
    ok: { label: "On track", pill: "bg-emerald-100 text-emerald-700", text: "text-gray-700" },
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 rounded-xl border border-teal-100 bg-teal-50/50 p-3">
        <div>
          <p className="text-sm font-semibold text-teal-900">Visit history by van</p>
          <p className="text-xs text-teal-800/70">Only sales recorded on the selected van count as visits.</p>
        </div>
        {isAdmin && vans.length > 0 && (
          <label className="text-xs font-medium text-gray-600">
            Van
            <select value={vanFiltro} onChange={(e) => setVanFiltro(e.target.value)} className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">All Vans</option>
              {vans.map((v) => <option key={v.id} value={v.id}>{v.nombre_van || v.id}</option>)}
            </select>
          </label>
        )}
      </div>
      {/* ── SUGGESTED STOPS — grouped by the weekday you actually tend to
          run that part of the route, from real visit history. Proven shops
          falling behind cadence first within each day, then the closest
          never-visited real shops to bolt onto that day's trip. Not
          turn-by-turn (no live van location to sequence against) — pick
          from the top of each day's list. ── */}
      {suggestedStopsByDay.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-teal-200 bg-teal-50/50 p-4">
          <h3 className="text-sm font-bold text-teal-900 mb-1">Suggested stops by day</h3>
          <p className="text-xs text-teal-800/80 mb-3">
            Grouped by the weekday you already run near that spot. Overdue/due shops first in each day
            (proven money you're leaving on the table), then the closest never-visited real shops to add on
            the same trip. "Unscheduled" means not enough history yet to tell which day fits best.
          </p>
          <div className="space-y-4">
            {suggestedStopsByDay.map(({ day, items }) => (
              <div key={day}>
                <h4 className="text-xs font-black uppercase tracking-wide text-teal-800 mb-1.5">
                  {day} <span className="font-semibold text-teal-700/60 normal-case">({items.length})</span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map((s, i) => (
                        <tr key={s.key} className="border-b border-teal-100 last:border-0">
                          <td className="py-2 pr-3 text-teal-700/60 font-semibold w-6">{i + 1}</td>
                          <td className="py-2 pr-3 font-semibold text-gray-800">{s.nombre}</td>
                          <td className="py-2 pr-3 text-gray-600 text-xs">{s.why}</td>
                          <td className={`py-2 pr-3 font-semibold text-xs whitespace-nowrap ${s.kind === "proven" ? "text-emerald-700" : "text-teal-700"}`}>
                            {s.valueLabel}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 mb-4">
        Automatic — a visit is counted whenever a sale is recorded for any client linked to a barbershop, whether
        or not it was on the daily route that day. New business names are matched (or created) automatically when
        a client is saved with one.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
        <SummaryCard label="Overdue" value={totals.overdue} icon={AlertTriangle} color={totals.overdue ? "red" : "green"} />
        <SummaryCard label="Due soon" value={totals.due} icon={Clock} color={totals.due ? "amber" : "green"} />
        <SummaryCard label="On track" value={totals.ok} icon={CheckCircle2} color="green" />
        <SummaryCard label="Avg time per visit" value={`~${totals.avgMinutes} min`} icon={MapPin} color="blue" />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-2">
        <SummaryCard label="Revenue tracked" value={fmtCurrency(totals.totalRevenue)} icon={DollarSign} color="green" />
        <SummaryCard label="Avg $ / visit" value={fmtCurrency(totals.avgRevenuePerVisit)} icon={TrendingUp} color="blue" />
      </div>
      <p className="text-[11px] text-gray-400 mb-6">
        {totals.shops} shops tracked · {totals.visits} total visits since {fmtDate(VISIT_LEARNING_START)} · {oneTime.length} visited only once so far (below)
      </p>

      {/* ── VISIT PACE — how often shops are actually getting visited, at a glance ── */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-gray-700">Visit pace</h3>
          <div className="flex gap-4 text-xs">
            <span className="text-gray-500">Avg/day <b className="text-gray-800">{pace.perDay}</b></span>
            <span className="text-gray-500">Avg/week <b className="text-gray-800">{pace.perWeek}</b></span>
            <span className="text-gray-500">Avg/month <b className="text-gray-800">{pace.perMonth}</b></span>
          </div>
        </div>
        {weeklySeries.length > 0 && (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={weeklySeries} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => [`${v} visits`, "Week of"]} />
              <Bar dataKey="visits" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-800 flex items-center gap-1.5 mb-1">
            <AlertTriangle size={15} /> Possible duplicates — needs a quick look
          </h3>
          <p className="text-xs text-amber-700 mb-3">
            A new business name looked similar to an existing barbershop, but the address didn't clearly match — it's
            already being tracked as its own shop, this is just asking whether it should be merged.
          </p>
          <div className="space-y-2">
            {pendientes.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-lg border border-amber-200 p-3">
                <div className="text-sm">
                  <span className="font-semibold text-gray-800">{p.nombre}</span>
                  <span className="text-gray-400"> ({p.direccion || "no address"})</span>
                  {p.target && (
                    <>
                      <span className="text-gray-400"> — might be the same as </span>
                      <span className="font-semibold text-gray-800">{p.target.nombre}</span>
                      <span className="text-gray-400"> ({p.target.direccion || "no address"})</span>
                    </>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === p.id || !p.target}
                    onClick={() => fusionar(p)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Merge into {p.target?.nombre || "—"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => mantenerSeparada(p)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Keep separate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {resumen.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          No visits recorded yet. Link a client's "Business" field to a barbershop and their sales will start counting automatically.
        </div>
      ) : (
        <>
          {established.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-500">Sort by:</span>
                {[
                  { id: "overdue", label: "Most overdue" },
                  { id: "revenuePerMinute", label: "Best $ / minute" },
                  { id: "revenuePerVisit", label: "Best $ / visit" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSortMode(opt.id)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      sortMode === opt.id
                        ? "bg-teal-600 border-teal-600 text-white"
                        : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-gray-400 border-b">
                      <th className="py-2 pr-3">Barbershop</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Last visit</th>
                      <th className="py-2 pr-3" title="Calendar days since the last recorded sale at this shop">Days since last visit</th>
                      <th className="py-2 pr-3" title="Average number of days between this shop's visits">Usual cadence</th>
                      <th className="py-2 pr-3">Avg time / visit</th>
                      <th className="py-2 pr-3">Total visits</th>
                      <th className="py-2 pr-3" title="Average revenue on a visit day at this shop">Avg $ / visit</th>
                      <th className="py-2 pr-3" title="Avg $ per visit divided by time spent on site — the real yield of a stop here">$ / minute</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEstablished.map((r) => {
                      const style = STATUS_STYLE[r.status];
                      return (
                        <tr key={r.barberia_id} className="border-b border-gray-100 last:border-0">
                          <td className="py-2.5 pr-3 font-semibold text-gray-800">{r.barberia_nombre}</td>
                          <td className="py-2.5 pr-3">
                            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${style.pill}`}>
                              {style.label}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-gray-600">{r.last_visit_date || "—"}</td>
                          <td className={`py-2.5 pr-3 font-semibold ${style.text}`}>
                            {r.daysSince != null ? `${r.daysSince}d` : "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-gray-600">{r.avgGap != null ? `~${r.avgGap}d` : "—"}</td>
                          <td className="py-2.5 pr-3 text-gray-600">
                            {r.avg_estimated_minutes != null ? `~${Math.round(r.avg_estimated_minutes)} min` : "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-gray-600">{r.total_visits}</td>
                          <td className="py-2.5 pr-3 font-semibold text-gray-700">{fmtCurrency(r.avg_revenue_per_visit)}</td>
                          <td className="py-2.5 pr-3 font-semibold text-teal-700">
                            {r.revenue_per_minute != null ? `${fmtCurrency(r.revenue_per_minute)}/min` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {oneTime.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowOneTime((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-600"
              >
                <ChevronDown size={14} className={`transition-transform ${showOneTime ? "" : "-rotate-90"}`} />
                {oneTime.length} shop{oneTime.length === 1 ? "" : "s"} visited only once — not enough history for a cadence yet
              </button>
              {showOneTime && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {oneTime.map((r) => (
                        <tr key={r.barberia_id} className="border-b border-gray-100 last:border-0 text-gray-500">
                          <td className="py-2 pr-3">{r.barberia_nombre}</td>
                          <td className="py-2 pr-3">{r.last_visit_date || "—"}</td>
                          <td className="py-2 pr-3">{r.total_visits} visit{r.total_visits === 1 ? "" : "s"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </>
      )}
    </div>
  );
}

/* ========================= MAIN ========================= */
export default function Reportes() {
  const { van }     = useVan();
  const { usuario } = useUsuario();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get("tab");
    return TABS.some((t) => t.id === requested) ? requested : "cierre_diario";
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-slate-100 p-2 sm:p-4">
      <div className="w-full max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-5 bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Operations Intelligence</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                Business Reports
              </h1>
              <p className="text-gray-500 mt-1 text-sm max-w-3xl">
                Actionable sales, payments, A/R, returns, product and profit reporting for daily decisions.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 min-w-[140px]">
                <div className="text-slate-400 font-bold uppercase">VAN</div>
                <div className="text-slate-800 font-semibold truncate">{van?.nombre_van || van?.nombre || "—"}</div>
              </div>
              <div className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 min-w-[140px]">
                <div className="text-slate-400 font-bold uppercase">User</div>
                <div className="text-slate-800 font-semibold truncate">{usuario?.nombre || usuario?.email || "—"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div
          role="tablist"
          aria-label="Business report sections"
          className="mb-6 flex snap-x snap-mandatory flex-nowrap gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 shadow-sm"
        >
          {TABS.map(({ id, label, icon: Icon, color }) => (
            <button key={id} onClick={() => setActiveTab(id)} type="button" role="tab"
              aria-selected={activeTab === id} aria-controls={`report-panel-${id}`} title={label}
              className={`flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold transition-all duration-200 ${
                activeTab===id ? "bg-slate-900 border-slate-900 text-white shadow-md" : "border-transparent text-gray-600 hover:bg-gray-100 hover:border-gray-200"
              }`}>
              <Icon size={15} className={activeTab===id ? "text-white" : color} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div id={`report-panel-${activeTab}`} role="tabpanel" className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-6">
          <div className="flex items-start gap-2 mb-5 pb-4 border-b border-gray-100">
            {(() => {
              const t=TABS.find(x=>x.id===activeTab);
              const I=t?.icon;
              return (<>
                {I&&<I size={20} className={`${t?.color} mt-0.5`}/>}
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{t?.label}</h2>
                  {t?.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                </div>
              </>);
            })()}
          </div>
          {activeTab==="cierre_diario"    && <CierreDiarioReport      van={van} usuario={usuario}/>}
          {activeTab==="ledger"           && <FinancialLedgerReport   van={van}/>}
          {activeTab==="ventas"          && <VentasReport           van={van} usuario={usuario}/>}
          {activeTab==="pagos_breakdown" && <PaymentBreakdownReport van={van} usuario={usuario}/>}
          {activeTab==="ar_risk"         && <ARAgingReport          van={van} usuario={usuario}/>}
          {activeTab==="discount_audit"  && <DiscountAuditReport    van={van} usuario={usuario}/>}
          {activeTab==="devoluciones"    && <DevolucionesReport     van={van} usuario={usuario}/>}
          {activeTab==="top_clientes"    && <TopClientesReport     van={van} usuario={usuario}/>}
          {activeTab==="productos"       && <ProductosReport       van={van} usuario={usuario}/>}
          {activeTab==="ganancias"       && <GananciasReport       van={van} usuario={usuario}/>}
          {activeTab==="barberias"       && <BarberiaVisitsReport van={van} usuario={usuario}/>}
        </div>
      </div>
    </div>
  );
}
