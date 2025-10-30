import { useState, useEffect } from 'react';
import { useUsuario } from '../UsuarioContext';
import { ComisionesService } from '../lib/comisiones-service';

export default function ComisionesPage() {
  const { usuario } = useUsuario();
  const [vans, setVans] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  
  const [vanSeleccionada, setVanSeleccionada] = useState('');
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState('');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
  const [fechaFin, setFechaFin] = useState(new Date().toISOString().split('T')[0]);
  
  const [configuracion, setConfiguracion] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  
  const [ajustesManuales, setAjustesManuales] = useState({
    descuentos: {}
  });

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    const { data: vansData } = await ComisionesService.obtenerVans();
    const { data: vendedoresData } = await ComisionesService.obtenerVendedores();
    
    if (vansData) setVans(vansData);
    if (vendedoresData) setVendedores(vendedoresData);
  };

  const recalcularLocal = (configActualizada = configuracion) => {
    if (!resultado || !configActualizada) return;

    const comisionPorMetodo = {};
    let comisionTotal = 0;

    Object.keys(resultado.desglosePorMetodo).forEach(metodo => {
      const datos = resultado.desglosePorMetodo[metodo];
      const configMetodo = configActualizada.comisiones_por_metodo[metodo];
      
      if (configMetodo && configMetodo.activo) {
        const comision = datos.monto * (configMetodo.porcentaje / 100);
        
        comisionPorMetodo[metodo] = {
          monto: datos.monto,
          porcentaje: configMetodo.porcentaje,
          comision: comision
        };
        
        comisionTotal += comision;
      } else {
        comisionPorMetodo[metodo] = {
          monto: datos.monto,
          porcentaje: 0,
          comision: 0
        };
      }
    });

    let totalDescuentos = 0;
    if (configActualizada.descuentos) {
      configActualizada.descuentos.filter(d => d.activo).forEach(descuento => {
        if (descuento.tipo === 'manual') {
          totalDescuentos += parseFloat(ajustesManuales.descuentos[descuento.id] || 0);
        } else {
          totalDescuentos += parseFloat(descuento.montoFijo || 0);
        }
      });
    }

    const nuevoResultado = {
      ...resultado,
      comisionPorMetodo,
      comisionTotal,
      salarioBase: configActualizada.salario_base || 0,
      totalDescuentos,
      totalAPagar: (configActualizada.salario_base || 0) + comisionTotal - totalDescuentos
    };

    setResultado(nuevoResultado);
  };

  const cargarDatos = async () => {
    if (!vanSeleccionada || !vendedorSeleccionado) {
      alert('Select a van and a seller');
      return;
    }

    setCargando(true);
    
    try {
      const { data: config, error: configError } = await ComisionesService.obtenerConfiguracion(
        vanSeleccionada,
        vendedorSeleccionado
      );
      
      if (configError) throw configError;
      setConfiguracion(config);

      const { data: comision, error: calcError } = await ComisionesService.calcularComisiones(
        vanSeleccionada,
        vendedorSeleccionado,
        fechaInicio,
        fechaFin,
        ajustesManuales
      );
      
      if (calcError) throw calcError;
      setResultado(comision);

    } catch (error) {
      console.error('Error:', error);
      alert('Error loading data: ' + error.message);
    } finally {
      setCargando(false);
    }
  };

  const actualizarPorcentaje = async (metodo, nuevoValor) => {
    const nuevaConfig = { ...configuracion };
    nuevaConfig.comisiones_por_metodo[metodo].porcentaje = parseFloat(nuevoValor);
    setConfiguracion(nuevaConfig);
    
    recalcularLocal(nuevaConfig);
  };

  const actualizarDescuento = async (idDescuento, valor) => {
    const nuevosAjustes = {
      ...ajustesManuales,
      descuentos: {
        ...ajustesManuales.descuentos,
        [idDescuento]: parseFloat(valor) || 0
      }
    };
    setAjustesManuales(nuevosAjustes);
    
    if (configuracion) {
      recalcularConAjustes(configuracion, nuevosAjustes);
    }
  };

  const recalcular = async (configActualizada = configuracion) => {
    try {
      const { data, error } = await ComisionesService.calcularComisiones(
        vanSeleccionada,
        vendedorSeleccionado,
        fechaInicio,
        fechaFin,
        ajustesManuales,
        configActualizada
      );
      
      if (error) throw error;
      setResultado(data);
    } catch (error) {
      console.error('Error recalculating:', error);
    }
  };

  const recalcularConAjustes = async (config, ajustes) => {
    try {
      const { data, error } = await ComisionesService.calcularComisiones(
        vanSeleccionada,
        vendedorSeleccionado,
        fechaInicio,
        fechaFin,
        ajustes,
        config
      );
      
      if (error) throw error;
      setResultado(data);
    } catch (error) {
      console.error('Error recalculating:', error);
    }
  };

  const guardarConfiguracion = async () => {
    try {
      const { error } = await ComisionesService.guardarConfiguracion(
        vanSeleccionada,
        vendedorSeleccionado,
        configuracion
      );
      
      if (error) throw error;
      alert('✅ Configuration saved successfully');
    } catch (error) {
      alert('❌ Error saving: ' + error.message);
    }
  };

  const aprobarPago = async () => {
    if (!window.confirm('Are you sure you want to approve this payment?')) return;
    
    try {
      if (!resultado.id) {
        const { data: guardado, error: guardarError } = await ComisionesService.guardarCalculo(
          vanSeleccionada,
          vendedorSeleccionado,
          fechaInicio,
          fechaFin,
          resultado
        );
        
        if (guardarError) throw guardarError;
        setResultado({ ...resultado, id: guardado.id });
        
        const { error } = await ComisionesService.aprobarPago(guardado.id);
        if (error) throw error;
        
        alert('✅ Payment approved');
        setResultado({ ...resultado, id: guardado.id, estado: 'aprobado' });
      } else {
        const { error } = await ComisionesService.aprobarPago(resultado.id);
        if (error) throw error;
        
        alert('✅ Payment approved');
        setResultado({ ...resultado, estado: 'aprobado' });
      }
    } catch (error) {
      alert('❌ Error approving: ' + error.message);
    }
  };

  const generarReporte = () => {
    const ventana = window.open('', '_blank');
    const fechaActual = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const vanNombre = vans.find(v => v.id === vanSeleccionada)?.nombre_van || 'N/A';
    const vendedorNombre = vendedores.find(v => v.id === vendedorSeleccionado)?.nombre || 'N/A';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Commission Report - ${vendedorNombre}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #333;
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .header h1 {
            color: #2563eb;
            margin: 0;
            font-size: 28px;
          }
          .info-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
            background: #f3f4f6;
            padding: 20px;
            border-radius: 8px;
          }
          .info-item {
            margin-bottom: 10px;
          }
          .info-label {
            font-weight: bold;
            color: #4b5563;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          th {
            background: #2563eb;
            color: white;
            padding: 12px;
            text-align: left;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #e5e7eb;
          }
          tr:nth-child(even) {
            background: #f9fafb;
          }
          .text-right {
            text-align: right;
          }
          .text-center {
            text-align: center;
          }
          .total-row {
            background: #dbeafe !important;
            font-weight: bold;
            font-size: 16px;
          }
          .calculo-final {
            background: #f3f4f6;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .calculo-item {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #d1d5db;
          }
          .calculo-total {
            display: flex;
            justify-content: space-between;
            padding: 15px 0;
            font-size: 24px;
            font-weight: bold;
            color: #2563eb;
            border-top: 3px solid #2563eb;
            margin-top: 10px;
          }
          .footer {
            text-align: center;
            color: #6b7280;
            font-size: 12px;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
          }
          .comision-positiva {
            color: #059669;
            font-weight: bold;
          }
          @media print {
            body { margin: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 COMMISSION REPORT</h1>
          <p>Generated on ${fechaActual}</p>
        </div>

        <div class="info-section">
          <div>
            <div class="info-item">
              <span class="info-label">Seller:</span> ${vendedorNombre}
            </div>
            <div class="info-item">
              <span class="info-label">Van:</span> ${vanNombre}
            </div>
          </div>
          <div>
            <div class="info-item">
              <span class="info-label">Start Date:</span> ${new Date(fechaInicio).toLocaleDateString('en-US')}
            </div>
            <div class="info-item">
              <span class="info-label">End Date:</span> ${new Date(fechaFin).toLocaleDateString('en-US')}
            </div>
            <div class="info-item">
              <span class="info-label">Period Days:</span> ${Math.ceil((new Date(fechaFin) - new Date(fechaInicio)) / (1000 * 60 * 60 * 24)) + 1}
            </div>
          </div>
        </div>

        <h2>💰 Sales Summary by Payment Method</h2>
        <table>
          <thead>
            <tr>
              <th>Payment Method</th>
              <th class="text-right">Amount</th>
              <th class="text-center">% of Total</th>
              <th class="text-center">Commission %</th>
              <th class="text-right">Commission Earned</th>
            </tr>
          </thead>
          <tbody>
            ${Object.keys(resultado.desglosePorMetodo).map(metodo => {
              const datos = resultado.desglosePorMetodo[metodo];
              const comision = resultado.comisionPorMetodo[metodo] || { comision: 0, porcentaje: 0 };
              return `
                <tr>
                  <td style="text-transform: capitalize; font-weight: 500;">${metodo}</td>
                  <td class="text-right">$${datos.monto.toFixed(2)}</td>
                  <td class="text-center">${datos.porcentaje.toFixed(1)}%</td>
                  <td class="text-center">${comision.porcentaje}%</td>
                  <td class="text-right comision-positiva">$${comision.comision.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
            <tr class="total-row">
              <td>TOTAL</td>
              <td class="text-right">$${resultado.ventasTotales.toFixed(2)}</td>
              <td class="text-center">100%</td>
              <td></td>
              <td class="text-right">$${resultado.comisionTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <h2>💵 Final Payment Calculation</h2>
        <div class="calculo-final">
          <div class="calculo-item">
            <span>Sales commissions:</span>
            <span class="comision-positiva">+ $${resultado.comisionTotal.toFixed(2)}</span>
          </div>
          <div class="calculo-item">
            <span>Base salary:</span>
            <span class="comision-positiva">+ $${resultado.salarioBase.toFixed(2)}</span>
          </div>
          ${resultado.bonos && resultado.bonos.length > 0 ? `
            <div class="calculo-item">
              <span>Bonuses:</span>
              <span class="comision-positiva">+ $${resultado.totalBonos.toFixed(2)}</span>
            </div>
          ` : ''}
          ${resultado.descuentos && resultado.descuentos.length > 0 ? `
            <div class="calculo-item">
              <span>Deductions:</span>
              <span style="color: #dc2626; font-weight: bold;">- $${resultado.totalDescuentos.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="calculo-total">
            <span>TOTAL TO PAY:</span>
            <span>$${resultado.totalAPagar.toFixed(2)}</span>
          </div>
        </div>

        <div class="footer">
          <p>This document was automatically generated by the commission system</p>
          <p>© ${new Date().getFullYear()} Tools4Care - All rights reserved</p>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 30px;">
          <button onclick="window.print()" style="background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;">
            🖨️ Print PDF
          </button>
          <button onclick="window.close()" style="background: #6b7280; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; margin-left: 10px;">
            Close
          </button>
        </div>
      </body>
      </html>
    `;
    
    ventana.document.write(html);
    ventana.document.close();
  };

  if (usuario?.rol !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permissions to access this page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          🎯 Commission Configuration
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Van</label>
            <select 
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              value={vanSeleccionada}
              onChange={(e) => setVanSeleccionada(e.target.value)}
            >
              <option value="">Select van...</option>
              {vans.map(van => (
                <option key={van.id} value={van.id}>
                  {van.nombre_van || `Van ${van.id}`}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Seller</label>
            <select 
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              value={vendedorSeleccionado}
              onChange={(e) => setVendedorSeleccionado(e.target.value)}
            >
              <option value="">Select seller...</option>
              {vendedores.map(vendedor => (
                <option key={vendedor.id} value={vendedor.id}>
                  {vendedor.nombre || vendedor.email}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Start Date</label>
            <input 
              type="date"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">End Date</label>
            <input 
              type="date"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
        </div>
        
        <button 
          onClick={cargarDatos}
          disabled={cargando}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          {cargando ? '⏳ Loading...' : '🔄 Load Data'}
        </button>
      </div>

      {resultado && configuracion && (
        <>
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">📊 Sales Summary</h2>
            
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-4">Method</th>
                  <th className="text-right p-4">Amount</th>
                  <th className="text-center p-4">Commission %</th>
                  <th className="text-right p-4">Earned</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(resultado.desglosePorMetodo).map(metodo => {
                  const datos = resultado.desglosePorMetodo[metodo];
                  const comision = resultado.comisionPorMetodo[metodo] || { comision: 0, porcentaje: 0 };
                  
                  return (
                    <tr key={metodo} className="border-t">
                      <td className="p-4 capitalize font-medium">{metodo}</td>
                      <td className="p-4 text-right">
                        ${datos.monto.toFixed(2)}
                        <span className="text-sm text-gray-500 ml-2">
                          ({datos.porcentaje.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <input 
                          type="number"
                          step="0.5"
                          className="w-20 border rounded px-2 py-1 text-center"
                          value={configuracion.comisiones_por_metodo[metodo]?.porcentaje || 0}
                          onChange={(e) => actualizarPorcentaje(metodo, e.target.value)}
                        />
                        %
                      </td>
                      <td className="p-4 text-right font-semibold text-green-600">
                        ${comision.comision.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 font-bold bg-gray-50">
                  <td className="p-4">TOTAL</td>
                  <td className="p-4 text-right">${resultado.ventasTotales.toFixed(2)}</td>
                  <td></td>
                  <td className="p-4 text-right text-green-600">${resultado.comisionTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-4">💰 Final Calculation</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>Commissions:</span>
                <span className="font-semibold">${resultado.comisionTotal.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span>Base salary:</span>
                <div className="flex gap-2 items-center">
                  <span className="text-sm">$</span>
                  <input 
                    type="number"
                    step="50"
                    className="w-32 border rounded px-2 py-1 text-right"
                    value={configuracion?.salario_base || 0}
                    onChange={(e) => {
                      const nuevaConfig = { ...configuracion };
                      nuevaConfig.salario_base = parseFloat(e.target.value) || 0;
                      setConfiguracion(nuevaConfig);
                      recalcularLocal(nuevaConfig);
                    }}
                  />
                  <span className="font-semibold text-green-600">
                    (+${(configuracion?.salario_base || 0).toFixed(2)})
                  </span>
                </div>
              </div>

              {resultado.bonos && resultado.bonos.length > 0 && (
                <div className="p-4 bg-green-50 rounded">
                  <h3 className="font-semibold mb-2">🎁 Bonuses</h3>
                  {resultado.bonos.map((bono, idx) => (
                    <div key={idx} className="flex justify-between py-1">
                      <span className="text-sm">✓ {bono.nombre}</span>
                      <span className="text-green-600">+${bono.monto.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {configuracion.descuentos && (
                <div className="p-4 bg-red-50 rounded">
                  <h3 className="font-semibold mb-2">➖ Deductions</h3>
                  {configuracion.descuentos.filter(d => d.activo).map((descuento) => (
                    <div key={descuento.id} className="flex justify-between py-1">
                      <span className="text-sm">{descuento.nombre}</span>
                      {descuento.tipo === 'manual' ? (
                        <div className="flex gap-2">
                          <input 
                            type="number"
                            step="1"
                            className="w-20 border rounded px-2 py-1 text-right"
                            value={ajustesManuales.descuentos[descuento.id] || 0}
                            onChange={(e) => actualizarDescuento(descuento.id, e.target.value)}
                          />
                          <span className="text-red-600">-${(ajustesManuales.descuentos[descuento.id] || 0).toFixed(2)}</span>
                        </div>
                      ) : (
                        <span className="text-red-600">-${descuento.montoFijo.toFixed(2)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t-2">
                <div className="flex justify-between text-3xl font-bold">
                  <span>💵 TOTAL:</span>
                  <span className="text-blue-600">${resultado.totalAPagar.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4">
              <button 
                onClick={guardarConfiguracion}
                className="bg-gray-600 text-white px-4 py-3 rounded-lg hover:bg-gray-700"
              >
                💾 Save Config
              </button>
              <button 
                onClick={generarReporte}
                className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700"
              >
                📄 Print PDF
              </button>
              <button 
                onClick={aprobarPago}
                disabled={resultado.estado !== 'pendiente'}
                className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                ✅ Approve
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}