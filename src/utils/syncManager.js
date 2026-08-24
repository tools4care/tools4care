// src/utils/syncManager.js
import { supabase } from '../supabaseClient';
import {
  marcarPagosSincronizados,
  marcarVentaSincronizada,
  migrarColasOfflineLegacy,
  obtenerPagosPendientes,
  obtenerVentasPendientes,
} from './offlineDB';
import { buildOfflinePaymentBatchRpc, groupOfflinePayments } from '../lib/offlineQueue';

async function fulfillVisitNotebookRequests(clientId, vanId) {
  if (!clientId || !vanId) return 0;
  const { data, error: loadError } = await supabase
    .from('visit_notebook_items')
    .select('id,visit_notebooks!inner(van_id)')
    .eq('cliente_id', clientId)
    .eq('sold', false)
    .eq('visit_notebooks.van_id', vanId);
  if (loadError) throw loadError;
  const ids = (data || []).map((item) => item.id).filter(Boolean);
  if (!ids.length) return 0;
  const { error: updateError } = await supabase
    .from('visit_notebook_items')
    .update({ sold: true, picked: true, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (updateError) throw updateError;
  return ids.length;
}

/**
 * Sincroniza todas las ventas pendientes con Supabase
 */
export async function sincronizarVentasPendientes() {
  console.log('🔄 Iniciando sincronización de ventas pendientes...');

  try {
    // Obtener ventas pendientes de IndexedDB
    await migrarColasOfflineLegacy();
    const ventasPendientes = await obtenerVentasPendientes();
    
    if (ventasPendientes.length === 0) {
      console.log('✅ No hay ventas pendientes para sincronizar');
      return {
        success: true,
        sincronizadas: 0,
        errores: 0,
        message: 'No hay ventas pendientes'
      };
    }

    console.log(`📦 Sincronizando ${ventasPendientes.length} venta(s)...`);

    let sincronizadas = 0;
    let errores = 0;
    const resultados = [];

    // Sincronizar cada venta
    for (const venta of ventasPendientes) {
      try {
        // All entries, including legacy ones, receive a persistent idempotency
        // key before any network request. Only the atomic RPC is allowed.
        if (venta.transaction_id) {
          const total = Number(venta.total_venta ?? venta.total ?? 0);
          const totalPaid = Number(venta.total_pagado ?? 0);
          const items = (venta.items || []).map((item) => {
            const base = Number(item.precio_unit ?? item.precio_unitario ?? 0);
            const pct = Number(item.descuento_pct ?? 0);
            const qty = Number(item.cantidad ?? 1);
            const finalUnit = pct > 0 ? base * (1 - pct / 100) : base;
            // Always derive from precio_unitario + descuento rather than
            // trusting a pre-existing item.subtotal — a stale value there
            // (from before a discount was applied) would get written to
            // detalle_ventas verbatim and never self-correct.
            return {
              producto_id: item.producto_id,
              cantidad: qty,
              precio_unitario: base,
              descuento: pct,
              subtotal: Number((finalUnit * qty).toFixed(2)),
            };
          });

          const { data: txRows, error: txError } = await supabase.rpc('guardar_venta_transaccional', {
            p_transaction_id: venta.transaction_id,
            p_cliente_id: venta.cliente_id ?? null,
            p_van_id: venta.van_id,
            p_usuario_id: venta.usuario_id,
            p_total: total,
            p_total_pagado: totalPaid,
            p_estado_pago: venta.estado_pago || 'pendiente',
            p_metodo_pago: venta.metodo_pago || null,
            p_pago: venta.pago || {},
            p_pago_efectivo: Number(venta.pago_efectivo || 0),
            p_pago_tarjeta: Number(venta.pago_tarjeta || 0),
            p_pago_transferencia: Number(venta.pago_transferencia || 0),
            p_pago_otro: Number(venta.pago_otro || 0),
            p_notas: venta.notas || '[OFFLINE SYNC]',
            p_items: items,
            p_deuda_nueva: venta.cliente_id ? Math.max(0, Number((total - totalPaid).toFixed(2))) : 0,
            p_pago_deuda_anterior: Number(venta.pago?.aplicado_deuda || 0),
            p_credito_favor_aplicado: Number(venta.pago?.credito_favor_aplicado || 0),
            p_credito_favor_a_deuda: Number(venta.pago?.credito_favor_aplicado_deuda || 0),
          });
          if (txError) throw txError;

          const syncedSaleId = txRows?.[0]?.venta_id;
          if (venta.store_cash_session_id && syncedSaleId) {
            const { error: registerError } = await supabase.rpc('attach_store_sale_to_session', {
              p_sale_id: syncedSaleId,
              p_session_id: venta.store_cash_session_id,
            });
            if (registerError) throw registerError;
          }

          await fulfillVisitNotebookRequests(
            venta.visit_notebook_client_id || venta.cliente_id,
            venta.van_id,
          );

          await marcarVentaSincronizada(venta._offline_id);
          sincronizadas++;
          resultados.push({ id: venta._offline_id, success: true, ventaId: syncedSaleId, atomic: true });
          continue;
        }

        throw new Error('Offline sale could not be assigned an idempotency key');

      } catch (error) {
        errores++;
        resultados.push({
          id: venta._offline_id,
          success: false,
          error: error.message
        });
        console.error(`❌ Error sincronizando venta ${venta._offline_id}:`, error);
      }
    }

    console.log(`✅ Sincronización completada: ${sincronizadas} exitosas, ${errores} errores`);

    return {
      success: errores === 0,
      sincronizadas,
      errores,
      resultados,
      message: `${sincronizadas} venta(s) sincronizada(s)${errores > 0 ? `, ${errores} error(es)` : ''}`
    };

  } catch (error) {
    console.error('❌ Error en sincronización:', error);
    return {
      success: false,
      sincronizadas: 0,
      errores: 1,
      error: error.message,
      message: 'Error al sincronizar ventas'
    };
  }
}

/**
 * Sincroniza todos los pagos pendientes offline con Supabase
 * Se llama automáticamente cuando vuelve la conexión
 */
export async function sincronizarPagosPendientes() {
  console.log('🔄 Iniciando sincronización de pagos pendientes...');

  try {
    await migrarColasOfflineLegacy();
    const pagosPendientes = await obtenerPagosPendientes();

    if (pagosPendientes.length === 0) {
      console.log('✅ No hay pagos pendientes para sincronizar');
      return { success: true, sincronizados: 0, errores: 0 };
    }

    console.log(`💳 Sincronizando ${pagosPendientes.length} pago(s) offline...`);

    let sincronizados = 0;
    let errores = 0;

    const paymentGroups = groupOfflinePayments(pagosPendientes);
    for (const group of paymentGroups) {
      try {
        const rpcPayload = buildOfflinePaymentBatchRpc(group);
        const { error: rpcError } = await supabase.rpc('record_split_ar_payment', rpcPayload);
        if (rpcError) throw rpcError;
        const removed = await marcarPagosSincronizados(group.parts.map((part) => part._offline_id));
        if (!removed) throw new Error('Payment reached Supabase but could not be removed from the local queue');
        sincronizados += group.parts.length;
        console.log(`✅ Lote offline ${group.batchId} sincronizado: ${group.parts.length} pago(s).`);

      } catch (error) {
        errores += group.parts.length;
        console.error(`❌ Error sincronizando lote ${group.batchId}:`, error);
      }
    }

    console.log(`✅ Pagos sync: ${sincronizados} exitosos, ${errores} errores`);
    return { success: errores === 0, sincronizados, errores };

  } catch (error) {
    console.error('❌ Error en sincronización de pagos:', error);
    return { success: false, sincronizados: 0, errores: 1, error: error.message };
  }
}
