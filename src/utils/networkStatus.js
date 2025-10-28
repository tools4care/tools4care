// src/utils/networkStatus.js

// Detecta si hay conexión a internet
export function isOnline() {
  return navigator.onLine;
}

// Escucha cambios de conexión (online/offline)
export function onConnectionChange(callback) {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Retorna función para limpiar listeners
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// Verifica conectividad real (ping a servidor)
export async function checkRealConnection() {
  if (!navigator.onLine) return false;

  try {
    // Intenta hacer fetch a tu dominio (cambia si es necesario)
    const response = await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      cache: 'no-cache',
      mode: 'no-cors'
    });
    return true;
  } catch (error) {
    return false;
  }
}