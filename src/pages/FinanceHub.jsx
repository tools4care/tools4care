import { createElement } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChartBar, CreditCard, FileText, TrendUp } from "@phosphor-icons/react";
import { usePermisos } from "../hooks/usePermisos";

const financeOptions = [
  {
    key: "facturas",
    to: "/facturas",
    title: "Invoices",
    description: "Find invoices, review payment status and open transaction details.",
    icon: FileText,
    accent: "from-violet-500 to-purple-700",
    surface: "from-violet-50 to-purple-50",
    border: "border-violet-200",
  },
  {
    key: "cxc",
    to: "/cxc",
    title: "Accounts Receivable",
    description: "Review customer balances, pending collections and payment history.",
    icon: CreditCard,
    accent: "from-amber-500 to-orange-600",
    surface: "from-amber-50 to-orange-50",
    border: "border-amber-200",
  },
  {
    key: "reportes",
    to: "/reportes",
    title: "Reports",
    description: "Analyze sales, collections, inventory and business performance.",
    icon: ChartBar,
    accent: "from-rose-500 to-pink-700",
    surface: "from-rose-50 to-pink-50",
    border: "border-rose-200",
  },
];

export default function FinanceHub() {
  const { puedeVerModulo } = usePermisos();
  const visibleOptions = financeOptions.filter(({ key }) => puedeVerModulo(key));

  return (
    <div className="mx-auto w-full max-w-7xl">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#142d4c] via-[#173b62] to-[#255a88] px-6 py-8 text-white sm:px-9">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-300/10 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <TrendUp size={30} weight="duotone" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Workspace</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Finance</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                Choose the financial area you want to work with. All options remain one click away.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="mb-5">
            <h2 className="text-xl font-black text-slate-900">What would you like to open?</h2>
            <p className="mt-1 text-sm text-slate-500">Select an option to continue.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {visibleOptions.map(({ to, title, description, icon: Icon, accent, surface, border }) => (
              <Link
                key={to}
                to={to}
                className={`group flex min-h-56 flex-col rounded-2xl border ${border} bg-gradient-to-br ${surface} p-5 transition duration-200 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-md`}>
                  {createElement(Icon, { size: 26, weight: "duotone" })}
                </div>
                <h3 className="mt-5 text-xl font-black text-slate-900">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                  Open {title}
                  <ArrowRight size={17} weight="bold" className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
