// src/hooks/useTenantBilling.js
// Reads the calling tenant's own subscription state for the account-level
// gate in App.jsx. Platform staff (tenant_id null) never call this.
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export function useTenantBilling(tenantId) {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(Boolean(tenantId));

  useEffect(() => {
    if (!tenantId) {
      setTenant(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    supabase
      .from("tenants")
      .select("status,subscription_status,trial_ends_at,business_name")
      .eq("id", tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) {
          setTenant(data || null);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [tenantId]);

  return { tenant, loading };
}
