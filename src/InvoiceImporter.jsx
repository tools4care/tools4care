// src/InvoiceImporter.jsx
// OCR invoice importer — reads supplier invoices and adds stock to stock_almacen
// Uses Tesseract.js (free, runs in browser, no API needed)
// Trained on CAPELLI BEAUTY & BARBER SUPPLY invoice format

import { useState, useRef } from "react";
import { createWorker } from "tesseract.js";
import { supabase } from "./supabaseClient";

/* ── Parse extracted OCR text into product rows ── */
function parseInvoiceText(rawText) {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const results = [];

  for (const line of lines) {
    // Skip header/noise lines
    if (/^\*\*\*|^INV|^WHS|^SKU|^Ship|^Bill|^ATTN|^Ph:|^Page|^Sub-?Total|^TOTAL|^Balance|^Tender|^Cust|^SHIPPED|^ORDER DATE/i.test(line)) continue;

    // Capelli format: SKU  DESCRIPTION  QTY(ends in .00)  Price  [Net Price]  Total
    // Key insight: QTY is always a whole number shown as X.00 (6.00, 18.00, 50.00)
    // Price is never .00 (79.99, 18.99, 0.59)
    // This lets us reliably split qty vs price

    // Primary pattern: strict — qty ends in .00
    const m = line.match(
      /^([A-Z0-9]{5,15})\s{2,}(.+?)\s{2,}(\d{1,4}\.00)\s+(\d+\.\d{2})(?:\s+\d*\.?\d*\s+(\d+\.\d{2}))?\s+(\d+\.\d{2})\s*$/
    );

    if (m) {
      const [, sku, desc, qty, price, netPrice, total] = m;
      const cantidad = parseFloat(qty);
      if (!cantidad || cantidad <= 0) continue;
      results.push({
        sku: sku.trim(),
        nombre: desc.trim().replace(/\*\*/g, "").trim(),
        cantidad,
        costo: parseFloat(netPrice || price),
        total: parseFloat(total),
      });
      continue;
    }

    // Fallback: extract all numbers from line, first one ending .00 = qty
    const skuMatch = line.match(/^([A-Z0-9]{5,15})\s+(.+?)\s+([\d.]+(?:\s+[\d.]+){2,})\s*$/);
    if (!skuMatch) continue;
    const [, sku, desc, numStr] = skuMatch;
    const nums = numStr.trim().split(/\s+/).map(Number).filter(n => !isNaN(n) && n > 0);
    if (nums.length < 3) continue;

    // Find qty: first number that is a whole integer (ends in .0 or is integer)
    const qtyIdx = nums.findIndex(n => Number.isInteger(n) || String(n).endsWith(".0") || (n * 100) % 100 === 0);
    if (qtyIdx === -1) continue;
    const cantidad = nums[qtyIdx];
    const costo = nums[qtyIdx + 1] || nums[nums.length - 2];
    const total = nums[nums.length - 1];
    if (!cantidad || !costo) continue;

    results.push({
      sku: sku.trim(),
      nombre: desc.trim().replace(/\*\*/g, "").trim(),
      cantidad,
      costo,
      total,
    });
  }

  return results;
}

/* ── Main component ── */
export default function InvoiceImporter({ onClose }) {
  const [step, setStep] = useState("upload"); // upload | ocr | review | done
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [parsedRows, setParsedRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setStep("ocr");
    setOcrProgress(0);
    setOcrStatus("Loading OCR engine...");

    try {
      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round(m.progress * 100));
            setOcrStatus("Reading invoice...");
          } else {
            setOcrStatus(m.status);
          }
        },
      });

      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      const rows = parseInvoiceText(text);

      if (rows.length === 0) {
        alert("No products detected. Make sure the image is clear and well-lit.");
        setStep("upload");
        return;
      }

      // Match each SKU against productos table
      const skus = rows.map((r) => r.sku);
      const { data: productos } = await supabase
        .from("productos")
        .select("id, codigo, nombre, costo")
        .in("codigo", skus);

      const productoMap = {};
      (productos || []).forEach((p) => { productoMap[p.codigo] = p; });

      // Also check stock_almacen for existing quantities
      const productIds = (productos || []).map((p) => p.id);
      const { data: stockActual } = await supabase
        .from("stock_almacen")
        .select("producto_id, cantidad")
        .in("producto_id", productIds);

      const stockMap = {};
      (stockActual || []).forEach((s) => { stockMap[s.producto_id] = Number(s.cantidad || 0); });

      const enriched = rows.map((r) => {
        const prod = productoMap[r.sku];
        return {
          ...r,
          producto_id: prod?.id || null,
          nombreDB: prod?.nombre || null,
          stockActual: prod ? (stockMap[prod.id] || 0) : null,
          include: !!prod, // only include matched products by default
        };
      });

      setParsedRows(enriched);
      setStep("review");
    } catch (err) {
      alert("OCR error: " + err.message);
      setStep("upload");
    }
  }

  function updateRow(idx, field, value) {
    setParsedRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  async function handleConfirm() {
    const toAdd = parsedRows.filter((r) => r.include && r.producto_id);
    if (!toAdd.length) return;
    setSaving(true);

    let count = 0;
    for (const row of toAdd) {
      // Get current stock
      const { data: existing } = await supabase
        .from("stock_almacen")
        .select("id, cantidad")
        .eq("producto_id", row.producto_id)
        .single();

      if (existing) {
        await supabase
          .from("stock_almacen")
          .update({ cantidad: existing.cantidad + row.cantidad })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("stock_almacen")
          .insert({ producto_id: row.producto_id, cantidad: row.cantidad });
      }
      count++;
    }

    setSavedCount(count);
    setSaving(false);
    setStep("done");
  }

  /* ── UI ── */
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center overflow-hidden">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh] sm:m-4">

        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-5 py-4 sm:rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-xl">📄 Invoice Importer</div>
              <div className="text-sm text-blue-200 mt-0.5">
                {step === "upload" && "Upload a supplier invoice photo"}
                {step === "ocr"    && "Reading invoice..."}
                {step === "review" && `${parsedRows.length} products detected — review before adding`}
                {step === "done"   && `${savedCount} products added to warehouse stock`}
              </div>
            </div>
            <button onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white text-xl font-bold">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* STEP: upload */}
          {step === "upload" && (
            <div className="p-6 flex flex-col items-center gap-4">
              <div
                className="w-full border-3 border-dashed border-blue-300 rounded-2xl p-10 text-center bg-blue-50 hover:bg-blue-100 cursor-pointer transition-colors"
                onClick={() => fileRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="text-5xl mb-3">📷</div>
                <div className="font-bold text-gray-700 text-lg">Tap to upload invoice photo</div>
                <div className="text-sm text-gray-400 mt-1">JPG, PNG — photo or screenshot</div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <div className="text-xs text-gray-400 text-center">
                Works best with clear, well-lit photos of flat invoices.<br/>
                Trained on CAPELLI BEAUTY & BARBER SUPPLY format.
              </div>
            </div>
          )}

          {/* STEP: ocr */}
          {step === "ocr" && (
            <div className="p-8 flex flex-col items-center gap-5">
              {previewUrl && (
                <img src={previewUrl} alt="Invoice" className="max-h-48 rounded-xl shadow border object-contain" />
              )}
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
              <div className="text-gray-500 font-semibold text-center">{ocrStatus} {ocrProgress > 0 ? `${ocrProgress}%` : ""}</div>
              <div className="text-xs text-gray-400">First time may take ~20s while downloading OCR data</div>
            </div>
          )}

          {/* STEP: review */}
          {step === "review" && (
            <div className="p-4">
              {/* Legend */}
              <div className="flex gap-4 mb-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"/>Found in system</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"/>Not in system (won't add)</span>
              </div>

              <div className="space-y-2">
                {parsedRows.map((row, i) => (
                  <div key={i}
                    className={`border-2 rounded-xl p-3 ${row.producto_id ? (row.include ? "border-green-300 bg-green-50" : "border-gray-200 bg-gray-50 opacity-60") : "border-amber-200 bg-amber-50"}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox — only for matched products */}
                      {row.producto_id ? (
                        <input type="checkbox" checked={row.include}
                          onChange={(e) => updateRow(i, "include", e.target.checked)}
                          className="mt-1 w-4 h-4 accent-green-600 flex-shrink-0" />
                      ) : (
                        <span className="mt-1 text-amber-500 text-lg flex-shrink-0">⚠</span>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{row.sku}</span>
                          <span className="font-semibold text-gray-800 text-sm truncate">
                            {row.nombreDB || row.nombre}
                          </span>
                        </div>
                        {!row.producto_id && (
                          <div className="text-xs text-amber-600 mt-0.5">SKU not found in product catalog</div>
                        )}
                        {row.producto_id && row.stockActual !== null && (
                          <div className="text-xs text-gray-400 mt-0.5">Current stock: {row.stockActual} units</div>
                        )}
                      </div>

                      {/* Qty editor */}
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xs text-gray-400 mb-0.5">Qty to add</div>
                        <input
                          type="number"
                          value={row.cantidad}
                          min="0"
                          step="1"
                          onChange={(e) => updateRow(i, "cantidad", parseFloat(e.target.value) || 0)}
                          className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center font-bold focus:ring-2 focus:ring-blue-400"
                        />
                      </div>

                      {/* Cost */}
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xs text-gray-400 mb-0.5">Cost</div>
                        <div className="text-sm font-semibold text-gray-700">${row.costo.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {parsedRows.filter(r => !r.producto_id).length > 0 && (
                <div className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  ⚠ {parsedRows.filter(r => !r.producto_id).length} products not found in catalog. Add them first in Products, then re-import.
                </div>
              )}
            </div>
          )}

          {/* STEP: done */}
          {step === "done" && (
            <div className="p-10 text-center">
              <div className="text-6xl mb-4">✅</div>
              <div className="font-bold text-gray-800 text-xl">{savedCount} products added to warehouse</div>
              <div className="text-sm text-gray-400 mt-2">Stock updated in stock_almacen successfully.</div>
              <button onClick={onClose}
                className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl shadow">
                Close
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "review" && (
          <div className="flex-shrink-0 border-t border-gray-200 px-4 py-3 bg-gray-50 sm:rounded-b-2xl flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              {parsedRows.filter(r => r.include && r.producto_id).length} of {parsedRows.length} will be added
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setStep("upload"); setParsedRows([]); setPreviewUrl(null); }}
                className="px-4 py-2 border-2 border-gray-300 rounded-xl text-sm font-semibold bg-white hover:bg-gray-50">
                Re-upload
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving || parsedRows.filter(r => r.include && r.producto_id).length === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl shadow text-sm"
              >
                {saving ? "Adding..." : "✓ Confirm & Add to Inventory"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
