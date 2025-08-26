// src/online/OnlineLayout.jsx
import { Outlet } from "react-router-dom";
import OnlineSidebar from "./OnlineSidebar";

export default function OnlineLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <OnlineSidebar />

      <div className="flex-1">
        {/* Header fijo */}
        <header className="sticky top-0 z-20 bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5">
            <h1 className="text-xl font-semibold tracking-tight">Tienda Online</h1>
            <p className="text-xs text-gray-500">Panel de administración</p>
          </div>
        </header>

        {/* 👇 Más aire arriba: incrementamos el padding-top */}
        <main className="max-w-7xl mx-auto px-6 lg:px-10 pt-12 lg:pt-16 pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
