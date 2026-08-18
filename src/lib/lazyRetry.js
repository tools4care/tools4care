import { lazy } from "react";

// Vite chunk filenames are content-hashed, so a deploy that ships between a
// client loading the app shell and it navigating to a not-yet-visited route
// leaves that client holding an index.html that references a chunk file the
// new deploy no longer has — the dynamic import 404s with "Failed to fetch
// dynamically imported module". A hard reload fixes it (fresh index.html,
// current hashes), so do that once automatically instead of dropping the
// user on the generic error screen. Guarded per-component in sessionStorage
// so a route that's genuinely broken doesn't reload-loop forever — it just
// falls through to the error boundary on the second failure.
export function lazyRetry(factory, name) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      const key = `lazyRetry:${name}`;
      const alreadyReloaded = window.sessionStorage.getItem(key) === "1";
      if (!alreadyReloaded) {
        window.sessionStorage.setItem(key, "1");
        window.location.reload();
        // Reload is in flight; never resolve so React doesn't render a
        // broken module in the moment before the page actually navigates.
        return new Promise(() => {});
      }
      window.sessionStorage.removeItem(key);
      throw error;
    }
  });
}
