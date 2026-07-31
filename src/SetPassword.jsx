import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { completeTenantOnboarding } from "./lib/adminApi";

export default function SetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (password.length < 10) {
      setMessage("Use at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setStatus("loading");
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setMessage(error.message || "Password could not be saved.");
      return;
    }

    try {
      await completeTenantOnboarding();
      setStatus("success");
      setMessage("Your Tools4Care workspace is ready.");
      setTimeout(() => navigate("/van", { replace: true }), 900);
    } catch (onboardingError) {
      setStatus("error");
      setMessage(onboardingError.message || "The password was saved, but workspace activation failed.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
        <img src="/icons/icon-192.png" alt="Tools4Care" className="h-14 w-14 rounded-2xl" />
        <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-blue-700">Account setup</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Create your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This activates your business workspace and lets you sign in later with email and password.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
              autoComplete="new-password"
              required
              className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={10}
              autoComplete="new-password"
              required
              className="h-12 w-full rounded-xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          {message && (
            <div className={`rounded-xl border p-3 text-sm font-semibold ${
              status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading" || status === "success"}
            className="h-12 w-full rounded-xl bg-blue-600 font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {status === "loading" ? "Activating..." : status === "success" ? "Workspace ready" : "Activate workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
