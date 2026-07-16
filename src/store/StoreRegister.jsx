import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Ban,
  Banknote,
  CircleAlert,
  History,
  LockKeyhole,
  LockOpen,
  MinusCircle,
  PlusCircle,
  ReceiptText,
  RefreshCw,
  Store,
  WalletCards,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useVan } from "../hooks/VanContext";
import { useUsuario } from "../UsuarioContext";
import { usePermisos } from "../hooks/usePermisos";
import {
  getStoreDeviceId,
  getStoreRegisterName,
  setStoreRegisterName,
  setStoredStoreCashSessionId,
} from "../lib/storeRegister";

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

export default function StoreRegister() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const { isAdmin, isSupervisor } = usePermisos();
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

  const activeSession = sessions.find((row) =>
    row.status === "open" && row.device_id === deviceId && row.cashier_id === usuario?.id
  ) || null;
  const deviceSession = sessions.find((row) => row.status === "open" && row.device_id === deviceId) || null;

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
      if (current) {
        setStoredStoreCashSessionId(van.id, current.id);
        const [summaryResult, movementResult, eventResult] = await Promise.all([
          supabase.rpc("get_store_cash_session_summary", { p_session_id: current.id }),
          supabase.from("store_cash_movements").select("*").eq("session_id", current.id).order("created_at", { ascending: false }),
          supabase.from("store_cash_session_events").select("*").eq("session_id", current.id).order("created_at", { ascending: false }).limit(20),
        ]);
        if (summaryResult.error) throw summaryResult.error;
        if (movementResult.error) throw movementResult.error;
        if (eventResult.error) throw eventResult.error;
        setSummary(summaryResult.data || null);
        setMovements(movementResult.data || []);
        setEvents(eventResult.data || []);
      } else {
        setStoredStoreCashSessionId(van.id, null);
        setSummary(null);
        setMovements([]);
        setEvents([]);
      }
    } catch (loadError) {
      setError(loadError?.message || "Could not load this cash register.");
    } finally {
      setLoading(false);
    }
  }, [deviceId, usuario?.id, van?.id]);

  useEffect(() => { load(); }, [load]);

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
      setStoredStoreCashSessionId(van.id, result.data?.id);
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
      const amount = Number(countedCash);
      if (!activeSession) throw new Error("There is no open session on this register.");
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter the cash counted in the drawer.");
      const result = await supabase.rpc("close_store_cash_session", {
        p_session_id: activeSession.id,
        p_counted_cash: amount,
        p_notes: closingNotes.trim() || null,
      });
      if (result.error) throw result.error;
      setStoredStoreCashSessionId(van.id, null);
      setCountedCash("");
      setClosingNotes("");
    });
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

        {!activeSession ? (
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
            <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Store size={24} /></span><div><div className="text-xs font-black uppercase tracking-widest text-emerald-700">Open Shift</div><h2 className="text-xl font-black text-emerald-950">{registers[activeSession.register_id]?.name || registerName}</h2><p className="text-sm font-semibold text-emerald-700">{usuario?.nombre || usuario?.email} · opened {dateTime(activeSession.opened_at)}</p></div></div>
                <Link to="/ventas?new=1" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-lg font-black text-white shadow-lg shadow-blue-200">Start Sale <ArrowRight size={21} /></Link>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Expected Cash" value={money(summary?.expected_cash)} detail="Live drawer target" tone="green" />
              <Metric label="Opening Float" value={money(summary?.opening_float)} />
              <Metric label="Cash Sales" value={money(summary?.cash_sales)} detail={`${summary?.sales_count || 0} transactions`} tone="blue" />
              <Metric label="A/R Cash Collected" value={money(summary?.ar_cash_collections)} detail={`${money(summary?.ar_total_collections)} by all methods`} tone="blue" />
              <Metric label="Deposits" value={money(summary?.manual_deposits)} tone="green" />
              <Metric label="Withdrawals" value={money(summary?.withdrawals)} tone="amber" />
              <Metric label="Expenses" value={money(summary?.expenses)} tone="red" />
              <Metric label="Cash Refunds" value={money(summary?.cash_returns)} tone="red" />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3"><Banknote className="text-blue-600" /><div><h2 className="text-xl font-black text-slate-950">Cash movement</h2><p className="text-sm text-slate-500">Every adjustment keeps its cashier, time and reason.</p></div></div>
                <form onSubmit={addMovement} className="mt-5">
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
                </form>
                <div className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                  {movements.length === 0 ? <div className="p-5 text-center text-sm font-semibold text-slate-400">No manual movements in this shift.</div> : movements.slice(0, 10).map((row) => (
                    <div key={row.id} className={`flex items-center gap-3 px-4 py-3 ${row.voided_at ? "opacity-45 line-through" : ""}`}><span className={`h-2.5 w-2.5 rounded-full ${row.movement_type === "deposit" ? "bg-emerald-500" : row.movement_type === "expense" ? "bg-rose-500" : "bg-amber-500"}`} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold capitalize text-slate-800">{row.movement_type} · {row.reason}</div><div className="text-xs text-slate-400">{dateTime(row.created_at)}{row.voided_at ? ` · voided: ${row.void_reason}` : ""}</div></div><div className="font-black tabular-nums text-slate-900">{row.movement_type === "deposit" ? "+" : "−"}{money(row.amount)}</div>{privileged && !row.voided_at && <button type="button" onClick={() => { setVoidMovementId(row.id); setVoidReason(""); }} className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700" title="Void movement"><Ban size={16} /></button>}</div>
                  ))}
                </div>
              </div>

              <form onSubmit={closeRegister} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3"><LockKeyhole className="text-slate-700" /><div><h2 className="text-xl font-black text-slate-950">Close this register</h2><p className="text-sm text-slate-500">Count the physical cash without changing the expected amount.</p></div></div>
                <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-white"><div className="text-xs font-black uppercase tracking-widest text-slate-400">System expected</div><div className="mt-1 text-4xl font-black tabular-nums">{money(summary?.expected_cash)}</div><div className="mt-2 text-xs text-slate-400">Opening + cash sales + A/R cash − cash returns + deposits − withdrawals − expenses</div></div>
                <label className="mt-5 block text-sm font-bold text-slate-700">Cash counted
                  <input type="number" min="0" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-4 text-2xl font-black outline-none focus:border-blue-500" placeholder="$0.00" required />
                </label>
                {liveVariance !== null && Number.isFinite(liveVariance) && <div className={`mt-3 rounded-xl border p-3 text-center font-black ${Math.abs(liveVariance) < 0.005 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>Difference: {money(liveVariance)}</div>}
                <textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} rows={2} className="mt-3 w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-blue-500" placeholder="Closing notes (optional)" />
                <button disabled={saving} className="mt-4 min-h-14 w-full rounded-2xl bg-rose-600 px-5 py-4 text-lg font-black text-white shadow-lg shadow-rose-200 disabled:opacity-50">Count & Close Register</button>
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
                  <tr key={row.id} className="text-slate-700"><td className="px-5 py-3"><div className="font-black text-slate-900">{registers[row.register_id]?.name || "Store Register"}</div><div className="text-xs text-slate-400">{row.cashier_name || `Cashier ${row.cashier_id.slice(0, 8)}`}</div></td><td className="whitespace-nowrap px-5 py-3">{dateTime(row.opened_at)}</td><td className="whitespace-nowrap px-5 py-3">{dateTime(row.closed_at)}</td><td className="px-5 py-3 text-right font-bold tabular-nums">{row.expected_cash == null ? "—" : money(row.expected_cash)}</td><td className="px-5 py-3 text-right font-bold tabular-nums">{row.counted_cash == null ? "—" : money(row.counted_cash)}</td><td className={`px-5 py-3 text-right font-black tabular-nums ${Math.abs(Number(row.variance || 0)) > 0.004 ? "text-rose-700" : "text-emerald-700"}`}>{row.variance == null ? "—" : money(row.variance)}</td><td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{row.status}</span>{row.reopened_at && <div className="mt-1 text-[10px] font-bold text-amber-600">Reopened</div>}</td><td className="px-5 py-3">{privileged && row.status === "closed" && <button onClick={() => { setReopenId(row.id); setReopenReason(""); }} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">Reopen</button>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {reopenId && <form onSubmit={reopenSession} className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-black text-slate-950">Controlled Reopening</h2><p className="mt-2 text-sm text-slate-500">The previous close snapshot stays in history. Enter why this session must reopen.</p><textarea autoFocus value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={4} className="mt-4 w-full rounded-xl border-2 border-amber-200 px-4 py-3 outline-none focus:border-amber-500" placeholder="Required supervisor reason…" required /><div className="mt-4 flex gap-3"><button type="button" onClick={() => setReopenId(null)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-black text-slate-600">Cancel</button><button disabled={saving} className="flex-1 rounded-xl bg-amber-600 px-4 py-3 font-black text-white disabled:opacity-50">Reopen Shift</button></div></div></form>}
        {voidMovementId && <form onSubmit={voidMovement} className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-black text-slate-950">Void Cash Movement</h2><p className="mt-2 text-sm text-slate-500">The original movement remains visible. The supervisor, time and reason are added to the audit trail.</p><textarea autoFocus value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} className="mt-4 w-full rounded-xl border-2 border-rose-200 px-4 py-3 outline-none focus:border-rose-500" placeholder="Required void reason…" required /><div className="mt-4 flex gap-3"><button type="button" onClick={() => setVoidMovementId(null)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-black text-slate-600">Cancel</button><button disabled={saving} className="flex-1 rounded-xl bg-rose-600 px-4 py-3 font-black text-white disabled:opacity-50">Void Movement</button></div></div></form>}
      </div>
    </div>
  );
}
