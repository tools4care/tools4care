// src/hooks/usePendingSalesCloud.js
// =====================================================================
// Hook para sincronizar ventas pendientes entre dispositivos via Supabase
// Reemplaza el sistema de localStorage para pending sales
// =====================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useVan } from './VanContext';
import { useUsuario } from '../UsuarioContext';

// --------------- Helpers ---------------

/** Genera un ID único para este dispositivo/navegador */
function getDeviceId() {
  const KEY = 'tools4care_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `${getDeviceType()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Detecta tipo de dispositivo */
function getDeviceType() {
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/iPhone|Android.*Mobile|Mobile/i.test(ua)) return 'phone';
  return 'pc';
}

/** Calcula total estimado del carrito */
function calcTotal(cart) {
  if (!Array.isArray(cart)) return 0;
  return cart.reduce((sum, p) => sum + (p.cantidad || 0) * (p.precio_unitario || 0), 0);
}

// --------------- Hook Principal ---------------

export function usePendingSalesCloud() {

  const { van } = useVan();
  const { usuario } = useUsuario();

  const [pendingSales, setPendingSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const deviceId = useRef(getDeviceId()).current;
  const deviceType = useRef(getDeviceType()).current;
  const subscriptionRef = useRef(null);

  // ===================== FETCH =====================
  
  const fetchPendingSales = useCallback(async () => {
    if (!van?.id || !usuario?.id) {
      setPendingSales([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchErr } = await supabase
        .from('ventas_pendientes')
        .select('*')
        .eq('van_id', van.id)
        .in('estado', ['preparada', 'en_progreso'])
        .order('updated_at', { ascending: false })
        .limit(20);

      if (fetchErr) throw fetchErr;
      setPendingSales(data || []);
      setError(null);
    } catch (err) {
      console.error('❌ Error fetching pending sales:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [van?.id, usuario?.id]);

  // ===================== REALTIME =====================

  useEffect(() => {
    if (!van?.id) return;

    // Fetch inicial
    fetchPendingSales();

    // Suscripción realtime
    const channel = supabase
      .channel(`pending_sales_${van.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ventas_pendientes',
          filter: `van_id=eq.${van.id}`,
        },
        (payload) => {
          console.log('🔔 Realtime pending sale update:', payload.eventType);
          
          setPendingSales(prev => {
            const { eventType, new: newRow, old: oldRow } = payload;
            
            if (eventType === 'INSERT') {
              // Solo agregar si no está ya y está activa
              if (['preparada', 'en_progreso'].includes(newRow.estado)) {
                const exists = prev.some(s => s.id === newRow.id);
                if (!exists) return [newRow, ...prev];
              }
              return prev;
            }
            
            if (eventType === 'UPDATE') {
              // Si se completó/canceló, quitarla
              if (['completada', 'cancelada'].includes(newRow.estado)) {
                return prev.filter(s => s.id !== newRow.id);
              }
              // Si no, actualizar
              return prev.map(s => s.id === newRow.id ? newRow : s);
            }
            
            if (eventType === 'DELETE') {
              return prev.filter(s => s.id !== (oldRow?.id ?? newRow?.id));
            }
            
            return prev;
          });
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      channel.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [van?.id, usuario?.id]);

  // Refrescar cuando la ventana recibe foco
  useEffect(() => {
    const onFocus = () => fetchPendingSales();
    const onVisible = () => { if (!document.hidden) fetchPendingSales(); };
    
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchPendingSales]);

  // ===================== CREAR (desde PC) =====================

  const createPendingSale = useCallback(async ({
    client,
    cart = [],
    payments = [{ forma: 'efectivo', monto: 0 }],
    notes = '',
    step = 1,
  }) => {
    if (!van?.id || !usuario?.id) {
      throw new Error('Van o usuario no disponibles');
    }

    const totalEstimado = calcTotal(cart);

    const record = {
      usuario_id: usuario.id,
      van_id: van.id,
      dispositivo: deviceType,
      dispositivo_id: deviceId,
      estado: 'preparada',
      cliente_id: client?.id || null,
      cliente_data: {
        id: client?.id,
        nombre: client?.nombre,
        apellido: client?.apellido,
        telefono: client?.telefono,
        email: client?.email,
        negocio: client?.negocio,
        direccion: client?.direccion,
        balance: client?.balance || client?._saldo_real || 0,
      },
      cart,
      payments,
      notes,
      step: Math.min(step, 3),
      total_estimado: totalEstimado,
    };

    const { data, error: insertErr } = await supabase
      .from('ventas_pendientes')
      .insert([record])
      .select()
      .single();

    if (insertErr) throw insertErr;

    console.log(`✅ Venta pendiente creada: ${data.id} desde ${deviceType}`);
    return data;
  }, [van?.id, usuario?.id, deviceType, deviceId]);

  // ===================== ACTUALIZAR =====================

  const updatePendingSale = useCallback(async (id, updates) => {
    const updateData = { ...updates };
    
    // Recalcular total si viene carrito
    if (updates.cart) {
      updateData.total_estimado = calcTotal(updates.cart);
    }
    
    // Serializar cliente si viene
    if (updates.client) {
      updateData.cliente_id = updates.client?.id || null;
      updateData.cliente_data = {
        id: updates.client?.id,
        nombre: updates.client?.nombre,
        apellido: updates.client?.apellido,
        telefono: updates.client?.telefono,
        email: updates.client?.email,
        negocio: updates.client?.negocio,
        direccion: updates.client?.direccion,
        balance: updates.client?.balance || updates.client?._saldo_real || 0,
      };
      delete updateData.client;
    }

    const { data, error: updateErr } = await supabase
      .from('ventas_pendientes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;
    return data;
  }, []);

  // ===================== UPSERT (crear o actualizar) =====================

  const upsertPendingSale = useCallback(async (existingId, saleData) => {
    if (existingId) {
      try {
        return await updatePendingSale(existingId, saleData);
      } catch (err) {
        console.warn('Update failed, creating new:', err.message);
      }
    }
    return await createPendingSale(saleData);
  }, [updatePendingSale, createPendingSale]);

  // ===================== TOMAR (desde teléfono) =====================

  const takePendingSale = useCallback(async (id) => {
    try {
      const { data, error: rpcErr } = await supabase.rpc('tomar_venta_pendiente', {
        p_id: id,
        p_dispositivo: deviceId,
      });

      if (rpcErr) throw rpcErr;
      
      if (!data?.ok) {
        throw new Error(data?.error || 'No se pudo tomar la venta');
      }

      console.log(`📱 Venta ${id} tomada por ${deviceType} (${deviceId})`);
      
      // Devolver la venta completa
      const sale = pendingSales.find(s => s.id === id);
      return sale;
    } catch (err) {
      console.error('Error tomando venta:', err);
      throw err;
    }
  }, [deviceId, deviceType, pendingSales]);

  // ===================== FORZAR TOMA (Desbloquear) =====================
  // Esta función ignora si está bloqueada por otro dispositivo y asigna el bloqueo al actual
  const forceTakePendingSale = useCallback(async (id) => {
    try {
      // Actualizamos directamente para forzar el bloqueo a este dispositivo
      const { data, error } = await supabase
        .from('ventas_pendientes')
        .update({
          locked_by: deviceId,
          locked_at: new Date().toISOString(),
          estado: 'en_progreso' // Aseguramos que pase a progreso
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Actualizamos el estado local inmediatamente para que la UI reaccione
      setPendingSales(prev => prev.map(s => s.id === id ? data : s));

      console.log(`🔓 Venta ${id} desbloqueada y tomada forzosamente por ${deviceType} (${deviceId})`);
      return data;
    } catch (err) {
      console.error('Error forzando toma de venta:', err);
      throw err;
    }
  }, [deviceId, deviceType]);

  // ===================== LIBERAR =====================

  const releasePendingSale = useCallback(async (id) => {
    try {
      const { error: rpcErr } = await supabase.rpc('liberar_venta_pendiente', {
        p_id: id,
        p_dispositivo: deviceId,
      });
      if (rpcErr) throw rpcErr;
      console.log(`🔓 Venta ${id} liberada`);
    } catch (err) {
      console.error('Error liberando venta:', err);
    }
  }, [deviceId]);

  // ===================== COMPLETAR =====================

  const completePendingSale = useCallback(async (id, ventaId = null) => {
    const { error: updateErr } = await supabase
      .from('ventas_pendientes')
      .update({
        estado: 'completada',
        venta_id: ventaId,
        locked_by: null,
        locked_at: null,
      })
      .eq('id', id);

    if (updateErr) {
      console.error('Error completando venta pendiente:', updateErr);
    } else {
      console.log(`✅ Venta pendiente ${id} completada → venta real ${ventaId}`);
    }
  }, []);

  // ===================== CANCELAR / ELIMINAR =====================

  const cancelPendingSale = useCallback(async (id) => {
    const { error: delErr } = await supabase
      .from('ventas_pendientes')
      .update({ estado: 'cancelada' })
      .eq('id', id);

    if (delErr) {
      console.error('Error cancelando venta pendiente:', delErr);
      throw delErr;
    }
    console.log(`🗑️ Venta pendiente ${id} cancelada`);
  }, []);

  const deletePendingSale = useCallback(async (id) => {
    const { error: delErr } = await supabase
      .from('ventas_pendientes')
      .delete()
      .eq('id', id);

    if (delErr) throw delErr;
    console.log(`🗑️ Venta pendiente ${id} eliminada`);
  }, []);

  // ===================== INFO DEL DISPOSITIVO =====================

  const deviceInfo = {
    id: deviceId,
    type: deviceType,
    isPC: deviceType === 'pc',
    isPhone: deviceType === 'phone',
    isTablet: deviceType === 'tablet',
  };

  // ===================== STATS =====================

  const stats = {
    total: pendingSales.length,
    preparadas: pendingSales.filter(s => s.estado === 'preparada').length,
    enProgreso: pendingSales.filter(s => s.estado === 'en_progreso').length,
    myCreated: pendingSales.filter(s => s.dispositivo_id === deviceId).length,
    lockedByMe: pendingSales.filter(s => s.locked_by === deviceId).length,
  };

  return {
    // Data
    pendingSales,
    loading,
    error,
    stats,
    deviceInfo,
    
    // Actions
    createPendingSale,
    updatePendingSale,
    upsertPendingSale,
    takePendingSale,
    releasePendingSale,
    completePendingSale,
    cancelPendingSale,
    deletePendingSale,
    forceTakePendingSale, // <--- AGREGADO: Función para desbloquear y retomar
    refresh: fetchPendingSales,
  };
}