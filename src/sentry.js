import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const sentryEnabled = Boolean(dsn) && import.meta.env.MODE !== "test";

function numberEnv(name, fallback) {
  const raw = import.meta.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function isExpectedAbort(event, hint) {
  const original = hint?.originalException;
  const exception = event?.exception?.values?.[0];
  const name = original?.name || exception?.type;
  const message = String(original?.message || exception?.value || event?.message || "").toLowerCase();

  return name === "AbortError" || message.includes("signal is aborted") || message.includes("the operation was aborted");
}

export function initSentry() {
  if (!sentryEnabled) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event, hint) {
      if (isExpectedAbort(event, hint)) return null;
      return event;
    },
    tracesSampleRate: numberEnv("VITE_SENTRY_TRACES_SAMPLE_RATE", 0.1),
    replaysSessionSampleRate: numberEnv("VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE", 0),
    replaysOnErrorSampleRate: numberEnv("VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE", 1),
  });
}

export function identifySentryUser(usuario) {
  if (!sentryEnabled) return;

  if (!usuario) {
    Sentry.setUser(null);
    Sentry.setTag("user_role", undefined);
    return;
  }

  Sentry.setUser({
    id: usuario.id,
    email: usuario.email,
    username: usuario.nombre,
  });
  Sentry.setTag("user_role", usuario.rol || "unknown");
}

export function setSentryVan(van) {
  if (!sentryEnabled) return;

  if (!van) {
    Sentry.setContext("van", null);
    Sentry.setTag("van_id", undefined);
    return;
  }

  Sentry.setContext("van", {
    id: van.id,
    nombre: van.nombre || van.nombre_van,
    tipo: van.tipo,
  });
  Sentry.setTag("van_id", van.id);
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
