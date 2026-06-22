export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-400/20 rounded-full blur-3xl"></div>

      {/* Logo de carga */}
      <div className="relative z-10 text-center">
        <div className="w-24 h-24 bg-white rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-lg ring-1 ring-blue-100">
          <img src="/icons/icon-192.png" alt="Tools4Care" className="h-20 w-20 rounded-2xl object-contain" />
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
          TOOLS4CARE
        </h1>
        
        {/* Animación de puntos de carga */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
          <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div>
          <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div>
        </div>
        
        <p className="text-lg text-gray-600 font-medium">Cargando Sistema de Ventas...</p>
      </div>
    </div>
  );
}
