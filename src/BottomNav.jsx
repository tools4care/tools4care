// src/BottomNav.jsx
import { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  House,
  ShoppingCart,
  Users,
  Package,
  DotsThreeCircle,
  ClipboardText,
  SignOut,
  Truck,
  UserCircle,
  FileText,
  CreditCard,
  CalendarCheck,
  Compass,
  ChartBar,
  CaretDown,
  PlusCircle,
  ArrowRight,
  X,
  Warning,
  Wrench,
  Shield,
  Storefront,
  CurrencyDollar,
} from "@phosphor-icons/react";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { supabase } from "./supabaseClient";
import { useStoreMode } from "./hooks/useStoreMode";
import { usePermisos } from "./hooks/usePermisos";

/* ── Tab definitions ───────────────────────────────── */
const items = [
  { to: "/",         label: "Home",      icon: House,          activeColor: "#2563eb", gradient: "from-blue-500 to-indigo-600"    },
  { to: "/ventas",   label: "Sales",     icon: ShoppingCart,   activeColor: "#059669", gradient: "from-emerald-400 to-green-600"  },
  { to: "/productos",label: "Products",  icon: Package,        activeColor: "#a21caf", gradient: "from-pink-500 to-purple-600"    },
  { to: "/clientes", label: "Customers", icon: Users,          activeColor: "#d97706", gradient: "from-amber-400 to-orange-500"   },
  { action: "more",  label: "More",      icon: DotsThreeCircle,activeColor: "#64748b", gradient: "from-slate-400 to-slate-600"    },
];

/* ── More menu grid ────────────────────────────────── */
const MORE_ITEMS = [
  { path: "/store/register", key: "register", label: "Cash Register", icon: CurrencyDollar, gradient: "from-emerald-500 to-teal-700", storeOnly: true },
  { path: "/emergencia",    key: "emergencia", label: "Essentials",    icon: Warning,       gradient: "from-cyan-400 to-blue-600" },
  { path: "/cxc",        key: "cxc",        label: "Accounts",     icon: CreditCard,    gradient: "from-sky-400 to-blue-600"    },
  { path: "/inventario", key: "inventario", label: "Inventory",    icon: ClipboardText, gradient: "from-indigo-400 to-blue-600" },
  { path: "/facturas",   key: "facturas",   label: "Invoicing",    icon: FileText,      gradient: "from-purple-500 to-violet-600" },
  { path: "/cierres",    key: "cierres",    label: "Van Closeout", icon: Truck,         gradient: "from-emerald-400 to-green-600" },
  { path: "/suplidores", key: "suplidores", label: "Suppliers",    icon: UserCircle,    gradient: "from-blue-400 to-indigo-600" },
  { path: "/reportes",   key: "reportes",   label: "Reports",       icon: ChartBar,      gradient: "from-rose-400 to-pink-600" },
  { path: "/van",            label: "Change Location", icon: Compass,      gradient: "from-amber-400 to-orange-600" },
];

const SERVICE_ITEMS = [
  { path: "/suscripciones", key: "suscripciones", label: "Subscriptions", description: "Recurring customer orders", icon: CalendarCheck, gradient: "from-violet-500 to-purple-600" },
  { path: "/alquileres", key: "alquileres", label: "Equipment Rentals", description: "Rental contracts and returns", icon: Wrench, gradient: "from-emerald-500 to-teal-600" },
];

const ADMIN_MORE_ITEM = {
  path: "/admin",
  label: "Admin",
  icon: Shield,
  gradient: "from-purple-500 to-fuchsia-600",
};

let salesPreload;
function preloadSales() {
  if (!salesPreload) {
    salesPreload = import("./Ventas").catch(() => {
      salesPreload = null;
    });
  }
  return salesPreload;
}

export default function BottomNav() {
  const [showMore, setShowMore]       = useState(false);
  const [showSaleSheet, setShowSaleSheet] = useState(false);
  const [showServices, setShowServices] = useState(false);
  const { usuario, setUsuario }       = useUsuario();
  const { van }                       = useVan();
  const { storeMode, isExplicitStore, setStoreMode } = useStoreMode();
  const { puedeVerModulo, puedeCambiarVan } = usePermisos();
  const navigate                      = useNavigate();
  const location                      = useLocation();

  const onVentas = location.pathname === "/ventas";

  useEffect(() => {
    if (onVentas || navigator.connection?.saveData) return undefined;
    const start = () => preloadSales();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(start, 900);
    return () => window.clearTimeout(id);
  }, [onVentas]);

  /* ── Logout ───────────────────────────────────────── */
  const handleLogout = async () => {
    setShowMore(false);
    await supabase.auth.signOut();
    setUsuario(null);
    navigate("/login");
  };

  /* ── More menu nav ────────────────────────────────── */
  const handleNav = (path) => {
    setShowMore(false);
    navigate(path);
  };

  /* ── Sales tab tap handler ────────────────────────── */
  const handleSalesTap = () => {
    if (onVentas) {
      // Already on sales page — offer New Sale or Continue
      setShowSaleSheet(true);
    } else {
      navigate("/ventas");
    }
  };

  const userInitial = (usuario?.email || usuario?.nombre || "?")[0].toUpperCase();
  const storeMoreKeys = new Set(["register", "emergencia", "cxc", "inventario", "facturas", "cierres", "suplidores", "reportes"]);
  const moreItemsBase = MORE_ITEMS
    .filter(({ storeOnly }) => !storeOnly || storeMode)
    .filter(({ key }) => !storeMode || !key || storeMoreKeys.has(key))
    .filter(({ key }) => !key || key === "emergencia" || key === "register" || puedeVerModulo(key))
    .filter(({ path }) => path !== "/van" || puedeCambiarVan)
    .map((item) => item.path === "/cierres" && storeMode ? { ...item, label: "Store Closeout" } : item);
  const moreItems = usuario?.rol === "admin" ? [...moreItemsBase, ADMIN_MORE_ITEM] : moreItemsBase;
  const serviceItems = storeMode ? [] : SERVICE_ITEMS.filter(({ key }) => puedeVerModulo(key));

  return (
    <>
      {/* ── Bottom tab bar ──────────────────────────────── */}
      <nav
        className="fixed bottom-2 left-2 right-2 bg-white/95 dark:bg-slate-800/95 border border-slate-200/80 dark:border-slate-700/80 shadow-[0_12px_35px_rgba(15,23,42,0.18)] z-50 flex justify-around items-center h-[66px] rounded-2xl lg:hidden backdrop-blur-md overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map(({ to, label, icon, action, activeColor, gradient }) => {
          const Icon = icon;
          /* "More" button */
          if (action === "more") {
            return (
              <button
                key="more"
                onClick={() => setShowMore(true)}
                className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative ${
                  showMore ? "text-slate-700 dark:text-slate-200" : "text-gray-400 hover:text-slate-600"
                }`}
              >
                {showMore && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full bg-slate-500" />
                )}
                <div className={`p-1.5 rounded-xl transition-all bg-gradient-to-br ${gradient} ${showMore ? "shadow-md scale-105" : "opacity-75"}`}>
                  <Icon size={21} weight="duotone" className="text-white" />
                </div>
                <span className={`text-[10px] font-medium ${showMore ? "text-slate-700 dark:text-slate-200" : "text-gray-400"}`}>
                  {label}
                </span>
              </button>
            );
          }

          /* "Sales" tab — custom tap handler */
          if (to === "/ventas") {
            const isActive = location.pathname === "/ventas";
            return (
              <button
                key={to}
                onClick={handleSalesTap}
                onPointerDown={preloadSales}
                className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative"
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full bg-emerald-500" />
                )}
                <div className={`p-1.5 rounded-xl transition-all bg-gradient-to-br ${gradient} ${isActive ? "shadow-md scale-105" : "opacity-75"}`}>
                  <Icon size={21} weight="duotone" className="text-white" />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? "text-emerald-700 dark:text-emerald-400" : "text-gray-400"}`}>
                  {label}
                </span>
              </button>
            );
          }

          /* Regular NavLink tab */
          return (
            <NavLink
              to={to}
              key={to}
              end={to === "/"}
              className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full"
                      style={{ backgroundColor: activeColor }}
                    />
                  )}
                  <div className={`p-1.5 rounded-xl transition-all bg-gradient-to-br ${gradient} ${isActive ? "shadow-md scale-105" : "opacity-75"}`}>
                    <Icon size={21} weight="duotone" className="text-white" />
                  </div>
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: isActive ? activeColor : "#9ca3af" }}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* ── "New Sale?" mini-sheet (shown when already on /ventas) ── */}
      {showSaleSheet && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setShowSaleSheet(false)}
        >
          <div
            className="bg-white w-full sm:w-96 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 pt-2 pb-4 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
                <ShoppingCart size={26} weight="duotone" className="text-white" />
              </div>
              <h2 className="font-bold text-gray-900 text-lg">Sales</h2>
              <p className="text-gray-500 text-sm mt-1">What would you like to do?</p>
            </div>

            {/* Options */}
            <div className="px-4 pb-4 space-y-3">
              {/* New Sale */}
              <button
                onClick={() => {
                  setShowSaleSheet(false);
                  navigate("/ventas?new=1");
                }}
                className="w-full flex items-center gap-4 bg-emerald-600 text-white px-5 py-4 rounded-2xl shadow-lg active:scale-[0.98] transition-all"
              >
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <PlusCircle size={20} weight="duotone" className="text-white" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-bold text-sm">New Sale</div>
                  <div className="text-emerald-100 text-xs">Start a fresh transaction</div>
                </div>
                <ArrowRight size={18} weight="bold" color="white" className="opacity-70" />
              </button>

              {/* Continue */}
              <button
                onClick={() => setShowSaleSheet(false)}
                className="w-full flex items-center gap-4 bg-gray-100 text-gray-800 px-5 py-4 rounded-2xl active:scale-[0.98] transition-all"
              >
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center flex-shrink-0">
                  <ArrowRight size={20} weight="bold" color="#059669" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-bold text-sm">Continue Current Sale</div>
                  <div className="text-gray-500 text-xs">Go back to the current transaction</div>
                </div>
              </button>
            </div>

            {/* Cancel pill */}
            <button
              onClick={() => setShowSaleSheet(false)}
              className="flex items-center justify-center gap-1.5 w-full py-4 border-t border-gray-100 text-gray-400 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <X size={15} weight="bold" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── More sheet ──────────────────────────────────── */}
      {showMore && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
          onClick={() => setShowMore(false)}
        >
          <div
            className="bg-slate-50 w-full sm:w-[440px] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border border-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 pt-1 pb-3 flex items-end justify-between flex-shrink-0">
              <div>
                <h2 className="font-extrabold text-slate-900 text-lg">Workspace</h2>
                <p className="text-[11px] text-slate-500">More tools and account options</p>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tools4Care</div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-4 pb-2">
              {/* 3-col icon grid */}
              <div className="grid grid-cols-3 gap-2.5 mb-3">
                {moreItems.map(({ path, label, icon, gradient }) => {
                  const Icon = icon;
                  return (
                    <button
                      key={path}
                      onClick={() => handleNav(path)}
                      className="flex flex-col items-center justify-center gap-2 min-h-[104px] p-3 rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm active:scale-[0.97] transition-transform"
                    >
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} shadow-sm flex items-center justify-center`}>
                        <Icon size={22} weight="duotone" className="text-white" />
                      </div>
                      <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight">{label}</span>
                    </button>
                  );
                })}
              </div>

              {serviceItems.length > 0 && (
                <div className="mb-3 rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowServices((open) => !open)}
                    aria-expanded={showServices}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
                      <Wrench size={20} weight="duotone" className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-800">Services</div>
                      <div className="text-[10px] text-slate-400">Subscriptions and rentals · optional tools</div>
                    </div>
                    <CaretDown size={16} weight="bold" className={`text-slate-400 transition-transform ${showServices ? "rotate-180" : ""}`} />
                  </button>
                  {showServices && (
                    <div className="border-t border-slate-100 p-2 space-y-1.5">
                      {serviceItems.map(({ path, label, description, icon, gradient }) => {
                        const Icon = icon;
                        return (
                          <button
                            key={path}
                            type="button"
                            onClick={() => handleNav(path)}
                            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100"
                          >
                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                              <Icon size={18} weight="duotone" className="text-white" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-700">{label}</div>
                              <div className="text-[10px] text-slate-400">{description}</div>
                            </div>
                            <ArrowRight size={14} weight="bold" className="ml-auto text-slate-300" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="h-px bg-gray-100 mx-1 mb-3" />

              {storeMode && !isExplicitStore && (
                <button
                  onClick={() => setStoreMode(false)}
                  className="mb-3 w-full rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-800 ring-1 ring-amber-200"
                >
                  Exit legacy Store Mode
                </button>
              )}

              {/* User info card */}
              <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-base">{userInitial}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-gray-900 truncate">
                    {usuario?.nombre || usuario?.email || "No session"}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">{usuario?.email}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 bg-white rounded-xl px-2.5 py-1.5 shadow-sm ring-1 ring-gray-200">
                  {isExplicitStore
                    ? <Storefront size={13} weight="duotone" color="#2563eb" />
                    : <Truck size={13} weight="duotone" color="#059669" />}
                  <span className="text-[10px] font-semibold text-gray-700 max-w-[72px] truncate">
                    {van?.nombre_van || van?.nombre || "No VAN"}
                  </span>
                </div>
              </div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-50 ring-1 ring-red-200 active:scale-[0.98] transition-all mb-2"
              >
                <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                  <SignOut size={18} weight="duotone" color="#dc2626" />
                </div>
                <span className="font-semibold text-red-600 text-sm">Log Out</span>
              </button>
            </div>

            {/* Close pill */}
            <button
              onClick={() => setShowMore(false)}
              className="flex-shrink-0 flex items-center justify-center gap-1.5 w-full py-4 border-t border-gray-100 text-gray-400 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <CaretDown size={16} weight="bold" />
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
