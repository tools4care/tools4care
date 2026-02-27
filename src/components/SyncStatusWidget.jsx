// src/components/SyncStatusWidget.jsx
// Tarjeta de estado de sincronización y backup automático para el Dashboard

import { useOffline } from "../hooks/useOffline";

function fmtFecha(ts) {
  if (!ts) return "Nunca";
  return new Date(ts).toLocaleString("es", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtHoraHasta8pm() {
  const ahora = new Date();
  const hoy8pm = new Date();
  hoy8pm.setHours(20, 0, 0, 0);
  if (ahora >= hoy8pm) {
    hoy8pm.setDate(hoy8pm.getDate() + 1);
  }
  const diffMs = hoy8pm - ahora;
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h > 0) return `en ${h}h ${m}m`;
  return `en ${m}m`;
}

export default function SyncStatusWidget({
  syncing = false,
  lastSync = null,
  historialBackups = [],
  ventasPendientes = 0,
  syncError = null,
  onSyncNow = null,
  onOpenBackupManager = null,
  backupCount = 0,
}) {
  const { isOnline } = useOffline();

  const estadoSync = syncError
    ? { color: "red",    icon: "❌", texto: "Error de sincronización" }
    : syncing
    ? { color: "blue",   icon: "🔄", texto: "Sincronizando..." }
    : !isOnline
    ? { color: "amber",  icon: "📵", texto: "Sin conexión" }
    : ventasPendientes > 0
    ? { color: "orange", icon: "⏳", texto: `${ventasPendientes} pendiente${ventasPendientes !== 1 ? "s" : ""}` }
    : { color: "green",  icon: "✅", texto: "Datos sincronizados" };

  const colorMap = {
    red:    { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    badge: "bg-red-100 text-red-700" },
    blue:   { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700" },
    amber:  { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700" },
    orange: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
    green:  { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  badge: "bg-green-100 text-green-700" },
  };
  const c = colorMap[estadoSync.color];

  return (
    <div className="bg-white rounded-3xl shadow-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Backup Automático</h2>
          <p className="text-sm text-gray-500 mt-0.5">Guarda hasta 7 copias · Sync 2× al día</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full ${c.badge}`}>
          <span>{estadoSync.icon}</span>
          {estadoSync.texto}
        </span>
      </div>

      {/* Error de sync */}
      {syncError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-xl">
          ⚠️ {syncError}
        </div>
      )}

      {/* Info grid */}
      <div className={`${c.bg} border ${c.border} rounded-2xl p-4 mb-5`}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Último backup</p>
            <p className={`text-sm font-semibold ${c.text}`}>{fmtFecha(lastSync)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Próximo sync</p>
            <p className="text-sm font-semibold text-gray-700">
              {isOnline ? `Hoy 8 PM (${fmtHoraHasta8pm()})` : "Al reconectar"}
            </p>
          </div>
          {ventasPendientes > 0 && (
            <div className="col-span-2">
              <p className="text-xs text-gray-500 mb-0.5">Pendientes de subir</p>
              <p className="text-sm font-semibold text-orange-600">
                {ventasPendientes} registro{ventasPendientes !== 1 ? "s" : ""} offline
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Historial de backups (últimos 3) */}
      {historialBackups.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Últimos backups ({historialBackups.length} de 7)
          </p>
          <div className="space-y-1.5">
            {historialBackups.slice(0, 3).map((b, i) => (
              <div key={b.backup_id || i} className="flex items-center justify-between text-sm bg-gray-50 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">{fmtFecha(b.timestamp)}</span>
                  {b.created_by === 'manual' && (
                    <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">manual</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {b.resumen ? (
                    <>
                      <span>{b.resumen.total_clientes ?? 0} clientes</span>
                      <span>{b.resumen.total_inventario_items ?? 0} prod</span>
                      <span className="text-red-400 font-medium">
                        ${Number(b.resumen.total_deuda || 0).toFixed(0)} deuda
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{b.registros?.clientes ?? 0} clientes</span>
                      <span>{b.registros?.inventario ?? 0} prod</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-2">
        {/* Sync manual */}
        {onSyncNow && isOnline && (
          <button
            onClick={onSyncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className={syncing ? "animate-spin" : ""}>🔄</span>
            {syncing ? "Sincronizando..." : "Sync ahora"}
          </button>
        )}

        {/* Gestionar backups */}
        {onOpenBackupManager && (
          <button
            onClick={onOpenBackupManager}
            className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-indigo-100 transition-all"
          >
            🗂️ Gestionar backups{backupCount > 0 ? ` (${backupCount})` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
