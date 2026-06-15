// src/components/ui/PageHeader.jsx
// Shared gradient page header used across modules, based on the
// pattern from AuditoriaLog. Each `color` maps to a from/to gradient
// pair and a matching subtitle tint.

const COLOR_MAP = {
  blue: { gradient: "from-slate-800 to-blue-900", subtitle: "text-blue-200" },
  pink: { gradient: "from-slate-800 to-pink-900", subtitle: "text-pink-200" },
  indigo: { gradient: "from-slate-800 to-indigo-900", subtitle: "text-indigo-200" },
  orange: { gradient: "from-slate-800 to-orange-900", subtitle: "text-orange-200" },
  purple: { gradient: "from-slate-800 to-purple-900", subtitle: "text-purple-200" },
  emerald: { gradient: "from-slate-800 to-emerald-900", subtitle: "text-emerald-200" },
};

export default function PageHeader({ icon: Icon, title, subtitle, color = "blue", actions, className = "" }) {
  const { gradient, subtitle: subtitleClass } = COLOR_MAP[color] || COLOR_MAP.blue;

  return (
    <div className={`bg-gradient-to-br ${gradient} text-white rounded-2xl px-6 py-5 mb-6 flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon size={22} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className={`${subtitleClass} text-xs mt-0.5`}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
