import { useRef, useState } from "react";
import { supabase } from "../supabaseClient";

export function PortalLogin() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const sendingRef = useRef(false);

  async function sendLink(event) {
    event.preventDefault();
    if (sendingRef.current) return;
    sendingRef.current = true;
    setStatus("sending");
    setError("");
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Route through the shared callback so Supabase redirect allow-lists
        // cannot fall back to the POS login page.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fportal`,
        data: { account_type: "portal_customer" },
      },
    });
    sendingRef.current = false;
    if (otpError) {
      setError(otpError.message || "We couldn't send your secure sign-in link.");
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <section className="mx-auto max-w-md bg-white rounded-2xl shadow-md p-6">
        <p className="text-sm font-bold text-blue-600">TOOLS4CARE</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Customer portal</h1>
        <p className="mt-2 text-sm text-slate-600">View your balance, invoices, purchases, and payments securely—no password required.</p>
        {status === "sent" ? (
          <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-bold">Check your email</p>
            <p className="mt-1">We sent you a secure, one-time sign-in link. You can close this page after opening it.</p>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={sendLink}>
            <label className="block text-sm font-semibold text-slate-700">
              Email address
              <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-60" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Email me a secure sign-in link"}
            </button>
            <p className="text-center text-xs leading-5 text-slate-500">For your security, each link can only be used once and expires automatically.</p>
          </form>
        )}
      </section>
    </main>
  );
}
