import React from "react";

// Chips de "productos habituales" del cliente — basado en frecuencia real de
// recompra (ver useProductosHabituales), no en el ultimo pedido. Tocar un chip
// agrega 1 unidad al carrito reusando handleAddProduct (misma validacion de
// stock/precio que agregar manualmente desde el catalogo).
export default function ProductosHabituales({ productos, onAdd }) {
  if (!productos || productos.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
      <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">
        Usual products for this client
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {productos.map((p) => (
          <button
            key={p.producto_id}
            type="button"
            onClick={() => onAdd(p.producto_id)}
            className={`shrink-0 text-left rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm active:scale-95 transition-all ${
              p.vencido
                ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>{p.vencido ? "⏰" : "🔁"}</span>
              <span className="max-w-[160px] truncate">{p.producto_nombre}</span>
            </div>
            <div className="text-[10px] font-normal text-gray-500 mt-0.5">
              {Math.round(p.ratio_recompra * 100)}% of orders
              {p.dias_desde_ultima_compra != null && ` · ${p.dias_desde_ultima_compra}d ago`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
