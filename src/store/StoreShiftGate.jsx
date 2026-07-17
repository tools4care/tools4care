import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Eye,
  EyeOff,
  KeyRound,
  LockOpen,
  MapPin,
  MonitorUp,
  RefreshCw,
  Store,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useVan } from "../hooks/VanContext";
import { useUsuario } from "../UsuarioContext";
import { isStoreLocation } from "../lib/locationTypes";
import {
  getStoredStoreCashSessionId,
  getStoreDeviceId,
  getStoreRegisterName,
  resolveOpenStoreCashSession,
  setStoredStoreCashSessionId,
  setStoreRegisterName,
} from "../lib/storeRegister";

export default function StoreShiftGate() {
  const { van, setVan } = useVan();
  const { usuario } = useUsuario();
  const location = useLocation();
  const navigate = useNavigate();
  const deviceId = useMemo(() => getStoreDeviceId(), []);
  const [activeSession, setActiveSession] = useState(null);
  const [blockingSession, setBlockingSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [registerName, setRegisterName] = useState(() => getStoreRegisterName());
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [openingNotes, setOpeningNotes] = useState("");
  const [resumeMode, setResumeMode] = useState(false);
  const [resumePassword, setResumePassword] = useState("");
  const [showResumePassword, setShowResumePassword] = useState(false);

  const shouldGuard = isStoreLocation(van) && (
    location.pathname === "/"
    || location.pathname.startsWith("/ventas")
    || location.pathname.startsWith("/clientes")
  );

  const checkShift = useCallback(async () => {
    if (!shouldGuard || !van?.id || !usuario?.id) {
      setLoading(false);
      setActiveSession(null);
      setBlockingSession(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (!navigator.onLine) {
        const storedId = getStoredStoreCashSessionId(van.id);
        if (storedId) {
          setActiveSession({ id: storedId, offline: true });
          setBlockingSession(null);
        } else {
          setActiveSession(null);
          setBlockingSession(null);
          setError("Internet is required to open a new cash-register shift.");
        }
        return;
      }

      const current = await resolveOpenStoreCashSession(supabase, van.id, usuario.id);
      if (current) {
        setActiveSession(current);
        setBlockingSession(null);
        return;
      }

      const { data, error: sessionsError } = await supabase
        .from("store_cash_sessions")
        .select("id,cashier_id,device_id,opened_at,status")
        .eq("location_id", van.id)
        .eq("status", "open");
      if (sessionsError) throw sessionsError;
      const blocking = (data || []).find((session) =>
        session.device_id === deviceId || session.cashier_id === usuario.id
      ) || null;
      setActiveSession(null);
      setBlockingSession(blocking);
      if (!blocking) {
        setResumeMode(false);
        setResumePassword("");
      }
    } catch (shiftError) {
      setActiveSession(null);
      setBlockingSession(null);
      setError(shiftError?.message || "Could not verify the cash-register shift.");
    } finally {
      setLoading(false);
    }
  }, [deviceId, shouldGuard, usuario?.id, van?.id]);

  useEffect(() => { checkShift(); }, [checkShift]);

  useEffect(() => {
    if (!shouldGuard || !van?.id) return undefined;
    const channel = supabase
      .channel(`store-shift-gate-${van.id}-${deviceId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "store_cash_sessions",
        filter: `location_id=eq.${van.id}`,
      }, checkShift)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [checkShift, deviceId, shouldGuard, van?.id]);

  async function openShift(event) {
    event.preventDefault();
    const amount = Number(openingFloat);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid opening float.");
      return;
    }
    if (!navigator.onLine) {
      setError("Internet is required to open a new cash-register shift.");
      return;
    }

    setSaving(true);
    setError("");
    try {
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
      setActiveSession(result.data || { id: getStoredStoreCashSessionId(van.id) });
      setBlockingSession(null);
      setOpeningNotes("");
    } catch (openError) {
      await checkShift();
      setError(openError?.message || "The register could not be opened.");
    } finally {
      setSaving(false);
    }
  }

  async function resumeShift(event) {
    event.preventDefault();
    if (!navigator.onLine) {
      setError("Internet is required to securely resume a shift.");
      return;
    }
    if (!usuario?.email || !resumePassword) {
      setError("Enter your password to resume this shift.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const authResult = await supabase.auth.signInWithPassword({
        email: usuario.email,
        password: resumePassword,
      });
      if (authResult.error || authResult.data?.user?.id !== usuario.id) {
        throw new Error("Password could not be verified.");
      }

      setStoreRegisterName(registerName);
      const result = await supabase.rpc("resume_store_cash_session", {
        p_session_id: blockingSession.id,
        p_new_device_id: deviceId,
        p_register_name: registerName.trim() || "Main Register",
      });
      if (result.error) throw result.error;

      setStoredStoreCashSessionId(van.id, result.data?.id || blockingSession.id);
      setActiveSession(result.data || { ...blockingSession, device_id: deviceId });
      setBlockingSession(null);
      setResumeMode(false);
      setResumePassword("");
    } catch (resumeError) {
      const message = resumeError?.message || "";
      const authenticationFailed = /invalid login|password|credentials/i.test(message);
      setError(authenticationFailed
        ? "Password could not be verified. Try again."
        : message || "The shift could not be resumed.");
    } finally {
      setSaving(false);
    }
  }

  if (!shouldGuard || activeSession) return null;

  const anotherCashierOnThisComputer = blockingSession?.device_id === deviceId
    && blockingSession?.cashier_id !== usuario?.id;
  const thisCashierOnAnotherComputer = blockingSession?.cashier_id === usuario?.id
    && blockingSession?.device_id !== deviceId;

  return (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-md sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="open-register-title">
      <div className="max-h-[96dvh] w-full max-w-2xl overflow-y-auto rounded-t-[30px] border border-white/70 bg-white shadow-2xl sm:rounded-[30px]">
        <header className="bg-gradient-to-r from-slate-950 via-blue-950 to-blue-800 p-6 text-white sm:p-7">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Store size={29} /></span>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Physical Store · Start of shift</div>
              <h2 id="open-register-title" className="mt-1 text-2xl font-black sm:text-3xl">
                {thisCashierOnAnotherComputer ? "Resume your open shift" : "Open the cash register first"}
              </h2>
              <p className="mt-2 text-sm text-blue-100">
                {thisCashierOnAnotherComputer
                  ? "Continue the same shift on this computer without closing or starting over."
                  : "Each cashier and computer needs an auditable shift before sales or customer payments."}
              </p>
            </div>
          </div>
        </header>

        <div className="p-5 sm:p-7">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">Location</div>
              <div className="mt-1 flex items-center gap-2 font-black text-slate-900"><MapPin size={17} className="text-blue-600" />{van?.nombre || van?.nombre_van || "Physical Store"}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">Cashier</div>
              <div className="mt-1 font-black text-slate-900">{usuario?.nombre || usuario?.email || "Signed-in user"}</div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw className="animate-spin text-blue-600" size={30} />
              <span className="font-bold">Checking this register…</span>
            </div>
          ) : blockingSession ? (
            <div>
              <div className="flex items-start gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-amber-900">
                <AlertTriangle className="mt-0.5 shrink-0" size={23} />
                <div>
                  <div className="font-black">An open shift needs attention</div>
                  <p className="mt-1 text-sm font-semibold text-amber-800">
                    {anotherCashierOnThisComputer
                      ? "Another cashier already has an open shift on this computer. Close that shift before signing in here."
                      : thisCashierOnAnotherComputer
                      ? "Your cashier account already has an open shift on another computer. Resume it here, or review it before closing."
                      : "This register already has an open shift that must be reviewed."}
                  </p>
                </div>
              </div>
              {thisCashierOnAnotherComputer ? (
                resumeMode ? (
                  <form onSubmit={resumeShift} className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-start gap-3">
                      <MonitorUp className="mt-0.5 shrink-0 text-blue-700" size={22} />
                      <div>
                        <div className="font-black text-blue-950">Move this shift to this computer</div>
                        <p className="mt-1 text-xs font-semibold text-blue-800">
                          All totals and transactions stay in the same shift. The previous computer will lose access.
                        </p>
                      </div>
                    </div>
                    <label className="mt-4 block text-sm font-black text-slate-700">
                      Confirm your password
                      <div className="relative mt-2">
                        <KeyRound className="absolute left-3.5 top-3.5 text-blue-600" size={19} />
                        <input
                          type={showResumePassword ? "text" : "password"}
                          value={resumePassword}
                          onChange={(event) => setResumePassword(event.target.value)}
                          autoComplete="current-password"
                          autoFocus
                          className="min-h-12 w-full rounded-xl border-2 border-blue-200 bg-white pl-11 pr-12 font-semibold outline-none focus:border-blue-500"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowResumePassword((visible) => !visible)}
                          aria-label={showResumePassword ? "Hide password" : "Show password"}
                          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                        >
                          {showResumePassword ? <EyeOff size={19} /> : <Eye size={19} />}
                        </button>
                      </div>
                    </label>
                    <button
                      disabled={saving}
                      className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-lg font-black text-white shadow-lg shadow-blue-200 disabled:opacity-50"
                    >
                      {saving
                        ? <><RefreshCw className="animate-spin" size={21} />Resuming…</>
                        : <><MonitorUp size={22} />Resume Shift Here</>}
                    </button>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setResumeMode(false); setResumePassword(""); setError(""); }}
                        className="min-h-11 rounded-xl border-2 border-slate-200 bg-white px-3 font-bold text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate("/store/register")}
                        className="min-h-11 rounded-xl border-2 border-slate-300 bg-white px-3 font-bold text-slate-800"
                      >
                        Review & Close
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-5 grid gap-2">
                    <button
                      type="button"
                      onClick={() => { setResumeMode(true); setError(""); }}
                      className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-lg font-black text-white shadow-lg shadow-blue-200"
                    >
                      <MonitorUp size={22} />Resume Shift on This Computer
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/store/register")}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-5 py-3 font-black text-slate-700"
                    >
                      Review or Close Previous Shift <ArrowRight size={19} />
                    </button>
                  </div>
                )
              ) : (
                <button type="button" onClick={() => navigate("/store/register")} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-lg font-black text-white">
                  Review Cash Register <ArrowRight size={21} />
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={openShift}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-black text-slate-700">Register name
                  <input value={registerName} onChange={(event) => setRegisterName(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border-2 border-slate-200 px-4 font-semibold outline-none focus:border-blue-500" required />
                </label>
                <label className="text-sm font-black text-slate-700">Opening float
                  <div className="relative mt-2"><Banknote className="absolute left-3.5 top-3 text-emerald-600" size={20} /><input type="number" min="0" step="0.01" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} className="min-h-12 w-full rounded-xl border-2 border-slate-200 pl-11 pr-4 text-lg font-black outline-none focus:border-blue-500" required /></div>
                </label>
              </div>
              <label className="mt-4 block text-sm font-black text-slate-700">Opening note <span className="font-semibold text-slate-400">(optional)</span>
                <textarea value={openingNotes} onChange={(event) => setOpeningNotes(event.target.value)} rows={2} placeholder="Starting cash counted and verified…" className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
              </label>
              <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800">Computer {deviceId.slice(0, 8)} · This opening is recorded under the signed-in cashier.</div>
              <button disabled={saving || !navigator.onLine} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 disabled:opacity-50">
                {saving ? <><RefreshCw className="animate-spin" size={21} />Opening…</> : <><LockOpen size={22} />Open Register & Start Shift</>}
              </button>
            </form>
          )}

          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">{error}</div>}
          <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
            <button type="button" onClick={checkShift} disabled={loading || saving} className="min-h-11 flex-1 rounded-xl border-2 border-slate-200 px-4 font-bold text-slate-600 disabled:opacity-50">Refresh status</button>
            <button type="button" onClick={() => { setVan(null); navigate("/van", { replace: true }); }} className="min-h-11 flex-1 rounded-xl border-2 border-blue-200 px-4 font-bold text-blue-700">Choose another location</button>
          </div>
        </div>
      </div>
    </div>
  );
}
