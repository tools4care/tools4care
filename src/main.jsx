import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { initSentry, SentryErrorBoundary } from "./sentry";
import { lazyRetry } from "./lib/lazyRetry";

import { UsuarioProvider } from "./UsuarioContext";
import VanProvider from "./hooks/VanContext";
import { ToastProvider } from "./hooks/useToast";

import "./index.css";

initSentry();

// ── Storefront público (sin providers del POS) ──────────────────────────
const Storefront        = lazyRetry(() => import("./storefront/Storefront.jsx"), "Storefront");
const Checkout          = lazyRetry(() => import("./storefront/Checkout.jsx"), "Checkout");
const AuthCallback      = lazyRetry(() => import("./storefront/AuthCallback.jsx"), "AuthCallback");
const PaymentSuccess    = lazyRetry(() => import("./PaymentSuccess.jsx"), "PaymentSuccess");
const PaymentCancelled  = lazyRetry(() => import("./PaymentCancelled.jsx"), "PaymentCancelled");
const BusinessInfo      = lazyRetry(() => import("./storefront/BusinessInfo.jsx"), "BusinessInfo");
const PortalPage        = lazyRetry(() => import("./portal/PortalPage.jsx").then((module) => ({ default: module.PortalPage })), "PortalPage");

// ── App del POS (con todos los providers) ───────────────────────────────
const App = lazyRetry(() => import("./App.jsx"), "App");

// Loading mínimo para storefront (no menciona "sistema de ventas")
const StorefrontFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-400" />
  </div>
);

// Loading estándar para el POS
const POSFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
  </div>
);

const AppErrorFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
    <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        The error was reported automatically. Please reload the app and try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Reload
      </button>
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={<AppErrorFallback />}>
      <BrowserRouter>
        <Routes>
        {/* ─── Rutas públicas del storefront ───────────────────────────
            Completamente independientes del POS:
            - Sin UsuarioProvider / VanProvider del POS
            - Sin NetworkIndicator de offline
            - Sin SyncProvider
            Si el cliente no tiene internet, Supabase falla y no puede comprar.
        ─────────────────────────────────────────────────────────────── */}
        <Route
          path="/store"
          element={
            <Suspense fallback={<StorefrontFallback />}>
              <Storefront />
            </Suspense>
          }
        />
        <Route
          path="/checkout"
          element={
            <Suspense fallback={<StorefrontFallback />}>
              <Checkout />
            </Suspense>
          }
        />
        <Route
          path="/auth/callback"
          element={
            <Suspense fallback={<StorefrontFallback />}>
              <AuthCallback />
            </Suspense>
          }
        />
        <Route
          path="/payment-success"
          element={
            <Suspense fallback={<StorefrontFallback />}>
              <PaymentSuccess />
            </Suspense>
          }
        />
        <Route
          path="/payment-cancelled"
          element={
            <Suspense fallback={<StorefrontFallback />}>
              <PaymentCancelled />
            </Suspense>
          }
        />
        <Route
          path="/portal"
          element={<Suspense fallback={<StorefrontFallback />}><PortalPage /></Suspense>}
        />
        <Route
          path="/info"
          element={
            <Suspense fallback={<StorefrontFallback />}>
              <BusinessInfo />
            </Suspense>
          }
        />

        {/* ─── Aliases de conveniencia ─────────────────────────────── */}
        {/* /store es la ruta canónica; /storefront y /shop redirigen aquí
            (a nivel raíz, para no cargar el bundle del POS solo por un redirect) */}
        <Route path="/storefront" element={<Navigate to="/store" replace />} />
        <Route path="/shop" element={<Navigate to="/store" replace />} />

        {/* ─── Sistema POS (vendedores en la van) ──────────────────── */}
        <Route
          path="/*"
          element={
            <ToastProvider>
              <UsuarioProvider>
                <VanProvider>
                  <Suspense fallback={<POSFallback />}>
                    <App />
                  </Suspense>
                </VanProvider>
              </UsuarioProvider>
            </ToastProvider>
          }
        />
        </Routes>
      </BrowserRouter>
      <Analytics />
      <SpeedInsights />
    </SentryErrorBoundary>
  </React.StrictMode>
);

// PWA: single registration point. The worker uses network-first HTML and
// skipWaiting(), so a controller change means the new app shell is ready.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshed) return;
      refreshed = true;
      // Android standalone PWAs can keep the previous JS bundle alive after
      // a deploy. Reload exactly once when the new worker takes control.
      const reloadKey = "tools4care-pwa-controller-reload";
      const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
      if (Date.now() - lastReload > 30_000) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        window.location.reload();
      }
    });

    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
    }).catch(console.warn);
  });
}
