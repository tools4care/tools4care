import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { CuentaCliente } from "./CuentaCliente";
import { PortalLogin } from "./PortalLogin";

export function PortalPage() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session || null); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (active) setSession(nextSession || null); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  if (session === undefined) return <main className="min-h-screen bg-slate-50 p-6 text-center">Checking your secure session…</main>;
  return session ? <CuentaCliente session={session} /> : <PortalLogin />;
}
