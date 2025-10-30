export class CalculadoraComisionesFlexible {
  constructor(configuracion) {
    this.config = configuracion;
  }

  calcularComisionDiaria(ventasDelDia, ajustesManuales = {}) {
    const resultado = {
      fecha: ventasDelDia.fecha,
      vendedor: ventasDelDia.vendedorId,
      van: ventasDelDia.vanId,
      desglosePorMetodo: {},
      ventasTotales: 0,
      comisionPorMetodo: {},
      comisionTotal: 0,
      salarioBase: this.config.salarioBase,
      bonos: [],
      totalBonos: 0,
      descuentos: [],
      totalDescuentos: 0,
      totalAPagar: 0,
      detalleCompleto: []
    };

    this.calcularTotalesPorMetodo(ventasDelDia, resultado);
    this.calcularComisionesPorMetodo(resultado);
    
    resultado.detalleCompleto.push({
      categoria: 'base',
      concepto: 'Salario base garantizado',
      calculo: 'Fijo diario',
      monto: resultado.salarioBase
    });

    this.evaluarBonos(ventasDelDia, resultado, ajustesManuales);
    this.aplicarDescuentos(resultado, ajustesManuales);

    resultado.totalAPagar = 
      resultado.comisionTotal +
      resultado.salarioBase +
      resultado.totalBonos -
      resultado.totalDescuentos;

    return resultado;
  }

  calcularTotalesPorMetodo(ventasDelDia, resultado) {
    Object.keys(ventasDelDia.ventasPorMetodo).forEach(metodo => {
      const ventas = ventasDelDia.ventasPorMetodo[metodo];
      const total = ventas.reduce((sum, venta) => sum + venta.monto, 0);
      
      resultado.desglosePorMetodo[metodo] = {
        ventas: ventas.length,
        monto: total,
        porcentaje: 0
      };
      
      resultado.ventasTotales += total;
    });

    Object.keys(resultado.desglosePorMetodo).forEach(metodo => {
      resultado.desglosePorMetodo[metodo].porcentaje = 
        (resultado.desglosePorMetodo[metodo].monto / resultado.ventasTotales) * 100;
    });
  }

  calcularComisionesPorMetodo(resultado) {
    Object.keys(resultado.desglosePorMetodo).forEach(metodo => {
      const configMetodo = this.config.comisionesPorMetodo[metodo];
      
      if (configMetodo && configMetodo.activo) {
        const monto = resultado.desglosePorMetodo[metodo].monto;
        const comision = monto * (configMetodo.porcentaje / 100);
        
        resultado.comisionPorMetodo[metodo] = {
          monto: monto,
          porcentaje: configMetodo.porcentaje,
          comision: comision
        };
        
        resultado.comisionTotal += comision;
        
        resultado.detalleCompleto.push({
          categoria: 'comision',
          concepto: `Comisión ${metodo}`,
          calculo: `$${monto.toFixed(2)} × ${configMetodo.porcentaje}%`,
          monto: comision
        });
      }
    });
  }

  evaluarBonos(ventasDelDia, resultado, ajustesManuales) {
    this.config.bonos.forEach(bono => {
      if (!bono.activo) return;

      let cumpleCondicion = false;
      let valorActual = 0;

      switch(bono.tipo) {
        case 'meta_ventas':
          valorActual = resultado.ventasTotales;
          cumpleCondicion = valorActual >= bono.condicion.valor;
          break;

        case 'porcentaje_efectivo':
          const montoEfectivo = resultado.desglosePorMetodo.efectivo?.monto || 0;
          valorActual = (montoEfectivo / resultado.ventasTotales) * 100;
          cumpleCondicion = valorActual >= bono.condicion.valor;
          break;

        case 'clientes_nuevos':
          valorActual = ventasDelDia.metadatos?.clientesNuevos || 0;
          cumpleCondicion = valorActual >= bono.condicion.valor;
          break;
      }

      if (cumpleCondicion) {
        resultado.bonos.push({
          nombre: bono.nombre,
          monto: bono.monto,
          cumplido: true
        });
        resultado.totalBonos += bono.monto;
        
        resultado.detalleCompleto.push({
          categoria: 'bono',
          concepto: bono.nombre,
          calculo: `Condición cumplida: ${valorActual.toFixed(1)}`,
          monto: bono.monto
        });
      }
    });
  }

  aplicarDescuentos(resultado, ajustesManuales) {
    this.config.descuentos.forEach(descuento => {
      if (!descuento.activo) return;

      let montoDescuento = 0;

      if (descuento.tipo === 'fijo') {
        montoDescuento = descuento.montoFijo;
      } else if (descuento.tipo === 'manual') {
        montoDescuento = ajustesManuales.descuentos?.[descuento.id] || 0;
      }

      if (montoDescuento > 0) {
        resultado.descuentos.push({
          nombre: descuento.nombre,
          monto: montoDescuento
        });
        resultado.totalDescuentos += montoDescuento;
        
        resultado.detalleCompleto.push({
          categoria: 'descuento',
          concepto: descuento.nombre,
          calculo: descuento.tipo === 'fijo' ? 'Fijo' : 'Manual',
          monto: -montoDescuento
        });
      }
    });
  }
}