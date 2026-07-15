import { useState, useEffect } from "react";
import { useUsuario } from "./UsuarioContext";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";

// Iconos SVG consistentes con el Dashboard
const IconUser = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const IconLock = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const IconAlert = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  // showAlreadyLoggedModal removed — useEffect now auto-navigates to "/" when already logged in
  const { usuario, cargando } = useUsuario();
  const navigate = useNavigate();

  useEffect(() => {
    if (!cargando && usuario) {
      navigate("/", { replace: true });
    }
  }, [usuario, cargando, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErrorMsg("Incorrect email or password. Please try again.");
    }
  };

  // Loading state
  if (cargando) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 flex flex-col items-center">
          <div className="relative">
            <div className="w-20 h-20 border-8 border-blue-200 rounded-full"></div>
            <div className="w-20 h-20 border-8 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <div className="mt-6 text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Loading your session...
          </div>
          <div className="mt-2 text-sm text-gray-500">Please wait</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 p-4 sm:p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-slate-950 to-emerald-950 opacity-90" />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-5xl items-center justify-center sm:min-h-[calc(100vh-3rem)]">
        <div className="grid w-full overflow-hidden rounded-[30px] border border-white/10 bg-white shadow-2xl shadow-black/40 md:grid-cols-[0.92fr_1.08fr]">
          <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-blue-800 p-7 text-white sm:p-10">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-2xl" />
            <div className="relative flex h-full min-h-64 flex-col justify-between gap-10 md:min-h-[560px]">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-white/20">
                    <img src="/icons/icon-192.png" alt="Tools4Care" className="h-12 w-12 rounded-xl object-contain" />
                  </div>
                  <div>
                    <div className="text-xl font-black tracking-wide">TOOLS4CARE</div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-200">Sales workspace</div>
                  </div>
                </div>

                <div className="mt-12 hidden md:block">
                  <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-cyan-100">
                    One secure workspace
                  </div>
                  <h1 className="mt-5 max-w-sm text-4xl font-black leading-tight">Run every location with confidence.</h1>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
                    Physical Store, VAN routes and Online operations share reliable customers, inventory and financial records.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-200">
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-3">Store</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-3">VAN</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-3">Online</div>
              </div>
            </div>
          </section>

          <form onSubmit={handleLogin} className="flex flex-col justify-center bg-slate-50 p-7 sm:p-10" autoComplete="on">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Secure access</p>
                <h2 className="mt-2 text-3xl font-black text-slate-950">Welcome back</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">Sign in, then choose Store, VAN or Online.</p>
              </div>

              {errorMsg && (
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
                  <div className="mt-0.5 shrink-0 text-red-600"><IconAlert /></div>
                  <p className="text-sm font-semibold">{errorMsg}</p>
                </div>
              )}

              <div className="space-y-5">
                <div>
                  <label htmlFor="login-email" className="mb-2 block text-sm font-bold text-slate-700">Email address</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400"><IconUser /></div>
                    <input
                      id="login-email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="your@email.com"
                      className="h-14 w-full rounded-2xl border-2 border-slate-200 bg-white pl-12 pr-4 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      type="email"
                      required
                      autoFocus
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="mb-2 block text-sm font-bold text-slate-700">Password</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400"><IconLock /></div>
                    <input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      className="h-14 w-full rounded-2xl border-2 border-slate-200 bg-white pl-12 pr-4 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                <button type="submit" className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 font-black text-white shadow-lg shadow-blue-200 transition hover:from-blue-700 hover:to-indigo-700">
                  Sign in
                  <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>

              <div className="mt-7 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-sm font-bold text-blue-950">Need help?</p>
                <p className="mt-0.5 text-xs leading-5 text-blue-700">Contact your system administrator for credentials or support.</p>
              </div>

              <p className="mt-7 text-center text-xs text-slate-400">© {new Date().getFullYear()} TOOLS4CARE · Secure business operations</p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
