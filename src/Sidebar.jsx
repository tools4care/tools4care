import { Link, useLocation } from "react-router-dom";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { usePermisos } from "./hooks/usePermisos";
// ICONS Lucide
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Users,
  Users2,
  Package,
  Boxes,
  Repeat,
  LogOut,
  CreditCard,
  UserCircle2,
  DollarSign,
  BarChart2,
  Shield,
  Globe,
  Star,
} from "lucide-react";

const ICON_SIZE = 22;

function NavLink({ to, icon, text, location }) {
  const isActive = location.pathname === to || location.pathname.startsWith(to + "/");
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 ${
        isActive
          ? "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg"
          : "hover:bg-[#23395d] hover:shadow-md"
      }`}
    >
      <div className={`transition-transform duration-300 ${isActive ? "scale-110" : "scale-100"}`}>
        {icon}
      </div>
      <span className="transition-all duration-300">{text}</span>
      {isActive && (
        <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse" />
      )}
    </Link>
  );
}

export default function Sidebar() {
  const { usuario } = useUsuario();
  const { van, setVan } = useVan();
  const location = useLocation();
  const { isAdmin, isSupervisor, puedeVerSuplidores, puedeCambiarVan } = usePermisos();

  // ── Main menu (visible to ALL roles) ──
  const menuBase = [
    { to: "/",          icon: <LayoutDashboard size={ICON_SIZE} className="text-blue-400" />,  text: "Dashboard" },
    { to: "/ventas",    icon: <ShoppingCart    size={ICON_SIZE} className="text-green-500" />,  text: "Sales" },
    { to: "/facturas",  icon: <FileText        size={ICON_SIZE} className="text-purple-500" />, text: "Invoices" },
    { to: "/clientes",  icon: <Users           size={ICON_SIZE} className="text-yellow-500" />, text: "Customers" },
    { to: "/productos", icon: <Package         size={ICON_SIZE} className="text-pink-500" />,   text: "Products" },
    { to: "/inventario",icon: <Boxes           size={ICON_SIZE} className="text-teal-500" />,   text: "Inventory" },
    { to: "/cierres",   icon: <Repeat          size={ICON_SIZE} className="text-cyan-600" />,   text: "Van Closeout" },
    { to: "/cxc",       icon: <CreditCard      size={ICON_SIZE} className="text-orange-400" />, text: "Accounts Receivable" },
    { to: "/reportes",  icon: <BarChart2       size={ICON_SIZE} className="text-rose-400" />,   text: "Reports" },
  ];

  // Suppliers only if permitted
  if (puedeVerSuplidores) {
    menuBase.splice(8, 0, {
      to: "/suplidores",
      icon: <UserCircle2 size={ICON_SIZE} className="text-indigo-400" />,
      text: "Suppliers",
    });
  }

  // ── Admin-only section ──
  const adminMenu = [
    { to: "/comisiones", icon: <DollarSign size={ICON_SIZE} className="text-emerald-400" />, text: "Commissions" },
    { to: "/online",     icon: <Globe      size={ICON_SIZE} className="text-sky-400"     />, text: "Online Store" },
    { to: "/usuarios",   icon: <Shield     size={ICON_SIZE} className="text-purple-400"  />, text: "Users" },
  ];

  function handleLogout() {
    localStorage.clear();
    window.location.href = "/login";
  }

  return (
    <aside className="bg-[#162941] text-white min-h-screen w-[220px] flex flex-col justify-between py-5 px-3 transition-all duration-300">
      <div>
        {/* ── Brand ── */}
        <div className="font-bold text-lg mb-6 ml-2 tracking-wide transition-all duration-300 hover:scale-105">
          TOOLS4CARE
        </div>

        {/* ── Role badge ── */}
        <div className="mb-4 mx-1">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
              isAdmin
                ? "bg-purple-900/60 text-purple-300 border border-purple-700"
                : isSupervisor
                ? "bg-amber-900/60 text-amber-300 border border-amber-700"
                : "bg-blue-900/60 text-blue-300 border border-blue-700"
            }`}
          >
            {isAdmin ? <Shield size={10} /> : isSupervisor ? <Star size={10} /> : <Users2 size={10} />}
            {isAdmin ? "Admin" : isSupervisor ? "Supervisor" : "Vendedor"}
          </span>
        </div>

        {/* ── Main nav ── */}
        <nav className="flex flex-col gap-1.5">
          {menuBase.map(({ to, icon, text }) => (
            <NavLink key={to} to={to} icon={icon} text={text} location={location} />
          ))}

          {/* ── Admin-only section ── */}
          {isAdmin && (
            <>
              <div className="h-px bg-gray-600 my-2" />
              <div className="text-xs text-gray-400 px-3 py-1 font-semibold uppercase tracking-wide flex items-center gap-1">
                <Shield size={10} /> Admin
              </div>
              {adminMenu.map(({ to, icon, text }) => (
                <NavLink key={to} to={to} icon={icon} text={text} location={location} />
              ))}
            </>
          )}
        </nav>
      </div>

      {/* ── Bottom: VAN + logout + user info ── */}
      <div className="mt-6 flex flex-col gap-3">
        {puedeCambiarVan && (
          <button
            onClick={() => {
              setVan(null);
              localStorage.removeItem("van");
              window.location.href = "/vanselector";
            }}
            className="w-full bg-yellow-400 hover:bg-yellow-500 text-black py-2 px-3 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
          >
            Change VAN
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full bg-red-600 hover:bg-red-700 py-2 px-3 rounded-lg font-semibold flex items-center gap-2 justify-center transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
        >
          <LogOut size={20} /> Log out
        </button>

        <div className="text-xs mt-4 text-gray-300">
          <div className="mb-1 text-gray-400">User:</div>
          <div className="font-semibold truncate">{usuario?.nombre || usuario?.email || "—"}</div>
          <div className="mb-1 mt-2 text-gray-400">VAN:</div>
          <div className="font-semibold">{van?.nombre_van || "—"}</div>
        </div>
      </div>
    </aside>
  );
}
