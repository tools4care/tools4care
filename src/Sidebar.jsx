import { Link, useLocation } from "react-router-dom";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { usePermisos } from "./hooks/usePermisos";
import { useStoreMode } from "./hooks/useStoreMode";
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
  Receipt,
  CalendarCheck,
  ChevronRight,
  MapPin,
} from "lucide-react";

const ICON_SIZE = 22;

function NavLink({ to, icon, text, location }) {
  const isActive = location.pathname === to || location.pathname.startsWith(to + "/");
  return (
    <Link
      to={to}
      className={`group relative flex items-center gap-3 px-2.5 py-2 rounded-xl font-medium transition-colors duration-150 ${
        isActive
          ? "bg-white/10 text-white ring-1 ring-white/10"
          : "hover:bg-white/[0.06] hover:text-white text-slate-300"
      }`}
    >
      {isActive && <span className="absolute -left-3.5 top-2 bottom-2 w-1 rounded-r-full bg-cyan-400" />}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
        isActive ? "bg-white/10" : "bg-white/[0.04] group-hover:bg-white/[0.08]"
      }`}>
        {icon}
      </div>
      <span className="text-sm font-semibold truncate">{text}</span>
      <ChevronRight size={14} className={`ml-auto transition-all ${isActive ? "opacity-80" : "opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0"}`} />
    </Link>
  );
}

export default function Sidebar() {
  const { usuario } = useUsuario();
  const { van, setVan } = useVan();
  const location = useLocation();
  const { isAdmin, isSupervisor, puedeVerModulo, puedeCambiarVan } = usePermisos();
  const { storeMode, toggle: toggleStoreMode } = useStoreMode();

  // ── Main menu filtered by per-user module permissions ──
  const allMenuItems = [
    { key: "dashboard",  to: "/",          icon: <LayoutDashboard size={ICON_SIZE} className="text-blue-400" />,   text: "Dashboard" },
    { key: "ventas",     to: "/ventas",    icon: <ShoppingCart    size={ICON_SIZE} className="text-green-500" />,   text: "Sales" },
    { key: "facturas",   to: "/facturas",  icon: <FileText        size={ICON_SIZE} className="text-purple-500" />,  text: "Invoices" },
    { key: "clientes",   to: "/clientes",  icon: <Users           size={ICON_SIZE} className="text-yellow-500" />,  text: "Customers" },
    { key: "productos",  to: "/productos", icon: <Package         size={ICON_SIZE} className="text-pink-500" />,    text: "Products" },
    { key: "inventario", to: "/inventario",icon: <Boxes           size={ICON_SIZE} className="text-teal-500" />,    text: "Inventory" },
    { key: "cierres",    to: "/cierres",   icon: <Repeat          size={ICON_SIZE} className="text-cyan-600" />,    text: "Van Closeout" },
    { key: "cxc",        to: "/cxc",       icon: <CreditCard      size={ICON_SIZE} className="text-orange-400" />,  text: "Accounts Receivable" },
    { key: "reportes",       to: "/reportes",      icon: <BarChart2      size={ICON_SIZE} className="text-rose-400" />,    text: "Reports" },
    { key: "suscripciones", to: "/suscripciones", icon: <CalendarCheck  size={ICON_SIZE} className="text-violet-400" />, text: "Subscriptions" },
    { key: "suplidores",    to: "/suplidores",    icon: <UserCircle2    size={ICON_SIZE} className="text-indigo-400" />,  text: "Suppliers" },
    { key: "comisiones",    to: "/comisiones",    icon: <DollarSign     size={ICON_SIZE} className="text-emerald-400" />, text: "Commissions" },
  ];

  const menuBase = allMenuItems.filter(item => puedeVerModulo(item.key));

  // ── Admin-only section (never per-user configurable) ──
  const adminMenu = [
    { to: "/online",   icon: <Globe   size={ICON_SIZE} className="text-sky-400"    />, text: "Online Store" },
    { to: "/tax",      icon: <Receipt size={ICON_SIZE} className="text-amber-400"  />, text: "Tax / Impuestos" },
    { to: "/usuarios", icon: <Shield  size={ICON_SIZE} className="text-purple-400" />, text: "Users" },
  ];

  function handleLogout() {
    localStorage.clear();
    window.location.href = "/login";
  }

  return (
    <aside className="sticky top-0 bg-gradient-to-b from-[#10243d] via-[#132b47] to-[#0d2036] text-white h-screen w-[248px] xl:w-[268px] flex flex-col px-3.5 py-4 shadow-xl shadow-slate-900/10">
      <div className="min-h-0 flex-1 flex flex-col">
        {/* ── Brand ── */}
        <div className="flex items-center gap-3 px-1.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-blue-950/40 flex items-center justify-center text-lg">
            🛠
          </div>
          <div>
            <div className="font-black text-[17px] tracking-wide leading-tight">TOOLS4CARE</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mt-0.5">Sales workspace</div>
          </div>
        </div>

        {/* ── Role badge ── */}
        <div className="mb-3 mx-1">
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
        <div className="px-2 mb-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-[0.18em]">Workspace</div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto pr-1 pb-3 sidebar-scroll">
          {menuBase.map(({ to, icon, text }) => (
            <NavLink key={to} to={to} icon={icon} text={text} location={location} />
          ))}

          {/* ── Admin-only section ── */}
          {isAdmin && (
            <>
              <div className="h-px bg-white/10 my-2" />
              <div className="text-[10px] text-slate-500 px-2 py-1 font-bold uppercase tracking-[0.18em] flex items-center gap-1.5">
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
      <div className="pt-3 mt-1 border-t border-white/10 flex flex-col gap-2">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-black/10">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold">
            {(usuario?.nombre || usuario?.email || "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-xs truncate">{usuario?.nombre || usuario?.email || "—"}</div>
            <div className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
              <MapPin size={9} /> {van?.nombre_van || van?.nombre || "No VAN"}
            </div>
          </div>
        </div>
        {puedeCambiarVan && (
          <button
            onClick={() => {
              setVan(null);
              localStorage.removeItem("van");
              window.location.href = "/van";
            }}
            className="w-full bg-amber-400/10 hover:bg-amber-400/20 text-amber-200 border border-amber-300/20 py-2 px-3 rounded-xl font-semibold text-xs transition-colors"
          >
            Change VAN
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-400/15 py-2 px-3 rounded-xl font-semibold text-xs flex items-center gap-2 justify-center transition-colors"
        >
          <LogOut size={15} /> Log out
        </button>

        {/* Store Mode toggle */}
        <button
          onClick={toggleStoreMode}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors text-xs font-semibold border ${
            storeMode
              ? "bg-blue-900/60 border-blue-600 text-blue-200"
              : "bg-gray-800/60 border-gray-600 text-gray-400"
          }`}
        >
          <span className="flex items-center gap-2">
            <span>{storeMode ? "🏪" : "🚐"}</span>
            <span>{storeMode ? "Physical Store" : "Van / Route"}</span>
          </span>
          <span className={`w-9 h-5 rounded-full flex items-center transition-all px-0.5 ${storeMode ? "bg-blue-500" : "bg-gray-600"}`}>
            <span className={`w-4 h-4 bg-white rounded-full shadow transition-all ${storeMode ? "translate-x-4" : "translate-x-0"}`} />
          </span>
        </button>

      </div>
    </aside>
  );
}
