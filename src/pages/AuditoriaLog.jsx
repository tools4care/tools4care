// src/pages/AuditoriaLog.jsx
// Admin-only: view audit trail of credit limit changes, price edits,
// discretionary discounts and sale returns.
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { ScrollText, RefreshCw } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { SkeletonRow } from "../components/ui/Skeleton";

const PAGE_SIZE = 20;

const ACCIONES = [
  { value: "ALL", label: "All actions" },
  { value: "credit_limit_change", label: "Credit limit change" },
  { value: "price_edit", label: "Price edit" },
  { value: "discount_applied", label: "Discount applied" },
  { value: "sale_return", label: "Sale return" },
  { value: "stock_adjustment", label: "Stock adjustment" },
  { value: "stock_transfer", label: "Stock transfer" },
];

const ACCION_BADGE = {
  credit_limit_change: "bg-purple-100 text-purple-700 border-purple-200",
  price_edit: "bg-blue-100 text-blue-700 border-blue-200",
  discount_applied: "bg-amber-100 text-amber-700 border-amber-200",
  sale_return: "bg-rose-100 text-rose-700 border-rose-200",
  stock_adjustment: "bg-emerald-100 text-emerald-700 border-emerald-200",
  stock_transfer: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

function fmtDate(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function describeChange(row) {
  const { accion, detalles } = row;
  const before = detalles?.before;
  const after = detalles?.after;

  if (accion === "credit_limit_change") {
    const b = before?.limite_manual;
    const a = after?.limite_manual;
    return `Limit: ${b == null ? "policy default" : fmtMoney(b)} → ${a == null ? "policy default" : fmtMoney(a)}`;
  }
  if (accion === "price_edit") {
    const parts = [];
    if (before?.precio !== after?.precio) parts.push(`Price: ${fmtMoney(before?.precio)} → ${fmtMoney(after?.precio)}`);
    if (before?.descuento_pct !== after?.descuento_pct) parts.push(`Discount: ${before?.descuento_pct ?? 0}% → ${after?.descuento_pct ?? 0}%`);
    return parts.join("  ·  ") || "—";
  }
  if (accion === "discount_applied") {
    const lines = detalles?.lines || [];
    return lines.map((l) => `${l.nombre || l.producto_id}: ${l.manualDescuentoPct}% off ×${l.cantidad}`).join(", ") || "—";
  }
  if (accion === "sale_return") {
    const parts = [`${detalles?.tipo === "credit" ? "Store credit" : "Refund"}: ${fmtMoney(detalles?.totalDevolucion)}`];
    if (detalles?.deudaReducida > 0) parts.push(`Debt reduced ${fmtMoney(detalles.deudaReducida)}`);
    if (detalles?.creditoFavorCreado > 0) parts.push(`Store credit created ${fmtMoney(detalles.creditoFavorCreado)}`);
    if (detalles?.motivo) parts.push(`Reason: ${detalles.motivo}`);
    return parts.join("  ·  ");
  }
  if (accion === "stock_adjustment") {
    const delta = after?.delta ?? detalles?.delta;
    const loc = after?.ubicacion || detalles?.ubicacion || "—";
    return `Adjustment: ${delta > 0 ? "+" : ""}${delta ?? "—"} · ${loc}${after?.van_id ? ` · VAN ${String(after.van_id).slice(0, 8)}` : ""}`;
  }
  if (accion === "stock_transfer") {
    const qty = after?.cantidad ?? detalles?.cantidad;
    const from = before?.origen || before?.origen_tipo || "—";
    const to = after?.destino || after?.destino_tipo || "—";
    return `Transfer: ${qty ?? "—"} · ${from} → ${to}`;
  }
  return "—";
}

export default function AuditoriaLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accion, setAccion] = useState("ALL");
  const [usuarioQ, setUsuarioQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const desde = (page - 1) * PAGE_SIZE;
      const hasta = desde + PAGE_SIZE - 1;

      let query = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (accion !== "ALL") query = query.eq("accion", accion);
      if (usuarioQ.trim()) query = query.ilike("usuario_nombre", `%${usuarioQ.trim()}%`);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", `${to}T23:59:59`);

      const { data, count, error: err } = await query.range(desde, hasta);
      if (err) throw err;

      setRows(data || []);
      setTotal(count || 0);
    } catch (e) {
      setError("Error loading audit log: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [page, accion, usuarioQ, from, to]);

  useEffect(() => { cargar(); }, [cargar]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [accion, usuarioQ, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <PageHeader
        icon={ScrollText}
        title="Audit Log"
        subtitle="Credit limit changes, price edits, discounts and returns"
        color="purple"
        actions={
          <button
            onClick={cargar}
            disabled={loading}
            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all"
            title="Reload"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Action</label>
          <select
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            className="border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg px-2 py-1.5 text-sm"
          >
            {ACCIONES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">User</label>
          <input
            type="text"
            value={usuarioQ}
            onChange={(e) => setUsuarioQ(e.target.value)}
            placeholder="Search by name…"
            className="border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg px-2 py-1.5 text-sm" />
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">User</th>
              <th className="text-left px-4 py-2">Action</th>
              <th className="text-left px-4 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} columns={4} />)
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="text-center text-slate-400 dark:text-slate-500 py-8">No audit entries found.</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{fmtDate(row.created_at)}</td>
                <td className="px-4 py-2 whitespace-nowrap dark:text-slate-200">{row.usuario_nombre || "—"}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ACCION_BADGE[row.accion] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                    {ACCIONES.find((a) => a.value === row.accion)?.label || row.accion}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                  {describeChange(row)}
                  {row.nota ? <span className="text-slate-400"> — {row.nota}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-slate-500 dark:text-slate-400">
        <span>{total} entries</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40"
          >
            Prev
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
