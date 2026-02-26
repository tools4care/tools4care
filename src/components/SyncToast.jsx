// src/components/SyncToast.jsx
// Toast flotante que aparece automáticamente cuando el sync completa
// con ventas u pagos offline subidos — confirma al usuario que sus
// transacciones offline fueron guardadas en la nube y los saldos
// se actualizaron.

import { useState, useEffect } from "react";
import { useSyncGlobal } from "../hooks/SyncContext";
import { useOffline } from "../hooks/useOffline";

export function SyncToast() {
  const { onSyncComplete, syncing, ventasPendientes } = useSyncGlobal();
  const { isOnline } = useOffline();

  const [toast, setToast] = useState(null); // { ventasSubidas, pagosSubidos }
  const [visible, setVisible] = useState(false);
  const [reconnectMsg, setReconnectMsg] = useState(false);

  // Mostrar toast cuando el sync completa con datos
  useEffect(() => {
    const unsub = onSyncComplete(({ ventasSubidas, pagosSubidos }) => {
      if (ventasSubidas > 0 || pagosSubidos > 0) {
        setToast({ ventasSubidas, pagosSubidos });
        setVisible(true);
        // Auto-ocultar después de 6 segundos
        const t = setTimeout(() => setVisible(false), 6000);
        return () => clearTimeout(t);
      }
    });
    return unsub;
  }, [onSyncComplete]);

  // Mostrar mensaje de reconexión cuando vuelve internet
  useEffect(() => {
    let prev = isOnline;
    const handler = () => {
      if (!prev && navigator.onLine) {
        setReconnectMsg(true);
        setTimeout(() => setReconnectMsg(false), 3000);
      }
      prev = navigator.onLine;
    };
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, []);

  return (
    <>
      {/* Toast de sync completado */}
      {visible && toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            maxWidth: 340,
            width: 'calc(100% - 32px)',
          }}
          onClick={() => setVisible(false)}
        >
          <div style={{
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            color: 'white',
            borderRadius: 16,
            padding: '14px 18px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            cursor: 'pointer',
          }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>✅</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
                Ventas sincronizadas
              </div>
              <div style={{ fontSize: 13, opacity: 0.92, lineHeight: 1.4 }}>
                {toast.ventasSubidas > 0 && (
                  <div>📦 {toast.ventasSubidas} venta{toast.ventasSubidas !== 1 ? 's' : ''} subida{toast.ventasSubidas !== 1 ? 's' : ''} a la nube</div>
                )}
                {toast.pagosSubidos > 0 && (
                  <div>💳 {toast.pagosSubidos} pago{toast.pagosSubidos !== 1 ? 's' : ''} registrado{toast.pagosSubidos !== 1 ? 's' : ''}</div>
                )}
                <div style={{ marginTop: 4, opacity: 0.8 }}>
                  Saldos y cuentas actualizados ✓
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync en progreso (mientras sube ventas offline) */}
      {syncing && ventasPendientes > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99998,
            maxWidth: 320,
            width: 'calc(100% - 32px)',
          }}
        >
          <div style={{
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: 'white',
            borderRadius: 16,
            padding: '12px 16px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 20, animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Sincronizando...</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Subiendo {ventasPendientes} transacci{ventasPendientes !== 1 ? 'ones' : 'ón'} offline
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mensaje de reconexión */}
      {reconnectMsg && !syncing && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99997,
            maxWidth: 280,
            width: 'calc(100% - 32px)',
          }}
        >
          <div style={{
            background: '#0f766e',
            color: 'white',
            borderRadius: 12,
            padding: '10px 16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
          }}>
            <span>🌐</span> Conexión restaurada — sincronizando
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
