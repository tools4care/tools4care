// src/utils/offlineDB.js
import localforage from 'localforage';

// Configurar almacén local
localforage.config({
  name: 'tools4care',
  storeName: 'ventas_offline',
  description: 'Almacenamiento offline para ventas'
});

// ==================== VENTAS PENDIENTES ====================

export async function guardarVentaOffline(venta) {
  try {
    const ventasPendientes = await obtenerVentasPendientes();
    const nuevaVenta = {
      ...venta,
      _offline_id: Date.now(),
      _offline_timestamp: new Date().toISOString(),
      _sincronizada: false
    };
    ventasPendientes.push(nuevaVenta);
    await localforage.setItem('ventas_pendientes', ventasPendientes);
    return nuevaVenta;
  } catch (error) {
    console.error('Error guardando venta offline:', error);
    throw error;
  }
}

export async function obtenerVentasPendientes() {
  try {
    const ventas = await localforage.getItem('ventas_pendientes');
    return ventas || [];
  } catch (error) {
    console.error('Error obteniendo ventas pendientes:', error);
    return [];
  }
}

export async function marcarVentaSincronizada(offlineId) {
  try {
    const ventas = await obtenerVentasPendientes();
    const ventasActualizadas = ventas.filter(v => v._offline_id !== offlineId);
    await localforage.setItem('ventas_pendientes', ventasActualizadas);
    return true;
  } catch (error) {
    console.error('Error marcando venta sincronizada:', error);
    return false;
  }
}

// ==================== CACHE DE DATOS ====================

export async function guardarInventarioCache(inventario) {
  try {
    await localforage.setItem('cache_inventario', {
      data: inventario,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error guardando inventario en cache:', error);
  }
}

export async function obtenerInventarioCache() {
  try {
    const cache = await localforage.getItem('cache_inventario');
    return cache?.data || [];
  } catch (error) {
    console.error('Error obteniendo inventario de cache:', error);
    return [];
  }
}

export async function guardarClientesCache(clientes) {
  try {
    await localforage.setItem('cache_clientes', {
      data: clientes,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error guardando clientes en cache:', error);
  }
}

export async function obtenerClientesCache() {
  try {
    const cache = await localforage.getItem('cache_clientes');
    return cache?.data || [];
  } catch (error) {
    console.error('Error obteniendo clientes de cache:', error);
    return [];
  }
}

// ==================== LIMPIEZA ====================

export async function limpiarDatosOffline() {
  try {
    await localforage.clear();
    return true;
  } catch (error) {
    console.error('Error limpiando datos offline:', error);
    return false;
  }
}