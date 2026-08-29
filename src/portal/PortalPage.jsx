import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { CuentaCliente } from "./CuentaCliente";
import { PortalLogin } from "./PortalLogin";

export function PortalPage() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    let active = true;
    async function loadSession() {
      // Some mail clients strip the callback path and send the PKCE code
      // directly to /portal. Exchange it here as a defensive fallback before
      // rendering the login form.
      const code = new URL(window.location.href).searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => {});
        window.history.replaceState({}, "", "/portal");
      }
      const { data } = await supabase.auth.getSession();
      if (active) setSession(data.session || null);
    }
    loadSession();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (active) setSession(nextSession || null); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  if (session === undefined) return <main className="min-h-screen bg-slate-50 p-6 text-center">Checking your secure session…</main>;
  return session ? <CuentaCliente session={session} /> : <PortalLogin />;
}
