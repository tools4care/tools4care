import { useState, useEffect } from 'react';
import { ComisionesService } from '../../lib/comisiones-service';

function ComisionesAdmin() {
  const [vans, setVans] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  
  const [vanSeleccionada, setVanSeleccionada] = useState('');
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  
  const [configuracion, setConfiguracion] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    console.log('🔄 Cargando datos iniciales...');
    const { data: vansData } = await ComisionesService.obtenerVans();
    const { data: vendedoresData } = await ComisionesService.obtenerVendedores();
    
    if (vansData) {
      console.log('✅ Vans cargadas:', vansData);
      setVans(vansData);
    }
    if (vendedoresData) {
      console.log('✅ Vendedores cargados:', vendedoresData);
      setVendedores(vendedoresData);
    }
  };

  const cargarDatos = async () => {
    if (!vanSeleccionada || !vendedorSeleccionado) {
      setMensaje('❌ Selecciona una van y un vendedor');
      setTimeout(() => setMensaje(''), 3000);
      return;
    }

    setCargando(true);
    setMensaje('');
    
    try {
      console.log('🔄 Obteniendo configuración...');
      const { data: config, error: configError } = await ComisionesService.obtenerConfiguracion(
        vanSeleccionada,
        vendedorSeleccionado
      );
      
      if (configError) {
        console.error('Error configuración:', configError);
        throw new Error('Error al obtener configuración: ' + configError.message);
      }
      
      console.log('✅ Configuración obtenida:', config);
      setConfiguracion(config);

      console.log('🔄 Calculando comisiones...');
      const { data: comision, error: calcError } = await ComisionesService.calcularComisiones(
        vanSeleccionada,
        vendedorSeleccionado,
        fecha,
        {}
      );
      
      if (calcError) {
        console.error('Error cálculo:', calcError);
        throw new Error('Error al calcular comisiones: ' + calcError.message);
      }
      
      console.log('✅ Comisiones calculadas:', comision);
      setResultado(comision);
      setMensaje('✅ Datos cargados exitosamente');
      setTimeout(() => setMensaje(''), 3000);

    } catch (error) {
      console.error('❌ Error general:', error);
      setMensaje('❌ Error: ' + error.message);
      setTimeout(() => setMensaje(''), 5000);
    } finally {
      setCargando(false);
    }
  };

  const actualizarPorcentaje = async (metodo, nuevoValor) => {
    if (!configuracion) return;

    console.log(`🔄 Actualizando ${metodo} a ${nuevoValor}%`);
    
    const nuevaConfig = {
      ...configuracion,
      comisiones_por_metodo: {
        ...configuracion.comisiones_por_metodo,
        [metodo]: {
          ...configuracion.comisiones_por_metodo[metodo],
          porcentaje: parseFloat(nuevoValor) || 0
        }
      }
    };
    
    setConfiguracion(nuevaConfig);
    
    // Recalcular con nueva configuración
    try {
      const { data: comision } = await ComisionesService.calcularComisiones(
        vanSeleccionada,
        vendedorSeleccionado,
        fecha,
        {}
      );
      
      if (comision) {
        // Recalcular comisiones manualmente con nuevos porcentajes
        const comisionPorMetodo = {};
        let comisionTotal = 0;

        Object.keys(comision.desglosePorMetodo).forEach(m => {
          const datos = comision.desglosePorMetodo[m];
          const configMetodo = nuevaConfig.comisiones_por_metodo[m];
          
          if (configMetodo && configMetodo.activo) {
            const com = datos.monto * (configMetodo.porcentaje / 100);
            
            comisionPorMetodo[m] = {
              monto: datos.monto,
              porcentaje: configMetodo.porcentaje,
              comision: com
            };
            
            comisionTotal += com;
          }
        });

        setResultado({
          ...comision,
          comisionPorMetodo,
          comisionTotal,
          totalAPagar: nuevaConfig.salario_base + comisionTotal
        });
      }
    } catch (error) {
      console.error('Error al recalcular:', error);
    }
  };

  const guardarConfiguracion = async () => {
    if (!configuracion) {
      setMensaje('❌ No hay configuración para guardar');
      setTimeout(() => setMensaje(''), 3000);
      return;
    }

    try {
      console.log('💾 Guardando configuración...');
      const { error } = await ComisionesService.guardarConfiguracion(
        vanSeleccionada,
        vendedorSeleccionado,
        configuracion
      );
      
      if (error) throw error;
      setMensaje('✅ Configuración guardada exitosamente');
      setTimeout(() => setMensaje(''), 3000);
    } catch (error) {
      console.error('Error al guardar:', error);
      setMensaje('❌ Error al guardar: ' + error.message);
      setTimeout(() => setMensaje(''), 3000);
    }
  };

  const aprobarPago = async () => {
    if (!resultado?.id) {
      setMensaje('❌ No hay comisión para aprobar');
      setTimeout(() => setMensaje(''), 3000);
      return;
    }

    if (!window.confirm('¿Estás seguro de aprobar este pago?')) return;
    
    try {
      const { error } = await ComisionesService.aprobarPago(resultado.id);
      if (error) throw error;
      
      setMensaje('✅ Pago aprobado exitosamente');
      setResultado({ ...resultado, estado: 'aprobado' });
      setTimeout(() => setMensaje(''), 3000);
    } catch (error) {
      console.error('Error al aprobar:', error);
      setMensaje('❌ Error al aprobar: ' + error.message);
      setTimeout(() => setMensaje(''), 3000);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      {/* Mensaje de estado */}
      {mensaje && (
        <div className={`mb-4 p-4 rounded-lg font-medium ${
          mensaje.includes('❌') 
            ? 'bg-red-100 text-red-700 border border-red-300' 
            : 'bg-green-100 text-green-700 border border-green-300'
        }`}>
          {mensaje}
        </div>
      )}

      {/* Panel de selección */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          🎯 Configuración de Comisiones
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Van</label>
            <select 
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={vanSeleccionada}
              onChange={(e) => setVanSeleccionada(e.target.value)}
            >
              <option value="">Seleccionar van...</option>
              {vans.map(van => (
                <option key={van.id} value={van.id}>
                  {van.nombre_van || van.nombre || `Van ${van.id}`}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Vendedor</label>
            <select 
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={vendedorSeleccionado}
              onChange={(e) => setVendedorSeleccionado(e.target.value)}
            >
              <option value="">Seleccionar vendedor...</option>
              {vendedores.map(vendedor => (
                <option key={vendedor.id} value={vendedor.id}>
                  {vendedor.nombre || vendedor.email}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Fecha</label>
            <input 
              type="date"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        </div>
        
        <button 
          onClick={cargarDatos}
          disabled={cargando}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium transition-colors"
        >
          {cargando ? '⏳ Cargando...' : '🔄 Cargar Datos'}
        </button>
      </div>

      {/* Resultados */}
      {resultado && configuracion && (
        <>
          {/* Resumen de ventas */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">📊 Resumen de Ventas</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-4 font-semibold">Método</th>
                    <th className="text-right p-4 font-semibold">Monto Vendido</th>
                    <th className="text-center p-4 font-semibold">Comisión %</th>
                    <th className="text-right p-4 font-semibold">Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(resultado.desglosePorMetodo || {}).map(metodo => {
                    const datos = resultado.desglosePorMetodo[metodo];
                    const comision = resultado.comisionPorMetodo?.[metodo];
                    
                    return (
                      <tr key={metodo} className="border-t hover:bg-gray-50">
                        <td className="p-4 capitalize font-medium text-gray-700">{metodo}</td>
                        <td className="p-4 text-right">
                          <span className="font-semibold text-gray-900">
                            ${datos?.monto?.toFixed(2) || '0.00'}
                          </span>
                          <span className="text-sm text-gray-500 ml-2">
                            ({datos?.porcentaje?.toFixed(1) || '0'}% del total)
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <input 
                            type="number"
                            step="0.5"
                            min="0"
                            max="100"
                            className="w-20 border border-gray-300 rounded px-2 py-1 text-center focus:ring-2 focus:ring-blue-500"
                            value={configuracion?.comisiones_por_metodo?.[metodo]?.porcentaje || 0}
                            onChange={(e) => actualizarPorcentaje(metodo, e.target.value)}
                          />
                          <span className="ml-1 text-gray-600">%</span>
                        </td>
                        <td className="p-4 text-right font-semibold text-green-600 text-lg">
                          ${comision?.comision?.toFixed(2) || '0.00'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 font-bold bg-blue-50">
                    <td className="p-4 text-gray-900">TOTAL</td>
                    <td className="p-4 text-right text-blue-600 text-lg">
                      ${resultado.ventasTotales?.toFixed(2) || '0.00'}
                    </td>
                    <td className="p-4"></td>
                    <td className="p-4 text-right text-green-600 text-lg">
                      ${resultado.comisionTotal?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Cálculo final */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">💰 Cálculo Final de Pago</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700 font-medium">Comisiones totales:</span>
                <span className="font-semibold text-lg text-green-600">
                  ${resultado.comisionTotal?.toFixed(2) || '0.00'}
                </span>
              </div>
              
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-gray-700 font-medium">Salario base:</span>
                <span className="font-semibold text-lg text-green-600">
                  +${resultado.salarioBase?.toFixed(2) || configuracion.salario_base?.toFixed(2) || '0.00'}
                </span>
              </div>

              <div className="pt-4 border-t-2 border-gray-300">
                <div className="flex justify-between items-center p-4 bg-blue-100 rounded-lg">
                  <span className="text-2xl font-bold text-gray-900">💵 TOTAL A PAGAR:</span>
                  <span className="text-3xl font-bold text-blue-600">
                    ${resultado.totalAPagar?.toFixed(2) || '0.00'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 p-3 bg-gray-100 rounded-lg">
                <span className="text-sm text-gray-600">Estado:</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  resultado.estado === 'pendiente' 
                    ? 'bg-yellow-100 text-yellow-800' 
                    : resultado.estado === 'aprobado'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {resultado.estado?.toUpperCase() || 'PENDIENTE'}
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <button 
                onClick={guardarConfiguracion}
                className="bg-gray-600 text-white px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors font-medium"
              >
                💾 Guardar Configuración
              </button>
              <button 
                onClick={() => window.print()}
                className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                📄 Imprimir Reporte
              </button>
              <button 
                onClick={aprobarPago}
                disabled={resultado.estado !== 'pendiente'}
                className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                ✅ {resultado.estado === 'aprobado' ? 'Ya Aprobado' : 'Aprobar Pago'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Mensaje cuando no hay datos */}
      {!resultado && !cargando && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            Selecciona los datos para comenzar
          </h3>
          <p className="text-gray-500">
            Elige una van, un vendedor y una fecha para calcular las comisiones
          </p>
        </div>
      )}
    </div>
  );
}

export default ComisionesAdmin;