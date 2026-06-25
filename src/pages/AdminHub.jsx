import { Link } from "react-router-dom";
import {
  BarChart3,
  FileCog,
  Globe2,
  Receipt,
  ScrollText,
  Shield,
  UserCog,
  WalletCards,
} from "lucide-react";
import PageHeader from "../components/ui/PageHeader";

const ADMIN_TOOLS = [
  {
    to: "/online",
    title: "Online Store",
    description: "Manage orders, catalog, discounts, and online inventory.",
    icon: Globe2,
    tone: "from-sky-500 to-blue-700",
  },
  {
    to: "/driver-expenses",
    title: "Driver Expenses",
    description: "Review driver spending, invoices, receipts, and closeout deductions.",
    icon: WalletCards,
    tone: "from-emerald-500 to-teal-700",
  },
  {
    to: "/comisiones",
    title: "Commissions",
    description: "Calculate and approve salesperson commissions.",
    icon: BarChart3,
    tone: "from-lime-500 to-emerald-700",
  },
  {
    to: "/tax",
    title: "Taxes",
    description: "Configure tax rules used by sales and invoices.",
    icon: Receipt,
    tone: "from-amber-500 to-orange-700",
  },
  {
    to: "/usuarios",
    title: "Users",
    description: "Manage roles, access, modules, and active users.",
    icon: UserCog,
    tone: "from-purple-500 to-fuchsia-700",
  },
  {
    to: "/auditoria",
    title: "Audit Log",
    description: "Track important changes, discounts, returns, and stock actions.",
    icon: ScrollText,
    tone: "from-rose-500 to-red-700",
  },
  {
    to: "/admin/new-client",
    title: "New Tenant",
    description: "Create a new client workspace manually.",
    icon: FileCog,
    tone: "from-slate-600 to-slate-900",
  },
];

export default function AdminHub() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={Shield}
        title="Admin"
        subtitle="One place for system management, finance controls, users, and audit tools"
        color="purple"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ADMIN_TOOLS.map(({ to, title, description, icon, tone }) => {
          const Icon = icon;
          return (
            <Link
              key={to}
              to={to}
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-md`}>
                  <Icon size={23} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black text-slate-900 dark:text-white">{title}</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>
                </div>
              </div>
              <div className="mt-4 h-1 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-1 w-10 rounded-full bg-gradient-to-r ${tone} transition-all group-hover:w-24`} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
