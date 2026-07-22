import { supabase } from "../supabaseClient";

// Enforces one active session per user account: logging in on a new device
// overwrites the account's session row, and every other device polling that
// row notices the mismatch and signs itself out.

const LOCAL_SESSION_KEY = "t4c_active_session_id";

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

// Call right after a fresh login — claims this device as the account's only
// active session, immediately displacing any other device's session.
export async function claimActiveSession(userId) {
  const sessionId = makeSessionId();
  const { error } = await supabase
    .from("user_active_sessions")
    .upsert(
      { user_id: userId, session_id: sessionId, device_label: deviceLabel(), last_seen_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
  setLocalSessionId(sessionId);
  return sessionId;
}

// Call when an already-persisted Supabase session resumes (page load/reload,
// not a fresh login). If this device never claimed a session yet, adopt one
// silently instead of forcing a claim — otherwise shipping this feature
// would immediately log out everyone already signed in.
export async function ensureLocalSessionClaimed(userId) {
  if (getLocalSessionId()) return;
  await claimActiveSession(userId).catch(() => {});
}

// true = still the active session; false = another device has since
// displaced it; null = the check itself failed (offline/network error) —
// callers must not sign out on null.
export async function isSessionStillActive(userId) {
  const localId = getLocalSessionId();
  if (!localId) return true;
  const { data, error } = await supabase
    .from("user_active_sessions")
    .select("session_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  if (!data) return true;
  return data.session_id === localId;
}
