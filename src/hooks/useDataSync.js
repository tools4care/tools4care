// src/hooks/useDataSync.js
// Sincronización automática 2x día: al iniciar + a las 8pm
// Descarga clientes, inventario y hace backup local

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  guardarClientesCache,
  guardarInventarioVan,
  guardarTopProductos,
  guardarBackupLocal,
  obtenerFechaUltimoBackup,
  obtenerHistorialBackups,
} from '../utils/offlineDB';
import { sincronizarVentasPendientes } from '../utils/syncManager';
import { obtenerVentasPendientes } from '../utils/offlineDB';

// Hora del segundo sync diario (20 = 8pm)
const SYNC_HORA_TARDE = 20;

function calcularMsHastaProximoSync() {
  const ahora = new Date();
  const hoy8pm = new Date();
  hoy8pm.setHours(SYNC_HORA_TARDE, 0, 0, 0);

  if (ahora < hoy8pm) {
    return hoy8pm.getTime() - ahora.getTime();
  } else {
    // Ya pasó las 8pm, próximo sync es mañana a las 8pm
    const manana8pm = new Date(hoy8pm);
    manana8pm.setDate(manana8pm.getDate() + 1);
    return manana8pm.getTime() - ahora.getTime();
  }
}

export function useDataSync({ vanId, usuarioId, enabled = true } = {}) {
  const [syncing, setSyncing]             = useState(false);
  const [lastSync, setLastSync]           = useState(null);
  const [historialBackups, setHistorial]  = useState([]);
  const [ventasPendientes, setVentasPend] = useState(0);
  const [syncError, setSyncError]         = useState(null);
  const timerRef = useRef(null);
  const syncingRef = useRef(false);

  // ── Contar ventas pendientes offline ──────────────────────────
  const contarPendientes = useCallback(async () => {
    const ventas = await obtenerVentasPendientes();
    setVentasPend(ventas.length);
  }, []);

  // ── Sincronización completa ───────────────────────────────────
  const sincronizarTodo = useCallback(async ({ silencioso = false } = {}) => {
    if (!enabled || syncingRef.current || !navigator.onLine) return;
    if (!vanId) return;

    syncingRef.current = true;
    if (!silencioso) setSyncing(true);
    setSyncError(null);

    try {
      console.log('🔄 [DataSync] Iniciando sincronización completa...');

      // 1. Subir ventas pendientes offline primero
      const resultSync = await sincronizarVentasPendientes();
      if (resultSync.sincronizadas > 0) {
        console.log(`✅ [DataSync] ${resultSync.sincronizadas} venta(s) offline subidas`);
      }

      // 2. Descargar todos los clientes (sin límite)
      const { data: clientes, error: eClientes } = await supabase
        .from('clientes_balance')
        .select('id,nombre,apellido,negocio,telefono,email,direccion,balance')
        .order('nombre', { ascending: true })
        .limit(2000);

      if (eClientes) throw new Error('Clientes: ' + eClientes.message);
      await guardarClientesCache(clientes || []);

      // 3. Descargar inventario de la van
      const { data: inventario, error: eInv } = await supabase
        .from('stock_van')
        .select('producto_id, cantidad, productos(id, nombre, precio, codigo_barras, categoria)')
        .eq('van_id', vanId)
        .gt('cantidad', 0);

      if (!eInv && inventario) {
        const productosFormateados = inventario
          .filter(i => i.productos)
          .map(i => ({
            producto_id: i.productos.id,
            nombre: i.productos.nombre,
            precio: i.productos.precio,
            codigo_barras: i.productos.codigo_barras,
            categoria: i.productos.categoria,
            cantidad: i.cantidad,
          }));
        await guardarInventarioVan(vanId, productosFormateados);
        await guardarTopProductos(vanId, productosFormateados.slice(0, 50));
      }

      // 4. Descargar ventas recientes (últimos 30 días) para backup
      const hace30dias = new Date();
      hace30dias.setDate(hace30dias.getDate() - 30);

      const { data: ventasRecientes } = await supabase
        .from('ventas')
        .select('id,fecha,total_venta,total_pagado,estado_pago,cliente_id')
        .gte('fecha', hace30dias.toISOString())
        .eq('van_id', vanId)
        .order('fecha', { ascending: false })
        .limit(500);

      // 5. Guardar backup local completo
      await guardarBackupLocal({
        clientes: clientes || [],
        inventario: inventario || [],
        ventas_recientes: ventasRecientes || [],
      });

      // 6. Actualizar estado
      const ahora = new Date().toISOString();
      setLastSync(ahora);
      localStorage.setItem('ultimo_sync_completo', ahora);

      const historial = await obtenerHistorialBackups();
      setHistorial(historial);

      await contarPendientes();

      console.log(`✅ [DataSync] Sync completo: ${clientes?.length || 0} clientes, ${inventario?.length || 0} productos`);

    } catch (error) {
      console.error('❌ [DataSync] Error en sync:', error);
      setSyncError(error.message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [vanId, enabled, contarPendientes]);

  // ── Al montar: sync inicial + programar sync a las 8pm ───────
  useEffect(() => {
    if (!enabled || !vanId) return;

    // Sync inmediato al iniciar (silencioso si ya hay cache reciente)
    const ultimoSync = localStorage.getItem('ultimo_sync_completo');
    const hace12h = Date.now() - 12 * 60 * 60 * 1000;
    const necesitaSync = !ultimoSync || new Date(ultimoSync).getTime() < hace12h;

    if (necesitaSync) {
      // Esperar 3 segundos para que la app cargue primero
      setTimeout(() => sincronizarTodo({ silencioso: true }), 3000);
    } else {
      console.log('✅ [DataSync] Cache reciente, no se necesita sync al inicio');
      setLastSync(ultimoSync);
      // Cargar historial aunque no sincronice
      obtenerHistorialBackups().then(setHistorial);
      contarPendientes();
    }

    // Programar sync automático a las 8pm
    const msHasta8pm = calcularMsHastaProximoSync();
    console.log(`⏰ [DataSync] Próximo sync programado en ${Math.round(msHasta8pm / 60000)} minutos`);

    timerRef.current = setTimeout(() => {
      sincronizarTodo({ silencioso: true });
      // Repetir cada 24h después del primer disparo
      timerRef.current = setInterval(() => {
        sincronizarTodo({ silencioso: true });
      }, 24 * 60 * 60 * 1000);
    }, msHasta8pm);

    // Sync también cuando vuelve la conexión
    const handleOnline = () => {
      console.log('🌐 [DataSync] Conexión restaurada, sincronizando...');
      sincronizarTodo({ silencioso: true });
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(timerRef.current);
      window.removeEventListener('online', handleOnline);
    };
  }, [vanId, enabled, sincronizarTodo, contarPendientes]);

  // Cargar fecha del último backup al montar
  useEffect(() => {
    obtenerFechaUltimoBackup().then(fecha => {
      if (fecha) setLastSync(fecha);
    });
    contarPendientes();
  }, [contarPendientes]);

  return {
    syncing,
    lastSync,
    historialBackups,
    ventasPendientes,
    syncError,
    sincronizarAhora: () => sincronizarTodo({ silencioso: false }),
  };
}
