import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  ExternalLink,
  FileImage,
  Filter,
  Fuel,
  Receipt,
  RefreshCw,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../supabaseClient";
import PageHeader from "../components/ui/PageHeader";

const PAGE_SIZE = 50;
const CHART_LIMIT = 1000;
const CHART_COLORS = ["#059669", "#2563eb", "#f59e0b", "#e11d48", "#7c3aed", "#0891b2", "#475569"];

const CATEGORY_OPTIONS = [
  { value: "ALL", label: "All categories" },
  { value: "combustible", label: "Fuel" },
  { value: "peaje", label: "Tolls" },
  { value: "comida", label: "Meals" },
  { value: "mantenimiento", label: "Maintenance" },
  { value: "parqueo", label: "Parking" },
  { value: "otro", label: "Other" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dateLabel(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function categoryLabel(value) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label || value || "Other";
}

function StatCard({ icon, label, value, tone = "blue" }) {
  const Icon = icon;
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/35 dark:text-blue-200",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200",
    slate: "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</div>
          <div className="mt-1 text-2xl font-black tracking-normal">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 shadow-sm dark:bg-white/10">
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3">
        <h2 className="text-sm font-black text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      <div className="h-[260px]">{children}</div>
    </div>
  );
}

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-950">
      <div className="font-bold text-slate-800 dark:text-slate-100">{label || payload[0]?.name}</div>
      <div className="mt-1 text-emerald-600 dark:text-emerald-300">{money(payload[0]?.value)}</div>
    </div>
  );
}

function EmptyState({ loading }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Receipt size={24} />
      </div>
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
        {loading ? "Loading driver expenses..." : "No expenses found"}
      </h3>
      {!loading && (
        <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Adjust the date range or filters to review uploaded driver invoices.
        </p>
      )}
    </div>
  );
}

export default function DriverExpensesAdmin() {
  const [rows, setRows] = useState([]);
  const [chartRows, setChartRows] = useState([]);
  const [vans, setVans] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [vanId, setVanId] = useState("ALL");
  const [driverId, setDriverId] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [receiptOnly, setReceiptOnly] = useState(false);
  const [query, setQuery] = useState("");

  const vanById = useMemo(() => new Map(vans.map((van) => [van.id, van])), [vans]);
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const loadLookups = useCallback(async () => {
    const [vansResult, usersResult] = await Promise.all([
      supabase.from("vans").select("id, nombre_van, placa").order("nombre_van", { ascending: true }),
      supabase.from("usuarios").select("id, nombre, email, rol, activo").order("nombre", { ascending: true }),
    ]);

    if (vansResult.error) throw vansResult.error;
    if (usersResult.error) throw usersResult.error;

    setVans(vansResult.data || []);
    setUsers(usersResult.data || []);
  }, []);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      const applyFilters = (request) => {
        let filtered = request;
        if (from) filtered = filtered.gte("fecha", from);
        if (to) filtered = filtered.lte("fecha", to);
        if (vanId !== "ALL") filtered = filtered.eq("van_id", vanId);
        if (driverId !== "ALL") filtered = filtered.eq("usuario_id", driverId);
        if (category !== "ALL") filtered = filtered.eq("categoria", category);
        if (receiptOnly) filtered = filtered.not("factura_url", "is", null);
        if (query.trim()) {
          const needle = query.trim();
          filtered = filtered.or(`descripcion.ilike.%${needle}%,categoria.ilike.%${needle}%`);
        }
        return filtered;
      };

      const request = applyFilters(supabase
        .from("gastos_conductor")
        .select("id, van_id, usuario_id, cierre_id, fecha, categoria, descripcion, monto, factura_url, created_at", {
          count: "exact",
        })
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }));

      const chartRequest = applyFilters(supabase
        .from("gastos_conductor")
        .select("id, van_id, usuario_id, fecha, categoria, monto, factura_url")
        .order("fecha", { ascending: false })
        .limit(CHART_LIMIT));

      const [
        { data, count, error: fetchError },
        { data: chartData, error: chartError },
      ] = await Promise.all([
        request.range(start, end),
        chartRequest,
      ]);
      if (fetchError) throw fetchError;
      if (chartError) throw chartError;

      setRows(data || []);
      setChartRows(chartData || []);
      setTotal(count || 0);
    } catch (err) {
      setError(err?.message || "Could not load driver expenses.");
    } finally {
      setLoading(false);
    }
  }, [category, driverId, from, page, query, receiptOnly, to, vanId]);

  useEffect(() => {
    loadLookups().catch((err) => setError(err?.message || "Could not load filters."));
  }, [loadLookups]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    setPage(1);
  }, [from, to, vanId, driverId, category, receiptOnly, query]);

  const totals = useMemo(() => {
    const amount = chartRows.reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const withReceipt = chartRows.filter((row) => row.factura_url).length;
    const drivers = new Set(chartRows.map((row) => row.usuario_id).filter(Boolean)).size;
    return { amount, withReceipt, drivers };
  }, [chartRows]);

  const byVan = useMemo(() => {
    const map = new Map();
    chartRows.forEach((row) => {
      const van = vanById.get(row.van_id);
      const name = van?.nombre_van || van?.placa || "Unknown VAN";
      const current = map.get(row.van_id || name) || { name, amount: 0, count: 0 };
      current.amount += Number(row.monto || 0);
      current.count += 1;
      map.set(row.van_id || name, current);
    });
    return [...map.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map((item) => ({ ...item, amount: Number(item.amount.toFixed(2)) }));
  }, [chartRows, vanById]);

  const byCategory = useMemo(() => {
    const map = new Map();
    chartRows.forEach((row) => {
      const name = categoryLabel(row.categoria);
      const current = map.get(name) || { name, amount: 0, count: 0 };
      current.amount += Number(row.monto || 0);
      current.count += 1;
      map.set(name, current);
    });
    return [...map.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((item) => ({ ...item, amount: Number(item.amount.toFixed(2)) }));
  }, [chartRows]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function exportCsv() {
    const header = ["Date", "Driver", "VAN", "Category", "Description", "Amount", "Receipt URL"];
    const lines = rows.map((row) => {
      const driver = userById.get(row.usuario_id);
      const van = vanById.get(row.van_id);
      return [
        row.fecha || "",
        driver?.nombre || driver?.email || "",
        van?.nombre_van || van?.placa || row.van_id || "",
        categoryLabel(row.categoria),
        row.descripcion || "",
        Number(row.monto || 0).toFixed(2),
        row.factura_url || "",
      ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `driver-expenses-${from || "start"}-${to || "end"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        icon={WalletCards}
        title="Driver Expenses"
        subtitle="Review driver spending, uploaded invoices, and VAN closeout deductions"
        color="emerald"
        actions={
          <>
            <button
              onClick={exportCsv}
              disabled={!rows.length}
              className="flex h-9 items-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-bold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              title="Export current page"
            >
              <Download size={15} />
              Export
            </button>
            <button
              onClick={loadExpenses}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <StatCard icon={WalletCards} label="Filtered total" value={money(totals.amount)} tone="emerald" />
        <StatCard icon={Receipt} label="Expenses loaded" value={chartRows.length.toString()} tone="blue" />
        <StatCard icon={FileImage} label="With receipts" value={totals.withReceipt.toString()} tone="amber" />
        <StatCard icon={UserRound} label="Drivers" value={totals.drivers.toString()} tone="slate" />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Spend by VAN" subtitle="Shows which VAN is spending the most in the selected filters">
          {byVan.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byVan} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(value) => `$${value}`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11 }} />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="amount" radius={[0, 8, 8, 0]} fill="#059669" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState loading={loading} />
          )}
        </ChartCard>

        <ChartCard title="Spend by Category" subtitle="Breakdown of fuel, tolls, meals, maintenance, parking, and other expenses">
          {byCategory.length ? (
            <div className="grid h-full gap-3 md:grid-cols-[1fr_180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="amount" nameKey="name" innerRadius={48} outerRadius={86} paddingAngle={3}>
                    {byCategory.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<MoneyTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col justify-center gap-2">
                {byCategory.slice(0, 6).map((entry, index) => (
                  <div key={entry.name} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-600 dark:text-slate-300">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <span className="font-black text-slate-900 dark:text-white">{money(entry.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState loading={loading} />
          )}
        </ChartCard>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
          <Filter size={16} className="text-emerald-600" />
          Filters
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <CalendarDays size={13} /> From
            </span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <CalendarDays size={13} /> To
            </span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">VAN</span>
            <select
              value={vanId}
              onChange={(event) => setVanId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="ALL">All vans</option>
              {vans.map((van) => (
                <option key={van.id} value={van.id}>{van.nombre_van || van.placa || van.id}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Driver</span>
            <select
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="ALL">All drivers</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.nombre || user.email || user.id}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Search size={13} /> Search
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Description"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={receiptOnly}
            onChange={(event) => setReceiptOnly(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Show only expenses with uploaded receipts
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Driver</th>
                <th className="px-4 py-3 text-left">VAN</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {!rows.length && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState loading={loading} />
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const driver = userById.get(row.usuario_id);
                const van = vanById.get(row.van_id);
                return (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{dateLabel(row.fecha)}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{driver?.nombre || "Unassigned"}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{driver?.email || row.usuario_id || "No driver on record"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">{van?.nombre_van || "Unknown VAN"}</div>
                      <div className="text-xs text-slate-500">{van?.placa || row.van_id || "-"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                        <Fuel size={12} />
                        {categoryLabel(row.categoria)}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div className="line-clamp-2">{row.descripcion || "-"}</div>
                      {row.cierre_id && <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Linked to closeout</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-base font-black text-slate-900 dark:text-white">{money(row.monto)}</td>
                    <td className="px-4 py-3 text-right">
                      {row.factura_url ? (
                        <a
                          href={row.factura_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        >
                          View <ExternalLink size={13} />
                        </a>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">No receipt</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing <strong className="text-slate-800 dark:text-slate-100">{rows.length}</strong> of{" "}
            <strong className="text-slate-800 dark:text-slate-100">{total}</strong> expenses
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
              className="rounded-xl border border-slate-200 px-3 py-2 font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Prev
            </button>
            <span className="px-2 font-semibold">Page {page} / {totalPages}</span>
            <button
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || loading}
              className="rounded-xl border border-slate-200 px-3 py-2 font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
