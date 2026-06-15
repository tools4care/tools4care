import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { UsuarioProvider } from "./UsuarioContext";
import VanProvider from "./hooks/VanContext";
import { ToastProvider } from "./hooks/useToast";
import { ThemeProvider } from "./hooks/useTheme.jsx";

import "./index.css";

// ── Storefront público (sin providers del POS) ──────────────────────────
const Storefront        = lazy(() => import("./storefront/Storefront.jsx"));
const Checkout          = lazy(() => import("./storefront/Checkout.jsx"));
const AuthCallback      = lazy(() => import("./storefront/AuthCallback.jsx"));
const PaymentSuccess    = lazy(() => import("./PaymentSuccess.jsx"));
const PaymentCancelled  = lazy(() => import("./PaymentCancelled.jsx"));

// ── App del POS (con todos los providers) ───────────────────────────────
const App = lazy(() => import("./App.jsx"));

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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
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
          path="/storefront"
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

        {/* ─── Aliases de conveniencia ─────────────────────────────── */}
        {/* /shop y /store redirigen a /storefront — se manejan en App */}

        {/* ─── Sistema POS (vendedores en la van) ──────────────────── */}
        <Route
          path="/*"
          element={
            <ThemeProvider>
              <ToastProvider>
                <UsuarioProvider>
                  <VanProvider>
                    <Suspense fallback={<POSFallback />}>
                      <App />
                    </Suspense>
                  </VanProvider>
                </UsuarioProvider>
              </ToastProvider>
            </ThemeProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

// opcional PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.warn);
  });
}
