// Shared visit-cadence logic for barbershop tracking (Dashboard alerts +
// Reportes "Barbershop Visits"). Kept in one place so both screens always
// agree on what "overdue" means and how far back visit history counts.

// How far back a shop's sale history counts toward its cadence. Client
// barberia_id links get applied/backfilled after the fact, so this only
// needs to be a date real route history exists from — not when the
// auto-linking trigger shipped.
export const VISIT_LEARNING_START = "2025-10-01";

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function cadenceForGap(gap) {
  if (gap <= 10) return { label: "weekly", alertAfter: 14 };
  if (gap <= 21) return { label: "every two weeks", alertAfter: 24 };
  if (gap <= 45) return { label: "monthly", alertAfter: 45 };
  return { label: `every ~${Math.round(gap)} days`, alertAfter: Math.round(gap * 1.5) };
}
