// src/utils/syncManager.js
import { supabase } from '../supabase';
import { obtenerVentasPendientes, marcarVentaSincronizada } from './offlineDB';

// Sincroniza todas las ventas pendientes
export async function sincronizarVentasPendientes() {
  try {
    const ventasPendientes = await obtenerVentasPendientes();
    
    if (ventasPendientes.length === 0) {
      return { success: true, sincronizadas: 0, errores: 0 };
    }

    console.log(`🔄 Sincronizando ${ventasPendientes.length} ventas pendientes...`);

    let sincronizadas = 0;
    let errores = 0;
    const erroresDetalle = [];

    for (const venta of ventasPendientes) {
      try {
        // Remover campos temporales antes de subir
        const { _offline_id, _offline_timestamp, _sincronizada, ...ventaLimpia } = venta;

        // Insertar en Supabase
        const { error } = await supabase
          .from('ventas')
          .insert(ventaLimpia);

        if (error) throw error;

        // Marcar como sincronizada
        await marcarVentaSincronizada(_offline_id);
        sincronizadas++;
        console.log(`✅ Venta ${_offline_id} sincronizada`);

      } catch (error) {
        errores++;
        erroresDetalle.push({
          venta: venta._offline_id,
          error: error.message
        });
        console.error(`❌ Error sincronizando venta ${venta._offline_id}:`, error);
      }
    }

    const resultado = {
      success: errores === 0,
      sincronizadas,
      errores,
      erroresDetalle
    };

    console.log(`🎉 Sincronización completa: ${sincronizadas} OK, ${errores} errores`);
    return resultado;

  } catch (error) {
    console.error('❌ Error en sincronización:', error);
    return {
      success: false,
      sincronizadas: 0,
      errores: 1,
      erroresDetalle: [{ error: error.message }]
    };
  }
}

// Sincroniza una sola venta (para uso manual)
export async function sincronizarVenta(venta) {
  try {
    const { _offline_id, _offline_timestamp, _sincronizada, ...ventaLimpia } = venta;

    const { error } = await supabase
      .from('ventas')
      .insert(ventaLimpia);

    if (error) throw error;

    await marcarVentaSincronizada(_offline_id);
    return { success: true };

  } catch (error) {
    console.error('Error sincronizando venta:', error);
    return { success: false, error: error.message };
  }
}