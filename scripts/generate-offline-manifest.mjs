// scripts/generate-offline-manifest.mjs
//
// Runs after `vite build`. Each app screen is its own lazy-loaded chunk with
// a hash that changes on every deploy — the service worker (public/sw.js)
// only ever sees a chunk once someone's browser actually requests it, so a
// screen nobody has opened since the latest deploy has nothing to fall back
// to offline.
//
// A handful of screens are used physically at a stop with no signal — the
// ones this reads dist/.vite/manifest.json for below. This walks each one's
// full dependency graph (static imports + dynamic imports, e.g. Facturas'
// PDF export, Ventas' barcode scanner and payment agreement modal) and
// writes the resulting file list to dist/offline-precache.json, which
// public/sw.js fetches once at install time and precaches — so those
// screens work offline even if nobody has opened them since the update
// landed.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "dist/.vite/manifest.json");
const OUT_PATH = path.join(ROOT, "dist/offline-precache.json");

// The screens actually used standing at a barbershop with no connection.
// Add a source path here to make a screen offline-reliable; nothing else
// needs to change.
const OFFLINE_CRITICAL_ENTRIES = [
  "src/Dashboard.jsx",       // "/" — where a re-opened app lands first
  "src/Ventas.jsx",          // taking a sale
  "src/Productos.jsx",       // checking price/stock
  "src/Facturas.jsx",        // pulling up / printing a past invoice
  "src/pages/VisitNotebook.jsx", // logging barber requests during the visit
];

// Mounted unconditionally alongside every route in App.jsx's layout (not
// inside the per-route <Outlet/>), so they're just as required to boot as
// the root bundle itself — if either fails to load, the whole app's error
// boundary trips and nothing renders, regardless of how well the actual
// screen above is cached.
const ALWAYS_REQUIRED_ENTRIES = [
  "index.html",              // the root bootstrap bundle (assets/index-*.js/css)
  "src/store/StoreShiftGate.jsx",
  "src/components/GlobalSearch.jsx",
];

if (!existsSync(MANIFEST_PATH)) {
  console.warn("[offline-manifest] dist/.vite/manifest.json not found — skipping (is build.manifest enabled in vite.config.js?)");
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));

// The router (src/App.jsx) is a static import of every screen, and its own
// dynamicImports list is literally every lazy route in the app (that's
// where every `lazy(() => import(...))` call lives) — recursing into that
// would silently pull the entire app into the offline cache. It's reached
// via `imports`, so its own imports still get walked (small vendor/icon
// chunks); only its dynamicImports are blocked.
//
// Its manifest key is content-hashed (e.g. "_App-v97PjxjG.js") so it can't
// be hardcoded — instead, treat any chunk with an implausibly large
// dynamic-import fan-out as a "router/hub" file and never expand its
// dynamic imports. A real screen's own optional features (a PDF exporter,
// a barcode scanner) number in the single digits.
const HUB_DYNAMIC_IMPORT_THRESHOLD = 10;
const NEVER_EXPAND_DYNAMIC_IMPORTS_OF = new Set([
  // The root entry's own dynamicImports are the public storefront/checkout
  // pages, not anything the van-sales driver flow needs — its `imports`
  // (the actual bootstrap JS/CSS every page needs to even start) still get
  // walked below.
  "index.html",
  ...Object.entries(manifest)
    .filter(([, entry]) => (entry.dynamicImports || []).length > HUB_DYNAMIC_IMPORT_THRESHOLD)
    .map(([key]) => key),
]);

// Walks both `imports` (required to render) and `dynamicImports` (in-screen
// optional features — Facturas' PDF export, Ventas' barcode scanner and
// payment agreement modal) so those work offline too, guarded by the
// blocklist above so it can't walk back into the rest of the app.
function resolveFiles(key, seen, files) {
  if (seen.has(key)) return;
  seen.add(key);
  const entry = manifest[key];
  if (!entry) return;
  if (entry.file) files.add(`/${entry.file}`);
  for (const cssFile of entry.css || []) files.add(`/${cssFile}`);
  for (const imp of entry.imports || []) {
    if (imp === "index.html") continue; // the app-shell entry, handled separately
    resolveFiles(imp, seen, files);
  }
  if (!NEVER_EXPAND_DYNAMIC_IMPORTS_OF.has(key)) {
    for (const dyn of entry.dynamicImports || []) {
      resolveFiles(dyn, seen, files);
    }
  }
}

const allFiles = new Set();
const seen = new Set();
const missing = [];
for (const entryPath of [...ALWAYS_REQUIRED_ENTRIES, ...OFFLINE_CRITICAL_ENTRIES]) {
  if (!manifest[entryPath]) {
    missing.push(entryPath);
    continue;
  }
  resolveFiles(entryPath, seen, allFiles);
}

if (missing.length) {
  console.warn(`[offline-manifest] Entries not found in build manifest (renamed/moved?): ${missing.join(", ")}`);
}

const fileList = [...allFiles].sort();
writeFileSync(OUT_PATH, JSON.stringify(fileList, null, 2));

const totalBytes = fileList.reduce((sum, f) => {
  try {
    return sum + readFileSync(path.join(ROOT, "dist", f.slice(1))).length;
  } catch {
    return sum;
  }
}, 0);

console.log(`[offline-manifest] Wrote ${fileList.length} files (${(totalBytes / 1024).toFixed(0)} KB) to dist/offline-precache.json`);
