import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App";
import Storefront from "./storefront/Storefront.jsx";
import Checkout from "./storefront/Checkout.jsx";

import { UsuarioProvider } from "./UsuarioContext";
import VanProvider from "./hooks/VanContext";
import { ToastProvider } from "./hooks/useToast";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <UsuarioProvider>
          <VanProvider>
            <Routes>
              {/* 🛒 público */}
              <Route path="/storefront" element={<Storefront />} />
              <Route path="/storefront/checkout" element={<Checkout />} />
              {/* todo lo demás */}
              <Route path="/*" element={<App />} />
            </Routes>
          </VanProvider>
        </UsuarioProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// opcional PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.warn);
  });
}
