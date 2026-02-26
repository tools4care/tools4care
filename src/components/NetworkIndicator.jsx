// src/components/NetworkIndicator.jsx
import React, { useState } from "react";
import { useOffline } from "../hooks/useOffline";

export function NetworkIndicator({
  syncing = false,
  ventasPendientes = 0,
  lastSync = null,
  syncError = null,
  onSyncNow = null,
}) {
  const { isOnline } = useOffline();
  const [expanded, setExpanded] = useState(false);

  // Formatear fecha del último sync
  function fmtSync(ts) {
    if (!ts) return 'Nunca';
    const d = new Date(ts);
    return d.toLocaleString('es', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ── Sin conexión ──────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9999,
          maxWidth: 300,
        }}
      >
        <div
          style={{
            backgroundColor: '#dc2626',
            color: 'white',
            borderRadius: 12,
            padding: '10px 14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            cursor: 'pointer',
          }}
          onClick={() => setExpanded(e => !e)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <span style={{ fontSize: 18 }}>📵</span>
            <span>Sin conexión</span>
            {ventasPendientes > 0 && (
              <span style={{
                backgroundColor: 'white', color: '#dc2626',
                borderRadius: 99, padding: '1px 8px', fontSize: 12, fontWeight: 800
              }}>
                {ventasPendientes}
              </span>
            )}
          </div>

          {expanded && (
            <div style={{ marginTop: 8, fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: 8 }}>
              {ventasPendientes > 0 ? (
                <div>⏳ {ventasPendientes} venta{ventasPendientes !== 1 ? 's' : ''} pendiente{ventasPendientes !== 1 ? 's' : ''} de sync</div>
              ) : (
                <div>✅ No hay ventas pendientes</div>
              )}
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                🕐 Último sync: {fmtSync(lastSync)}
              </div>
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                Los datos del cache están disponibles
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Con conexión: solo mostrar si hay sync activo, pendientes o error ──
  const tieneAlgo = syncing || ventasPendientes > 0 || syncError;
  if (!tieneAlgo && !expanded) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        maxWidth: 320,
      }}
    >
      <div
        style={{
          backgroundColor: syncError ? '#dc2626' : syncing ? '#2563eb' : '#16a34a',
          color: 'white',
          borderRadius: 12,
          padding: '10px 14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          transition: 'background-color 0.3s',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          <span style={{ fontSize: 18 }}>
            {syncError ? '❌' : syncing ? '🔄' : ventasPendientes > 0 ? '⏳' : '✅'}
          </span>
          <span>
            {syncError ? 'Error de sync'
              : syncing ? 'Sincronizando...'
              : ventasPendientes > 0 ? `${ventasPendientes} pendiente${ventasPendientes !== 1 ? 's' : ''}`
              : 'Sincronizado'}
          </span>
          {ventasPendientes > 0 && !syncing && (
            <span style={{
              backgroundColor: 'white', color: '#16a34a',
              borderRadius: 99, padding: '1px 8px', fontSize: 12, fontWeight: 800
            }}>
              {ventasPendientes}
            </span>
          )}
        </div>

        {/* Detalles expandibles */}
        {expanded && (
          <div style={{ marginTop: 8, fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: 8 }}>
            {syncError && (
              <div style={{ marginBottom: 6 }}>⚠️ {syncError}</div>
            )}
            <div>🕐 Último sync: {fmtSync(lastSync)}</div>
            <div style={{ marginTop: 4 }}>📅 Próximo sync: hoy a las 8:00pm</div>

            {onSyncNow && !syncing && (
              <button
                onClick={(e) => { e.stopPropagation(); onSyncNow(); }}
                style={{
                  marginTop: 10,
                  width: '100%',
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  border: '1px solid rgba(255,255,255,0.5)',
                  color: 'white',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                🔄 Sincronizar ahora
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
