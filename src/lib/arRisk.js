// src/lib/arRisk.js
// Shared A/R collection-risk helpers, extracted from Reportes.jsx so the same
// logic can also drive the Dashboard's "collect today" widget without the two
// screens drifting out of sync with two separate copies.

export function daysSince(raw) {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

export function classifyArRisk({ saldo, age, score, utilization }) {
  const balance = Number(saldo || 0);
  const days = age == null ? null : Number(age);
  const use = utilization == null ? null : Number(utilization);

  if (balance <= 0) return { risk: "Low", reason: "No open balance." };
  if (balance < 30) return { risk: "Low", reason: "Small balance under $30." };
  if (balance < 75 && days != null && days <= 14) return { risk: "Low", reason: "Recent activity with a small balance." };

  const high =
    (balance >= 500 && (days == null || days >= 15)) ||
    (balance >= 250 && days != null && days >= 45) ||
    (balance >= 100 && days != null && days >= 60) ||
    (balance >= 100 && use != null && use >= 100) ||
    (balance >= 100 && Number(score || 0) > 0 && Number(score || 0) < 500);

  if (high) {
    return { risk: "High", reason: "Large, old, over-limit, or weak-score balance." };
  }

  const medium =
    balance >= 150 ||
    (balance >= 50 && days != null && days >= 21) ||
    (balance >= 75 && use != null && use >= 75) ||
    (balance >= 75 && Number(score || 0) > 0 && Number(score || 0) < 550);

  if (medium) {
    return { risk: "Medium", reason: "Needs follow-up, but not critical yet." };
  }

  return { risk: "Low", reason: "Current or low-dollar balance." };
}

export function buildCollectionMessage(row) {
  const name = row?.cliente_nombre || "there";
  const amount = `$${Number(row?.saldo || 0).toFixed(2)}`;
  return `Hi ${name}, this is Tools4Care. Our records show an open balance of ${amount}. Please let us know when you can take care of it. Thank you.`;
}

export function phoneLink(phone, type = "sms", body = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return type === "tel" ? `tel:${digits}` : `sms:${digits}${body ? `?&body=${encodeURIComponent(body)}` : ""}`;
}
