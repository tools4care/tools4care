import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useVan } from "./VanContext";
import { DEFAULT_LOCATION_SETTINGS, normalizeLocationSettings } from "../lib/locationSettings";

const settingsKey = (locationId) => `tools4care_location_settings_${locationId}`;
const isMissingSettingsTable = (error) =>
  error?.code === "42P01" ||
  error?.code === "PGRST205" ||
  /could not find[^]*location_settings|relation[^]*location_settings[^]*does not exist/i.test(error?.message || "");

function loadCachedSettings(locationId) {
  if (!locationId) return DEFAULT_LOCATION_SETTINGS;
  try {
    const locationValue = localStorage.getItem(settingsKey(locationId));
    if (locationValue) return normalizeLocationSettings(JSON.parse(locationValue));

    // One-time compatibility with the previous global tax configuration.
    const legacyTax = localStorage.getItem("tools4care_tax_config");
    if (legacyTax) return normalizeLocationSettings(JSON.parse(legacyTax));
  } catch {
    return DEFAULT_LOCATION_SETTINGS;
  }
  return DEFAULT_LOCATION_SETTINGS;
}

export function useLocationSettings() {
  const { van } = useVan();
  const [settings, setSettings] = useState(() => loadCachedSettings(van?.id));
  const [loading, setLoading] = useState(Boolean(van?.id));

  useEffect(() => {
    if (!van?.id) {
      setSettings(DEFAULT_LOCATION_SETTINGS);
      setLoading(false);
      return undefined;
    }

    let active = true;
    const cached = loadCachedSettings(van.id);
    setSettings(cached);
    setLoading(true);

    supabase
      .from("location_settings")
      .select("tax_enabled,tax_rate,tax_name,tax_included,customer_display_enabled,receipt_printing_enabled,cash_drawer_enabled")
      .eq("location_id", van.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data) {
          const next = normalizeLocationSettings(data);
          setSettings(next);
          localStorage.setItem(settingsKey(van.id), JSON.stringify(next));
        }
        // Missing-table errors are intentionally non-blocking during rollout.
        setLoading(false);
      });

    return () => { active = false; };
  }, [van?.id]);

  const saveSettings = useCallback(async (changes) => {
    if (!van?.id) throw new Error("Select a location first.");
    const next = normalizeLocationSettings({ ...settings, ...changes });
    setSettings(next);
    localStorage.setItem(settingsKey(van.id), JSON.stringify(next));

    const payload = {
      location_id: van.id,
      ...next,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("location_settings").upsert(payload, { onConflict: "location_id" });
    if (error && !isMissingSettingsTable(error)) throw error;
    return next;
  }, [settings, van?.id]);

  return { settings, loading, saveSettings };
}
