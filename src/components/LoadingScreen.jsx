// src/components/LoadingScreen.jsx - Versión mejorada
import { useState, useEffect } from "react";

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-400/20 rounded-full blur-3xl"></div>

      {/* Logo de carga */}
      <div className="relative z-10 text-center">
        <div className="w-24 h-24 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-lg">
          <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
          </svg>
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