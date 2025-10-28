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
// ==================== CACHE DE INVENTARIO (para ventas offline) ====================

export async function guardarInventarioVan(vanId, productos) {
  try {
    await localforage.setItem(`inventario_van_${vanId}`, {
      data: productos,
      timestamp: new Date().toISOString(),
      vanId
    });
    console.log(`✅ Inventario de van ${vanId} guardado en caché`);
  } catch (error) {
    console.error('Error guardando inventario de van:', error);
  }
}

export async function obtenerInventarioVan(vanId) {
  try {
    const cache = await localforage.getItem(`inventario_van_${vanId}`);
    if (cache?.data) {
      console.log(`📦 Inventario de van ${vanId} cargado desde caché`);
      return cache.data;
    }
    return [];
  } catch (error) {
    console.error('Error obteniendo inventario de van:', error);
    return [];
  }
}

export async function guardarTopProductos(vanId, productos) {
  try {
    await localforage.setItem(`top_productos_${vanId}`, {
      data: productos,
      timestamp: new Date().toISOString()
    });
    console.log(`✅ Top productos guardados en caché`);
  } catch (error) {
    console.error('Error guardando top productos:', error);
  }
}

export async function obtenerTopProductos(vanId) {
  try {
    const cache = await localforage.getItem(`top_productos_${vanId}`);
    return cache?.data || [];
  } catch (error) {
    console.error('Error obteniendo top productos:', error);
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