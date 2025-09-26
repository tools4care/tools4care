import { useEffect, useRef, useState } from 'react';
import Quagga from 'quagga';

export function BarcodeScanner({ onScan, onClose, isActive }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!isActive) return;

    setScanning(true);
    
    const config = {
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: scannerRef.current,
        constraints: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          facingMode: "environment",
          frameRate: { ideal: 15, max: 30 }
        }
      },
      locator: {
        patchSize: "medium",
        halfSample: true
      },
      numOfWorkers: 2,
      frequency: 10,
      decoder: {
        readers: [
          "ean_reader",
          "ean_8_reader", 
          "code_128_reader",
          "code_39_reader",
          "code_39_vin_reader",
          "codabar_reader",
          "upc_reader",
          "upc_e_reader"
        ]
      },
      locate: true
    };

    Quagga.init(config, (err) => {
      if (err) {
        console.error('Error inicializando Quagga:', err);
        setError('Error al acceder a la cámara. Verifica los permisos.');
        setScanning(false);
        return;
      }
      
      Quagga.start();
      setScanning(false);
    });

    // Contador para validar lecturas múltiples
    const detectionCounts = new Map();
    
   const onDetected = (result) => {
  const code = result.codeResult.code;
  
  // Validar que el código tiene formato válido (menos estricto)
  if (!code || code.length < 4 || !/^[0-9]+$/.test(code)) {
    return;
  }

  // Contar detecciones del mismo código
  const count = detectionCounts.get(code) || 0;
  detectionCounts.set(code, count + 1);

  // Solo aceptar después de 2 detecciones del mismo código
  if (count >= 1) {
    setLastResult(code);
    onScan(code);
    Quagga.stop();
  }

  // Limpiar contadores antiguos después de 2 segundos
  setTimeout(() => {
    detectionCounts.clear();
  }, 2000);
};

    Quagga.onDetected(onDetected);

    return () => {
      try {
        Quagga.stop();
        Quagga.offDetected(onDetected);
      } catch (e) {
        console.warn('Error stopping Quagga:', e);
      }
    };
  }, [isActive, onScan]);

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center">
          <div className="text-red-600 text-lg font-semibold mb-4">Error de Cámara</div>
          <p className="text-gray-700 mb-4">{error}</p>
          <button 
            onClick={onClose} 
            className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-4 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">Escanear Código de Barras</h3>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
          >
            ✕
          </button>
        </div>
        
        <div className="relative">
          <div 
            ref={scannerRef} 
            className="w-full h-64 bg-gray-900 rounded-lg overflow-hidden"
          />
          
          {/* Overlay con línea de escaneo */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="relative w-full h-full">
              {/* Marco de escaneo */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-20 border-2 border-red-500 rounded-lg">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-4 text-center">
          {scanning ? (
            <div className="flex items-center justify-center gap-2 text-blue-600">
              <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <span>Iniciando cámara...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Coloca el código de barras dentro del marco rojo
              </p>
              {lastResult && (
                <p className="text-xs text-green-600 font-mono">
                  Último: {lastResult}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}