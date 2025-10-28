// src/components/NetworkIndicator.jsx
import { useOffline } from '../hooks/useOffline';
import { useSync } from '../hooks/useSync';

export default function NetworkIndicator() {
  const { isOffline, showNotification } = useOffline();
  const { ventasPendientes, syncing } = useSync();

  if (!isOffline && ventasPendientes === 0 && !showNotification) {
    return null; // No mostrar nada si está todo bien
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      {/* Indicador de estado */}
      <div
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg
          transition-all duration-300
          ${isOffline 
            ? 'bg-red-500 text-white' 
            : 'bg-green-500 text-white'
          }
        `}
      >
        {/* Icono */}
        <div className="flex items-center">
          {syncing ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          ) : (
            <div className={`w-3 h-3 rounded-full ${isOffline ? 'bg-white' : 'bg-white'}`} />
          )}
        </div>

        {/* Mensaje */}
        <div className="text-sm font-medium">
          {syncing && '🔄 Sincronizando...'}
          {!syncing && isOffline && '🔴 Sin conexión'}
          {!syncing && !isOffline && ventasPendientes > 0 && `✅ ${ventasPendientes} venta(s) pendiente(s)`}
          {!syncing && !isOffline && ventasPendientes === 0 && '🟢 Conectado'}
        </div>
      </div>

      {/* Notificación de cambio de estado */}
      {showNotification && (
        <div
          className={`
            mt-2 px-4 py-2 rounded-lg shadow-lg text-sm
            animate-fade-in
            ${isOffline 
              ? 'bg-orange-100 text-orange-800 border border-orange-300' 
              : 'bg-blue-100 text-blue-800 border border-blue-300'
            }
          `}
        >
          {isOffline 
            ? '📵 Trabajando sin conexión. Las ventas se guardarán localmente.' 
            : '✅ Conexión recuperada. Sincronizando datos...'
          }
        </div>
      )}
    </div>
  );
}