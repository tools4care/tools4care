// src/hooks/useSync.js
import { useState, useEffect, useCallback } from 'react';
import { useOffline } from './useOffline';
import { sincronizarVentasPendientes } from '../utils/syncManager';
import { obtenerVentasPendientes } from '../utils/offlineDB';

export function useSync() {
  const { isOnline } = useOffline();
  const [syncing, setSyncing] = useState(false);
  const [ventasPendientes, setVentasPendientes] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState(null);

  // Contar ventas pendientes
  const contarPendientes = useCallback(async () => {
    const ventas = await obtenerVentasPendientes();
    setVentasPendientes(ventas.length);
  }, []);

  // Sincronizar manualmente
  const sincronizar = useCallback(async () => {
    if (!isOnline || syncing) return;

    setSyncing(true);
    try {
      const resultado = await sincronizarVentasPendientes();
      setLastSyncResult(resultado);
      await contarPendientes();
      return resultado;
    } catch (error) {
      console.error('Error en sincronización:', error);
      return { success: false, error: error.message };
    } finally {
      setSyncing(false);
    }
  }, [isOnline, syncing, contarPendientes]);

  // Auto-sincronizar cuando vuelve la conexión
  useEffect(() => {
    if (isOnline && ventasPendientes > 0 && !syncing) {
      console.log('🔄 Conexión recuperada, sincronizando automáticamente...');
      sincronizar();
    }
  }, [isOnline, ventasPendientes, syncing, sincronizar]);

  // Contar pendientes al montar
  useEffect(() => {
    contarPendientes();
  }, [contarPendientes]);

  return {
    syncing,
    ventasPendientes,
    lastSyncResult,
    sincronizar,
    contarPendientes
  };
}