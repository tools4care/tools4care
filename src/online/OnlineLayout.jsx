// src/online/OnlineLayout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, ShoppingBag, X } from "lucide-react";
import OnlineSidebar from "./OnlineSidebar";

export default function OnlineLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="hidden lg:block">
        <OnlineSidebar />
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative h-full">
            <OnlineSidebar mobile onNavigate={() => setMenuOpen(false)} />
            <button
              aria-label="Close menu"
              className="absolute top-4 -right-12 w-10 h-10 rounded-xl bg-white text-slate-700 shadow-lg flex items-center justify-center"
              onClick={() => setMenuOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Header fijo */}
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-3.5 flex items-center gap-3">
            <button
              aria-label="Open menu"
              className="lg:hidden w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 flex items-center justify-center shadow-sm active:scale-95 transition-transform"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white hidden sm:flex lg:hidden items-center justify-center shadow-sm">
              <ShoppingBag size={19} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">Online Store</h1>
              <p className="text-[11px] text-slate-500">Administration workspace</p>
            </div>
          </div>
        </header>

        {/* Contenido */}
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-10 pt-6 lg:pt-10 pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
