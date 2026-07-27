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

    const probe = () => checkServerReachable().then((online) => setIsOffline(!online));
    const timer = window.setInterval(probe, 15000);
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
