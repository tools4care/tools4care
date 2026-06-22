// src/components/VanSelector.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVan } from "../hooks/VanContext";
import { supabase } from "../supabaseClient";
import { AlertCircle, ArrowRight, CheckCircle2, Monitor, RefreshCw, Search, Truck, Wifi } from "lucide-react";

const VANS_CACHE_KEY = "tools4care_vans_cache_v1";

function getVanName(van) {
  return van?.nombre || van?.nombre_van || van?.name || "VAN";
}

function getVanPlate(van) {
  return van?.placa || van?.plate || "";
}

function isOnlineVan(van) {
  return getVanName(van).toLowerCase().includes("online");
}

export default function VanSelector({ onSelect }) {
  const { van: selectedVan, setVan } = useVan();
  const navigate = useNavigate();
  const [vans, setVans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState("");
  const searchRef = useRef(null);

  async function loadVans({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("v_vans_app")
        .select("id, nombre, placa, activo")
        .eq("activo", true)
        .order("nombre", { ascending: true });

      if (error) throw error;
      setVans(data || []);
      try {
        localStorage.setItem(VANS_CACHE_KEY, JSON.stringify({ data: data || [], savedAt: Date.now() }));
      } catch (storageError) {
        console.warn("Could not cache vans:", storageError?.message || storageError);
      }
    } catch (e) {
      setErr(e.message || "Error loading vans");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(VANS_CACHE_KEY) || "null");
      if (Array.isArray(cached?.data) && cached.data.length > 0) {
        setVans(cached.data);
        setLoading(false);
      }
    } catch (storageError) {
      console.warn("Could not read cached vans:", storageError?.message || storageError);
    }

    loadVans({ silent: true });
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

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
    const syncResult = setVan(compatible);
    if (syncResult && typeof syncResult.catch === "function") {
      syncResult.catch((syncError) => {
        console.warn("Could not sync selected van:", syncError?.message || syncError);
      });
    }
    try {
      localStorage.setItem("van", JSON.stringify(compatible));
    } catch (storageError) {
      console.warn("Could not save selected van:", storageError?.message || storageError);
    }

    if (onSelect) {
      onSelect(compatible);
    } else {
      navigate(isOnlineVan(v) ? "/online" : "/");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-6 sm:px-6">
        <div className="grid w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-[0.88fr_1.12fr]">
          <section className="bg-slate-950 p-6 text-white sm:p-8">
            <div className="flex h-full min-h-[360px] flex-col justify-between gap-8">
              <div>
                <div className="mb-8 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-950/30">
                    <Truck size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200">Tools4Care</p>
                    <h1 className="text-xl font-black">Select Workspace</h1>
                  </div>
                </div>

                <h2 className="max-w-sm text-3xl font-black leading-tight sm:text-4xl">
                  Choose your workspace.
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
                  Your selection is saved on this device and synced to your session when connection is available.
                </p>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <Wifi size={18} className="text-emerald-300" />
                  <span className="text-slate-200">{navigator.onLine ? "Online sync ready" : "Offline mode"}</span>
                </div>
                {selectedVan?.id && (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
                    <CheckCircle2 size={18} className="text-emerald-300" />
                    <span className="text-slate-100">Current: {getVanName(selectedVan)}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="p-5 sm:p-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">VAN / Route</p>
                <h3 className="mt-1 text-2xl font-black">Select a VAN</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {loading ? "Loading routes..." : `${filteredVans.length} of ${vans.length} available`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadVans()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" size={19} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredVans.length === 1) handleSeleccionar(filteredVans[0]);
                }}
                className="h-12 w-full rounded-xl border-2 border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-bold outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                placeholder="Search by name or plate..."
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
                  <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : filteredVans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="font-bold text-slate-700">No vans available</p>
                <p className="mt-1 text-sm text-slate-500">Try clearing the search or refreshing the list.</p>
              </div>
            ) : (
              <div className="grid max-h-[54vh] gap-3 overflow-y-auto pr-1">
                {filteredVans.map((v) => {
                  const active = selectedVan?.id === v.id;
                  const online = isOnlineVan(v);
                  const plate = getVanPlate(v);
                  const isSaving = savingId === v.id;

                  return (
                    <button
                      key={v.id}
                      onClick={() => handleSeleccionar(v)}
                      disabled={!!savingId}
                      className={`group grid min-h-[76px] grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border-2 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-70 ${
                        active
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-blue-300"
                      }`}
                    >
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        online ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {online ? <Monitor size={23} /> : <Truck size={23} />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-black text-slate-950">{getVanName(v)}</p>
                          {active && (
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-black uppercase text-white">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {plate || (online ? "Online workspace" : "Route workspace")}
                        </p>
                      </div>

                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-blue-600 group-hover:text-white">
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
