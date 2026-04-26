// src/BottomNav.jsx
import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  ShoppingCart,
  Users,
  Box,
  MoreHorizontal,
  ClipboardList,
  LogOut,
  Truck,
  UserCircle2,
  FileText,
  CreditCard,
  CalendarCheck,
  Navigation,
  BarChart2,
  ChevronDown,
  PlusCircle,
  ArrowRight,
  X,
} from "lucide-react";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { supabase } from "./supabaseClient";

/* ── Tab definitions ───────────────────────────────── */
const items = [
  { to: "/",         label: "Home",      icon: Home,          color: "#2563eb", activeColor: "#2563eb", activeBg: "bg-blue-50"    },
  { to: "/ventas",   label: "Sales",     icon: ShoppingCart,  color: "#059669", activeColor: "#059669", activeBg: "bg-emerald-50" },
  { to: "/productos",label: "Products",  icon: Box,           color: "#a21caf", activeColor: "#a21caf", activeBg: "bg-purple-50"  },
  { to: "/clientes", label: "Customers", icon: Users,         color: "#d97706", activeColor: "#d97706", activeBg: "bg-amber-50"   },
  { to: "/cxc",      label: "Accounts",  icon: CreditCard,    color: "#0ea5e9", activeColor: "#0ea5e9", activeBg: "bg-sky-50"     },
  { action: "more",  label: "More",      icon: MoreHorizontal,color: "#64748b", activeColor: "#64748b", activeBg: "bg-slate-50"   },
];

/* ── More menu grid ────────────────────────────────── */
const MORE_ITEMS = [
  { path: "/inventario", label: "Inventory",    icon: ClipboardList, iconColor: "#6366f1", bg: "bg-indigo-50",  ring: "ring-indigo-200" },
  { path: "/facturas",   label: "Invoicing",    icon: FileText,      iconColor: "#9333ea", bg: "bg-purple-50",  ring: "ring-purple-200" },
  { path: "/cierres",    label: "Van Closeout", icon: Truck,         iconColor: "#059669", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  { path: "/suplidores", label: "Suppliers",    icon: UserCircle2,   iconColor: "#4f46e5", bg: "bg-blue-50",    ring: "ring-blue-200"   },
  { path: "/reportes",       label: "Reports",       icon: BarChart2,     iconColor: "#e11d48", bg: "bg-rose-50",    ring: "ring-rose-200"   },
  { path: "/suscripciones", label: "Subscriptions", icon: CalendarCheck, iconColor: "#7c3aed", bg: "bg-violet-50",  ring: "ring-violet-200" },
  { path: "/van",            label: "Change VAN",    icon: Navigation,    iconColor: "#b45309", bg: "bg-amber-50",   ring: "ring-amber-200"  },
];

export default function BottomNav() {
  const [showMore, setShowMore]       = useState(false);
  const [showSaleSheet, setShowSaleSheet] = useState(false);
  const { usuario, setUsuario }       = useUsuario();
  const { van }                       = useVan();
  const navigate                      = useNavigate();
  const location                      = useLocation();

  const onVentas = location.pathname === "/ventas";

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

  return (
    <>
      {/* ── Bottom tab bar ──────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-lg z-50 flex justify-around items-center h-16 lg:hidden">
        {items.map(({ to, label, icon: Icon, action, color, activeColor, activeBg }) => {
          /* "More" button */
          if (action === "more") {
            return (
              <button
                key="more"
                onClick={() => setShowMore(true)}
                className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative ${
                  showMore ? "text-slate-700" : "text-gray-400 hover:text-slate-600"
                }`}
              >
                {showMore && (
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-slate-500" />
                )}
                <div className={`p-1.5 rounded-xl transition-colors ${showMore ? activeBg : ""}`}>
                  <Icon size={21} color={showMore ? color : "#9ca3af"} />
                </div>
                <span className={`text-[10px] font-medium ${showMore ? "text-slate-700" : "text-gray-400"}`}>
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
                className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative"
              >
                {isActive && (
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-emerald-500" />
                )}
                <div className={`p-1.5 rounded-xl transition-colors ${isActive ? activeBg : ""}`}>
                  <Icon size={21} color={isActive ? activeColor : "#9ca3af"} />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? "text-emerald-700" : "text-gray-400"}`}>
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
                      className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                      style={{ backgroundColor: activeColor }}
                    />
                  )}
                  <div className={`p-1.5 rounded-xl transition-colors ${isActive ? activeBg : ""}`}>
                    <Icon size={21} color={isActive ? activeColor : "#9ca3af"} />
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
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <ShoppingCart size={26} color="#059669" />
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
                  <PlusCircle size={20} color="white" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-bold text-sm">New Sale</div>
                  <div className="text-emerald-100 text-xs">Start a fresh transaction</div>
                </div>
                <ArrowRight size={18} color="white" className="opacity-70" />
              </button>

              {/* Continue */}
              <button
                onClick={() => setShowSaleSheet(false)}
                className="w-full flex items-center gap-4 bg-gray-100 text-gray-800 px-5 py-4 rounded-2xl active:scale-[0.98] transition-all"
              >
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center flex-shrink-0">
                  <ArrowRight size={20} color="#059669" />
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
              <X size={15} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── More sheet ──────────────────────────────────── */}
      {showMore && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setShowMore(false)}
        >
          <div
            className="bg-white w-full sm:w-[420px] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 pt-1 pb-3 text-center flex-shrink-0">
              <h2 className="font-bold text-gray-800 text-lg">More</h2>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-4 pb-2">
              {/* 3-col icon grid */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                {MORE_ITEMS.map(({ path, label, icon: Icon, iconColor, bg, ring }) => (
                  <button
                    key={path}
                    onClick={() => handleNav(path)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl ${bg} ring-1 ${ring} active:scale-95 transition-all`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                      <Icon size={22} color={iconColor} />
                    </div>
                    <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight">{label}</span>
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="h-px bg-gray-100 mx-1 mb-3" />

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
                  <Truck size={13} color="#059669" />
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
                  <LogOut size={18} color="#dc2626" />
                </div>
                <span className="font-semibold text-red-600 text-sm">Log Out</span>
              </button>
            </div>

            {/* Close pill */}
            <button
              onClick={() => setShowMore(false)}
              className="flex-shrink-0 flex items-center justify-center gap-1.5 w-full py-4 border-t border-gray-100 text-gray-400 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <ChevronDown size={16} />
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
