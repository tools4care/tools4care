import { createElement } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";

export default function ModuleHub({ eyebrow = "Workspace", title, description, icon, options }) {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#142d4c] via-[#173b62] to-[#255a88] px-6 py-8 text-white sm:px-9">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-300/10 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              {createElement(icon, { size: 30, weight: "duotone" })}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">{eyebrow}</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">{description}</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="mb-5">
            <h2 className="text-xl font-black text-slate-900">What would you like to open?</h2>
            <p className="mt-1 text-sm text-slate-500">Select an option to continue.</p>
          </div>
          <div className={`grid gap-4 ${options.length >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"}`}>
            {options.map(({ to, title: optionTitle, description: optionDescription, icon: optionIcon, accent, surface, border }) => (
              <Link
                key={to}
                to={to}
                className={`group flex min-h-52 flex-col rounded-2xl border ${border} bg-gradient-to-br ${surface} p-5 transition duration-200 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-md`}>
                  {createElement(optionIcon, { size: 26, weight: "duotone" })}
                </div>
                <h3 className="mt-5 text-xl font-black text-slate-900">{optionTitle}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{optionDescription}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                  Open {optionTitle}
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
