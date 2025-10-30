import { supabase } from '../supabaseClient';

// Configuración por defecto
const crearConfiguracionPorDefecto = (vanId, vendedorId) => ({
  van_id: vanId,
  vendedor_id: vendedorId,
  comisiones_por_metodo: {
    efectivo: { porcentaje: 5, activo: true },
    tarjeta: { porcentaje: 3, activo: true },
    transferencia: { porcentaje: 4, activo: true },
    otro: { porcentaje: 2, activo: true }
  },
  salario_base: 500,
  bonos: [],
  descuentos: [],
  activo: true
});

export const ComisionesService = {
  // Obtener vans
  async obtenerVans() {
    try {
      const { data, error } = await supabase
        .from('vans')
        .select('*')
        .eq('activo', true)
        .order('nombre_van');
      
      console.log('🚐 Vans encontradas:', data);
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error obteniendo vans:', error);
      return { data: null, error };
    }
  },

  // Obtener vendedores
  async obtenerVendedores() {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, email, rol, activo')
        .in('rol', ['vendedor', 'admin'])
        .eq('activo', true)
        .order('nombre');
      
      console.log('👥 Usuarios encontrados:', data);
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error obteniendo vendedores:', error);
      return { data: null, error };
    }
  },

  // Obtener configuración
  async obtenerConfiguracion(vanId, vendedorId) {
    try {
      const { data, error } = await supabase
        .from('configuraciones_comisiones')
        .select('*')
        .eq('van_id', vanId)
        .eq('vendedor_id', vendedorId)
        .eq('activo', true)
        .single();

      if (error || !data) {
        const nuevaConfig = crearConfiguracionPorDefecto(vanId, vendedorId);
        const { data: configCreada, error: createError } = await supabase
          .from('configuraciones_comisiones')
          .insert(nuevaConfig)
          .select()
          .single();

        if (createError) throw createError;
        return { data: configCreada, error: null };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Error obteniendo configuración:', error);
      return { data: null, error };
    }
  },

  
// Obtener ventas en un rango de fechas
async obtenerVentasEnRango(vanId, vendedorId, fechaInicio, fechaFin) {
  try {
    const inicio = new Date(fechaInicio);
    inicio.setHours(0, 0, 0, 0);
    
    const fin = new Date(fechaFin);
    fin.setHours(23, 59, 59, 999);

    const { data: ventas, error } = await supabase
      .from('ventas')
      .select('*')
      .eq('van_id', vanId)
      .eq('usuario_id', vendedorId)
      .gte('fecha', inicio.toISOString())
      .lte('fecha', fin.toISOString());

    if (error) throw error;

    const totales = {
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      otro: 0
    };

    let totalVentas = 0;

    ventas.forEach(venta => {
      const efectivo = parseFloat(venta.pago_efectivo) || 0;
      const tarjeta = parseFloat(venta.pago_tarjeta) || 0;
      const transferencia = parseFloat(venta.pago_transferencia) || 0;
      const otro = parseFloat(venta.pago_otro) || 0;

      totales.efectivo += efectivo;
      totales.tarjeta += tarjeta;
      totales.transferencia += transferencia;
      totales.otro += otro;

      totalVentas += efectivo + tarjeta + transferencia + otro;
    });

    const desglosePorMetodo = {};
    Object.keys(totales).forEach(metodo => {
      desglosePorMetodo[metodo] = {
        ventas: ventas.length,
        monto: totales[metodo],
        porcentaje: totalVentas > 0 ? (totales[metodo] / totalVentas) * 100 : 0
      };
    });

    return {
      data: {
        vanId,
        vendedorId,
        fechaInicio,
        fechaFin,
        desglosePorMetodo,
        ventasTotales: totalVentas,
        numVentas: ventas.length
      },
      error: null
    };
  } catch (error) {
    console.error('Error obteniendo ventas:', error);
    return { data: null, error };
  }
},

  
// Calcular comisiones
async calcularComisiones(vanId, vendedorId, fechaInicio, fechaFin, ajustesManuales = {}) {
  try {
    const { data: configuracion, error: configError } = await this.obtenerConfiguracion(vanId, vendedorId);
    if (configError) throw configError;

    const { data: ventasEnRango, error: ventasError } = await this.obtenerVentasEnRango(vanId, vendedorId, fechaInicio, fechaFin);
    if (ventasError) throw ventasError;

    const comisionPorMetodo = {};
    let comisionTotal = 0;

    Object.keys(ventasEnRango.desglosePorMetodo).forEach(metodo => {
      const datos = ventasEnRango.desglosePorMetodo[metodo];
      const configMetodo = configuracion.comisiones_por_metodo[metodo];
      
      if (configMetodo && configMetodo.activo) {
        const comision = datos.monto * (configMetodo.porcentaje / 100);
        
        comisionPorMetodo[metodo] = {
          monto: datos.monto,
          porcentaje: configMetodo.porcentaje,
          comision: comision
        };
        
        comisionTotal += comision;
      }
    });

    const resultado = {
      fechaInicio,
      fechaFin,
      vendedor: vendedorId,
      van: vanId,
      desglosePorMetodo: ventasEnRango.desglosePorMetodo,
      ventasTotales: ventasEnRango.ventasTotales,
      numVentas: ventasEnRango.numVentas,
      comisionPorMetodo,
      comisionTotal,
      salarioBase: configuracion.salario_base,
      bonos: [],
      totalBonos: 0,
      descuentos: [],
      totalDescuentos: 0,
      totalAPagar: configuracion.salario_base + comisionTotal,
      estado: 'pendiente'
    };

    return { data: resultado, error: null };
  } catch (error) {
    console.error('Error calculando comisiones:', error);
    return { data: null, error };
  }
},

  // Guardar configuración
  async guardarConfiguracion(vanId, vendedorId, configuracion) {
    try {
      await supabase
        .from('configuraciones_comisiones')
        .update({ activo: false })
        .eq('van_id', vanId)
        .eq('vendedor_id', vendedorId);

      const { data, error } = await supabase
        .from('configuraciones_comisiones')
        .insert({
          van_id: vanId,
          vendedor_id: vendedorId,
          comisiones_por_metodo: configuracion.comisiones_por_metodo,
          salario_base: configuracion.salario_base,
          bonos: configuracion.bonos || [],
          descuentos: configuracion.descuentos || [],
          activo: true
        })
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error guardando configuración:', error);
      return { data: null, error };
    }
  },

// Guardar cálculo de comisión
async guardarCalculo(vanId, vendedorId, fechaInicio, fechaFin, resultado) {
  try {
    const { data, error } = await supabase
      .from('comisiones_calculadas')
      .insert({
        van_id: vanId,
        vendedor_id: vendedorId,
        fecha: fechaFin, // Usamos la fecha final como referencia
        ventas_totales: resultado.ventasTotales || 0,
        desglose_por_metodo: resultado.desglosePorMetodo || {},
        comision_por_metodo: resultado.comisionPorMetodo || {},
        comision_total: resultado.comisionTotal || 0,
        salario_base: resultado.salarioBase || 0,
        bonos: resultado.bonos || [],
        total_bonos: resultado.totalBonos || 0,
        descuentos: resultado.descuentos || [],
        total_descuentos: resultado.totalDescuentos || 0,
        total_a_pagar: resultado.totalAPagar || 0,
        detalle_completo: {
          fechaInicio,
          fechaFin,
          numVentas: resultado.numVentas || 0,
          configuracion: resultado.configuracion || null
        },
        estado: 'pendiente',
        fecha_creacion: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error guardando cálculo:', error);
    return { data: null, error };
  }
},
  // Aprobar pago
  async aprobarPago(comisionId) {
    try {
      const { data, error } = await supabase
        .from('comisiones_calculadas')
        .update({
          estado: 'aprobado',
          fecha_aprobacion: new Date().toISOString()
        })
        .eq('id', comisionId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error aprobando pago:', error);
      return { data: null, error };
    }
  }
};