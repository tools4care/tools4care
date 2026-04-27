// src/components/NetworkIndicator.jsx
import { useState } from "react";
import { WifiOff, CheckCircle, AlertCircle, RefreshCw, Clock, Upload, ChevronUp, ChevronDown } from "lucide-react";
import { useOffline } from "../hooks/useOffline";

function fmtSync(ts) {
  if (!ts) return "Never";
  const d = new Date(ts);
  const now = new Date();
  const diffMin = Math.round((now - d) / 60000);
  if (diffMin < 1)  return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function NetworkIndicator({ syncing = false, ventasPendientes = 0, lastSync = null, syncError = null, onSyncNow = null }) {
  const { isOnline } = useOffline();
  const [expanded, setExpanded] = useState(false);

  // ── Offline ──────────────────────────────────────
  if (!isOnline) {
    return (
      <div className="fixed bottom-20 lg:bottom-4 right-4 z-[9999] max-w-[280px]">
        <div
          className="bg-red-600 text-white rounded-2xl px-4 py-2.5 shadow-2xl cursor-pointer select-none"
          onClick={() => setExpanded(e => !e)}
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <WifiOff size={16} className="shrink-0" />
            <span>No connection</span>
            {ventasPendientes > 0 && (
              <span className="bg-white text-red-600 text-xs font-black px-2 py-0.5 rounded-full ml-auto">
                {ventasPendientes}
              </span>
            )}
            {expanded ? <ChevronDown size={14} className="ml-1" /> : <ChevronUp size={14} className="ml-1" />}
          </div>
          {expanded && (
            <div className="mt-2.5 pt-2.5 border-t border-white/25 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                <Upload size={12} />
                {ventasPendientes > 0
                  ? `${ventasPendientes} sale${ventasPendientes !== 1 ? "s" : ""} waiting to sync`
                  : "No pending sales"}
              </div>
              <div className="flex items-center gap-1.5 opacity-80">
                <Clock size={12} />
                Last sync: {fmtSync(lastSync)}
              </div>
              <p className="opacity-70 text-[11px] pt-0.5">Cached data available offline</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Online: only show when something to report ──
  const hasStatus = syncing || ventasPendientes > 0 || syncError;
  if (!hasStatus && !expanded) return null;

  const statusBg  = syncError ? "bg-red-600" : syncing ? "bg-blue-600" : "bg-emerald-600";
  const StatusIcon = syncError ? AlertCircle : syncing ? RefreshCw : ventasPendientes > 0 ? Upload : CheckCircle;
  const statusText = syncError ? "Sync error"
    : syncing ? "Syncing…"
    : ventasPendientes > 0 ? `${ventasPendientes} pending`
    : "Synced";

  return (
    <div className="fixed bottom-20 lg:bottom-4 right-4 z-[9999] max-w-[280px]">
      <div
        className={`${statusBg} text-white rounded-2xl px-4 py-2.5 shadow-2xl cursor-pointer select-none transition-colors duration-300`}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          <StatusIcon size={16} className={`shrink-0 ${syncing ? "animate-spin" : ""}`} />
          <span>{statusText}</span>
          {ventasPendientes > 0 && !syncing && (
            <span className="bg-white/20 text-white text-xs font-black px-2 py-0.5 rounded-full ml-auto">
              {ventasPendientes}
            </span>
          )}
          {expanded ? <ChevronDown size={14} className="ml-1 opacity-70" /> : <ChevronUp size={14} className="ml-1 opacity-70" />}
        </div>

        {expanded && (
          <div className="mt-2.5 pt-2.5 border-t border-white/25 space-y-1.5 text-xs">
            {syncError && (
              <div className="flex items-start gap-1.5 text-red-100">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{syncError}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 opacity-80">
              <Clock size={12} />
              Last sync: {fmtSync(lastSync)}
            </div>
            {onSyncNow && !syncing && (
              <button
                onClick={(e) => { e.stopPropagation(); onSyncNow(); }}
                className="w-full mt-2 bg-white/20 hover:bg-white/30 border border-white/40 text-white rounded-xl py-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={12} /> Sync now
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
