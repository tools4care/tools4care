import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Ban,
  Banknote,
  CircleAlert,
  Download,
  Eye,
  History,
  LockKeyhole,
  LockOpen,
  MinusCircle,
  PlusCircle,
  Printer,
  ReceiptText,
  RefreshCw,
  Store,
  WalletCards,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useVan } from "../hooks/VanContext";
import { useUsuario } from "../UsuarioContext";
import { usePermisos } from "../hooks/usePermisos";
import { useSyncGlobal } from "../hooks/SyncContext";
import { useLocationSettings } from "../hooks/useLocationSettings";
import {
  getStoreDeviceId,
  getStoreRegisterName,
  selectManagedStoreCashSession,
  setStoreRegisterName,
  setStoredStoreCashSessionId,
} from "../lib/storeRegister";
import {
  closeoutHasVariance,
  closeoutPaymentRows,
  downloadStoreCloseoutPdf,
  printStoreCloseoutThermal,
} from "../lib/storeCloseoutReport";

const money = (value) => Number(value || 0).toLocaleString("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const dateTime = (value) => value
  ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  : "—";

function Metric({ label, value, detail, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-rose-200 bg-rose-50 text-rose-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="text-[11px] font-black uppercase tracking-[0.13em] opacity-65">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      {detail && <div className="mt-1 text-xs font-semibold opacity-65">{detail}</div>}
    </div>
  );
}

function ReconciliationField({ label, system, value, onChange, help, min }) {
  const numeric = value === "" ? null : Number(value);
  const difference = numeric == null || !Number.isFinite(numeric) ? null : numeric - Number(system || 0);
  const balanced = difference != null && Math.abs(difference) < 0.005;
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div><div className="font-black text-slate-900">{label}</div><div className="text-xs font-semibold text-slate-500">{help}</div></div>
        <div className="text-right"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">System</div><div className="font-black text-slate-800">{money(system)}</div></div>
      </div>
      <input type="number" min={min} step="0.01" value={value} onChange={(event) => onChange(event.target.value)} className="mt-3 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-lg font-black outline-none focus:border-blue-500" placeholder="Verified total" required />
      {difference != null && Number.isFinite(difference) && (
        <div className={`mt-2 text-right text-xs font-black ${balanced ? "text-emerald-700" : "text-rose-700"}`}>Difference {money(difference)}</div>
      )}
    </div>
  );
}

export default function StoreRegister() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const { isAdmin, isSupervisor } = usePermisos();
  const { syncing, ventasPendientes, sincronizarAhora } = useSyncGlobal();
  const { settings: locationSettings } = useLocationSettings();
  const privileged = isAdmin || isSupervisor;
  const deviceId = useMemo(() => getStoreDeviceId(), []);
  const [registerName, setRegisterNameState] = useState(() => getStoreRegisterName());
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [openingNotes, setOpeningNotes] = useState("");
  const [sessions, setSessions] = useState([]);
  const [registers, setRegisters] = useState({});
  const [movements, setMovements] = useState([]);
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [movementType, setMovementType] = useState("deposit");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [reopenId, setReopenId] = useState(null);
  const [reopenReason, setReopenReason] = useState("");
  const [voidMovementId, setVoidMovementId] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [reviewSessionId, setReviewSessionId] = useState(null);
  const [declaredCard, setDeclaredCard] = useState("");
  const [declaredTransfer, setDeclaredTransfer] = useState("");
  const [declaredOther, setDeclaredOther] = useState("");
  const [cardBatchReference, setCardBatchReference] = useState("");
  const [closedReport, setClosedReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const reconciliationSessionRef = useRef(null);

  const activeSession = sessions.find((row) =>
    row.status === "open" && row.device_id === deviceId && row.cashier_id === usuario?.id
  ) || null;
  const deviceSession = sessions.find((row) => row.status === "open" && row.device_id === deviceId) || null;
  const managedSession = selectManagedStoreCashSession(sessions, {
    deviceId,
    cashierId: usuario?.id,
    reviewSessionId,
    privileged,
  });
  const recoveryMode = Boolean(managedSession && managedSession.id !== activeSession?.id);
  const systemPayments = summary?.system_payments || {};
  const liveMethodVariances = {
    cash: countedCash === "" ? 0 : Number(countedCash) - Number(summary?.expected_cash || 0),
    card: declaredCard === "" ? 0 : Number(declaredCard) - Number(systemPayments.card || 0),
    transfer: declaredTransfer === "" ? 0 : Number(declaredTransfer) - Number(systemPayments.transfer || 0),
    other: declaredOther === "" ? 0 : Number(declaredOther) - Number(systemPayments.other || 0),
  };

  const load = useCallback(async () => {
    if (!van?.id || !usuario?.id) return;
    setLoading(true);
    setError("");
    try {
      const sessionsResult = await supabase.rpc("get_store_cash_session_history", {
        p_location_id: van.id,
        p_limit: 60,
      });
      if (sessionsResult.error) throw sessionsResult.error;
      const rows = Array.isArray(sessionsResult.data) ? sessionsResult.data : [];
      setSessions(rows);

      setRegisters(Object.fromEntries(rows.map((row) => [row.register_id, { id: row.register_id, name: row.register_name, device_id: row.device_id }])));

      const current = rows.find((row) => row.status === "open" && row.device_id === deviceId && row.cashier_id === usuario.id);
      const selected = selectManagedStoreCashSession(rows, {
        deviceId,
        cashierId: usuario.id,
        reviewSessionId,
        privileged,
      });

      setStoredStoreCashSessionId(van.id, current?.id || null, current ? deviceId : null);
      if (selected) {
        const [summaryResult, movementResult, eventResult] = await Promise.all([
          supabase.rpc("get_store_cash_closeout_preview", { p_session_id: selected.id }),
          supabase.from("store_cash_movements").select("*").eq("session_id", selected.id).order("created_at", { ascending: false }),
          supabase.from("store_cash_session_events").select("*").eq("session_id", selected.id).order("created_at", { ascending: false }).limit(20),
        ]);
        if (summaryResult.error) throw summaryResult.error;
        if (movementResult.error) throw movementResult.error;
        if (eventResult.error) throw eventResult.error;
        setSummary(summaryResult.data || null);
        setMovements(movementResult.data || []);
        setEvents(eventResult.data || []);
      } else {
        setSummary(null);
        setMovements([]);
        setEvents([]);
      }
    } catch (loadError) {
      setError(loadError?.message || "Could not load this cash register.");
    } finally {
      setLoading(false);
    }
  }, [deviceId, privileged, reviewSessionId, usuario?.id, van?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!managedSession?.id || summary?.session_id !== managedSession.id) return;
    if (reconciliationSessionRef.current === managedSession.id) return;
    reconciliationSessionRef.current = managedSession.id;
    setCountedCash("");
    setDeclaredCard(Math.abs(Number(summary?.system_payments?.card || 0)) < 0.005 ? "0.00" : "");
    setDeclaredTransfer(Number(summary?.system_payments?.transfer || 0).toFixed(2));
    setDeclaredOther(Number(summary?.system_payments?.other || 0).toFixed(2));
    setCardBatchReference("");
    setClosingNotes("");
  }, [managedSession?.id, summary]);

  useEffect(() => {
    if (!van?.id) return undefined;
    const refresh = () => load();
    const channel = supabase
      .channel(`store-register-${van.id}-${deviceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_cash_sessions", filter: `location_id=eq.${van.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_cash_movements", filter: `location_id=eq.${van.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [deviceId, load, van?.id]);

  async function run(action) {
    setSaving(true);
    setError("");
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(actionError?.message || "The operation could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  function openRegister(event) {
    event.preventDefault();
    run(async () => {
      const amount = Number(openingFloat);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid opening float.");
      setStoreRegisterName(registerName);
      const result = await supabase.rpc("open_store_cash_session", {
        p_location_id: van.id,
        p_device_id: deviceId,
        p_register_name: registerName.trim() || "Main Register",
        p_opening_float: amount,
        p_notes: openingNotes.trim() || null,
      });
      if (result.error) throw result.error;
      setStoredStoreCashSessionId(van.id, result.data?.id, deviceId);
      setOpeningNotes("");
    });
  }

  function addMovement(event) {
    event.preventDefault();
    run(async () => {
      const amount = Number(movementAmount);
      if (!activeSession) throw new Error("Open this register first.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive amount.");
      if (movementReason.trim().length < 3) throw new Error("Enter a clear reason.");
      const result = await supabase.rpc("add_store_cash_movement", {
        p_session_id: activeSession.id,
        p_movement_type: movementType,
        p_amount: amount,
        p_reason: movementReason.trim(),
      });
      if (result.error) throw result.error;
      setMovementAmount("");
      setMovementReason("");
    });
  }

  function closeRegister(event) {
    event.preventDefault();
    run(async () => {
      if (!navigator.onLine) throw new Error("Reconnect and synchronize before closing this shift.");
      if (syncing) throw new Error("Wait for synchronization to finish before closing this shift.");
      if (ventasPendientes > 0) throw new Error(`Synchronize ${ventasPendientes} pending offline transaction${ventasPendientes === 1 ? "" : "s"} before closing.`);
      const amount = Number(countedCash);
      const cardAmount = Number(declaredCard);
      const transferAmount = Number(declaredTransfer);
      const otherAmount = Number(declaredOther);
      if (!managedSession) throw new Error("There is no open session to close.");
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter the cash counted in the drawer.");
      if (!Number.isFinite(cardAmount)) throw new Error("Enter the card terminal batch total.");
      if (!Number.isFinite(transferAmount)) throw new Error("Review the transfer total.");
      if (!Number.isFinite(otherAmount)) throw new Error("Review the check / other total.");
      if (recoveryMode && managedSession.cashier_id !== usuario?.id && closingNotes.trim().length < 5) {
        throw new Error("Enter a supervisor recovery reason before closing this shift.");
      }
      const variances = {
        cash: amount - Number(summary?.expected_cash || 0),
        card: cardAmount - Number(systemPayments.card || 0),
        transfer: transferAmount - Number(systemPayments.transfer || 0),
        other: otherAmount - Number(systemPayments.other || 0),
      };
      if (closeoutHasVariance(variances) && closingNotes.trim().length < 5) {
        throw new Error("Explain the closeout difference in the closing notes.");
      }
      const result = await supabase.rpc("close_store_cash_session_v2", {
        p_session_id: managedSession.id,
        p_reconciliation: {
          cash_counted: amount,
          card_declared: cardAmount,
          transfer_declared: transferAmount,
          other_declared: otherAmount,
          card_batch_reference: cardBatchReference.trim() || null,
        },
        p_notes: closingNotes.trim() || null,
      });
      if (result.error) throw result.error;
      let report = result.data;
      setClosedReport(report);
      if (locationSettings.receipt_printing_enabled && report?.id) {
        const printStarted = printStoreCloseoutThermal(report);
        if (printStarted) {
          const printResult = await supabase.rpc("mark_store_cash_closeout_printed", { p_report_id: report.id });
          if (!printResult.error && printResult.data) {
            report = printResult.data;
            setClosedReport(report);
          }
        }
      }
      setStoredStoreCashSessionId(van.id, null);
      setCountedCash("");
      setDeclaredCard("");
      setDeclaredTransfer("");
      setDeclaredOther("");
      setCardBatchReference("");
      setClosingNotes("");
      setReviewSessionId(null);
      reconciliationSessionRef.current = null;
    });
  }

  async function loadCloseoutReport(session) {
    if (!session?.id || !session?.closeout_report_id) return;
    setReportLoading(true);
    setError("");
    try {
      const result = await supabase.rpc("get_store_cash_closeout_report", {
        p_session_id: session.id,
        p_close_version: session.close_version || null,
      });
      if (result.error) throw result.error;
      setClosedReport(result.data || null);
    } catch (reportError) {
      setError(reportError?.message || "Could not load the closeout report.");
    } finally {
      setReportLoading(false);
    }
  }

  async function printCloseoutReport(report = closedReport) {
    if (!report?.id) return;
    setReportLoading(true);
    setError("");
    try {
      const printStarted = printStoreCloseoutThermal(report, { reprint: Number(report.print_count || 0) > 0 });
      if (!printStarted) throw new Error("The print preview could not be opened.");
      const result = await supabase.rpc("mark_store_cash_closeout_printed", { p_report_id: report.id });
      if (result.error) throw result.error;
      setClosedReport(result.data || report);
      await load();
    } catch (printError) {
      setError(printError?.message || "Could not print the closeout report.");
    } finally {
      setReportLoading(false);
    }
  }

  async function downloadCloseoutReport(report = closedReport) {
    if (!report?.id) return;
    setReportLoading(true);
    setError("");
    try {
      await downloadStoreCloseoutPdf(report);
    } catch (downloadError) {
      setError(downloadError?.message || "Could not generate the closeout PDF.");
    } finally {
      setReportLoading(false);
    }
  }

  function reopenSession(event) {
    event.preventDefault();
    run(async () => {
      if (!reopenId || reopenReason.trim().length < 5) throw new Error("Enter a detailed reason for reopening.");
      const result = await supabase.rpc("reopen_store_cash_session", {
        p_session_id: reopenId,
        p_reason: reopenReason.trim(),
      });
      if (result.error) throw result.error;
      setReopenId(null);
      setReopenReason("");
    });
  }

  function voidMovement(event) {
    event.preventDefault();
    run(async () => {
      if (!voidMovementId || voidReason.trim().length < 3) throw new Error("Enter a clear void reason.");
      const result = await supabase.rpc("void_store_cash_movement", {
        p_movement_id: voidMovementId,
        p_reason: voidReason.trim(),
      });
      if (result.error) throw result.error;
      setVoidMovementId(null);
      setVoidReason("");
    });
  }

  const liveVariance = countedCash === "" || !summary
    ? null
    : Number(countedCash) - Number(summary.expected_cash || 0);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1450px] space-y-6">
        <header className="rounded-[30px] bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-800 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/20"><WalletCards size={34} /></span>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Physical Store · Cash Operations</div>
                <h1 className="mt-1 text-3xl font-black sm:text-4xl">Cash Register</h1>
                <p className="mt-1 text-sm text-blue-100">One cashier, one computer and one auditable shift.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/cierres" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-black ring-1 ring-white/20 hover:bg-white/15">General Store Closeout</Link>
              <button onClick={load} disabled={loading} className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60">
                <RefreshCw size={17} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>
        </header>

        {error && <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800"><CircleAlert size={19} className="mt-0.5 shrink-0" />{error}</div>}

        {!managedSession ? (
          <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
            <form onSubmit={openRegister} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><LockOpen size={25} /></span>
                <div><h2 className="text-xl font-black text-slate-950">Open this register</h2><p className="text-sm text-slate-500">Count the starting cash before the first sale.</p></div>
              </div>
              {deviceSession && deviceSession.cashier_id !== usuario?.id && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                  This computer already has an open shift for another cashier. That shift must be closed first.
                </div>
              )}
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">Register name
                  <input value={registerName} onChange={(e) => setRegisterNameState(e.target.value)} className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-blue-500" required />
                </label>
                <label className="text-sm font-bold text-slate-700">Opening float
                  <div className="relative mt-2"><span className="absolute left-4 top-3.5 font-bold text-slate-400">$</span><input type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 py-3 pl-8 pr-4 text-lg font-black outline-none focus:border-blue-500" required /></div>
                </label>
              </div>
              <label className="mt-4 block text-sm font-bold text-slate-700">Opening note (optional)
                <textarea value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} rows={2} className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-blue-500" placeholder="Float counted and verified…" />
              </label>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs font-semibold text-slate-500">Computer ID: {deviceId.slice(0, 8)} · Cashier: {usuario?.nombre || usuario?.email}</div>
              <button disabled={saving || Boolean(deviceSession && deviceSession.cashier_id !== usuario?.id)} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 disabled:opacity-50">
                <LockOpen size={22} /> Open Register
              </button>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-xl font-black text-slate-950">Before opening</h2>
              <div className="mt-5 space-y-3 text-sm font-semibold text-slate-600">
                {["Sign in as the cashier using this computer.", "Count the drawer and enter the opening float.", "Record deposits, withdrawals and expenses during the shift.", "Count and close this register before the general store closeout."].map((line, index) => (
                  <div key={line} className="flex gap-3 rounded-2xl bg-slate-50 p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">{index + 1}</span>{line}</div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <>
            {recoveryMode ? (
              <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white"><CircleAlert size={25} /></span>
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-amber-700">Shift recovery</div>
                    <h2 className="mt-1 text-xl font-black text-amber-950">Close the previous open shift</h2>
                    <p className="mt-1 text-sm font-semibold text-amber-800">
                      {managedSession.cashier_id === usuario?.id
                        ? "This is your unfinished shift from another computer or browser session. Count the physical drawer and close it below before starting a new shift."
                        : "A supervisor is reviewing an unfinished shift from another cashier. Count the physical drawer and close it below with an audit note."}
                    </p>
                    <div className="mt-3 text-xs font-bold text-amber-700">
                      {registers[managedSession.register_id]?.name || "Store Register"} · {managedSession.cashier_name || `Cashier ${managedSession.cashier_id.slice(0, 8)}`} · opened {dateTime(managedSession.opened_at)}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Store size={24} /></span><div><div className="text-xs font-black uppercase tracking-widest text-emerald-700">Open Shift</div><h2 className="text-xl font-black text-emerald-950">{registers[activeSession.register_id]?.name || registerName}</h2><p className="text-sm font-semibold text-emerald-700">{usuario?.nombre || usuario?.email} · opened {dateTime(activeSession.opened_at)}</p></div></div>
                  <Link to="/ventas?new=1" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-lg font-black text-white shadow-lg shadow-blue-200">Start Sale <ArrowRight size={21} /></Link>
                </div>
              </section>
            )}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Expected Cash" value={money(summary?.expected_cash)} detail="Live drawer target" tone="green" />
              <Metric label="Card Activity" value={money(systemPayments.card)} detail={`${money(summary?.payment_breakdown?.card?.refunds)} refunded`} tone="blue" />
              <Metric label="Transfers" value={money(systemPayments.transfer)} detail="Net accepted this shift" tone="blue" />
              <Metric label="Check / Other" value={money(systemPayments.other)} detail="Net accepted this shift" />
              <Metric label="Net Sales" value={money(summary?.net_sales)} detail={`${summary?.completed_sales_count || 0} sales · ${summary?.return_count || 0} returns`} tone="green" />
              <Metric label="Tax Collected" value={money(summary?.tax_net)} detail={`${money(summary?.tax_refunds)} refunded`} tone="amber" />
              <Metric label="Discounts" value={money(summary?.discounts)} tone="amber" />
              <Metric label="A/R Collected" value={money(summary?.ar_total_collections)} detail="All payment methods" tone="blue" />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3"><Banknote className="text-blue-600" /><div><h2 className="text-xl font-black text-slate-950">Cash movement</h2><p className="text-sm text-slate-500">Every adjustment keeps its cashier, time and reason.</p></div></div>
                {!recoveryMode && <form onSubmit={addMovement} className="mt-5">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["deposit", "Deposit", <PlusCircle key="deposit-icon" size={19} />],
                      ["withdrawal", "Withdrawal", <MinusCircle key="withdrawal-icon" size={19} />],
                      ["expense", "Expense", <ReceiptText key="expense-icon" size={19} />],
                    ].map(([key, label, icon]) => (
                      <button type="button" key={key} onClick={() => setMovementType(key)} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-2 text-sm font-black ${movementType === key ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600"}`}>{icon}{label}</button>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[0.42fr_1fr]">
                    <input type="number" min="0.01" step="0.01" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} placeholder="$ Amount" className="rounded-xl border-2 border-slate-200 px-4 py-3 font-black outline-none focus:border-blue-500" required />
                    <input value={movementReason} onChange={(e) => setMovementReason(e.target.value)} placeholder="Required reason" className="rounded-xl border-2 border-slate-200 px-4 py-3 font-semibold outline-none focus:border-blue-500" required />
                  </div>
                  <button disabled={saving} className="mt-3 min-h-12 w-full rounded-xl bg-slate-900 px-5 py-3 font-black text-white disabled:opacity-50">Record {movementType}</button>
                </form>}
                {recoveryMode && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">Cash adjustments are disabled during recovery. Review the recorded movements, count the drawer and close the shift.</div>}
                <div className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                  {movements.length === 0 ? <div className="p-5 text-center text-sm font-semibold text-slate-400">No manual movements in this shift.</div> : movements.slice(0, 10).map((row) => (
                    <div key={row.id} className={`flex items-center gap-3 px-4 py-3 ${row.voided_at ? "opacity-45 line-through" : ""}`}><span className={`h-2.5 w-2.5 rounded-full ${row.movement_type === "deposit" ? "bg-emerald-500" : row.movement_type === "expense" ? "bg-rose-500" : "bg-amber-500"}`} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold capitalize text-slate-800">{row.movement_type} · {row.reason}</div><div className="text-xs text-slate-400">{dateTime(row.created_at)}{row.voided_at ? ` · voided: ${row.void_reason}` : ""}</div></div><div className="font-black tabular-nums text-slate-900">{row.movement_type === "deposit" ? "+" : "−"}{money(row.amount)}</div>{privileged && !row.voided_at && <button type="button" onClick={() => { setVoidMovementId(row.id); setVoidReason(""); }} className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700" title="Void movement"><Ban size={16} /></button>}</div>
                  ))}
                </div>
              </div>

              <form onSubmit={closeRegister} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3"><LockKeyhole className="text-slate-700" /><div><h2 className="text-xl font-black text-slate-950">{recoveryMode ? "Recover & close this shift" : "Close & reconcile this shift"}</h2><p className="text-sm text-slate-500">Verify the drawer and every payment source before creating the final report.</p></div></div>

                {(!navigator.onLine || ventasPendientes > 0 || syncing) && (
                  <div className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">
                    <div>{!navigator.onLine ? "Reconnect before closing. The report must include every transaction." : syncing ? "Synchronization is running. Wait until it finishes." : `${ventasPendientes} offline transaction${ventasPendientes === 1 ? " is" : "s are"} waiting to synchronize.`}</div>
                    {navigator.onLine && ventasPendientes > 0 && !syncing && <button type="button" onClick={sincronizarAhora} className="mt-3 rounded-xl bg-amber-600 px-4 py-2 font-black text-white">Synchronize now</button>}
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Gross sales</div><div className="font-black text-slate-900">{money(summary?.gross_sales)}</div></div>
                  <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Refunds</div><div className="font-black text-rose-700">−{money(summary?.refund_total)}</div></div>
                  <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Net sales</div><div className="font-black text-emerald-700">{money(summary?.net_sales)}</div></div>
                  <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Transactions</div><div className="font-black text-slate-900">{summary?.completed_sales_count || 0} sales · {summary?.return_count || 0} returns</div></div>
                </div>

                <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-white"><div className="text-xs font-black uppercase tracking-widest text-slate-400">Expected cash drawer</div><div className="mt-1 text-4xl font-black tabular-nums">{money(summary?.expected_cash)}</div><div className="mt-2 text-xs text-slate-400">Opening + cash received − refunds + deposits − withdrawals − expenses</div></div>
                <label className="mt-5 block text-sm font-bold text-slate-700">Cash counted
                  <input type="number" min="0" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-4 text-2xl font-black outline-none focus:border-blue-500" placeholder="$0.00" required />
                </label>
                {liveVariance !== null && Number.isFinite(liveVariance) && <div className={`mt-3 rounded-xl border p-3 text-center font-black ${Math.abs(liveVariance) < 0.005 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>Difference: {money(liveVariance)}</div>}

                <div className="mt-6 border-t border-slate-200 pt-5">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Payment reconciliation</div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Compare Card with the terminal batch. Confirm transfer and other sources against their records.</p>
                  <div className="mt-4 space-y-3">
                    <ReconciliationField label="Card terminal batch" system={systemPayments.card} value={declaredCard} onChange={setDeclaredCard} help="Enter the gross batch total shown by the card terminal." />
                    {Math.abs(Number(systemPayments.card || 0)) > 0.005 && <input value={cardBatchReference} onChange={(e) => setCardBatchReference(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 font-semibold outline-none focus:border-blue-500" placeholder="Card batch reference (recommended)" />}
                    <ReconciliationField label="Transfers" system={systemPayments.transfer} value={declaredTransfer} onChange={setDeclaredTransfer} help="Verify Zelle, Venmo, Cash App and other transfers." />
                    <ReconciliationField label="Check / Other" system={systemPayments.other} value={declaredOther} onChange={setDeclaredOther} help="Verify checks and remaining payment methods." />
                  </div>
                </div>

                <textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} rows={3} className="mt-4 w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-blue-500" placeholder={recoveryMode && managedSession.cashier_id !== usuario?.id ? "Supervisor recovery reason (required)" : closeoutHasVariance(liveMethodVariances) ? "Explain the difference (required)" : "Closing notes (optional)"} />
                <button disabled={saving || syncing || !navigator.onLine || ventasPendientes > 0} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-4 text-lg font-black text-white shadow-lg shadow-rose-200 disabled:opacity-50"><Printer size={21} />{recoveryMode ? "Close Previous Shift & Print" : "Close Shift & Print Report"}</button>
                <p className="mt-2 text-center text-[11px] font-semibold text-slate-400">The report is saved before printing and remains available for reprint.</p>
              </form>
            </section>

            {events.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs font-semibold text-slate-500"><span className="font-black text-slate-700">Audit trail:</span> {events.length} recorded events for this shift. Close and reopen snapshots are preserved.</div>}
          </>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><History className="text-blue-600" /><div><h2 className="text-lg font-black text-slate-950">Register History</h2><p className="text-sm text-slate-500">Per cashier and computer, separate from the general store closeout.</p></div></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Register / Cashier</th><th className="px-5 py-3">Opened</th><th className="px-5 py-3">Closed</th><th className="px-5 py-3 text-right">Expected</th><th className="px-5 py-3 text-right">Counted</th><th className="px-5 py-3 text-right">Difference</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.length === 0 ? <tr><td colSpan={8} className="p-8 text-center font-semibold text-slate-400">No register shifts recorded yet.</td></tr> : sessions.map((row) => (
                  <tr key={row.id} className="text-slate-700">
                    <td className="px-5 py-3"><div className="font-black text-slate-900">{registers[row.register_id]?.name || "Store Register"}</div><div className="text-xs text-slate-400">{row.cashier_name || `Cashier ${row.cashier_id.slice(0, 8)}`}</div>{row.closeout_report_number && <div className="mt-1 text-[10px] font-bold text-blue-600">{row.closeout_report_number}</div>}</td>
                    <td className="whitespace-nowrap px-5 py-3">{dateTime(row.opened_at)}</td>
                    <td className="whitespace-nowrap px-5 py-3">{dateTime(row.closed_at)}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums">{row.expected_cash == null ? "—" : money(row.expected_cash)}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums">{row.counted_cash == null ? "—" : money(row.counted_cash)}</td>
                    <td className={`px-5 py-3 text-right font-black tabular-nums ${Math.abs(Number(row.variance || 0)) > 0.004 ? "text-rose-700" : "text-emerald-700"}`}>{row.variance == null ? "—" : money(row.variance)}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{row.status}</span>{row.closeout_report_status === "adjusted" && <div className="mt-1 text-[10px] font-black text-rose-600">Adjusted after close</div>}{row.closeout_print_status === "pending" && row.closeout_report_id && <div className="mt-1 text-[10px] font-bold text-amber-600">Print / reprint pending</div>}{row.reopened_at && <div className="mt-1 text-[10px] font-bold text-amber-600">Reopened</div>}</td>
                    <td className="px-5 py-3"><div className="flex flex-wrap gap-2">{row.status === "open" && row.id !== managedSession?.id && (row.cashier_id === usuario?.id || privileged) && <button onClick={() => setReviewSessionId(row.id)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800">Review & Close</button>}{row.closeout_report_id && <button type="button" onClick={() => loadCloseoutReport(row)} disabled={reportLoading} className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 disabled:opacity-50"><Eye size={14} />View / Print</button>}{privileged && row.status === "closed" && <button onClick={() => { setReopenId(row.id); setReopenReason(""); }} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">Reopen</button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {closedReport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
            <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
              <div className="bg-gradient-to-r from-slate-950 to-blue-900 p-6 text-white sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div><div className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Physical Store · Shift Closeout</div><h2 className="mt-1 text-2xl font-black">{closedReport.report_number}</h2><p className="mt-1 text-sm text-blue-100">{closedReport.register_name} · {closedReport.cashier_name}</p></div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${closedReport.status === "adjusted" ? "bg-rose-500 text-white" : closedReport.status === "reopened" ? "bg-amber-400 text-slate-950" : "bg-emerald-400 text-emerald-950"}`}>{closedReport.status}</span>
                </div>
              </div>
              <div className="space-y-5 p-5 sm:p-7">
                {closedReport.status === "adjusted" && <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 text-sm font-black text-rose-800">A late offline transaction changed this report after closing. Review the new totals{closedReport.print_status === "pending" ? " and print an updated copy" : " — the updated copy is recorded as printed"}.</div>}
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Net Sales" value={money(closedReport.system_summary?.net_sales)} detail={`${closedReport.system_summary?.completed_sales_count || 0} completed sales`} tone="green" />
                  <Metric label="Refunds" value={money(closedReport.system_summary?.refund_total)} detail={`${closedReport.system_summary?.return_count || 0} returns`} tone="red" />
                  <Metric label="Tax Collected" value={money(closedReport.system_summary?.tax_net)} tone="amber" />
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.7fr] bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500"><span>Method</span><span className="text-right">System</span><span className="text-right">Verified</span><span className="text-right">Difference</span></div>
                  {closeoutPaymentRows(closedReport).map((row) => <div key={row.key} className="grid grid-cols-[1fr_0.8fr_0.8fr_0.7fr] border-t border-slate-100 px-4 py-3 text-sm"><span className="font-black text-slate-800">{row.label}</span><span className="text-right font-bold tabular-nums">{money(row.system)}</span><span className="text-right font-bold tabular-nums">{money(row.declared)}</span><span className={`text-right font-black tabular-nums ${Math.abs(row.variance) > 0.009 ? "text-rose-700" : "text-emerald-700"}`}>{money(row.variance)}</span></div>)}
                </div>
                <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><span className="text-xs font-black uppercase text-slate-400">Opened</span><div className="font-bold text-slate-800">{dateTime(closedReport.opened_at)}</div></div><div><span className="text-xs font-black uppercase text-slate-400">Closed</span><div className="font-bold text-slate-800">{dateTime(closedReport.closed_at)}</div></div><div><span className="text-xs font-black uppercase text-slate-400">Closed by</span><div className="font-bold text-slate-800">{closedReport.closed_by_name}</div></div><div><span className="text-xs font-black uppercase text-slate-400">Card batch</span><div className="font-bold text-slate-800">{closedReport.card_batch_reference || "Not entered"}</div></div></div>
                {closedReport.notes && <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700"><span className="font-black">Closing notes:</span> {closedReport.notes}</div>}
                <div className="text-center text-xs font-semibold text-slate-400">Print status: {closedReport.print_status} · {closedReport.print_count || 0} recorded print request{Number(closedReport.print_count || 0) === 1 ? "" : "s"}</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <button type="button" onClick={() => printCloseoutReport(closedReport)} disabled={reportLoading} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-black text-white disabled:opacity-50"><Printer size={18} />{Number(closedReport.print_count || 0) > 0 ? "Reprint Thermal" : "Print Thermal"}</button>
                  <button type="button" onClick={() => downloadCloseoutReport(closedReport)} disabled={reportLoading} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-black text-white disabled:opacity-50"><Download size={18} />Download PDF</button>
                  <button type="button" onClick={() => setClosedReport(null)} className="min-h-12 rounded-xl border-2 border-slate-200 px-4 py-3 font-black text-slate-600">Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {reopenId && <form onSubmit={reopenSession} className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-black text-slate-950">Controlled Reopening</h2><p className="mt-2 text-sm text-slate-500">The previous close snapshot stays in history. Enter why this session must reopen.</p><textarea autoFocus value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={4} className="mt-4 w-full rounded-xl border-2 border-amber-200 px-4 py-3 outline-none focus:border-amber-500" placeholder="Required supervisor reason…" required /><div className="mt-4 flex gap-3"><button type="button" onClick={() => setReopenId(null)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-black text-slate-600">Cancel</button><button disabled={saving} className="flex-1 rounded-xl bg-amber-600 px-4 py-3 font-black text-white disabled:opacity-50">Reopen Shift</button></div></div></form>}
        {voidMovementId && <form onSubmit={voidMovement} className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-black text-slate-950">Void Cash Movement</h2><p className="mt-2 text-sm text-slate-500">The original movement remains visible. The supervisor, time and reason are added to the audit trail.</p><textarea autoFocus value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} className="mt-4 w-full rounded-xl border-2 border-rose-200 px-4 py-3 outline-none focus:border-rose-500" placeholder="Required void reason…" required /><div className="mt-4 flex gap-3"><button type="button" onClick={() => setVoidMovementId(null)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-black text-slate-600">Cancel</button><button disabled={saving} className="flex-1 rounded-xl bg-rose-600 px-4 py-3 font-black text-white disabled:opacity-50">Void Movement</button></div></div></form>}
      </div>
    </div>
  );
}
