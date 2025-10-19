// src/PaymentSuccess.jsx
export default function PaymentSuccess() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        {/* Icono de éxito */}
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
            <svg 
              className="w-12 h-12 text-green-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={3} 
                d="M5 13l4 4L19 7" 
              />
            </svg>
          </div>
        </div>
        
        {/* Título */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          ✅ Payment Successful!
        </h1>
        
        {/* Descripción */}
        <p className="text-gray-600 mb-6 text-lg">
          Thank you for your payment. Your transaction has been completed successfully.
        </p>
        
        {/* Instrucciones */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800 font-semibold mb-2">
            📱 What's next?
          </p>
          <p className="text-sm text-blue-700">
            You can close this window now. The cashier will complete your purchase and provide your receipt.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-gray-200">
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