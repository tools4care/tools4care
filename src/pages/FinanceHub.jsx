import { ChartBar, CreditCard, FileText, TrendUp } from "@phosphor-icons/react";
import ModuleHub from "../components/ModuleHub";
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
    <ModuleHub
      title="Finance"
      description="Choose the financial area you want to work with. All options remain one click away."
      icon={TrendUp}
      options={visibleOptions}
    />
  );
}
