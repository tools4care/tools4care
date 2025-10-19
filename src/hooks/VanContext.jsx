// src/hooks/VanContext.jsx
import { createContext, useContext, useState, useEffect } from "react";

const VanContext = createContext();

export function useVan() {
  return useContext(VanContext);
}

const VAN_STORAGE_KEY = "selected_van";

export function VanProvider({ children }) {
  const [van, setVanState] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Cargar van al iniciar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VAN_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setVanState(parsed);
      }
    } catch (err) {
      console.warn("Error loading saved van:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ Función que guarda en localStorage
  const setVan = (newVan) => {
    try {
      if (newVan) {
        localStorage.setItem(VAN_STORAGE_KEY, JSON.stringify(newVan));
      } else {
        localStorage.removeItem(VAN_STORAGE_KEY);
      }
      setVanState(newVan);
    } catch (err) {
      console.error("Error saving van:", err);
      setVanState(newVan);
    }
  };

  // ✅ Loading screen
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <VanContext.Provider value={{ van, setVan, loading }}>
      {children}
    </VanContext.Provider>
  );
}