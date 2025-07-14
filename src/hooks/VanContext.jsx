import { createContext, useContext, useState } from "react";

const VanContext = createContext();

export function useVan() {
  return useContext(VanContext);
}

export function VanProvider({ children }) {
  const [van, setVan] = useState(null);

  return (
    <VanContext.Provider value={{ van, setVan }}>
      {children}
    </VanContext.Provider>
  );
}
