import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  CircleDollarSign,
  PackageSearch,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useVan } from "../hooks/VanContext";
import { useLocationSettings } from "../hooks/useLocationSettings";

const money = (value) => Number(value || 0).toLocaleString("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function ActionCard({ to, icon, title, description, tone = "blue" }) {
  const tones = {
    blue: "from-blue-600 to-indigo-600 shadow-blue-200",
    green: "from-emerald-500 to-green-600 shadow-emerald-200",
    amber: "from-amber-500 to-orange-600 shadow-amber-200",
    slate: "from-slate-700 to-slate-900 shadow-slate-300",
  };
  return (
    <Link
      to={to}
      className={`group flex min-h-32 items-center gap-4 rounded-3xl bg-gradient-to-br ${tones[tone]} p-5 text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0`}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-black">{title}</span>
        <span className="mt-1 block text-sm text-white/80">{description}</span>
      </span>
      <ArrowRight className="shrink-0 transition-transform group-hover:translate-x-1" size={22} />
    </Link>
  );
}

function Stat({ icon, label, value, detail, tone }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
          <div className="mt-1 text-sm font-medium text-slate-500">{detail}</div>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

export default function StoreDashboard() {
  const { van } = useVan();
  const { settings } = useLocationSettings();
  const [sales, setSales] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!van?.id) return;
    setLoading(true);
    setError("");
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const [salesResult, stockResult] = await Promise.all([
      supabase
        .from("ventas")
        .select("id,fecha,total,total_venta,total_pagado,pago_efectivo,pago_tarjeta,pago_transferencia,pago_otro,cambio,tipo,cliente_id,cliente_nombre,numero_factura")
        .eq("van_id", van.id)
        .gte("fecha", start.toISOString())
        .lte("fecha", end.toISOString())
        .order("fecha", { ascending: false })
        .limit(500),
      supabase
        .from("stock_van")
        .select("id,producto_id,cantidad,qty,productos:producto_id(id,nombre,codigo,marca)")
        .eq("van_id", van.id)
        .order("cantidad", { ascending: true })
        .limit(1000),
    ]);

    if (salesResult.error || stockResult.error) {
      setError(salesResult.error?.message || stockResult.error?.message || "Could not load the store dashboard.");
    }
    setSales(salesResult.data || []);
    setStock(stockResult.data || []);
    setLoading(false);
  }, [van?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!van?.id) return undefined;
    const refresh = () => load();
    const channel = supabase
      .channel(`store-dashboard-${van.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas", filter: `van_id=eq.${van.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_van", filter: `van_id=eq.${van.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, van?.id]);

  const summary = useMemo(() => {
    const completed = sales.filter((sale) => sale.tipo !== "devolucion");
    const returns = sales.filter((sale) => sale.tipo === "devolucion");
    const gross = completed.reduce((sum, sale) => sum + Number(sale.total_venta ?? sale.total ?? 0), 0);
    const refunds = returns.reduce((sum, sale) => sum + Math.abs(Number(sale.total_venta ?? sale.total ?? 0)), 0);
    const cash = completed.reduce((sum, sale) => sum + Number(sale.pago_efectivo || 0), 0)
      - returns.reduce((sum, sale) => sum + Math.abs(Number(sale.pago_efectivo || 0)), 0);
    const customers = new Set(completed.map((sale) => sale.cliente_id).filter(Boolean)).size;
    const lowStock = stock.filter((row) => Number(row.cantidad ?? row.qty ?? 0) <= 3);
    const outOfStock = lowStock.filter((row) => Number(row.cantidad ?? row.qty ?? 0) <= 0);
    return { completed, returns, gross, refunds, net: gross - refunds, cash, customers, lowStock, outOfStock };
  }, [sales, stock]);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="overflow-hidden rounded-[30px] bg-gradient-to-r from-slate-900 via-blue-950 to-blue-800 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/20">
                <Store size={34} />
              </span>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Physical Store</div>
                <h1 className="mt-1 text-3xl font-black sm:text-4xl">{van?.nombre || van?.nombre_van || "Store Dashboard"}</h1>
                <p className="mt-1 text-sm text-blue-100">Counter sales, inventory, returns and daily closeout.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/tax" className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold ring-1 ring-white/20 hover:bg-white/15">
                Tax: {settings.tax_enabled ? `${settings.tax_rate}% on` : "off"}
              </Link>
              <button onClick={load} disabled={loading} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 disabled:opacity-60">
                <RefreshCw size={17} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Store actions">
          <ActionCard to="/ventas?new=1" icon={<ShoppingCart size={29} strokeWidth={2.2} />} title="New Sale" description="Start a counter or walk-in sale" tone="green" />
          <ActionCard to="/ventas?mode=return" icon={<RotateCcw size={29} strokeWidth={2.2} />} title="Process Return" description="Find an invoice and refund safely" tone="amber" />
          <ActionCard to="/clientes" icon={<Users size={29} strokeWidth={2.2} />} title="Find Customer" description="Search, review or create a customer" tone="blue" />
          <ActionCard to="/cierres" icon={<ReceiptText size={29} strokeWidth={2.2} />} title="Close Store" description="Count payments and close the day" tone="slate" />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<CircleDollarSign size={23} />} label="Net Sales Today" value={money(summary.net)} detail={`${summary.completed.length} completed sales`} tone="bg-emerald-100 text-emerald-700" />
          <Stat icon={<BadgeDollarSign size={23} />} label="Cash Expected" value={money(summary.cash)} detail="Before drawer count" tone="bg-amber-100 text-amber-700" />
          <Stat icon={<RotateCcw size={23} />} label="Returns Today" value={money(summary.refunds)} detail={`${summary.returns.length} return transactions`} tone="bg-rose-100 text-rose-700" />
          <Stat icon={<PackageSearch size={23} />} label="Low Stock" value={summary.lowStock.length} detail={stock.length === 0 ? "No inventory assigned" : `${summary.outOfStock.length} out of stock`} tone="bg-blue-100 text-blue-700" />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Recent Transactions</h2>
                <p className="text-sm text-slate-500">Today at this physical store</p>
              </div>
              <Link to="/reportes" className="text-sm font-bold text-blue-700">View reports</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {loading && sales.length === 0 ? (
                <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading transactions…</div>
              ) : sales.length === 0 ? (
                <div className="p-8 text-center text-sm font-semibold text-slate-400">No transactions yet today.</div>
              ) : sales.slice(0, 8).map((sale) => {
                const isReturn = sale.tipo === "devolucion";
                return (
                  <div key={sale.id} className="flex items-center gap-4 px-5 py-3.5">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isReturn ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {isReturn ? <RotateCcw size={19} /> : <ShoppingCart size={19} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-slate-900">{sale.cliente_nombre || "Walk-in Customer"}</div>
                      <div className="text-xs text-slate-500">{new Date(sale.fecha).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {sale.numero_factura || sale.id.slice(0, 8)}</div>
                    </div>
                    <div className={`text-right font-black ${isReturn ? "text-rose-700" : "text-slate-900"}`}>
                      {isReturn ? "−" : ""}{money(Math.abs(Number(sale.total_venta ?? sale.total ?? 0)))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Store Inventory</h2>
                <p className="text-sm text-slate-500">Stock assigned only to this location</p>
              </div>
              <Boxes className="text-blue-600" size={24} />
            </div>
            <div className="divide-y divide-slate-100">
              {summary.lowStock.slice(0, 7).map((row) => {
                const quantity = Number(row.cantidad ?? row.qty ?? 0);
                return (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-800">{row.productos?.nombre || "Product"}</div>
                      <div className="text-xs text-slate-400">{row.productos?.codigo || "No code"}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${quantity <= 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {quantity} left
                    </span>
                  </div>
                );
              })}
              {!loading && stock.length === 0 && <div className="p-8 text-center text-sm font-semibold text-amber-700">No inventory has been assigned to this store yet.</div>}
              {!loading && stock.length > 0 && summary.lowStock.length === 0 && <div className="p-8 text-center text-sm font-semibold text-emerald-600">Inventory levels look good.</div>}
            </div>
            <Link to="/inventario" className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-4 text-sm font-black text-blue-700 hover:bg-blue-50">
              Open Store Inventory <ArrowRight size={16} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
