// React JSX transform handled by @vitejs/plugin-react — no explicit import needed here
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
const Login = lazy(() => import("./Login"));
const VanSelector = lazy(() => import("./components/VanSelector"));
const Dashboard = lazy(() => import("./Dashboard"));
const Clientes = lazy(() => import("./Clientes"));
const Productos = lazy(() => import("./Productos"));
const Inventario = lazy(() => import("./Inventario"));
const Ventas = lazy(() => import("./Ventas"));
const CierreVan = lazy(() => import("./CierreVan"));
const PreCierreVan = lazy(() => import("./PreCierreVan"));
const Facturas = lazy(() => import("./Facturas"));
const CuentasPorCobrar = lazy(() => import("./CuentasPorCobrar.jsx"));
const CreditoSimulador = lazy(() => import("./CreditoSimulador"));

// === Online ===
const OnlineLayout = lazy(() => import("./online/OnlineLayout"));
const OnlineDashboard = lazy(() => import("./online/OnlineDashboard"));
const Orders = lazy(() => import("./admin/Orders"));
const OnlineCatalog = lazy(() => import("./online/OnlineCatalog"));
const OnlineDiscounts = lazy(() => import("./online/Discounts"));

import { NetworkIndicator } from "./components/NetworkIndicator";
import { SyncProvider, useSyncGlobal } from "./hooks/SyncContext";
import { SyncToast } from "./components/SyncToast";

import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";


const Suplidores = lazy(() => import("./Suplidores"));

// 💰 Comisiones (NUEVO)
const ComisionesPage = lazy(() => import('./pages/ComisionesPage'));
const UsuariosAdmin = lazy(() => import("./pages/UsuariosAdmin"));
const AuditoriaLog = lazy(() => import("./pages/AuditoriaLog"));

// 📊 Reportes (NUEVO)
const Reportes = lazy(() => import('./Reportes'));

// 📦 Suscripciones
const Suscripciones = lazy(() => import('./Suscripciones'));
const GlobalSearch = lazy(() => import('./components/GlobalSearch'));

// 🧾 Tax / Impuestos
const TaxConfig = lazy(() => import('./pages/TaxConfig'));
const CreateTenantManual = lazy(() => import('./admin/CreateTenantManual'));
const ListaEmergencia = lazy(() => import('./ListaEmergencia'));


function PrivateRoute({ children }) {
  const { usuario, cargando } = useUsuario();
  
  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!usuario) return <Navigate to="/login" />;
  return children;
}

function PrivateRouteWithVan({ children }) {
  const { usuario, cargando } = useUsuario();
  const { van } = useVan();
  
  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!usuario) return <Navigate to="/login" />;
  if (!van) return <Navigate to="/van" />;

  // Only redirect if the van has an explicit tipo === "online" field — never match by name
  if (van?.tipo === "online") return <Navigate to="/online" replace />;
  return children;
}

// Redirects non-admins away from admin-only routes
function AdminRoute({ children }) {
  const { usuario, cargando } = useUsuario();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol !== "admin") return <Navigate to="/" replace />;
  return children;
}

// Allows admin AND supervisor (blocks vendedor)
function PrivilegedRoute({ children }) {
  const { usuario, cargando } = useUsuario();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol !== "admin" && usuario.rol !== "supervisor") return <Navigate to="/" replace />;
  return children;
}

function LayoutInterior() {
  const { syncing, ventasPendientes, syncError, lastSync, sincronizarAhora } = useSyncGlobal();
  return (
    <div className="min-h-screen bg-gray-50 flex lg:flex-row flex-col">
      <NetworkIndicator
        syncing={syncing}
        ventasPendientes={ventasPendientes}
        syncError={syncError}
        lastSync={lastSync}
        onSyncNow={sincronizarAhora}
      />
      <SyncToast />
      <Suspense fallback={null}><GlobalSearch /></Suspense>
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 pt-4 pb-20 px-2 sm:px-6 transition-all duration-300">
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}

function RouteLoading() {
  return (
    <div className="min-h-[55vh] flex items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm border border-slate-200">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-b-blue-600" />
        <span className="text-sm font-semibold text-slate-600">Opening...</span>
      </div>
    </div>
  );
}

function LayoutPrivado() {
  return (
    <SyncProvider>
      <LayoutInterior />
    </SyncProvider>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
    <Routes>
          {/* Aliases de storefront (redirigen) */}
          <Route path="/shop" element={<Navigate to="/storefront" replace />} />
          <Route path="/store" element={<Navigate to="/storefront" replace />} />
          <Route path="/online/checkout" element={<Navigate to="/checkout" replace />} />

          {/* --- Público general --- */}
          <Route path="/login" element={<Login />} />

          {/* Selector de VAN (protegido) */}
          <Route
            path="/van"
            element={
              <PrivateRoute>
                <VanSelector />
              </PrivateRoute>
            }
          />

          {/* ÁREA ONLINE (solo admin) */}
          <Route
            path="/online/*"
            element={
              <AdminRoute>
                <OnlineLayout />
              </AdminRoute>
            }
          >
            <Route index element={<OnlineDashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="catalog" element={<OnlineCatalog />} />
            <Route path="discounts" element={<OnlineDiscounts />} />
            <Route path="inventory" element={<Navigate to="/online/catalog" replace />} />
          </Route>

          {/* Alias antiguos */}
          <Route path="/catalog" element={<Navigate to="/online/catalog" replace />} />

          {/* Área Vans (protegido + VAN) */}
          <Route
            path="/*"
            element={
              <PrivateRouteWithVan>
                <LayoutPrivado />
              </PrivateRouteWithVan>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/nuevo" element={<Clientes />} />
            <Route path="productos/nuevo" element={<Productos />} />
            <Route path="productos" element={<Productos />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="cierres" element={<PreCierreVan />} />
            <Route path="cierres/van" element={<CierreVan />} />
            <Route path="facturas" element={<Facturas />} />
            <Route path="cxc" element={<CuentasPorCobrar />} />
            <Route path="cxc/sim" element={<CreditoSimulador />} />
            <Route path="suplidores" element={<PrivilegedRoute><Suplidores /></PrivilegedRoute>} />

            {/* 💰 COMISIONES (ADMIN) */}
            <Route path="comisiones" element={<AdminRoute><ComisionesPage /></AdminRoute>} />

            {/* 👥 USUARIOS (ADMIN) */}
            <Route path="usuarios" element={<AdminRoute><UsuariosAdmin /></AdminRoute>} />

            {/* 📜 AUDITORÍA (ADMIN) */}
            <Route path="auditoria" element={<AdminRoute><AuditoriaLog /></AdminRoute>} />

            {/* 📊 REPORTES (NUEVO) */}
            <Route path="reportes" element={<Reportes />} />
            <Route path="emergencia" element={<ListaEmergencia />} />

            {/* 📦 SUSCRIPCIONES */}
            <Route path="suscripciones" element={<Suscripciones />} />

            {/* 🧾 TAX / IMPUESTOS */}
            <Route path="tax" element={<AdminRoute><TaxConfig /></AdminRoute>} />

            {/* 🏢 NUEVO TENANT (ADMIN) */}
            <Route path="admin/new-client" element={<AdminRoute><CreateTenantManual /></AdminRoute>} />

            <Route path="*" element={<Navigate to="/" />} />
          </Route>
    </Routes>
    </Suspense>
  );
}
