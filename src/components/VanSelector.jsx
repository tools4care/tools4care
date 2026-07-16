// src/components/VanSelector.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVan } from "../hooks/VanContext";
import { useUsuario } from "../UsuarioContext";
import { supabase } from "../supabaseClient";
import { AlertCircle, ArrowRight, CheckCircle2, Monitor, RefreshCw, Search, Store, Truck, Wifi } from "lucide-react";
import { getLocationLabel, getLocationType, LOCATION_TYPES } from "../lib/locationTypes";
import { hasLocationRestriction, restrictLocationsForUser } from "../lib/locationAccess";

const VANS_CACHE_KEY = "tools4care_vans_cache_v1";
const TOOLS4CARE_LOGO = "/icons/icon-192.png";

function getVanName(van) {
  return van?.nombre || van?.nombre_van || van?.name || "VAN";
}

function getVanPlate(van) {
  return van?.placa || van?.plate || "";
}

export default function VanSelector({ onSelect }) {
  const { van: selectedVan, setVan } = useVan();
  const { usuario } = useUsuario();
  const navigate = useNavigate();
  const [vans, setVans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState("");
  const [restricted, setRestricted] = useState(false);
  const searchRef = useRef(null);

  const loadVans = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setErr("");
    try {
      let { data, error } = await supabase
        .from("v_vans_app")
        .select("id, nombre, placa, activo, tipo")
        .eq("activo", true)
        .order("nombre", { ascending: true });

      // The frontend can be released before the additive DB migration.
      // Fall back to the existing view so current VAN users are never blocked.
      if (error && /tipo/i.test(error.message || "")) {
        const fallback = await supabase
          .from("v_vans_app")
          .select("id, nombre, placa, activo")
          .eq("activo", true)
          .order("nombre", { ascending: true });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;

      let assignments = [];
      if (usuario?.id && usuario?.rol !== "admin") {
        const assignmentResult = await supabase
          .from("usuarios_vans")
          .select("van_id, activo")
          .eq("usuario_id", usuario.id);
        if (assignmentResult.error) {
          console.warn("Could not load location assignments:", assignmentResult.error.message);
        } else {
          assignments = assignmentResult.data || [];
        }
      }

      const visibleLocations = restrictLocationsForUser(data || [], assignments, usuario?.rol);
      setRestricted(hasLocationRestriction(assignments, usuario?.rol));
      setVans(visibleLocations);
      try {
        const cacheKey = `${VANS_CACHE_KEY}:${usuario?.id || "anonymous"}`;
        localStorage.setItem(cacheKey, JSON.stringify({ data: visibleLocations, savedAt: Date.now() }));
      } catch (storageError) {
        console.warn("Could not cache vans:", storageError?.message || storageError);
      }
    } catch (e) {
      setErr(e.message || "Error loading vans");
    } finally {
      setLoading(false);
    }
  }, [usuario?.id, usuario?.rol]);

  useEffect(() => {
    setVans([]);
    setRestricted(false);
    setLoading(true);
    try {
      const cacheKey = `${VANS_CACHE_KEY}:${usuario?.id || "anonymous"}`;
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (Array.isArray(cached?.data) && cached.data.length > 0) {
        setVans(cached.data);
        setLoading(false);
      }
    } catch (storageError) {
      console.warn("Could not read cached vans:", storageError?.message || storageError);
    }

    loadVans({ silent: true });
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [loadVans, usuario?.id]);

  const filteredVans = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return vans;
    return vans.filter((v) => {
      const text = `${getVanName(v)} ${getVanPlate(v)}`.toLowerCase();
      return text.includes(term);
    });
  }, [query, vans]);

  function handleSeleccionar(v) {
    setSavingId(v.id);
    // Keep compatibility with existing modules that read nombre_van.
    const compatible = { ...v, nombre_van: getVanName(v) };
    setVan(compatible);

    if (onSelect) {
      onSelect(compatible);
    } else {
      navigate(getLocationType(v) === LOCATION_TYPES.ONLINE ? "/online" : "/");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111f] text-slate-950">
      <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(6,182,212,0.18),transparent_28%,rgba(16,185,129,0.13)_62%,transparent)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-6 sm:px-6">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/30 md:grid-cols-[0.92fr_1.08fr]">
          <section className="bg-[#081524] p-6 text-white sm:p-8">
            <div className="flex h-full min-h-[360px] flex-col justify-between gap-8">
              <div>
                <div className="mb-8 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg shadow-cyan-950/30 ring-1 ring-white/20">
                    <img src={TOOLS4CARE_LOGO} alt="Tools4Care" className="h-10 w-10 rounded-lg object-contain" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Tools4Care</p>
                    <h1 className="text-xl font-black text-white">Select Workspace</h1>
                  </div>
                </div>

                <div className="mb-5 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">
                  Multi-location sales system
                </div>
                <h2 className="max-w-sm text-3xl font-black leading-tight text-white sm:text-4xl">
                  Choose where you are working.
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
                  Choose explicitly at the start of each browser session. Refreshing this tab keeps your current workspace.
                </p>

                <div className="mt-8 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Access</p>
                    <p className="mt-1 text-lg font-black text-white">Secure</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Sync</p>
                    <p className="mt-1 text-lg font-black text-emerald-200">Live</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3">
                  <Wifi size={18} className="text-cyan-200" />
                  <span className="text-slate-200">{navigator.onLine ? "Online sync ready" : "Offline mode"}</span>
                </div>
                {selectedVan?.id && (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3">
                    <CheckCircle2 size={18} className="text-emerald-200" />
                    <span className="text-slate-100">Current: {getVanName(selectedVan)}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="bg-[#f7fafc] p-5 sm:p-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Workspace</p>
                <h3 className="mt-1 text-2xl font-black text-[#0b1728]">Select a location</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {loading ? "Loading routes..." : `${filteredVans.length} of ${vans.length} available`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadVans()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600" size={19} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredVans.length === 1) handleSeleccionar(filteredVans[0]);
                }}
                className="h-12 w-full rounded-2xl border-2 border-slate-200 bg-white pl-12 pr-4 text-base font-bold text-[#0b1728] outline-none shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                placeholder="Search store, VAN or online..."
              />
            </div>

            {err && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Could not refresh the list.</p>
                  <p className="text-red-600">{err}</p>
                </div>
              </div>
            )}

            {loading && vans.length === 0 ? (
              <div className="grid gap-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : filteredVans.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                <p className="font-bold text-[#0b1728]">{restricted ? "No locations assigned" : "No locations available"}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {restricted ? "Ask an administrator to update your location access." : "Try clearing the search or refreshing the list."}
                </p>
              </div>
            ) : (
              <div className="grid max-h-[54vh] gap-3 overflow-y-auto pr-1">
                {filteredVans.map((v) => {
                  const active = selectedVan?.id === v.id;
                  const locationType = getLocationType(v);
                  const online = locationType === LOCATION_TYPES.ONLINE;
                  const store = locationType === LOCATION_TYPES.STORE;
                  const plate = getVanPlate(v);
                  const isSaving = savingId === v.id;

                  return (
                    <button
                      key={v.id}
                      onClick={() => handleSeleccionar(v)}
                      disabled={!!savingId}
                      className={`group grid min-h-[76px] grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-70 ${
                        active
                          ? "border-emerald-400 bg-emerald-50 shadow-emerald-900/10"
                          : "border-slate-200 bg-white hover:border-cyan-300"
                      }`}
                    >
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                        online ? "bg-cyan-100 text-cyan-700" : store ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {online ? <Monitor size={23} /> : store ? <Store size={23} /> : <Truck size={23} />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-black text-[#0b1728]">{getVanName(v)}</p>
                          {active && (
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-black uppercase text-white">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {getLocationLabel(v)}{plate ? ` · ${plate}` : ""}
                        </p>
                      </div>

                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-[#0b1728] group-hover:text-white">
                        {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRight size={19} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
