// src/utils/networkStatus.js

import { supabase } from "../supabaseClient";

let serverReachable = typeof navigator === "undefined" ? true : navigator.onLine;
let lastProbeAt = 0;
let activeProbe = null;
let consecutiveFailures = 0;
const listeners = new Set();
const FAILURES_BEFORE_OFFLINE = 2;

function publish(online) {
  serverReachable = Boolean(online);
  listeners.forEach((listener) => {
    try {
      listener(serverReachable);
    } catch {
      // One UI listener must not prevent the others from receiving the update.
    }
  });
}

/**
 * navigator.onLine only says that the device has a network interface. A phone
 * can still report "online" in a dead zone, so the app also tracks whether the
 * Supabase server is actually reachable.
 */
export function isOnline() {
  return serverReachable;
}

export function reportConnectionFailure() {
  consecutiveFailures += 1;
  if (!navigator.onLine || consecutiveFailures >= FAILURES_BEFORE_OFFLINE) {
    publish(false);
  }
}

export async function checkServerReachable({ force = false, timeoutMs = 3500 } = {}) {
  if (!force && Date.now() - lastProbeAt < 5000) return serverReachable;
  if (activeProbe) return activeProbe;

  activeProbe = (async () => {
    try {
      await Promise.race([
        supabase.from("ventas_pendientes").select("id").limit(1),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("connectivity-timeout")), timeoutMs);
        }),
      ]);
      lastProbeAt = Date.now();
      consecutiveFailures = 0;
      publish(true);
      return true;
    } catch {
      lastProbeAt = Date.now();
      consecutiveFailures += 1;
      if (!navigator.onLine || consecutiveFailures >= FAILURES_BEFORE_OFFLINE) {
        publish(false);
      }
      return false;
    } finally {
      activeProbe = null;
    }
  })();

  return activeProbe;
}

/**
 * Escucha cambios en la conexión
 * @param {Function} callback - Función que recibe (isOnline: boolean)
 * @returns {Function} Función de cleanup para remover listeners
 */
export function onConnectionChange(callback) {
  listeners.add(callback);

  const handleOnline = async () => {
    const reachable = await checkServerReachable({ force: true });
    console.log(reachable ? '🌐 Conexión restaurada' : '📵 Red sin acceso al servidor');
  };
  
  const handleOffline = () => {
    console.log('📵 Sin conexión');
    consecutiveFailures = FAILURES_BEFORE_OFFLINE;
    publish(false);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  checkServerReachable({ force: true });

  // Retornar función de cleanup
  return () => {
    listeners.delete(callback);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
