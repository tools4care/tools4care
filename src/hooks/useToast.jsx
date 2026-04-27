// src/hooks/useToast.jsx
// Global toast + confirm dialog system
// Usage:
//   const { toast, confirm } = useToast();
//   toast.success("Saved");
//   const ok = await confirm("Delete this record?");

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, RefreshCw, X } from "lucide-react";

const ToastContext = createContext(null);

const CONFIG = {
  success: { Icon: CheckCircle, bg: "bg-gradient-to-r from-green-600 to-emerald-600", bar: "bg-green-300" },
  error:   { Icon: XCircle,     bg: "bg-gradient-to-r from-red-600 to-rose-600",      bar: "bg-red-300"   },
  warning: { Icon: AlertTriangle,bg:"bg-gradient-to-r from-amber-500 to-orange-500",  bar: "bg-amber-300" },
  info:    { Icon: Info,        bg: "bg-gradient-to-r from-blue-600 to-indigo-600",   bar: "bg-blue-300"  },
  return:  { Icon: RefreshCw,   bg: "bg-gradient-to-r from-violet-600 to-purple-600", bar: "bg-violet-300"},
};

let _idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts]   = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const resolveRef = useRef(null);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, message, durationMs = 4000) => {
    const id = ++_idCounter;
    setToasts((prev) => [...prev.slice(-4), { id, type, message, durationMs }]);
    if (durationMs > 0) setTimeout(() => dismiss(id), durationMs);
    return id;
  }, [dismiss]);

  const toast = {
    success: (msg, ms)  => addToast("success", msg, ms),
    error:   (msg, ms)  => addToast("error",   msg, ms ?? 5000),
    warning: (msg, ms)  => addToast("warning", msg, ms),
    info:    (msg, ms)  => addToast("info",    msg, ms),
    return:  (msg, ms)  => addToast("return",  msg, ms),
  };

  const showConfirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConfirmState({ message, ...opts });
    });
  }, []);

  const handleConfirm = (result) => {
    setConfirmState(null);
    resolveRef.current?.(result);
  };

  return (
    <ToastContext.Provider value={{ toast, confirm: showConfirm }}>
      {children}

      {/* ── Toast stack ─────────────────────────────── */}
      <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[99999] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const { Icon, bg, bar } = CONFIG[t.type] || CONFIG.info;
          return (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={`${bg} text-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto cursor-pointer`}
              style={{ animation: "toast-in 0.22s ease-out" }}
            >
              <div className="flex items-start gap-3 px-4 py-3.5">
                <Icon size={20} className="shrink-0 mt-0.5" />
                <span className="text-sm font-semibold leading-snug flex-1">{t.message}</span>
                <X size={15} className="shrink-0 opacity-60 mt-0.5" />
              </div>
              {/* Progress bar — shrinks over durationMs */}
              {t.durationMs > 0 && (
                <div className={`h-1 ${bar} opacity-60`}
                  style={{ animation: `toast-shrink ${t.durationMs}ms linear forwards` }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Confirm bottom-sheet ─────────────────────── */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[100000] bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => handleConfirm(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon header */}
            <div className="flex flex-col items-center pt-6 pb-4 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                <AlertTriangle size={26} className="text-amber-500" />
              </div>
              <p className="text-gray-900 font-bold text-base leading-snug whitespace-pre-line">
                {confirmState.message}
              </p>
              {confirmState.detail && (
                <p className="text-gray-500 text-sm mt-1.5">{confirmState.detail}</p>
              )}
            </div>
            {/* Buttons */}
            <div className="flex gap-2 px-4 pb-5">
              <button
                onClick={() => handleConfirm(false)}
                className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                {confirmState.cancelLabel || "Cancel"}
              </button>
              <button
                onClick={() => handleConfirm(true)}
                className={`flex-1 py-3 rounded-2xl text-white font-bold text-sm transition-all ${confirmState.danger ? "bg-gradient-to-r from-red-600 to-rose-600" : "bg-gradient-to-r from-blue-600 to-indigo-600"}`}
              >
                {confirmState.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(14px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes toast-shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
