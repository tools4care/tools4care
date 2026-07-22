import { supabase } from "../supabaseClient";

// Enforces up to MAX_CONCURRENT_SESSIONS active sessions per user account —
// e.g. scanning from a phone while completing the sale on a laptop. Logging
// in on a device beyond that limit evicts the oldest session, and that
// device's periodic poll notices it's gone and signs itself out.

const LOCAL_SESSION_KEY = "t4c_active_session_id";
const MAX_CONCURRENT_SESSIONS = 2;

function makeSessionId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function deviceLabel() {
  const ua = navigator.userAgent || "";
  return ua.slice(0, 120);
}

export function getLocalSessionId() {
  try { return localStorage.getItem(LOCAL_SESSION_KEY); } catch { return null; }
}

function setLocalSessionId(id) {
  try {
    if (id) localStorage.setItem(LOCAL_SESSION_KEY, id);
    else localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch { /* storage unavailable */ }
}

export function clearLocalSessionId() {
  setLocalSessionId(null);
}

// Call right after a fresh login — claims one of this account's session
// slots (the actor is derived server-side from auth.uid()). If that pushes
// the account over MAX_CONCURRENT_SESSIONS, the oldest session is evicted.
export async function claimActiveSession() {
  const sessionId = makeSessionId();
  const { error } = await supabase.rpc("claim_user_session_slot", {
    p_session_id: sessionId,
    p_device_label: deviceLabel(),
    p_max_sessions: MAX_CONCURRENT_SESSIONS,
  });
  if (error) throw error;
  setLocalSessionId(sessionId);
  return sessionId;
}

// Call when an already-persisted Supabase session resumes (page load/reload,
// not a fresh login). If this device never claimed a session yet, adopt one
// silently instead of forcing a claim — otherwise shipping this feature
// would immediately log out everyone already signed in.
export async function ensureLocalSessionClaimed() {
  if (getLocalSessionId()) return;
  await claimActiveSession().catch(() => {});
}

// true = this device still holds one of the account's session slots;
// false = a newer login elsewhere evicted it; null = the check itself
// failed (offline/network error) — callers must not sign out on null.
export async function isSessionStillActive(userId) {
  const localId = getLocalSessionId();
  if (!localId) return true;
  const { data, error } = await supabase
    .from("user_active_sessions")
    .select("session_id")
    .eq("user_id", userId)
    .eq("session_id", localId)
    .maybeSingle();
  if (error) return null;
  return Boolean(data);
}
