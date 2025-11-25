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

const IconCheck = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconLogout = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const IconDashboard = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showAlreadyLoggedModal, setShowAlreadyLoggedModal] = useState(false);
  const { usuario, cargando } = useUsuario();
  const navigate = useNavigate();

  useEffect(() => {
    if (!cargando && usuario) {
      setShowAlreadyLoggedModal(true);
    }
  }, [usuario, cargando]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErrorMsg("Incorrect email or password. Please try again.");
    }
  };

  // Modal: Already logged in
  const AlreadyLoggedModal = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header del modal */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconAlert />
            <h3 className="font-bold text-xl">Active Session</h3>
          </div>
          <button
            className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors text-xl"
            onClick={() => setShowAlreadyLoggedModal(false)}
          >
            ✖
          </button>
        </div>

        {/* Contenido del modal */}
        <div className="p-6 space-y-4">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border-2 border-amber-200 text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <IconCheck />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">You're already logged in!</h4>
            <p className="text-sm text-gray-600">
              You have an active session. Choose an option below.
            </p>
          </div>

          {/* Botones */}
          <div className="space-y-3">
            <button
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3.5 px-4 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group"
              onClick={() => navigate("/")}
            >
              <IconDashboard />
              <span>Go to Dashboard</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            <button
              className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white py-3.5 px-4 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.reload();
              }}
            >
              <IconLogout />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-400/20 rounded-full blur-3xl"></div>

      {/* Modal: Already logged in */}
      {showAlreadyLoggedModal && <AlreadyLoggedModal />}

      {/* Login Container */}
      <div className="w-full max-w-md relative z-10">
        {/* Logo/Brand Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-6 text-center">
          <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            TOOLS4CARE
          </h1>
          <p className="text-sm text-gray-600">Mobile Business Management System</p>
        </div>

        {/* Login Form Card */}
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-3xl shadow-xl p-8 space-y-6"
          autoComplete="on"
        >
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome Back</h2>
            <p className="text-sm text-gray-600">Sign in to access your dashboard</p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3">
              <div className="flex-shrink-0 text-red-600 mt-0.5">
                <IconAlert />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Email Input */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <IconUser />
              </div>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full pl-12 pr-4 py-3.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900 placeholder-gray-400"
                type="email"
                required
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <IconLock />
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900 placeholder-gray-400"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2 group"
          >
            <span>Sign In</span>
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>

          {/* Footer */}
          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              © {new Date().getFullYear()} TOOLS4CARE - All rights reserved
            </p>
          </div>
        </form>

        {/* Additional Info Card */}
        <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-blue-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-blue-900 mb-1">Need Help?</h4>
              <p className="text-xs text-blue-700">
                Contact your system administrator for login credentials or support.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}