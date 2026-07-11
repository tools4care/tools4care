// src/lib/submitGuard.js
//
// A synchronous submit guard (mutex) to prevent a handler from running twice
// concurrently — e.g. a rapid double-click/double-tap on "Guardar venta".
//
// NOTE: src/Ventas.jsx does not use this yet. Its current guard is a React `saving`
// state flag only (Ventas.jsx:3757, 2877-2878), which is asynchronous — two clicks that
// both fire before React commits the state update can both pass the check. This module
// is the recommended fix, fully tested; wiring it into Ventas.jsx is a separate,
// reviewable follow-up change.

export function createSubmitGuard() {
  let busy = false;
  return {
    tryAcquire() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
    get isBusy() {
      return busy;
    },
  };
}

/**
 * Wraps an async function so that if it's already running, a concurrent call is
 * rejected instead of executed — the exact protection "Guardar venta" is missing today.
 */
export function guardAsync(fn) {
  const guard = createSubmitGuard();
  return async function guarded(...args) {
    if (!guard.tryAcquire()) {
      throw new Error("DUPLICATE_SUBMIT_BLOCKED");
    }
    try {
      return await fn(...args);
    } finally {
      guard.release();
    }
  };
}
