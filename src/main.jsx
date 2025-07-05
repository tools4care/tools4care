import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { UsuarioProvider } from "./UsuarioContext";
import { VanProvider } from "./hooks/VanContext";


import { BrowserRouter } from "react-router-dom";
import "./index.css"; // o el archivo de tailwind

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <UsuarioProvider>
        <VanProvider>
          <App />
        </VanProvider>
      </UsuarioProvider>
    </BrowserRouter>
  </React.StrictMode>
);
