// src/hooks/useOffline.js
import { useState, useEffect } from 'react';
import { isOnline, onConnectionChange } from '../utils/networkStatus';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // Actualizar estado inicial
    setIsOffline(!isOnline());

    // Escuchar cambios de conexión
    const cleanup = onConnectionChange((online) => {
      const wasOffline = isOffline;
      setIsOffline(!online);

      // Mostrar notificación cuando cambia el estado
      if (wasOffline && online) {
        // Se recuperó la conexión
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 3000);
      } else if (!wasOffline && !online) {
        // Se perdió la conexión
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 5000);
      }
    });

    return cleanup;
  }, []);

  return {
    isOffline,
    isOnline: !isOffline,
    showNotification
  };
}