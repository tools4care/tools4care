import { useState, useEffect } from "react";
import { useUsuario } from "./UsuarioContext";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";

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
    // If no error, the context will redirect automatically
  };

  // Modal: Already logged in
  const AlreadyLoggedModal = () =>
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full relative flex flex-col items-center">
        <button
          className="absolute top-2 right-4 text-2xl text-gray-400 hover:text-black"
          onClick={() => setShowAlreadyLoggedModal(false)}
        >×</button>
        <div className="mb-3 text-yellow-500">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" strokeWidth="2"
            viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12A9 9 0 103 12a9 9 0 0018 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-yellow-600 mb-2 text-center">You already have an active session</h3>
        <div className="text-gray-700 text-center mb-5">
          Please log out if you want to use another account.<br />
        </div>
        <div className="flex gap-2 mt-2 w-full">
          <button
            className="flex-1 bg-blue-700 text-white py-2 rounded-lg font-semibold hover:bg-blue-800"
            onClick={() => navigate("/")}
          >
            Go to Dashboard
          </button>
          <button
            className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.reload();
            }}
          >
            Log Out
          </button>
        </div>
      </div>
    </div>;

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-blue-700">
        <svg className="animate-spin h-12 w-12 mb-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <div className="text-lg font-medium">Loading your session...</div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* MODAL: Already logged in */}
      {showAlreadyLoggedModal && <AlreadyLoggedModal />}

      {/* Login Form */}
      <form
        onSubmit={handleLogin}
        className="flex flex-col gap-3 max-w-xs mx-auto mt-32 bg-white rounded-xl shadow p-8 border"
        autoComplete="on"
      >
        <h2 className="text-2xl font-bold mb-4 text-center text-blue-900">Sign In</h2>
        {errorMsg && (
          <div className="bg-red-100 text-red-700 border border-red-300 rounded px-3 py-2 text-sm text-center">
            {errorMsg}
          </div>
        )}
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          className="border rounded px-3 py-2 focus:outline-blue-400"
          type="email"
          required
          autoFocus
          autoComplete="username"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="border rounded px-3 py-2 focus:outline-blue-400"
          required
          autoComplete="current-password"
        />
        <button
          type="submit"
          className="bg-blue-700 hover:bg-blue-800 text-white py-2 rounded-xl font-semibold shadow mt-2 transition"
        >
          Sign In
        </button>
        <div className="text-xs text-center text-gray-400 mt-2">
          © {new Date().getFullYear()} TOOLS4CARE
        </div>
      </form>
    </div>
  );
}
