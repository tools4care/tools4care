import { ArrowsClockwise, Gear, Package, Stack, UserCircle, Warning } from "@phosphor-icons/react";
import ModuleHub from "../components/ModuleHub";
import { usePermisos } from "../hooks/usePermisos";
import { useStoreMode } from "../hooks/useStoreMode";

export default function OperationsHub() {
  const { isAdmin, puedeVerModulo } = usePermisos();
  const { storeMode } = useStoreMode();
  const options = [
    {
      key: "inventario", to: "/inventario", title: "Inventory",
      description: "Review stock, transfers and product availability by location.",
      icon: Stack, accent: "from-teal-500 to-cyan-700", surface: "from-teal-50 to-cyan-50", border: "border-teal-200",
    },
    {
      key: "cierres", to: "/cierres", title: storeMode ? "Store Closeout" : "Van Closeout",
      description: "Count, reconcile and document the operational closeout.",
      icon: ArrowsClockwise, accent: "from-blue-500 to-indigo-700", surface: "from-blue-50 to-indigo-50", border: "border-blue-200",
    },
    {
      key: "suplidores", to: "/suplidores", title: "Suppliers",
      description: "Manage supplier records, purchases and business contacts.",
      icon: UserCircle, accent: "from-indigo-500 to-blue-700", surface: "from-indigo-50 to-blue-50", border: "border-indigo-200",
    },
    {
      key: "emergencia", to: "/emergencia", title: "Essentials",
      description: "Open the essential products and priority operational tools.",
      icon: Warning, accent: "from-cyan-500 to-blue-700", surface: "from-cyan-50 to-blue-50", border: "border-cyan-200",
    },
    ...(storeMode && isAdmin ? [{
      key: "tax", to: "/tax", title: "Store Settings",
      description: "Configure taxes and location-specific store settings.",
      icon: Gear, accent: "from-slate-500 to-slate-700", surface: "from-slate-50 to-gray-100", border: "border-slate-200",
    }] : []),
  ].filter(({ key }) => key === "emergencia" || key === "tax" || puedeVerModulo(key));

  return (
    <ModuleHub
      title="Operations"
      description="Inventory, closeouts, suppliers and essential operational tools in one place."
      icon={Package}
      options={options}
    />
  );
}
