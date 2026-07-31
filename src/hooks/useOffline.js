// src/hooks/useOffline.js
import { useState, useEffect } from 'react';
import { checkServerReachable, isOnline, onConnectionChange } from '../utils/networkStatus';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // Actualizar estado inicial
    setIsOffline(!isOnline());

    // Escuchar cambios de conexión
    const cleanup = onConnectionChange((online) => {
      setIsOffline((wasOffline) => {
        if (wasOffline !== !online) {
          setShowNotification(true);
          setTimeout(() => setShowNotification(false), online ? 3000 : 5000);
        }
        return !online;
      });
    });

    // The shared network service publishes only stable state changes. Do not
    // override it locally after one slow mobile request.
    const probe = () => { checkServerReachable(); };
    const timer = window.setInterval(probe, 30000);
    const onVisible = () => { if (!document.hidden) probe(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cleanup();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return {
    isOffline,
    isOnline: !isOffline,
    showNotification
  };
}
