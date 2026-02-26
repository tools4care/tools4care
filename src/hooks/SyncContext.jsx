// src/hooks/SyncContext.jsx
// Context global de sincronización offline → online
// Se inicializa una sola vez en LayoutPrivado y cualquier pantalla
// puede suscribirse a onSyncComplete para refrescarse automáticamente.

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useVan } from './VanContext';
import { useUsuario } from '../UsuarioContext';
import {
  guardarClientesCache,
  guardarInventarioVan,
  guardarTopProductos,
  guardarBackupLocal,
  guardarDeudaCache,
  obtenerFechaUltimoBackup,
  obtenerVentasPendientes,
  obtenerPagosPendientes,
} from '../utils/offlineDB';
import { sincronizarVentasPendientes, sincronizarPagosPendientes } from '../utils/syncManager';

const SyncContext = createContext(null);

export function useSyncGlobal() {
  const ctx = useContext(SyncContext);
  if (!ctx) return {
    syncing: false,
    lastSync: null,
    ventasPendientes: 0,
    syncError: null,
    sincronizarAhora: () => {},
    onSyncComplete: () => () => {},
  };
  return ctx;
}

export function SyncProvider({ children }) {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const vanId = van?.id;
  const usuarioId = usuario?.id;

  const [syncing, setSyncing]           = useState(false);
  const [lastSync, setLastSync]         = useState(() => localStorage.getItem('ultimo_sync_completo'));
  const [ventasPendientes, setVentasPend] = useState(0);
  const [syncError, setSyncError]       = useState(null);

  // Lista de callbacks a llamar cuando el sync completa exitosamente
  const listenersRef = useRef([]);

  // Registrar listener — devuelve función de cleanup
  const onSyncComplete = useCallback((cb) => {
    listenersRef.current = [...listenersRef.current, cb];
    return () => {
      listenersRef.current = listenersRef.current.filter(fn => fn !== cb);
    };
  }, []);

  const syncingRef = useRef(false);
  const timerRef  = useRef(null);

  // ── Contar pendientes ────────────────────────────────────────
  const contarPendientes = useCallback(async () => {
    const [ventas, pagos] = await Promise.all([
      obtenerVentasPendientes(),
      obtenerPagosPendientes(),
    ]);
    setVentasPend(ventas.length + pagos.length);
  }, []);

  // ── Sync completo ────────────────────────────────────────────
  const sincronizarTodo = useCallback(async ({ silencioso = false } = {}) => {
    if (syncingRef.current || !navigator.onLine) return;
    if (!vanId || !usuarioId) return;

    syncingRef.current = true;
    if (!silencioso) setSyncing(true);
    setSyncError(null);

    let ventasSubidas = 0;
    let pagosSubidos  = 0;

    try {
      console.log('🔄 [SyncGlobal] Iniciando sync...');

      // 1. Subir ventas y pagos offline primero
      const [resVentas, resPagos] = await Promise.all([
        sincronizarVentasPendientes(),
        sincronizarPagosPendientes(),
      ]);
      ventasSubidas = resVentas.sincronizadas || 0;
      pagosSubidos  = resPagos.sincronizados  || 0;

      if (ventasSubidas > 0 || pagosSubidos > 0) {
        console.log(`✅ [SyncGlobal] Subidas: ${ventasSubidas} venta(s), ${pagosSubidos} pago(s)`);
      }

      // 2. Descargar clientes con balance
      const { data: clientes, error: eClientes } = await supabase
        .from('clientes_balance')
        .select('id,nombre,negocio,telefono,email,direccion,balance')
        .order('nombre', { ascending: true })
        .limit(2000);
      if (eClientes) throw new Error('Clientes: ' + eClientes.message);
      await guardarClientesCache(clientes || []);

      // 3. Descargar inventario van
      const { data: inventario, error: eInv } = await supabase
        .from('stock_van')
        .select('producto_id, cantidad, productos:productos!inner(id, nombre, precio, codigo, marca, descuento_pct, bulk_min_qty, bulk_unit_price)')
        .eq('van_id', vanId)
        .gt('cantidad', 0);

      if (!eInv && inventario) {
        const fmt = inventario.filter(i => i.productos).map(i => ({
          producto_id: i.producto_id,
          cantidad: Number(i.cantidad) || 0,
          productos: {
            id: i.productos.id,
            nombre: i.productos.nombre ?? '',
            precio: Number(i.productos.precio) || 0,
            codigo: i.productos.codigo ?? null,
            marca: i.productos.marca ?? '',
            descuento_pct: i.productos.descuento_pct ?? null,
            bulk_min_qty: i.productos.bulk_min_qty ?? null,
            bulk_unit_price: i.productos.bulk_unit_price ?? null,
          },
        }));
        await guardarInventarioVan(vanId, fmt);
        await guardarTopProductos(vanId, fmt.slice(0, 50));
      }

      // 4. Ventas recientes + ventas con deuda
      const hace60dias = new Date();
      hace60dias.setDate(hace60dias.getDate() - 60);

      const [{ data: ventasRecientes }, { data: ventasConDeuda }] = await Promise.all([
        supabase
          .from('ventas')
          .select('id,created_at,total_venta,total,total_pagado,estado_pago,cliente_id,metodo_pago,notas')
          .gte('created_at', hace60dias.toISOString())
          .eq('van_id', vanId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('ventas')
          .select('id,created_at,total_venta,total,total_pagado,estado_pago,cliente_id,metodo_pago,notas')
          .eq('van_id', vanId)
          .in('estado_pago', ['pendiente', 'parcial'])
          .order('created_at', { ascending: false })
          .limit(1000),
      ]);

      await guardarDeudaCache(ventasConDeuda || []);

      // 5. Backup local completo
      await guardarBackupLocal({
        clientes: clientes || [],
        inventario: inventario || [],
        ventas_recientes: ventasRecientes || [],
        ventas_con_deuda: ventasConDeuda || [],
        backup_version: '2.0',
        van_id: vanId,
      });

      // 6. Actualizar estado
      const ahora = new Date().toISOString();
      setLastSync(ahora);
      localStorage.setItem('ultimo_sync_completo', ahora);
      await contarPendientes();

      console.log(`✅ [SyncGlobal] Completado: ${clientes?.length || 0} clientes, ${inventario?.length || 0} productos`);

      // 7. Notificar a todos los listeners (vistas que necesitan refrescarse)
      const resumenSync = { ventasSubidas, pagosSubidos, clientes: clientes?.length || 0 };
      listenersRef.current.forEach(cb => {
        try { cb(resumenSync); } catch {}
      });

    } catch (error) {
      console.error('❌ [SyncGlobal] Error:', error);
      setSyncError(error.message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [vanId, usuarioId, contarPendientes]);

  // ── Al montar: sync inicial + 8pm + reconexión ──────────────
  useEffect(() => {
    if (!vanId || !usuarioId) return;

    // Sync inicial si el cache tiene más de 12h
    const ultimoSync  = localStorage.getItem('ultimo_sync_completo');
    const hace12h     = Date.now() - 12 * 60 * 60 * 1000;
    const necesitaSync = !ultimoSync || new Date(ultimoSync).getTime() < hace12h;

    if (necesitaSync) {
      setTimeout(() => sincronizarTodo({ silencioso: true }), 3000);
    } else {
      setLastSync(ultimoSync);
      contarPendientes();
    }

    // Sync a las 8pm
    const ahora   = new Date();
    const hoy8pm  = new Date(); hoy8pm.setHours(20, 0, 0, 0);
    if (ahora >= hoy8pm) hoy8pm.setDate(hoy8pm.getDate() + 1);
    const ms8pm   = hoy8pm - ahora;

    timerRef.current = setTimeout(() => {
      sincronizarTodo({ silencioso: true });
      timerRef.current = setInterval(() => sincronizarTodo({ silencioso: true }), 24 * 3600 * 1000);
    }, ms8pm);

    // ── SYNC AUTOMÁTICO AL RECONECTAR ──────────────────────────
    const handleOnline = () => {
      console.log('🌐 [SyncGlobal] Reconectado — sincronizando ventas offline...');
      // Pequeño delay para que la conexión esté estable
      setTimeout(() => sincronizarTodo({ silencioso: false }), 1500);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(timerRef.current);
      window.removeEventListener('online', handleOnline);
    };
  }, [vanId, usuarioId, sincronizarTodo, contarPendientes]);

  // Cargar pendientes al montar
  useEffect(() => {
    obtenerFechaUltimoBackup().then(f => { if (f) setLastSync(f); });
    contarPendientes();
  }, [contarPendientes]);

  const value = {
    syncing,
    lastSync,
    ventasPendientes,
    syncError,
    sincronizarAhora: () => sincronizarTodo({ silencioso: false }),
    onSyncComplete,   // ← las vistas usan esto para auto-refresh
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
