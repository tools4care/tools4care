// src/hooks/useStoreMode.js
// Per-van "Physical Store Mode" toggle.
// Stored in localStorage under key t4c_store_mode_<van_id>.
// Store mode = true  → show thermal print, cash drawer, POS toolbar extras
// Van/route mode = false (default) → hide those options

import { useState, useEffect } from "react";
import { useVan } from "./VanContext";
import { isStoreLocation } from "../lib/locationTypes";

const getKey = (vanId) => `t4c_store_mode_${vanId}`;
const STORE_MODE_EVENT = "tools4care:store-mode-change";

export function useStoreMode() {
  const { van } = useVan();
  const isExplicitStore = isStoreLocation(van);

  const [legacyStoreMode, setStoreModeState] = useState(() => {
    if (!van?.id) return false;
    return localStorage.getItem(getKey(van.id)) === "1";
  });
  const storeMode = isExplicitStore || legacyStoreMode;

  // Re-sync when the active van changes
  useEffect(() => {
    if (!van?.id) { setStoreModeState(false); return; }
    setStoreModeState(localStorage.getItem(getKey(van.id)) === "1");
  }, [van?.id]);

  // Keep every consumer in sync. Sidebar, mobile navigation and the sales
  // workspace each mount their own hook instance, so local state alone is not
  // enough when the mode is changed without a reload.
  useEffect(() => {
    if (!van?.id) return undefined;

    const syncMode = (event) => {
      if (event.type === "storage" && event.key !== getKey(van.id)) return;
      if (event.type === STORE_MODE_EVENT && event.detail?.vanId !== van.id) return;
      setStoreModeState(localStorage.getItem(getKey(van.id)) === "1");
    };

    window.addEventListener("storage", syncMode);
    window.addEventListener(STORE_MODE_EVENT, syncMode);
    return () => {
      window.removeEventListener("storage", syncMode);
      window.removeEventListener(STORE_MODE_EVENT, syncMode);
    };
  }, [van?.id]);

  const setStoreMode = (value) => {
    if (!van?.id) return;
    localStorage.setItem(getKey(van.id), value ? "1" : "0");
    setStoreModeState(value);
    window.dispatchEvent(new CustomEvent(STORE_MODE_EVENT, {
      detail: { vanId: van.id, storeMode: value },
    }));
  };

  const toggle = () => {
    if (isExplicitStore) return;
    setStoreMode(!storeMode);
  };

  return { storeMode, isExplicitStore, setStoreMode, toggle };
}
