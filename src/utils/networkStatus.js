// src/utils/networkStatus.js

/**
 * Verifica si hay conexión a internet
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Escucha cambios en la conexión
 * @param {Function} callback - Función que recibe (isOnline: boolean)
 * @returns {Function} Función de cleanup para remover listeners
 */
export function onConnectionChange(callback) {
  const handleOnline = () => {
    console.log('🌐 Conexión restaurada');
    callback(true);
  };
  
  const handleOffline = () => {
    console.log('📵 Sin conexión');
    callback(false);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Retornar función de cleanup
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}