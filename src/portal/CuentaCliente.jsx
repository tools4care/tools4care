import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
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

function HistoryCard({ icon, title, subtitle, rows, loading, error, hasMore, loadMore, renderRow, emptyText }) {
  return (
    <section className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-2 text-blue-700">{icon}</span>
        <div>
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
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

export function CuentaCliente({ session }) {
  const { cliente, resumen, loading, error, unlinked, refresh } = usePortalCliente(session);
  const pagos = usePagosCliente(cliente?.id);
  const compras = useComprasCliente(cliente?.id);
  const paymentOptions = usePortalPaymentOptions();
  const [refreshing, setRefreshing] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const refreshRef = useRef(false);

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
  const creditStatus = getCreditStatus(balance, availableCredit);
  const loadedPurchaseTotal = compras.rows.reduce((sum, row) => sum + safeAmount(row.total_venta ?? row.total), 0);
  const creditUsedPercent = creditLimit > 0 ? Math.min(100, Math.max(0, Math.round((balance / creditLimit) * 100))) : 0;

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
            <div><p className="text-sm text-blue-100">Welcome back</p><h2 className="text-xl font-black">{cliente?.negocio || cliente?.nombre}</h2></div>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${creditStatus.classes}`}><span className={`h-2 w-2 rounded-full ${creditStatus.dot}`} />{creditStatus.label}</span>
          </div>
          <div className="mt-7">
            <p className="text-sm font-semibold text-blue-100">Outstanding balance</p>
            <p className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{fmtMoney(balance)}</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
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

        <HistoryCard icon={<WalletCards size={20} />} title="Payments" subtitle="Payments applied to your account" {...pagos} emptyText="No payments have been recorded yet." renderRow={(row) => (
          <div key={row.id} className="flex justify-between gap-4 py-3"><div><p className="font-bold capitalize">{row.metodo_pago || "Payment"}</p><p className="text-xs text-slate-500">{fmtDateEt(row.fecha_pago)}</p>{row.referencia && <p className="mt-1 text-xs text-slate-400">Ref. {row.referencia}</p>}</div><p className="font-black text-emerald-700">{fmtMoney(row.monto)}</p></div>
        )} />

        <HistoryCard icon={<ReceiptText size={20} />} title="Purchases & invoices" subtitle="Download a PDF copy whenever you need it" {...compras} emptyText="No purchases have been recorded yet." renderRow={(row) => (
          <div key={row.id} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0"><p className="truncate font-bold">{row.numero_factura ? `Invoice ${row.numero_factura}` : "Purchase"}</p><p className="text-xs text-slate-500">{fmtDateEt(row.fecha || row.created_at)}</p><InvoiceDownloadButton purchase={row} client={cliente} /></div>
            <div className="text-right"><p className="font-black">{fmtMoney(row.total_venta ?? row.total)}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{row.estado_pago || "recorded"}</p></div>
          </div>
        )} />

        <section className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-slate-100 p-2 text-slate-700"><Headphones size={20} /></span><div><h2 className="font-black text-slate-900">Need help?</h2><p className="text-sm text-slate-500">Questions about an invoice, payment, or your credit account.</p></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><a className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-700" href="mailto:Tools4care@gmail.com?subject=Customer%20portal%20support"><Mail size={16} /> Email support</a><a className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white" href="tel:+19785941624"><Headphones size={16} /> Call (978) 594-1624</a></div>
        </section>

        <footer className="pb-4 pt-2 text-center text-xs text-slate-400">Balances update after payments are processed. All dates are shown in Eastern Time.</footer>
      </div>

      {paymentModalOpen && balance > 0 && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentModalOpen(false); }}>
          <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Landmark size={21} /></span>
                <div><h2 id="payment-modal-title" className="text-xl font-black text-slate-950">Choose how to pay</h2><p className="mt-1 text-sm text-slate-500">Outstanding balance</p><p className="text-2xl font-black text-slate-950">{fmtMoney(balance)}</p></div>
              </div>
              <button className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" aria-label="Close payment options" onClick={() => setPaymentModalOpen(false)}><X size={20} /></button>
            </div>

            <div className="mt-5 grid gap-3">
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
              <div className="flex min-h-16 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 opacity-75">
                <span><span className="block font-black text-slate-800">Credit or debit card</span><span className="text-sm text-slate-500">Stripe secure checkout</span></span><span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">Coming soon</span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Before sending:</strong> Enter exactly {fmtMoney(balance)} and include your business name or invoice number in the payment note. Cash App and Venmo payments appear here after Tools4Care confirms them.</div>
            <button className="mt-4 w-full rounded-xl border border-slate-300 py-3 text-sm font-black text-slate-700" onClick={() => setPaymentModalOpen(false)}>Cancel</button>
          </section>
        </div>
      )}
    </main>
  );
}
