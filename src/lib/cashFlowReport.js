const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function startOfWeek(isoDate) {
  const [year, month, day] = String(isoDate || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return date.toISOString().slice(0, 10);
}

export function aggregateLedgerByWeek(days = []) {
  const weeks = new Map();
  for (const day of days) {
    const weekStart = startOfWeek(day.business_date);
    if (!weekStart) continue;
    if (!weeks.has(weekStart)) {
      weeks.set(weekStart, {
        week_start: weekStart,
        money_in: 0,
        refunds: 0,
        expenses: 0,
        net_cash_movement: 0,
        net_ar_change: 0,
        cash_entries: 0,
      });
    }
    const week = weeks.get(weekStart);
    week.money_in = money(week.money_in + Number(day.money_in || 0));
    week.refunds = money(week.refunds + Number(day.refunds || 0));
    week.expenses = money(week.expenses + Number(day.expenses || 0));
    week.net_cash_movement = money(week.net_cash_movement + Number(day.net_cash_movement || 0));
    week.net_ar_change = money(week.net_ar_change + Number(day.net_ar_change || 0));
    week.cash_entries += Number(day.cash_entries || 0);
  }
  return Array.from(weeks.values()).sort((a, b) => a.week_start.localeCompare(b.week_start));
}

export function ledgerPeriodPreset(preset, todayIso) {
  const today = new Date(`${todayIso}T12:00:00Z`);
  const iso = (date) => date.toISOString().slice(0, 10);
  const mondayOffset = today.getUTCDay() === 0 ? 6 : today.getUTCDay() - 1;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() - mondayOffset);

  if (preset === "this_week") return { from: iso(thisMonday), to: todayIso };
  if (preset === "last_week") {
    const from = new Date(thisMonday); from.setUTCDate(from.getUTCDate() - 7);
    const to = new Date(thisMonday); to.setUTCDate(to.getUTCDate() - 1);
    return { from: iso(from), to: iso(to) };
  }
  const from = new Date(today);
  from.setUTCDate(today.getUTCDate() - (preset === "90_days" ? 89 : 29));
  return { from: iso(from), to: todayIso };
}
