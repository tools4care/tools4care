// src/BottomNav.jsx
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
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
  RefreshCcw,
  BarChart2,
  ChevronDown,
} from "lucide-react";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { supabase } from "./supabaseClient";

const items = [
  { to: "/",        label: "Home",      icon: Home,         color: "#2563eb" },
  { to: "/ventas",  label: "Sales",     icon: ShoppingCart, color: "#059669" },
  { to: "/productos", label: "Products",icon: Box,          color: "#a21caf" },
  { to: "/clientes", label: "Customers",icon: Users,        color: "#f59e42" },
  { to: "/cxc",     label: "Accounts",  icon: CreditCard,   color: "#0ea5e9" },
  { action: "more", label: "More",      icon: MoreHorizontal, color: "#64748b" },
];

const MORE_ITEMS = [
  { path: "/inventario", label: "Inventory",    icon: ClipboardList, iconColor: "#6366f1", bg: "bg-indigo-50",  ring: "ring-indigo-200" },
  { path: "/facturas",   label: "Invoicing",    icon: FileText,      iconColor: "#9333ea", bg: "bg-purple-50",  ring: "ring-purple-200" },
  { path: "/cierres",    label: "Van Closeout", icon: Truck,         iconColor: "#059669", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  { path: "/suplidores", label: "Suppliers",    icon: UserCircle2,   iconColor: "#4f46e5", bg: "bg-blue-50",    ring: "ring-blue-200"   },
  { path: "/reportes",   label: "Reports",      icon: BarChart2,     iconColor: "#e11d48", bg: "bg-rose-50",    ring: "ring-rose-200"   },
  { path: "/van",        label: "Change VAN",   icon: RefreshCcw,    iconColor: "#b45309", bg: "bg-amber-50",   ring: "ring-amber-200"  },
];

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false);
  const { usuario, setUsuario } = useUsuario();
  const { van } = useVan();
  const navigate = useNavigate();

  const handleLogout = async () => {
    setShowMore(false);
    await supabase.auth.signOut();
    setUsuario(null);
    navigate("/login");
  };

  const handleNav = (path) => {
    setShowMore(false);
    navigate(path);
  };

  const userInitial = (usuario?.email || usuario?.nombre || "?")[0].toUpperCase();

  return (
    <>
      {/* ── Bottom tab bar ─────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-lg z-50 flex justify-around items-center h-16 lg:hidden">
        {items.map(({ to, label, icon: Icon, action, color }) =>
          action === "more" ? (
            <button
              key="more"
              onClick={() => setShowMore(true)}
              className={`flex flex-col items-center justify-center px-2 gap-0.5 transition ${
                showMore ? "text-blue-600" : "text-gray-500 hover:text-blue-600"
              }`}
            >
              <Icon size={22} color={showMore ? "#2563eb" : color} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ) : (
            <NavLink
              to={to}
              key={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center px-2 gap-0.5 transition ${
                  isActive ? "text-blue-600" : "text-gray-500 hover:text-blue-600"
                }`
              }
              end={to === "/"}
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} color={isActive ? "#2563eb" : color} />
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          )
        )}
      </nav>

      {/* ── More sheet ─────────────────────────────── */}
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
              {/* 2-col icon grid */}
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
