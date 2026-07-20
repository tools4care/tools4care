import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

export default function PrimarySearch({
  id,
  label,
  description,
  placeholder,
  value,
  onChange,
  onKeyDown,
  onClear,
  inputRef,
  rightAction,
  hint = "Start typing to filter",
  status,
  busy = false,
  busyLabel = "Searching",
  children,
  className = "",
  autoFocus = true,
}) {
  const localInputRef = useRef(null);
  const shellRef = useRef(null);
  const resolvedInputRef = inputRef || localInputRef;

  useEffect(() => {
    if (!autoFocus) return undefined;
    const frame = window.requestAnimationFrame(() => {
      resolvedInputRef.current?.focus({ preventScroll: true });
      if (window.innerWidth < 768) {
        shellRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, resolvedInputRef]);

  function clearSearch() {
    if (onClear) onClear();
    else onChange?.("");
    window.requestAnimationFrame(() => resolvedInputRef.current?.focus());
  }

  return (
    <section
      ref={shellRef}
      aria-labelledby={`${id}-label`}
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800 sm:p-5 ${className}`}
    >
      <div className="mb-2 flex items-end justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2 id={`${id}-label`} className="text-sm font-black text-slate-800 dark:text-slate-100">
            {label}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
        {hint && (
          <span className="hidden shrink-0 text-[11px] font-semibold text-blue-600 sm:block">{hint}</span>
        )}
      </div>

      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-500"
            size={21}
          />
          <input
            ref={resolvedInputRef}
            id={id}
            data-testid={id}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus={autoFocus}
            aria-label={label}
            className="min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white py-3.5 pl-12 pr-12 text-base font-semibold text-slate-950 shadow-sm outline-none transition-all placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 sm:text-lg"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange?.(event.target.value, event)}
            onFocus={() => {
              window.requestAnimationFrame(() => {
                shellRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") clearSearch();
              onKeyDown?.(event);
            }}
          />
          {value && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label={`Clear ${label.toLowerCase()}`}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
            >
              <X size={18} />
            </button>
          )}
        </div>
        {rightAction}
      </div>

      {(status || busy) && (
        <div className="mt-2 flex min-h-5 items-center justify-between gap-3 px-0.5 text-[11px] font-semibold">
          <span className="text-slate-500 dark:text-slate-400">{status}</span>
          {busy && (
            <span className="flex shrink-0 items-center gap-1.5 text-blue-600">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              {busyLabel}
            </span>
          )}
        </div>
      )}

      {children && <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">{children}</div>}
    </section>
  );
}
