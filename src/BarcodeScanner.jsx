import { useCallback, useEffect, useRef, useState } from "react";

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "codabar"];
const QUAGGA_READERS = ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader", "code_128_reader", "code_39_reader"];

function normalizeCode(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function isUsableCode(value) {
  return value.length >= 4 && /^[A-Za-z0-9._/-]+$/.test(value);
}

export function BarcodeScanner({ onScan, onClose, isActive }) {
  const scannerRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const quaggaRef = useRef(null);
  const rafRef = useRef(null);
  const finishedRef = useRef(false);
  const detectionsRef = useRef(new Map());
  const onScanRef = useRef(onScan);
  const [status, setStatus] = useState("Starting camera...");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [engine, setEngine] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const acceptCode = useCallback((rawCode, confidence = 1) => {
    const code = normalizeCode(rawCode);
    if (finishedRef.current || !isUsableCode(code)) return false;

    const now = Date.now();
    const previous = detectionsRef.current.get(code);
    const count = previous && now - previous.at < 1300 ? previous.count + 1 : 1;
    detectionsRef.current.clear();
    detectionsRef.current.set(code, { count, at: now });
    setLastResult(code);
    setStatus(count >= 2 || confidence >= 0.92 ? "Product found" : "Hold steady...");

    if (count < 2 && confidence < 0.92) return false;
    finishedRef.current = true;
    navigator.vibrate?.([80, 40, 80]);
    onScanRef.current(code);
    return true;
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { quaggaRef.current?.stop(); } catch {}
    for (const track of streamRef.current?.getTracks?.() || []) track.stop();
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;
    finishedRef.current = false;
    detectionsRef.current.clear();
    setError("");
    setStatus("Starting camera...");

    let alive = true;

    const startNative = async () => {
      if (!("BarcodeDetector" in window)) return false;
      const supported = await window.BarcodeDetector.getSupportedFormats?.().catch(() => []) || [];
      const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
      if (!formats.length) return false;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });
      if (!alive) {
        stream.getTracks().forEach((track) => track.stop());
        return true;
      }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const track = stream.getVideoTracks()[0];
      setTorchAvailable(Boolean(track?.getCapabilities?.().torch));
      setEngine("Fast scan");
      setStatus("Point camera at the barcode");
      const detector = new window.BarcodeDetector({ formats });
      let lastDetectAt = 0;

      const detect = async (time) => {
        if (!alive || finishedRef.current) return;
        if (time - lastDetectAt >= 100) {
          lastDetectAt = time;
          try {
            const results = await detector.detect(videoRef.current);
            if (results[0] && acceptCode(results[0].rawValue, 1)) return;
          } catch {}
        }
        rafRef.current = requestAnimationFrame(detect);
      };
      rafRef.current = requestAnimationFrame(detect);
      return true;
    };

    const startQuagga = async (onDetected) => {
      if (!scannerRef.current) throw new Error("Scanner unavailable");
      setEngine("Compatible scan");
      const { default: Quagga } = await import("quagga");
      quaggaRef.current = Quagga;
      Quagga.onDetected(onDetected);
      return new Promise((resolve, reject) => Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerRef.current,
          area: { top: "25%", right: "8%", left: "8%", bottom: "25%" },
          constraints: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "environment",
            frameRate: { ideal: 24, max: 30 },
          },
        },
        locator: { patchSize: "medium", halfSample: true },
        numOfWorkers: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)),
        frequency: 15,
        decoder: { readers: QUAGGA_READERS, multiple: false },
        locate: true,
      }, (err) => {
        if (err) return reject(err);
        Quagga.start();
        setStatus("Point camera at the barcode");
        resolve();
      }));
    };

    const onDetected = (result) => {
      const errors = result?.codeResult?.decodedCodes
        ?.filter((part) => Number.isFinite(part.error))
        .map((part) => part.error) || [];
      const confidence = errors.length ? Math.max(0, 1 - errors.reduce((a, b) => a + b, 0) / errors.length) : 0;
      if (acceptCode(result?.codeResult?.code, confidence)) stopCamera();
    };

    (async () => {
      try {
        const nativeStarted = await startNative().catch(() => false);
        if (!nativeStarted) {
          await startQuagga(onDetected);
        }
      } catch (err) {
        setError("Could not access the camera. Check camera permission and try again.");
        setStatus("");
      }
    })();

    return () => {
      alive = false;
      quaggaRef.current?.offDetected(onDetected);
      stopCamera();
    };
  }, [acceptCode, isActive, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {}
  };

  const submitManual = () => {
    const code = normalizeCode(manualCode);
    if (!isUsableCode(code)) return;
    finishedRef.current = true;
    onScanRef.current(code);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950 flex items-center justify-center sm:p-4">
      <div className="bg-white w-full h-full sm:h-auto sm:max-w-md sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200">
          <div>
            <h3 className="font-extrabold text-slate-900">Scan Barcode</h3>
            <p className="text-xs text-slate-500">{engine || "Camera scanner"}</p>
          </div>
          <button onClick={onClose} className="w-11 h-11 rounded-full bg-slate-100 text-slate-700 text-xl font-bold">✕</button>
        </div>

        <div className="relative flex-1 min-h-[330px] bg-black overflow-hidden">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          <div ref={scannerRef} className="absolute inset-0 [&_video]:w-full [&_video]:h-full [&_video]:object-cover [&_canvas]:hidden" />
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,rgba(0,0,0,.48)_0%,rgba(0,0,0,.1)_28%,rgba(0,0,0,.1)_72%,rgba(0,0,0,.48)_100%)]">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[84%] h-28 border-2 border-emerald-400 rounded-2xl shadow-[0_0_0_999px_rgba(0,0,0,.12)]">
              <div className="absolute left-3 right-3 top-1/2 h-0.5 bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,.7)] animate-pulse" />
            </div>
          </div>
          {torchAvailable && (
            <button onClick={toggleTorch} className="absolute right-4 bottom-4 bg-black/60 text-white px-4 py-2.5 rounded-full font-semibold text-sm">
              {torchOn ? "Turn light off" : "Turn light on"}
            </button>
          )}
        </div>

        <div className="p-4 space-y-3 bg-white">
          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
          ) : (
            <div className={`rounded-xl p-3 text-center font-semibold text-sm ${lastResult ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
              {status}{lastResult ? ` · ${lastResult}` : ""}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submitManual()}
              placeholder="Enter barcode manually"
              inputMode="text"
              className="min-w-0 flex-1 border-2 border-slate-200 rounded-xl px-3 py-3 text-base outline-none focus:border-blue-500"
            />
            <button onClick={submitManual} disabled={!isUsableCode(normalizeCode(manualCode))} className="bg-blue-600 text-white px-5 rounded-xl font-bold disabled:opacity-40">
              Use
            </button>
          </div>
          <p className="text-center text-xs text-slate-400">Hold the phone 6–10 inches away and keep the barcode inside the frame.</p>
        </div>
      </div>
    </div>
  );
}
