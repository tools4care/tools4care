import { useEffect, useRef } from "react";

// Runs `callback` `delay`ms after the last change to `deps` — cancels any
// pending run if deps change again before it fires (or on unmount). Use for
// "search as you pick a date/filter" instead of requiring a separate button.
export function useDebouncedEffect(callback, deps, delay = 350) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const timer = setTimeout(() => callbackRef.current(), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
