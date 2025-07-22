import React from "react";

export default function SeleccionProductos({ productos, onAgregarProducto, carrito }) {
  return (
    <div>
      {productos.length === 0 && <p>No products for this van or search.</p>}
      {productos.map((p) => {
        const cantidadEnCarrito = carrito.find(item => item.producto_id === p.producto_id)?.cantidad || 0;
        return (
          <div key={p.producto_id} className="p-2 border-b flex justify-between items-center">
            <div onClick={() => onAgregarProducto(p)} className="flex-1 cursor-pointer">
              <div className="font-bold">{p.productos?.nombre}</div>
              <div className="text-xs text-gray-500">
                Code: {p.productos?.codigo || "N/A"} | Available: {p.cantidad} | Price: ${p.productos?.precio?.toFixed(2)}
              </div>
            </div>
            {cantidadEnCarrito > 0 && (
              <div className="flex items-center gap-2">
                <button>-</button> {/* Here you can add logic to decrease */}
                <span>{cantidadEnCarrito}</span>
                <button>+</button> {/* Here you can add logic to increase */}
                <button className="text-xs text-red-500">Remove</button> {/* Here remove product */}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
