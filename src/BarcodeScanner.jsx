import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

function BarcodeScanner({ onResult, onClose }) {
  const [useCamera, setUseCamera] = useState(false);
  const videoRef = useRef(null);
  const inputRef = useRef(null);
  const lastCodeRef = useRef("");
  const [error, setError] = useState(null);

  // ESCÁNER FÍSICO SIEMPRE ACTIVO
  useEffect(() => {
    let scannerInput = "";
    let isMounted = true;

    function handleKey(e) {
      if (e.key === "Enter" && scannerInput.length > 2 && isMounted) {
        if (lastCodeRef.current !== scannerInput) {
          lastCodeRef.current = scannerInput;
          onResult(scannerInput);
          setTimeout(onClose, 120);
        }
        scannerInput = "";
      } else if (/^[\w\-\.]$/.test(e.key)) {
        scannerInput += e.key;
      }
    }
    window.addEventListener("keydown", handleKey);

    setTimeout(() => inputRef.current && inputRef.current.focus(), 200);

    return () => window.removeEventListener("keydown", handleKey);
  }, [onResult, onClose]);

  // CAMARA SOLO SI useCamera === true
  useEffect(() => {
    if (!useCamera) return;
    let codeReader = new BrowserMultiFormatReader();
    let isMounted = true;

    codeReader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
      if (result && isMounted) {
        const code = result.getText();
        if (lastCodeRef.current !== code) {
          lastCodeRef.current = code;
          if ("vibrate" in navigator) navigator.vibrate([120, 40, 120]);
          try { new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg").play(); } catch {}
          onResult(code);
          setTimeout(onClose, 150);
        }
      }
      if (err && err.name === "NotAllowedError") {
        setError("Permiso de cámara denegado. Habilite permisos y reintente.");
      }
    });

    return () => {
      if (codeReader && typeof codeReader.reset === "function") codeReader.reset();
    };
  }, [useCamera, onResult, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-80 flex flex-col items-center justify-center">
      {!useCamera ? (
        <>
          <input
            ref={inputRef}
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
            tabIndex={-1}
            aria-hidden
          />
          <button
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded mb-2"
            onClick={() => setUseCamera(true)}
          >
            Usar cámara (opcional)
          </button>
          <button className="bg-white text-black px-4 py-2 rounded" onClick={onClose}>
            Cerrar
          </button>
          <div className="mt-2 text-xs text-white opacity-80 text-center">
            Escanee con un lector de códigos físico.<br />
            (O pulse “Usar cámara” para activar la cámara)
          </div>
        </>
      ) : !error ? (
        <>
          <video
            ref={videoRef}
            style={{ width: "90vw", maxWidth: 400, borderRadius: 10 }}
            autoPlay
            muted
            playsInline
          />
          <button className="mt-3 bg-white text-black px-4 py-2 rounded" onClick={() => setUseCamera(false)}>
            Cancelar cámara
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center">
          <div className="text-red-200 bg-red-800/80 rounded p-4 text-center">{error}</div>
          <button className="mt-4 bg-white text-black px-4 py-2 rounded" onClick={onClose}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}

export default BarcodeScanner;
