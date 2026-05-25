// src/hooks/useStoreMode.js
// Per-van "Physical Store Mode" toggle.
// Stored in localStorage under key t4c_store_mode_<van_id>.
// Store mode = true  → show thermal print, cash drawer, POS toolbar extras
// Van/route mode = false (default) → hide those options

import { useState, useEffect } from "react";
import { useVan } from "./VanContext";

const getKey = (vanId) => `t4c_store_mode_${vanId}`;

export function useStoreMode() {
  const { van } = useVan();

  const [storeMode, setStoreModeState] = useState(() => {
    if (!van?.id) return false;
    return localStorage.getItem(getKey(van.id)) === "1";
  });

  // Re-sync when the active van changes
  useEffect(() => {
    if (!van?.id) { setStoreModeState(false); return; }
    setStoreModeState(localStorage.getItem(getKey(van.id)) === "1");
  }, [van?.id]);

  const setStoreMode = (value) => {
    if (!van?.id) return;
    localStorage.setItem(getKey(van.id), value ? "1" : "0");
    setStoreModeState(value);
  };

  const toggle = () => setStoreMode(!storeMode);

  return { storeMode, setStoreMode, toggle };
}
