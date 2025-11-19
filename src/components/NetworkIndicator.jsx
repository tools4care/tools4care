// src/components/NetworkIndicator.jsx
import React from "react";
import { useOffline } from "../hooks/useOffline"; // ajusta la ruta según tu estructura

export function NetworkIndicator() {
  const { isOnline } = useOffline();

  // Si está online, no muestres nada
  if (isOnline) return null;

  // Si está offline, muestra un aviso
  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        padding: "8px 12px",
        backgroundColor: "#f97373",
        color: "white",
        borderRadius: 8,
        fontSize: 14,
        zIndex: 9999,
      }}
    >
      Sin conexión: algunos datos pueden no guardarse.
    </div>
  );
}
