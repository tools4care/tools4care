// src/PaymentCancelled.jsx
export default function PaymentCancelled() {
  const handleRetry = () => {
    window.close();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        {/* Icono de cancelación */}
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
            <svg 
              className="w-12 h-12 text-red-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={3} 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          </div>
        </div>
        
        {/* Título */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Payment Cancelled
        </h1>
        
        {/* Descripción */}
        <p className="text-gray-600 mb-6 text-lg">
          Your payment was cancelled. No charges were made to your account.
        </p>
        
        {/* Instrucciones */}
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800 font-semibold mb-2">
            💡 Need help?
          </p>
          <p className="text-sm text-yellow-700">
            You can close this window and try again, or speak with the cashier for alternative payment methods.
          </p>
        </div>

        {/* Botón de cerrar */}
        <button
          onClick={handleRetry}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
        >
          Close Window
        </button>

        {/* Footer */}
        <div className="pt-6 mt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2">
            Powered by Stripe
          </p>
          <p className="text-sm text-gray-700 font-semibold">
            {import.meta?.env?.VITE_COMPANY_NAME || "Tools4Care"}
          </p>
        </div>
      </div>
    </div>
  );
}