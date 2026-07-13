import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Gauge,
  History,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Timer,
  Wifi,
  XCircle,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "../components/ui/PageHeader";
import { supabase } from "../supabaseClient";

const CXC_API_BASE = import.meta.env.VITE_CXC_API_BASE || "https://cxc-api.onrender.com";
const APP_URL =
  import.meta.env.VITE_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://tools4care.vercel.app");

const LINKS = {
  sentry: import.meta.env.VITE_SENTRY_DASHBOARD_URL || "https://tools4caregmailcom.sentry.io/issues/",
  betterStack: import.meta.env.VITE_BETTERSTACK_DASHBOARD_URL || "https://uptime.betterstack.com/team/t565742/monitors",
  vercel: import.meta.env.VITE_VERCEL_ANALYTICS_URL || "https://vercel.com/edwins-projects-5abac2e2/tools4care/analytics",
  supabase: import.meta.env.VITE_SUPABASE_DASHBOARD_URL || "https://supabase.com/dashboard/project/gvloygqbavibmpakzdma",
};

const HISTORY_KEY = "tools4care-system-health-history";
const HISTORY_LIMIT = 30;

function getSentryStatus() {
  return Boolean(import.meta.env.VITE_SENTRY_DSN);
}

function getVercelStatus() {
  return Boolean(import.meta.env.VITE_VERCEL_ANALYTICS_ENABLED !== "false");
}

function formatTime(value) {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatMs(value) {
  if (!Number.isFinite(value)) return "n/a";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  try {
    const next = [entry, ...getHistory()].slice(0, HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

function statusRank(status) {
  return { error: 3, warn: 2, checking: 1, ok: 0 }[status] ?? 1;
}

function statusColor(status) {
  return {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    error: "bg-red-500",
    checking: "bg-slate-400",
  }[status] || "bg-slate-400";
}

function latencyTone(value, status) {
  if (status === "error") {
    return {
      label: "Down",
      detail: "No responde ahora mismo.",
      className: "text-red-700 bg-red-50 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800",
    };
  }
  if (!Number.isFinite(value)) {
    return {
      label: "Sin dato",
      detail: "Esperando la próxima lectura.",
      className: "text-slate-600 bg-slate-50 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
    };
  }
  if (value < 250) {
    return {
      label: "Rápido",
      detail: "Respuesta saludable.",
      className: "text-emerald-700 bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800",
    };
  }
  if (value < 1000) {
    return {
      label: "Normal",
      detail: "Todavía dentro de rango.",
      className: "text-blue-700 bg-blue-50 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800",
    };
  }
  return {
    label: "Lento",
    detail: "Revisar si se repite.",
    className: "text-amber-700 bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800",
  };
}

function StatusPill({ status }) {
  const styles = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800",
    warn: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800",
    error: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800",
    checking: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  };

  const labels = {
    ok: "OK",
    warn: "Warning",
    error: "Down",
    checking: "Checking",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles[status] || styles.checking}`}>
      {labels[status] || "Checking"}
    </span>
  );
}

function DashboardLink({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    >
      {label}
      <ExternalLink size={13} />
    </a>
  );
}

function LatencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-2 font-black text-slate-900 dark:text-white">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.stroke }} />
            <span className="font-semibold text-slate-600 dark:text-slate-300">{item.name}</span>
            <span className="font-black text-slate-900 dark:text-white">{formatMs(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceTrends({ history }) {
  const serviceMeta = [
    { id: "app", title: "Tools4Care App", color: "#2563eb" },
    { id: "cxc-api", title: "CxC API", color: "#7c3aed" },
    { id: "supabase", title: "Supabase", color: "#059669" },
  ];

  const chronological = history.slice().reverse();
  const chartData = chronological.map((entry) => {
    const row = { time: formatTime(entry.at) };
    serviceMeta.forEach((service) => {
      const sample = entry.services?.find((item) => item.id === service.id);
      row[service.id] = Number.isFinite(sample?.responseMs) ? sample.responseMs : null;
    });
    return row;
  });

  const rows = serviceMeta.map((service) => {
    const samples = history
      .slice()
      .reverse()
      .map((entry) => entry.services?.find((item) => item.id === service.id))
      .filter(Boolean);
    const latest = samples[samples.length - 1];
    return {
      ...service,
      title: latest?.title || service.title,
      latest,
      values: samples.map((sample) => sample.responseMs),
      statuses: samples.slice(-16).map((sample) => sample.status),
    };
  });

  const hasChartData = chartData.some((entry) => serviceMeta.some((service) => Number.isFinite(entry[service.id])));

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Gauge size={18} className="text-slate-500" />
          <h2 className="text-sm font-black text-slate-900 dark:text-white">Live Response Monitor</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            live
          </span>
        </div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Bajo 250ms es rápido. Sobre 1s es lento si se repite.
        </p>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{row.title}</h3>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ahora mismo</p>
              </div>
              <StatusPill status={row.latest?.status || "checking"} />
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-black text-slate-900 dark:text-white">{formatMs(row.latest?.responseMs)}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Última medición
                </p>
              </div>
              {(() => {
                const tone = latencyTone(row.latest?.responseMs, row.latest?.status);
                return (
                  <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${tone.className}`}>
                    {tone.label}
                  </span>
                );
              })()}
            </div>

            <div className="mt-3 flex gap-1" aria-label={`Recent status for ${row.title}`}>
              {row.statuses.length === 0 ? (
                <span className="text-xs text-slate-400">No samples yet</span>
              ) : row.statuses.map((status, index) => (
                <span
                  key={`${row.id}-${index}`}
                  className={`h-3 flex-1 rounded-full ${statusColor(status)}`}
                  title={status}
                />
              ))}
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {latencyTone(row.latest?.responseMs, row.latest?.status).detail}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 p-4 dark:border-slate-700">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
          {serviceMeta.map((service) => (
            <span key={service.id} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: service.color }} />
              {service.title}
            </span>
          ))}
          <span className="ml-auto hidden text-slate-400 sm:inline">ms = tiempo de respuesta</span>
        </div>

        <div className="h-72 rounded-lg bg-slate-50 p-2 dark:bg-slate-950/30">
          {hasChartData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 18, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={26} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => formatMs(value)}
                  width={56}
                  domain={[0, "dataMax + 150"]}
                />
                <Tooltip content={<LatencyTooltip />} />
                <ReferenceLine y={250} stroke="#10b981" strokeDasharray="4 4" label={{ value: "rápido", fontSize: 11, fill: "#059669" }} />
                <ReferenceLine y={1000} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "lento", fontSize: 11, fill: "#d97706" }} />
                {serviceMeta.map((service) => (
                  <Line
                    key={service.id}
                    type="monotone"
                    dataKey={service.id}
                    name={service.title}
                    stroke={service.color}
                    strokeWidth={3}
                    dot={{ r: 3, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                    isAnimationActive
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500 dark:text-slate-400">
              Todavía no hay suficientes lecturas. Déjalo abierto o presiona Refresh.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HealthCard({ icon: Icon, title, description, status, detail, checkedAt, responseMs, url, link, recommendation }) {
  const statusIcon = {
    ok: <CheckCircle2 className="text-emerald-500" size={22} />,
    warn: <AlertTriangle className="text-amber-500" size={22} />,
    error: <XCircle className="text-red-500" size={22} />,
    checking: <RefreshCw className="animate-spin text-slate-400" size={22} />,
  }[status] || <RefreshCw className="animate-spin text-slate-400" size={22} />;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Icon size={21} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        {statusIcon}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusPill status={status} />
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Clock3 size={13} />
          {formatTime(checkedAt)}
        </span>
        {Number.isFinite(responseMs) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800">
            <Timer size={13} />
            {formatMs(responseMs)}
          </span>
        )}
      </div>

      {url && <p className="mt-3 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{url}</p>}

      {detail && (
        <p className="mt-2 break-words rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {detail}
        </p>
      )}

      {recommendation && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {recommendation}
        </p>
      )}

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-800 dark:text-blue-300"
        >
          Open dashboard
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

export default function SystemHealth() {
  const [checks, setChecks] = useState([]);
  const [history, setHistory] = useState(() => getHistory());
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(60);

  const staticChecks = useMemo(() => [
    {
      id: "sentry",
      title: "Sentry",
      description: "Frontend error monitoring and issue alerts.",
      icon: ShieldCheck,
      status: getSentryStatus() ? "ok" : "warn",
      detail: getSentryStatus()
        ? "VITE_SENTRY_DSN is present. Browser errors should report to Sentry."
        : "Missing VITE_SENTRY_DSN. Error reporting is disabled.",
      link: LINKS.sentry,
      recommendation: getSentryStatus() ? "" : "Add VITE_SENTRY_DSN in Vercel production variables.",
    },
    {
      id: "vercel-analytics",
      title: "Vercel Analytics",
      description: "Visits, page usage, Web Vitals, and Speed Insights.",
      icon: BarChart3,
      status: getVercelStatus() ? "ok" : "warn",
      detail: "Analytics appears in Vercel after production traffic is collected.",
      link: LINKS.vercel,
    },
    {
      id: "browser-network",
      title: "Browser Network",
      description: "Current device connection state.",
      icon: Wifi,
      status: navigator.onLine ? "ok" : "error",
      detail: navigator.onLine ? "Browser reports online." : "Browser reports offline.",
    },
  ], []);

  const checkWithTiming = useCallback(async ({ id, title, description, icon, url, link, timeoutMs = 15000, request }) => {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await request(controller.signal);
      return {
        id,
        title,
        description,
        icon,
        url,
        link,
        checkedAt: new Date(),
        responseMs: performance.now() - startedAt,
        ...result,
      };
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      return {
        id,
        title,
        description,
        icon,
        url,
        link,
        status: timedOut ? "warn" : "error",
        detail: timedOut ? `Timed out after ${Math.round(timeoutMs / 1000)}s.` : error?.message || "Check failed.",
        recommendation: timedOut
          ? "This can happen during a Render cold start. Better Stack is the source of truth for outage alerts."
          : "Open the linked dashboard and check recent incidents/logs.",
        checkedAt: new Date(),
        responseMs: performance.now() - startedAt,
      };
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const runChecks = useCallback(async () => {
    const checkedAt = new Date();
    setLoading(true);
    setChecks([
      ...staticChecks.map((item) => ({ ...item, checkedAt })),
      {
        id: "app",
        title: "Tools4Care App",
        description: "Production app responds from Vercel.",
        icon: Activity,
        status: "checking",
        detail: "Checking production app.",
        url: APP_URL,
        link: LINKS.betterStack,
        checkedAt,
      },
      {
        id: "cxc-api",
        title: "CxC API",
        description: "Render API health endpoint and DB status.",
        icon: Server,
        status: "checking",
        detail: "Checking API health endpoint.",
        url: `${CXC_API_BASE}/health`,
        link: LINKS.betterStack,
        checkedAt,
      },
      {
        id: "supabase",
        title: "Supabase",
        description: "Auth/session endpoint is reachable.",
        icon: Database,
        status: "checking",
        detail: "Checking Supabase auth session.",
        link: LINKS.supabase,
        checkedAt,
      },
    ]);

    const results = await Promise.all([
      checkWithTiming({
        id: "app",
        title: "Tools4Care App",
        description: "Production app responds from Vercel.",
        icon: Activity,
        url: APP_URL,
        link: LINKS.betterStack,
        timeoutMs: 12000,
        request: async (signal) => {
          const res = await fetch(APP_URL, { method: "HEAD", signal, cache: "no-store" });
          return {
            status: res.ok ? "ok" : "error",
            detail: `${APP_URL} returned HTTP ${res.status}.`,
            recommendation: res.ok ? "" : "Open Vercel and Better Stack to inspect the deployment and outage history.",
          };
        },
      }),
      checkWithTiming({
        id: "cxc-api",
        title: "CxC API",
        description: "Render API health endpoint and DB status.",
        icon: Server,
        url: `${CXC_API_BASE}/health`,
        link: LINKS.betterStack,
        timeoutMs: 25000,
        request: async (signal) => {
          let res = await fetch(`${CXC_API_BASE}/health`, { signal, cache: "no-store" });
          if ([502, 503, 504].includes(res.status)) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            res = await fetch(`${CXC_API_BASE}/health`, { signal, cache: "no-store" });
          }
          const payload = await res.json().catch(() => null);
          const dbOk = payload?.db === true || payload?.ok === true;
          return {
            status: res.ok && dbOk ? "ok" : res.ok ? "warn" : "error",
            detail: payload ? `HTTP ${res.status}. ${JSON.stringify(payload)}` : `HTTP ${res.status}.`,
            recommendation: res.ok && !dbOk
              ? "API responded, but the DB health value was not clearly OK."
              : res.ok ? "" : "Check Render logs and Better Stack incidents.",
          };
        },
      }),
      checkWithTiming({
        id: "supabase",
        title: "Supabase",
        description: "Auth/session endpoint is reachable.",
        icon: Database,
        link: LINKS.supabase,
        timeoutMs: 12000,
        request: async () => {
          const started = performance.now();
          const { data, error } = await supabase.auth.getSession();
          return {
            status: error ? "error" : "ok",
            detail: error ? error.message : data?.session ? "Session found." : "Reachable. No active session required.",
            responseMs: performance.now() - started,
            recommendation: error ? "Open Supabase Auth logs and API logs." : "",
          };
        },
      }),
    ]);

    const nextChecks = [
      ...staticChecks.map((item) => ({ ...item, checkedAt })),
      ...results,
    ];

    setChecks(nextChecks);
    setLastRun(checkedAt);
    setLoading(false);

    const nextHistory = saveHistory({
      at: checkedAt.toISOString(),
      counts: nextChecks.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {}),
      averageResponseMs: Math.round(
        results
          .filter((item) => Number.isFinite(item.responseMs))
          .reduce((sum, item, _index, arr) => sum + item.responseMs / arr.length, 0)
      ),
      services: results.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        responseMs: Number.isFinite(item.responseMs) ? Math.round(item.responseMs) : null,
      })),
      worstStatus: nextChecks.reduce((worst, item) => statusRank(item.status) > statusRank(worst) ? item.status : worst, "ok"),
    });
    setHistory(nextHistory);
  }, [checkWithTiming, staticChecks]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const interval = setInterval(() => {
      runChecks();
    }, refreshSeconds * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshSeconds, runChecks]);

  const counts = checks.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const dynamicChecks = checks.filter((item) => Number.isFinite(item.responseMs));
  const avgResponse = dynamicChecks.length
    ? dynamicChecks.reduce((sum, item) => sum + item.responseMs, 0) / dynamicChecks.length
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={Activity}
        title="System Health"
        subtitle="Live checks, response times, dashboard links, and recent local history"
        color="blue"
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={(counts.error || 0) > 0 ? "error" : (counts.warn || 0) > 0 ? "warn" : "ok"} />
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{counts.ok || 0} healthy</span>
            {(counts.warn || 0) > 0 && <span className="text-sm font-semibold text-amber-600">{counts.warn} warnings</span>}
            {(counts.error || 0) > 0 && <span className="text-sm font-semibold text-red-600">{counts.error} down</span>}
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <Gauge size={16} />
              Avg response: {formatMs(avgResponse)}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <Clock3 size={16} />
              Last run: {formatTime(lastRun)}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              {autoRefresh ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
              {autoRefresh ? `Live every ${refreshSeconds}s` : "Live paused"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={autoRefresh ? String(refreshSeconds) : "off"}
            onChange={(event) => {
              if (event.target.value === "off") {
                setAutoRefresh(false);
                return;
              }
              setRefreshSeconds(Number(event.target.value));
              setAutoRefresh(true);
            }}
            className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="30">Live 30s</option>
            <option value="60">Live 60s</option>
            <option value="120">Live 2m</option>
            <option value="off">Paused</option>
          </select>
          <button
            type="button"
            onClick={runChecks}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <DashboardLink href={LINKS.sentry} label="Sentry Issues" />
        <DashboardLink href={LINKS.betterStack} label="Better Stack Monitors" />
        <DashboardLink href={LINKS.vercel} label="Vercel Analytics" />
        <DashboardLink href={LINKS.supabase} label="Supabase Dashboard" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => (
          <HealthCard key={check.id} {...check} />
        ))}
      </div>

      <ServiceTrends history={history} />

      <div className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <History size={18} className="text-slate-500" />
          <h2 className="text-sm font-black text-slate-900 dark:text-white">Recent Local Checks</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Overall</th>
                <th className="px-4 py-3">Healthy</th>
                <th className="px-4 py-3">Warnings</th>
                <th className="px-4 py-3">Down</th>
                <th className="px-4 py-3">Avg Response</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={6}>No local check history yet.</td>
                </tr>
              ) : history.map((entry) => (
                <tr key={entry.at}>
                  <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">{formatTime(entry.at)}</td>
                  <td className="px-4 py-3"><StatusPill status={entry.worstStatus} /></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.counts?.ok || 0}</td>
                  <td className="px-4 py-3 text-amber-600">{entry.counts?.warn || 0}</td>
                  <td className="px-4 py-3 text-red-600">{entry.counts?.error || 0}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatMs(entry.averageResponseMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
