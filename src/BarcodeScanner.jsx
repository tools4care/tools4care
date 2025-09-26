import { useEffect, useRef, useState } from 'react';
import Quagga from 'quagga';

export function BarcodeScanner({ onScan, onClose, isActive }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isActive) return;

    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: scannerRef.current,
        constraints: {
          width: 640,
          height: 480,
          facingMode: "environment" // Cámara trasera
        }
      },
      decoder: {
        readers: ["code_128_reader", "ean_reader", "ean_8_reader", "code_39_reader"]
      }
    }, (err) => {
      if (err) {
        setError('Error al inicializar cámara: ' + err.message);
        return;
      }
      Quagga.start();
    });

    Quagga.onDetected((result) => {
      const code = result.codeResult.code;
      onScan(code);
      Quagga.stop();
    });

    return () => {
      Quagga.stop();
    };
  }, [isActive, onScan]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
        <button onClick={onClose} className="mt-2 bg-red-600 text-white px-4 py-2 rounded">
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-4 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold">Escanear Código</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✖
          </button>
        </div>
        
        <div ref={scannerRef} className="w-full h-64 bg-gray-200 rounded-lg mb-4" />
        
        <p className="text-sm text-gray-600 text-center">
          Apunta la cámara hacia el código de barras
        </p>
      </div>
    </div>
  );
}