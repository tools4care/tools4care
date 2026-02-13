import { useState, useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import Login from "./Login";
import VanSelector from "./components/VanSelector";
import Dashboard from "./Dashboard";
import Clientes from "./Clientes";
import Productos from "./Productos";
import Inventario from "./Inventario";
import Ventas from "./Ventas";
import CierreVan from "./CierreVan";
import PreCierreVan from "./PreCierreVan";
import Facturas from "./Facturas";
import CuentasPorCobrar from "./CuentasPorCobrar.jsx";
import CreditoSimulador from "./CreditoSimulador";

// === Online ===
import OnlineLayout from "./online/OnlineLayout";
import OnlineDashboard from "./online/OnlineDashboard";
import Orders from "./admin/Orders";
import OnlineCatalog from "./online/OnlineCatalog";
import Checkout from "./storefront/Checkout";
import OnlineDiscounts from "./online/Discounts";

import { NetworkIndicator } from "./components/NetworkIndicator";

// === Storefront público ===
import Storefront from "./storefront/Storefront";
import AuthCallback from "./storefront/AuthCallback";

// 🆕 Payment pages
import PaymentSuccess from "./PaymentSuccess";
import PaymentCancelled from "./PaymentCancelled";

import { UsuarioProvider, useUsuario } from "./UsuarioContext";
import VanProvider, { useVan } from "./hooks/VanContext";


// Suplidores
import Suplidores from "./Suplidores";

// 💰 Comisiones (NUEVO)
import ComisionesPage from './pages/ComisionesPage';

// Componente de carga profesional
const LoadingScreen = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-400/20 rounded-full blur-3xl"></div>

      {/* Contenedor principal de la animación */}
      <div className="relative z-10 text-center">
        {/* Logo con efecto de brillo animado */}
        <div className="mb-8">
          <div className="relative w-32 h-32 mx-auto">
            {/* Efecto de brillo circular */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl opacity-20 animate-pulse"></div>
            
            {/* Logo SVG con animación de suavizado */}
            <svg className="w-20 h-20 text-white absolute inset-0 m-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
            </svg>
          </div>
        </div>

        {/* Título con animación de desvanecimiento gradual */}
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-6 animate-fade-in" style={{ animationDuration: '1.5s' }}>
          TOOLS4CARE
        </h1>

        {/* Línea divisoria animada */}
        <div className="w-64 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent mx-auto mb-6 animate-shimmer" style={{ animationDuration: '2s' }}></div>

        {/* Texto de carga con animación de desvanecimiento */}
        <p className="text-lg text-gray-600 font-medium mb-8 animate-fade-in" style={{ animationDuration: '1.5s', animationDelay: '0.3s' }}>
          Cargando Sistema de Ventas...
        </p>

        {/* Efecto de partículas modernas */}
        <div className="flex justify-center space-x-4 mb-8">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDuration: '1.5s', animationDelay: '0s' }}></div>
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" style={{ animationDuration: '1.5s', animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDuration: '1.5s', animationDelay: '0.4s' }}></div>
        </div>

        {/* Efecto de carga progresiva */}
        <div className="w-64 h-1 bg-gray-200 rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full animate-progress" style={{ animationDuration: '2.5s' }}></div>
        </div>

        {/* Efectos de fondo adicionales sutiles */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-20 w-1 h-1 bg-blue-300 rounded-full animate-float" style={{ animationDuration: '6s' }}></div>
          <div className="absolute top-40 right-32 w-1 h-1 bg-indigo-300 rounded-full animate-float" style={{ animationDuration: '7s', animationDelay: '1s' }}></div>
          <div className="absolute bottom-32 left-40 w-1 h-1 bg-purple-300 rounded-full animate-float" style={{ animationDuration: '8s', animationDelay: '2s' }}></div>
          <div className="absolute bottom-20 right-20 w-1 h-1 bg-pink-300 rounded-full animate-float" style={{ animationDuration: '9s', animationDelay: '3s' }}></div>
        </div>
      </div>
    </div>
  );
};

// Estilos CSS para las animaciones profesionales
const style = document.createElement('style');
style.textContent = `
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes progress {
    from { width: 0%; }
    to { width: 100%; }
  }
  
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  
  @keyframes float {
    0% { transform: translateY(0) translateX(0); opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { transform: translateY(-100px) translateX(30px); opacity: 0; }
  }
  
  .animate-fade-in {
    animation: fade-in;
  }
  
  .animate-progress {
    animation: progress;
  }
  
  .animate-shimmer {
    background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.5), transparent);
    background-size: 200% 100%;
    animation: shimmer;
  }
  
  .animate-float {
    animation: float;
  }
`;
document.head.appendChild(style);

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

  try {
    const raw = JSON.stringify(van).toLowerCase();
    if (raw.includes("online")) return <Navigate to="/online" replace />;
  } catch {}
  return children;
}

function LayoutPrivado() {
  return (
    <div className="min-h-screen bg-gray-50 flex lg:flex-row flex-col">
      <NetworkIndicator />
      
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 pt-4 pb-20 px-2 sm:px-6 transition-all duration-300">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  // Simula la carga inicial de la aplicación
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2500); // 2.5 segundos de carga inicial

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <UsuarioProvider>
      <VanProvider>
        <Routes>
          {/* --- Público: tienda --- */}
          <Route path="/storefront" element={<Storefront />} />
          <Route path="/shop" element={<Navigate to="/storefront" replace />} />
          <Route path="/store" element={<Navigate to="/storefront" replace />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/online/checkout" element={<Navigate to="/checkout" replace />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Payment Success/Cancel Pages */}
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/payment-cancelled" element={<PaymentCancelled />} />

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

          {/* ÁREA ONLINE (protegido) */}
          <Route
            path="/online/*"
            element={
              <PrivateRoute>
                <OnlineLayout />
              </PrivateRoute>
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
            <Route path="suplidores" element={<Suplidores />} />
            
            {/* 💰 COMISIONES (NUEVO) */}
            <Route path="comisiones" element={<ComisionesPage />} />

            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </VanProvider>
    </UsuarioProvider>
  );
}