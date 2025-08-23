// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App";
import Storefront from "./storefront/Storefront.jsx";

import { UsuarioProvider } from "./UsuarioContext";
import { VanProvider } from "./hooks/VanContext";

import "./index.css"; // Tailwind

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <UsuarioProvider>
        <VanProvider>
          <Routes>
            {/* Nueva tienda online */}
            <Route path="/storefront" element={<Storefront />} />
            {/* Todo lo demás sigue igual */}
            <Route path="/*" element={<App />} />
          </Routes>
        </VanProvider>
      </UsuarioProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// ---- PWA: registrar Service Worker (no toca tu app) ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("SW registration failed", e);
    });
  });
}
