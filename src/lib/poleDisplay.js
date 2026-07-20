// Web Serial integration for a physical customer-facing "pole display"
// (a small VFD/LED unit wired to the terminal by COM port, sometimes chained
// through the receipt printer). Almost every unbranded pole display sold for
// POS use emulates the CD5220 command set, which only relies on plain ASCII
// control codes (Form Feed / CR / LF) rather than vendor-specific escape
// sequences — that makes it the safest default for unknown hardware.
//
// Requires Chrome or Edge (Web Serial isn't available in Safari/Firefox).

const ENABLED_KEY = "tools4care_pole_display_enabled";
const BAUD_RATE_KEY = "tools4care_pole_display_baud_rate";
const DEFAULT_BAUD_RATE = 9600;

const CLEAR_AND_HOME = 0x0c; // Form Feed
const CARRIAGE_RETURN = 0x0d;
const LINE_FEED = 0x0a;

let activePort = null;
let activeWriter = null;

export function isPoleDisplaySupported() {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function isPoleDisplayEnabled() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(ENABLED_KEY) === "1";
}

export function setPoleDisplayEnabled(enabled) {
  localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
}

export function getPoleDisplayBaudRate() {
  const stored = Number(localStorage.getItem(BAUD_RATE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_BAUD_RATE;
}

export function setPoleDisplayBaudRate(rate) {
  localStorage.setItem(BAUD_RATE_KEY, String(rate));
}

export function isPoleDisplayConnected() {
  return Boolean(activePort && activeWriter);
}

async function openWriter(port, baudRate) {
  if (!port.readable) {
    await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: "none" });
  }
  activePort = port;
  activeWriter = port.writable.getWriter();
  return port;
}

// Must be called from a user gesture (button click) — the browser shows a
// device picker the first time. The grant is remembered by the browser, so
// reconnectPoleDisplay() can silently re-open it on future page loads.
export async function connectPoleDisplay(baudRate = getPoleDisplayBaudRate()) {
  if (!isPoleDisplaySupported()) {
    throw new Error("This browser doesn't support Web Serial — use Chrome or Edge.");
  }
  const port = await navigator.serial.requestPort();
  return openWriter(port, baudRate);
}

// Silently reattaches to a previously-granted port (e.g. on page reload).
// Returns null if nothing was previously authorized — never prompts the user.
export async function reconnectPoleDisplay(baudRate = getPoleDisplayBaudRate()) {
  if (!isPoleDisplaySupported()) return null;
  const ports = await navigator.serial.getPorts();
  const port = ports[0];
  if (!port) return null;
  try {
    return await openWriter(port, baudRate);
  } catch {
    return null;
  }
}

export async function disconnectPoleDisplay() {
  try { activeWriter?.releaseLock(); } catch { /* already released */ }
  try { await activePort?.close(); } catch { /* already closed */ }
  activePort = null;
  activeWriter = null;
}

function toDisplayBytes(text, width = 20) {
  // Decompose accents ("é" -> "e" + combining mark) then drop anything
  // outside printable ASCII — most VFDs can't render accented characters.
  const clean = String(text || "")
    .normalize("NFD")
    .replace(/[^\x20-\x7e]/g, "");
  const padded = clean.length > width ? clean.slice(0, width) : clean.padEnd(width, " ");
  return new TextEncoder().encode(padded);
}

// Writes up to two 20-char lines to the display. Safe to call even when
// nothing is connected (it just no-ops) so callers don't need to guard.
export async function writePoleDisplay(line1, line2 = "") {
  if (!activeWriter) return false;
  const chunks = [
    new Uint8Array([CLEAR_AND_HOME]),
    toDisplayBytes(line1),
    new Uint8Array([CARRIAGE_RETURN, LINE_FEED]),
    toDisplayBytes(line2),
  ];
  try {
    for (const chunk of chunks) await activeWriter.write(chunk);
    return true;
  } catch {
    return false;
  }
}
