// React JSX transform handled by @vitejs/plugin-react — no explicit import needed here
import { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import { lazyRetry } from "./lib/lazyRetry";
const Login = lazyRetry(() => import("./Login"), "Login");
const SetPassword = lazyRetry(() => import("./SetPassword"), "SetPassword");
const VanSelector = lazyRetry(() => import("./components/VanSelector"), "VanSelector");
const Dashboard = lazyRetry(() => import("./Dashboard"), "Dashboard");
const StoreDashboard = lazyRetry(() => import("./store/StoreDashboard"), "StoreDashboard");
const StoreRegister = lazyRetry(() => import("./store/StoreRegister"), "StoreRegister");
const StoreShiftGate = lazyRetry(() => import("./store/StoreShiftGate"), "StoreShiftGate");
const CustomerDisplay = lazyRetry(() => import("./store/CustomerDisplay"), "CustomerDisplay");
const Clientes = lazyRetry(() => import("./Clientes"), "Clientes");
const Productos = lazyRetry(() => import("./Productos"), "Productos");
const Inventario = lazyRetry(() => import("./Inventario"), "Inventario");
const Ventas = lazyRetry(() => import("./Ventas"), "Ventas");
const CierreVan = lazyRetry(() => import("./CierreVan"), "CierreVan");
const PreCierreVan = lazyRetry(() => import("./PreCierreVan"), "PreCierreVan");
const Facturas = lazyRetry(() => import("./Facturas"), "Facturas");
const CuentasPorCobrar = lazyRetry(() => import("./CuentasPorCobrar.jsx"), "CuentasPorCobrar");
const CreditoSimulador = lazyRetry(() => import("./CreditoSimulador"), "CreditoSimulador");
const FinanceHub = lazyRetry(() => import("./pages/FinanceHub"), "FinanceHub");
const OperationsHub = lazyRetry(() => import("./pages/OperationsHub"), "OperationsHub");
const ServicesHub = lazyRetry(() => import("./pages/ServicesHub"), "ServicesHub");

// === Online ===
const OnlineLayout = lazyRetry(() => import("./online/OnlineLayout"), "OnlineLayout");
const OnlineDashboard = lazyRetry(() => import("./online/OnlineDashboard"), "OnlineDashboard");
const Orders = lazyRetry(() => import("./admin/Orders"), "Orders");
const OnlineCatalog = lazyRetry(() => import("./online/OnlineCatalog"), "OnlineCatalog");
const OnlineDiscounts = lazyRetry(() => import("./online/Discounts"), "OnlineDiscounts");

import { NetworkIndicator } from "./components/NetworkIndicator";
import { SyncProvider, useSyncGlobal } from "./hooks/SyncContext";
import { SyncToast } from "./components/SyncToast";

import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { isOnlineLocation, isStoreLocation } from "./lib/locationTypes";


const Suplidores = lazyRetry(() => import("./Suplidores"), "Suplidores");

// 💰 Comisiones (NUEVO)
const ComisionesPage = lazyRetry(() => import('./pages/ComisionesPage'), "ComisionesPage");
const AdminHub = lazyRetry(() => import("./pages/AdminHub"), "AdminHub");
const DriverExpensesAdmin = lazyRetry(() => import("./pages/DriverExpensesAdmin"), "DriverExpensesAdmin");
const UsuariosAdmin = lazyRetry(() => import("./pages/UsuariosAdmin"), "UsuariosAdmin");
const AuditoriaLog = lazyRetry(() => import("./pages/AuditoriaLog"), "AuditoriaLog");
const SystemHealth = lazyRetry(() => import("./pages/SystemHealth"), "SystemHealth");

// 📊 Reportes (NUEVO)
const Reportes = lazyRetry(() => import('./Reportes'), "Reportes");

// 📦 Suscripciones
const Suscripciones = lazyRetry(() => import('./Suscripciones'), "Suscripciones");

// 🛠 Alquileres (equipment rentals)
const Alquileres = lazyRetry(() => import('./Alquileres'), "Alquileres");
const GlobalSearch = lazyRetry(() => import('./components/GlobalSearch'), "GlobalSearch");

// 🧾 Tax / Impuestos
const TaxConfig = lazyRetry(() => import('./pages/TaxConfig'), "TaxConfig");
const BusinessInfoAdmin = lazyRetry(() => import('./pages/BusinessInfoAdmin'), "BusinessInfoAdmin");
const CreateTenantManual = lazyRetry(() => import('./admin/CreateTenantManual'), "CreateTenantManual");
const ListaEmergencia = lazyRetry(() => import('./ListaEmergencia'), "ListaEmergencia");
const VisitNotebook = lazyRetry(() => import('./pages/VisitNotebook'), "VisitNotebook");


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
  const { van, locationAccessChecking } = useVan();
  
  if (cargando || locationAccessChecking) {
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

  if (isOnlineLocation(van)) return <Navigate to="/online" replace />;
  return children;
}

function WorkspaceDashboard() {
  const { van } = useVan();
  return isStoreLocation(van) ? <StoreDashboard /> : <Dashboard />;
}

function StoreOnlyRoute({ children }) {
  const { van } = useVan();
  return isStoreLocation(van) ? children : <Navigate to="/" replace />;
}

// Redirects non-admins away from admin-only routes
function AdminRoute({ children }) {
  const { usuario, cargando } = useUsuario();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol !== "admin") return <Navigate to="/" replace />;
  return children;
}

function PlatformAdminRoute({ children }) {
  const { usuario, cargando } = useUsuario();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol !== "admin" || !usuario.platform_admin) return <Navigate to="/admin" replace />;
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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex lg:flex-row flex-col">
      <NetworkIndicator
        syncing={syncing}
        ventasPendientes={ventasPendientes}
        syncError={syncError}
        lastSync={lastSync}
        onSyncNow={sincronizarAhora}
      />
      <SyncToast />
      <Suspense fallback={null}><StoreShiftGate /></Suspense>
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
          {/* /shop y /store se manejan a nivel raíz en main.jsx */}
          <Route path="/online/checkout" element={<Navigate to="/checkout" replace />} />

          {/* --- Público general --- */}
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/customer-display" element={<PrivateRoute><CustomerDisplay /></PrivateRoute>} />

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
            <Route index element={<WorkspaceDashboard />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/nuevo" element={<Clientes />} />
            <Route path="productos/nuevo" element={<Productos />} />
            <Route path="productos" element={<Productos />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="store/register" element={<StoreOnlyRoute><StoreRegister /></StoreOnlyRoute>} />
            <Route path="cierres" element={<PreCierreVan />} />
            <Route path="cierres/van" element={<CierreVan />} />
            <Route path="finance" element={<FinanceHub />} />
            <Route path="operations" element={<OperationsHub />} />
            <Route path="services" element={<ServicesHub />} />
            <Route path="facturas" element={<Facturas />} />
            <Route path="cxc" element={<CuentasPorCobrar />} />
            <Route path="cxc/sim" element={<CreditoSimulador />} />
            <Route path="suplidores" element={<PrivilegedRoute><Suplidores /></PrivilegedRoute>} />

            {/* Admin hub */}
            <Route path="admin" element={<AdminRoute><AdminHub /></AdminRoute>} />

            {/* 💰 COMISIONES (ADMIN) */}
            <Route path="comisiones" element={<AdminRoute><ComisionesPage /></AdminRoute>} />

            {/* 🧾 DRIVER EXPENSES (ADMIN) */}
            <Route path="driver-expenses" element={<AdminRoute><DriverExpensesAdmin /></AdminRoute>} />

            {/* 👥 USUARIOS (ADMIN) */}
            <Route path="usuarios" element={<AdminRoute><UsuariosAdmin /></AdminRoute>} />

            {/* 📜 AUDITORÍA (ADMIN) */}
            <Route path="auditoria" element={<AdminRoute><AuditoriaLog /></AdminRoute>} />

            {/* 🩺 SYSTEM HEALTH (ADMIN) */}
            <Route path="system-health" element={<AdminRoute><SystemHealth /></AdminRoute>} />

            {/* 📊 REPORTES (NUEVO) */}
            <Route path="reportes" element={<Reportes />} />
            <Route path="emergencia" element={<ListaEmergencia />} />
            <Route path="visit-notes" element={<VisitNotebook />} />

            {/* 📦 SUSCRIPCIONES */}
            <Route path="suscripciones" element={<Suscripciones />} />

            {/* 🛠 ALQUILERES (equipment rentals) */}
            <Route path="alquileres" element={<Alquileres />} />

            {/* 🧾 TAX / IMPUESTOS */}
            <Route path="tax" element={<AdminRoute><TaxConfig /></AdminRoute>} />
            <Route path="business-info" element={<AdminRoute><BusinessInfoAdmin /></AdminRoute>} />

            {/* 🏢 NUEVO TENANT (ADMIN) */}
            <Route path="admin/new-client" element={<PlatformAdminRoute><CreateTenantManual /></PlatformAdminRoute>} />

            <Route path="*" element={<Navigate to="/" />} />
          </Route>
    </Routes>
    </Suspense>
  );
}
