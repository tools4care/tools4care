import { CalendarCheck, Wrench } from "@phosphor-icons/react";
import ModuleHub from "../components/ModuleHub";
import { usePermisos } from "../hooks/usePermisos";

const serviceOptions = [
  {
    key: "suscripciones", to: "/suscripciones", title: "Subscriptions",
    description: "Manage recurring services, renewals and customer subscription status.",
    icon: CalendarCheck, accent: "from-violet-500 to-purple-700", surface: "from-violet-50 to-purple-50", border: "border-violet-200",
  },
  {
    key: "alquileres", to: "/alquileres", title: "Equipment Rentals",
    description: "Track rented equipment, due dates, returns and customer assignments.",
    icon: Wrench, accent: "from-emerald-500 to-teal-700", surface: "from-emerald-50 to-teal-50", border: "border-emerald-200",
  },
];

export default function ServicesHub() {
  const { puedeVerModulo } = usePermisos();
  return (
    <ModuleHub
      title="Services"
      description="Open subscriptions and equipment rentals from a dedicated service workspace."
      icon={Wrench}
      options={serviceOptions.filter(({ key }) => puedeVerModulo(key))}
    />
  );
}
