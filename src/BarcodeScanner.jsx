import React, { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

// Permite escanear con cámara Y también con escáner físico tipo teclado
function BarcodeScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const inputRef = useRef(null); // Para capturar escáner tipo teclado
  const lastCodeRef = useRef(""); // Evitar doble lectura

  useEffect(() => {
    let codeReader = new BrowserMultiFormatReader();
    let isMounted = true;
    let scannerInput = "";

    // === ESCÁNER CÁMARA ===
    codeReader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
      if (result && isMounted) {
        const code = result.getText();
        // Evita dobles lecturas seguidas
        if (lastCodeRef.current !== code) {
          lastCodeRef.current = code;
          if ("vibrate" in navigator) navigator.vibrate([120, 40, 120]);
          try {
            new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg").play();
          } catch {}
          onResult(code);
          setTimeout(onClose, 100); // Permite ver el beep antes de cerrar
        }
      }
    });

    // === ESCÁNER FÍSICO (teclado) ===
    function handleKey(e) {
      if (e.key === "Enter") {
        if (scannerInput.length > 2 && isMounted) {
          if (lastCodeRef.current !== scannerInput) {
            lastCodeRef.current = scannerInput;
            onResult(scannerInput);
            setTimeout(onClose, 100);
          }
        }
        scannerInput = "";
      } else if (/^[\w\-\.]$/.test(e.key)) {
        scannerInput += e.key;
      }
    }
    window.addEventListener("keydown", handleKey);

    // Limpiar al desmontar
    return () => {
      isMounted = false;
      codeReader.reset();
      window.removeEventListener("keydown", handleKey);
    };
  }, [onResult, onClose]);

  // Permite enfocar el área (invisible) para escáner físico apenas abre
  useEffect(() => {
    setTimeout(() => inputRef.current && inputRef.current.focus(), 200);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-80 flex flex-col items-center justify-center">
      <video
        ref={videoRef}
        style={{ width: "90vw", maxWidth: 400, borderRadius: 10 }}
        autoPlay
        muted
        playsInline
      />
      {/* Input oculto para que escáner físico siempre funcione */}
      <input
        ref={inputRef}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
        tabIndex={-1}
        aria-hidden
      />
      <button className="mt-4 bg-white text-black px-4 py-2 rounded" onClick={onClose}>
        Cerrar
      </button>
      <div className="mt-2 text-xs text-white opacity-60">
        Escanee usando la cámara o conecte un escáner físico.
      </div>
    </div>
  );
}

export default BarcodeScanner;
