import React, { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

function BarcodeScanner({ onResult, onClose }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader();
    let isMounted = true;

    codeReader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
      if (result && isMounted) {
        // Hacer vibrar el teléfono
        if ("vibrate" in navigator) navigator.vibrate([200, 50, 200]);
        // Sonar (opcional)
        const beep = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
        beep.play();

        onResult(result.getText());
        onClose(); // Cierra scanner
      }
    });

    return () => {
      isMounted = false;
      codeReader.reset();
    };
  }, [onResult, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-80 flex flex-col items-center justify-center">
      <video ref={videoRef} style={{ width: "90vw", maxWidth: 400, borderRadius: 10 }} autoPlay muted />
      <button className="mt-4 bg-white text-black px-4 py-2 rounded" onClick={onClose}>Cerrar</button>
    </div>
  );
}

export default BarcodeScanner; // SOLO UNA VEZ, Y NO MÁS
