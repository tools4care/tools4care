// src/hooks/useToast.jsx
// Global toast + confirm dialog system
// Usage:
//   const { toast, confirm } = useToast();
//   toast.success("Guardado");
//   const ok = await confirm("¿Eliminar este registro?");

import { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastContext = createContext(null);

const ICONS = {
  success: "✅",
  error:   "❌",
  warning: "⚠️",
  info:    "ℹ️",
  return:  "🔄",
};

const COLORS = {
  success: { bg: "linear-gradient(135deg,#16a34a,#15803d)", border: "#15803d" },
  error:   { bg: "linear-gradient(135deg,#dc2626,#b91c1c)", border: "#b91c1c" },
  warning: { bg: "linear-gradient(135deg,#d97706,#b45309)", border: "#b45309" },
  info:    { bg: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "#1d4ed8" },
  return:  { bg: "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "#6d28d9" },
};

let _idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts]     = useState([]);
  const [confirm, setConfirm]   = useState(null); // { message, resolve }
  const resolveRef               = useRef(null);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, message, durationMs = 4000) => {
    const id = ++_idCounter;
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
    if (durationMs > 0) {
      setTimeout(() => dismiss(id), durationMs);
    }
    return id;
  }, [dismiss]);

  const toast = {
    success: (msg, ms)  => addToast("success", msg, ms),
    error:   (msg, ms)  => addToast("error",   msg, ms ?? 5000),
    warning: (msg, ms)  => addToast("warning", msg, ms),
    info:    (msg, ms)  => addToast("info",    msg, ms),
    return:  (msg, ms)  => addToast("return",  msg, ms),
  };

  const showConfirm = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConfirm({ message });
    });
  }, []);

  const handleConfirm = (result) => {
    setConfirm(null);
    if (resolveRef.current) resolveRef.current(result);
  };

  return (
    <ToastContext.Provider value={{ toast, confirm: showConfirm }}>
      {children}

      {/* ── Toast container ── */}
      <div style={{
        position: "fixed",
        bottom: 88,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360,
        width: "calc(100% - 32px)",
        pointerEvents: "none",
      }}>
        {toasts.map((t) => {
          const c = COLORS[t.type] || COLORS.info;
          return (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: "white",
                borderRadius: 14,
                padding: "13px 16px",
                boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                pointerEvents: "auto",
                animation: "slideUp 0.2s ease-out",
              }}
            >
              <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.2 }}>
                {ICONS[t.type] || ICONS.info}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
                {t.message}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Confirm dialog ── */}
      {confirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100000,
          background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          padding: "0 16px 24px",
        }}>
          <div style={{
            background: "white",
            borderRadius: 20,
            padding: "24px 20px 20px",
            width: "100%",
            maxWidth: 400,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <p style={{
              fontSize: 15, fontWeight: 600, color: "#111827",
              lineHeight: 1.5, marginBottom: 20, textAlign: "center",
              whiteSpace: "pre-line",
            }}>
              {confirm.message}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => handleConfirm(false)}
                style={{
                  flex: 1, padding: "13px", borderRadius: 12,
                  border: "2px solid #e5e7eb", background: "white",
                  fontSize: 15, fontWeight: 700, color: "#374151",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirm(true)}
                style={{
                  flex: 1, padding: "13px", borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                  fontSize: 15, fontWeight: 700, color: "white",
                  cursor: "pointer",
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
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
