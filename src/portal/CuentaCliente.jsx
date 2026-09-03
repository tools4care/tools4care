import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Headphones,
  LogOut,
  Mail,
  Landmark,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { fmtDateEt, fmtMoney, safeAmount } from "./portalUtils";
import { useComprasCliente, usePagosCliente } from "./usePortalHistory";
import { usePortalCliente } from "./usePortalCliente";
import { usePortalPaymentOptions } from "./usePortalPaymentOptions";
import { PortalCardPayment } from "./PortalCardPayment";

function HistoryCard({ icon, title, subtitle, rows, loading, error, hasMore, loadMore, renderRow, emptyText, headerExtra }) {
  return (
    <section className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-2 text-blue-700">{icon}</span>
        <div>
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {headerExtra}
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && rows.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">{emptyText}</div>}
      <div className="mt-3 divide-y divide-slate-100">{rows.map(renderRow)}</div>
      {loading && <p className="mt-4 text-center text-sm text-slate-500">Loading…</p>}
      {hasMore && rows.length > 0 && (
        <button className="mt-4 w-full rounded-xl border border-slate-300 py-2 text-sm font-bold text-slate-700 disabled:opacity-60" disabled={loading} onClick={loadMore}>
          {loading ? "Loading…" : "Show more"}
        </button>
      )}
    </section>
  );
}

function PaymentStatusTimeline() {
  const steps = ["Stripe approved", "Applied to CxC", "Balance updated", "Receipt prepared"];
  return (
    <ol aria-label="Payment processing status" className="grid grid-cols-2 gap-3 rounded-2xl border border-emerald-100 bg-white p-4 sm:grid-cols-4">
      {steps.map((label, index) => (
        <li key={label} className="relative flex items-center gap-2 sm:block sm:text-center">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white sm:mx-auto">
            <CheckCircle2 size={16} aria-hidden="true" />
          </span>
          <span className="text-xs font-bold text-slate-700 sm:mt-2 sm:block">{label}</span>
          {index < steps.length - 1 && <span className="absolute left-8 top-4 hidden h-px w-[calc(100%-1.5rem)] bg-emerald-200 sm:block sm:left-[calc(50%+1.25rem)] sm:w-[calc(100%-2.5rem)]" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

function InvoiceDownloadButton({ purchase, client }) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const downloadingRef = useRef(false);

  async function downloadInvoice() {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setStatus("loading");
    setError("");
    try {
      // PDF libraries and invoice details are loaded only after the customer asks for them.
      const { buildFacturaPDF, ensureDetalleVentas } = await import("../lib/invoiceEmail");
      const invoice = await ensureDetalleVentas({
        ...purchase,
        total: purchase.total_venta ?? purchase.total,
        cliente_nombre_c: client?.nombre,
        cliente_email: client?.email,
        cliente_telefono: client?.telefono,
        cliente_direccion: client?.direccion,
      });
      const doc = await buildFacturaPDF(invoice);
      doc.save(`${purchase.numero_factura || `invoice-${purchase.id.slice(0, 8)}`}.pdf`);
      setStatus("done");
    } catch (downloadError) {
      setError(downloadError.message || "Invoice download failed.");
      setStatus("error");
    } finally {
      downloadingRef.current = false;
    }
  }

  return (
    <div className="mt-2">
      <button className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 disabled:opacity-50" disabled={status === "loading"} onClick={downloadInvoice}>
        <Download size={14} /> {status === "loading" ? "Preparing PDF…" : status === "done" ? "Download again" : "Download invoice"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function getCreditStatus(balance, availableCredit) {
  if (balance <= 0) return { label: "Account current", classes: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" };
  if (availableCredit > 0) return { label: "Credit available", classes: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" };
  return { label: "Credit limit reached", classes: "bg-amber-100 text-amber-900", dot: "bg-amber-500" };
}

// Database values remain stable for accounting; translate only at the portal
// presentation layer so customers always see English labels.
function formatPaymentMethod(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("stripe_terminal") || raw.includes("card") || raw.includes("tarjeta")) return "Card";
  if (raw.includes("cash") || raw.includes("efectivo")) return "Cash";
  if (raw.includes("cashapp") || raw.includes("cash app")) return "Cash App";
  if (raw.includes("venmo")) return "Venmo";
  if (raw.includes("zelle")) return "Zelle";
  if (raw.includes("apple pay") || raw.includes("applepay")) return "Apple Pay";
  if (raw.includes("transfer") || raw.includes("transferencia")) return "Bank transfer";
  if (raw.includes("check") || raw.includes("cheque")) return "Check";
  if (raw.includes("otro") || raw.includes("other")) return "Other";
  return value ? String(value) : "Payment";
}

function formatPaymentStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "pagado" || raw === "paid") return "Paid";
  if (raw === "parcial" || raw === "partial") return "Partial";
  if (raw === "pendiente" || raw === "pending") return "Pending";
  if (raw === "cancelado" || raw === "cancelled" || raw === "canceled") return "Cancelled";
  if (raw === "reembolsado" || raw === "refunded") return "Refunded";
  return value ? String(value) : "Recorded";
}

function recentMonths(count = 18) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { value, label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
  });
}

export function CuentaCliente({ session }) {
  const { cliente, resumen, loading, error, unlinked, refresh } = usePortalCliente(session);
  const [paymentMonth, setPaymentMonth] = useState("");
  const months = recentMonths();
  const paymentDateFrom = paymentMonth ? `${paymentMonth}-01` : "";
  const paymentDateTo = paymentMonth ? new Date(Number(paymentMonth.slice(0, 4)), Number(paymentMonth.slice(5, 7)), 0).toISOString().slice(0, 10) : "";
  const pagos = usePagosCliente(cliente?.id, paymentDateFrom, paymentDateTo);
  const [invoiceFrom, setInvoiceFrom] = useState("");
  const [invoiceTo, setInvoiceTo] = useState("");
  const [invoiceFromDraft, setInvoiceFromDraft] = useState("");
  const [invoiceToDraft, setInvoiceToDraft] = useState("");
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const compras = useComprasCliente(cliente?.id, invoiceFrom, invoiceTo);
  const paymentOptions = usePortalPaymentOptions();
  const [refreshing, setRefreshing] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [cardAmountStep, setCardAmountStep] = useState(false);
  const [cardAmountInput, setCardAmountInput] = useState("");
  const [cardAmount, setCardAmount] = useState(0);
  const [cardPaymentActive, setCardPaymentActive] = useState(false);
  const [cardPaymentDone, setCardPaymentDone] = useState(false);
  const refreshRef = useRef(false);

  useEffect(() => {
    setSelectedInvoices((current) => current.filter((id) => compras.rows.some((row) => row.id === id)));
  }, [compras.rows]);

  useEffect(() => {
    if (!paymentModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setPaymentModalOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [paymentModalOpen]);

  async function refreshAll() {
    if (refreshRef.current) return;
    refreshRef.current = true;
    setRefreshing(true);
    await Promise.all([refresh(), pagos.refresh(), compras.refresh()]);
    refreshRef.current = false;
    setRefreshing(false);
  }

  function closePaymentModal() {
    setPaymentModalOpen(false);
    setCardAmountStep(false);
    setCardPaymentActive(false);
    setCardPaymentDone(false);
  }

  function openCardAmountStep(defaultAmount) {
    setCardAmountInput(defaultAmount.toFixed(2));
    setCardAmountStep(true);
  }

  function confirmCardAmount(maxAmount) {
    const parsed = Math.round((Number(cardAmountInput) || 0) * 100) / 100;
    const clamped = Math.min(Math.max(parsed, 0.5), maxAmount);
    setCardAmount(clamped);
    setCardAmountStep(false);
    setCardPaymentActive(true);
  }

  async function handleCardPaymentSuccess() {
    setCardPaymentActive(false);
    setCardPaymentDone(true);
    await refreshAll();
  }

  if (loading && !cliente) return <main className="min-h-screen bg-slate-50 p-6 text-center text-slate-600">Loading your account…</main>;
  if (unlinked) return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto mt-12 max-w-md bg-white rounded-2xl shadow-md p-6">
        <h1 className="text-xl font-black">Account not linked</h1>
        <p className="mt-2 text-slate-600">If your access was just activated, try again. You can also sign in with another email address.</p>
        <div className="mt-5 space-y-3">
          <button className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white" onClick={refresh}>Try again</button>
          <button className="w-full rounded-xl border border-slate-300 py-3 font-bold text-slate-700" onClick={() => supabase.auth.signOut()}>Use another email</button>
        </div>
      </div>
    </main>
  );

  const balance = safeAmount(resumen?.saldo);
  const creditLimit = cliente?.limite_manual != null ? safeAmount(cliente.limite_manual) : safeAmount(resumen?.limite_politica);
  const availableCredit = Math.max(0, Number((creditLimit - balance).toFixed(2)));
  const creditScore = Math.max(300, Math.min(850, Number(resumen?.score_base || 600)));
  const creditStatus = getCreditStatus(balance, availableCredit);
  const loadedPurchaseTotal = compras.rows.reduce((sum, row) => sum + safeAmount(row.total_venta ?? row.total), 0);
  const creditUsedPercent = creditLimit > 0 ? Math.min(100, Math.max(0, Math.round((balance / creditLimit) * 100))) : 0;

  async function downloadSelectedInvoices() {
    if (!selectedInvoices.length || bulkStatus === "loading") return;
    setBulkStatus("loading");
    try {
      const { buildFacturaPDF, ensureDetalleVentas } = await import("../lib/invoiceEmail");
      const selected = compras.rows.filter((row) => selectedInvoices.includes(row.id));
      for (const purchase of selected) {
        const invoice = await ensureDetalleVentas({ ...purchase, total: purchase.total_venta ?? purchase.total, cliente_nombre: cliente?.nombre, cliente_email: cliente?.email, cliente_telefono: cliente?.telefono, cliente_direccion: cliente?.direccion });
        const doc = await buildFacturaPDF(invoice);
        doc.save(`${purchase.numero_factura || `invoice-${purchase.id.slice(0, 8)}`}.pdf`);
      }
      setBulkStatus("done");
    } catch (downloadError) {
      setBulkStatus(downloadError.message || "Invoice download failed.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center justify-between">
          <div><p className="text-xs font-black tracking-widest text-blue-600">TOOLS4CARE</p><h1 className="text-2xl font-black text-slate-950">My account</h1></div>
          <button className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold text-slate-600 hover:bg-white" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Sign out</button>
        </header>

        {error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Showing the last available balance. {error}</p>}

        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 p-5 text-white shadow-lg sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm text-blue-100">Welcome back</p><h2 className="text-xl font-black">{[cliente?.nombre, cliente?.negocio].filter(Boolean).join(" — ")}</h2></div>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${creditStatus.classes}`}><span className={`h-2 w-2 rounded-full ${creditStatus.dot}`} />{creditStatus.label}</span>
          </div>
          <div className="mt-7">
            <p className="text-sm font-semibold text-blue-100">Outstanding balance</p>
            <p className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{fmtMoney(balance)}</p>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-sm sm:gap-3">
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur"><p className="text-blue-100">Credit score</p><p className="mt-1 text-lg font-black">{creditScore}</p></div>
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur"><p className="text-blue-100">Credit limit</p><p className="mt-1 text-lg font-black">{fmtMoney(creditLimit)}</p></div>
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur"><p className="text-blue-100">Available credit</p><p className="mt-1 text-lg font-black text-emerald-300">{fmtMoney(availableCredit)}</p></div>
          </div>
          {creditLimit > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs text-blue-100"><span>Credit used</span><span>{creditUsedPercent}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${creditUsedPercent}%` }} /></div>
            </div>
          )}
          <button disabled={balance <= 0} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-black text-blue-900 disabled:cursor-not-allowed disabled:opacity-65" onClick={() => setPaymentModalOpen(true)}>
            {balance > 0 ? <><WalletCards size={19} /> Pay {fmtMoney(balance)}</> : <><CheckCircle2 size={19} /> You're all paid up</>}
          </button>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm"><ReceiptText className="text-blue-600" size={20} /><p className="mt-3 text-xs text-slate-500">Recent invoices</p><p className="text-xl font-black">{compras.rows.length}</p></div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><FileText className="text-violet-600" size={20} /><p className="mt-3 text-xs text-slate-500">Recent purchases</p><p className="text-xl font-black">{fmtMoney(loadedPurchaseTotal)}</p></div>
          <div className="col-span-2 rounded-2xl bg-white p-4 shadow-sm sm:col-span-1"><ShieldCheck className="text-emerald-600" size={20} /><p className="mt-3 text-xs text-slate-500">Portal access</p><p className="text-sm font-black">Secure & private</p></div>
        </section>

        <button className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white py-3 text-sm font-bold text-slate-700 disabled:opacity-60" disabled={refreshing} onClick={refreshAll}>
          <RefreshCw className={refreshing ? "animate-spin" : ""} size={16} /> {refreshing ? "Refreshing…" : "Refresh account"}
        </button>

        <HistoryCard icon={<WalletCards size={20} />} title="Payments" subtitle={paymentMonth ? `Showing payments for ${months.find((month) => month.value === paymentMonth)?.label || paymentMonth}` : "Payments applied to your account"} {...pagos} headerExtra={<div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3"><label className="text-xs font-bold text-slate-600">Month<select value={paymentMonth} onChange={(e) => setPaymentMonth(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"><option value="">All months</option>{months.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}</select></label>{paymentMonth && <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700" onClick={() => setPaymentMonth("")}>Clear</button>}</div>} emptyText="No payments have been recorded yet." renderRow={(row) => (
          <div key={row.id} className="flex justify-between gap-4 py-3"><div><p className="font-bold">{formatPaymentMethod(row.metodo_pago)}</p><p className="text-xs text-slate-500">{fmtDateEt(row.fecha_pago)}</p>{row.referencia && <p className="mt-1 text-xs text-slate-400">Ref. {row.referencia}</p>}</div><p className="font-black text-emerald-700">{fmtMoney(row.monto)}</p></div>
        )} />

        <HistoryCard icon={<ReceiptText size={20} />} title="Purchases & invoices" subtitle="Filter by date, select invoices, and download PDF copies" {...compras} emptyText="No purchases have been recorded yet."
          headerExtra={<div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Choose a date range from the calendar.</p><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-500">From<input type="date" value={invoiceFromDraft} onChange={(e) => setInvoiceFromDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-slate-700" /></label><label className="text-xs font-bold text-slate-500">To<input type="date" value={invoiceToDraft} onChange={(e) => setInvoiceToDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-slate-700" /></label></div><div className="flex flex-wrap gap-2"><button className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white" onClick={() => { if (invoiceFromDraft && invoiceToDraft && invoiceFromDraft > invoiceToDraft) { setBulkStatus("Please choose a valid date range."); return; } setBulkStatus(""); setInvoiceFrom(invoiceFromDraft); setInvoiceTo(invoiceToDraft); setSelectedInvoices([]); }}>Apply dates</button><button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700" onClick={() => { setInvoiceFromDraft(""); setInvoiceToDraft(""); setInvoiceFrom(""); setInvoiceTo(""); setSelectedInvoices([]); setBulkStatus(""); }}>Clear</button>{selectedInvoices.length > 0 && <button className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800" onClick={downloadSelectedInvoices}>{bulkStatus === "loading" ? "Preparing PDFs…" : `Download ${selectedInvoices.length} PDF${selectedInvoices.length > 1 ? "s" : ""}`}</button>}</div>{bulkStatus === "done" && <p className="text-xs font-bold text-emerald-700">Invoices downloaded.</p>}{bulkStatus && bulkStatus !== "loading" && bulkStatus !== "done" && <p className="text-xs font-bold text-red-600">{bulkStatus}</p>}</div>}
          renderRow={(row) => (
          <div key={row.id} className="flex items-start justify-between gap-4 py-3">
            <div className="flex min-w-0 items-start gap-3"><input type="checkbox" aria-label="Select invoice" checked={selectedInvoices.includes(row.id)} onChange={() => setSelectedInvoices((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} className="mt-1.5 h-4 w-4 rounded border-slate-300 text-blue-600" /><div><p className="truncate font-bold">{row.numero_factura ? `Invoice ${row.numero_factura}` : "Purchase"}</p><p className="text-xs text-slate-500">{fmtDateEt(row.fecha || row.created_at)}</p><InvoiceDownloadButton purchase={row} client={cliente} /></div></div>
            <div className="text-right"><p className="font-black">{fmtMoney(row.total_venta ?? row.total)}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{formatPaymentStatus(row.estado_pago)}</p></div>
          </div>
        )} />

        <section className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-slate-100 p-2 text-slate-700"><Headphones size={20} /></span><div><h2 className="font-black text-slate-900">Need help?</h2><p className="text-sm text-slate-500">Questions about an invoice, payment, or your credit account.</p></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><a className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-700" href="mailto:Tools4care@gmail.com?subject=Customer%20portal%20support"><Mail size={16} /> Email support</a><a className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white" href="tel:+19785941624"><Headphones size={16} /> Call (978) 594-1624</a></div>
        </section>

        <footer className="pb-4 pt-2 text-center text-xs text-slate-400">Balances update after payments are processed. All dates are shown in Eastern Time.</footer>
      </div>

      {paymentModalOpen && balance > 0 && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePaymentModal(); }}>
          <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Landmark size={21} /></span>
                <div><h2 id="payment-modal-title" className="text-xl font-black text-slate-950">{cardPaymentActive ? "Pay with card" : cardAmountStep ? "How much to pay?" : cardPaymentDone ? "Payment received" : "Choose how to pay"}</h2><p className="mt-1 text-sm text-slate-500">{cardPaymentActive ? "Amount to charge" : "Outstanding balance"}</p><p className="text-2xl font-black text-slate-950">{fmtMoney(cardPaymentActive ? cardAmount : balance)}</p></div>
              </div>
              <button className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" aria-label="Close payment options" onClick={closePaymentModal}><X size={20} /></button>
            </div>

            {cardPaymentDone ? (
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                  <CheckCircle2 size={22} />
                  <p className="text-sm font-bold">Your card payment was applied to your account.</p>
                </div>
                <PaymentStatusTimeline />
                <button className="w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white" onClick={closePaymentModal}>Done</button>
              </div>
            ) : cardPaymentActive ? (
              <div className="mt-5">
                <PortalCardPayment amount={cardAmount} onSuccess={handleCardPaymentSuccess} onCancel={() => setCardPaymentActive(false)} />
              </div>
            ) : cardAmountStep ? (
              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="card-amount" className="block text-xs font-black uppercase tracking-wide text-slate-500">Amount to pay</label>
                  <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 focus-within:border-slate-900">
                    <span className="text-lg font-black text-slate-500">$</span>
                    <input
                      id="card-amount"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.50"
                      max={balance}
                      value={cardAmountInput}
                      onChange={(event) => setCardAmountInput(event.target.value)}
                      className="w-full border-0 p-0 text-xl font-black text-slate-950 outline-none"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Between $0.50 and {fmtMoney(balance)}. You can pay part of your balance if you prefer.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCardAmountStep(false)} className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-black text-slate-700">Back</button>
                  <button onClick={() => confirmCardAmount(balance)} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white">Continue</button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-3">
                  <button onClick={() => openCardAmountStep(balance)} className="flex min-h-16 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition active:scale-[0.99] hover:bg-slate-100">
                    <span><span className="block font-black text-slate-900">Pay with card</span><span className="text-sm text-slate-500">Instant — applied automatically</span></span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><CreditCard size={18} /></span>
                  </button>
                  {paymentOptions.cashApp.map((option) => (
                    <a key={option.handle} href={option.url} target="_blank" rel="noreferrer" className="flex min-h-16 items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 transition active:scale-[0.99] hover:bg-emerald-100">
                      <span><span className="block font-black text-emerald-950">Pay with Cash App</span><span className="text-sm text-emerald-700">{option.handle}</span></span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-xl font-black text-white">$</span>
                    </a>
                  ))}
                  {paymentOptions.venmo && (
                    <a href={paymentOptions.venmo.url} target="_blank" rel="noreferrer" className="flex min-h-16 items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 transition active:scale-[0.99] hover:bg-blue-100">
                      <span><span className="block font-black text-blue-950">Pay with Venmo</span><span className="text-sm text-blue-700">{paymentOptions.venmo.handle}</span></span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-black text-white">V</span>
                    </a>
                  )}
                </div>

                <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Before sending:</strong> Enter exactly {fmtMoney(balance)} and include your business name or invoice number in the payment note. Cash App and Venmo payments appear here after Tools4Care confirms them.</div>
                <button className="mt-4 w-full rounded-xl border border-slate-300 py-3 text-sm font-black text-slate-700" onClick={closePaymentModal}>Cancel</button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
