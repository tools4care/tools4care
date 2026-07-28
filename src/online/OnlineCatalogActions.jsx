// src/online/OnlineCatalogActions.jsx
import { lazy, Suspense, useState } from "react";

const AgregarStockModal = lazy(() => import("../AgregarStockModal"));
const ModalTraspasoStock = lazy(() => import("../ModalTraspasoStock"));

const WAREHOUSE_LOCATION = { key: "warehouse", id: null, nombre: "Central Warehouse", tipo: "warehouse" };

/* ---------- Toolbar de acciones para el Catálogo ---------- */
export default function OnlineCatalogActions({ onlineVanId, onChanged }) {
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const ready = !!onlineVanId;

  const onlineLocation = { key: `van_${onlineVanId}`, id: onlineVanId, nombre: "VAN Online", tipo: "van" };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
          onClick={() => setAddOpen(true)}
          disabled={!ready}
          title={ready ? undefined : "Resolving Online location…"}
        >
          + Add product
        </button>
        <button
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
          onClick={() => setTransferOpen(true)}
          disabled={!ready}
          title={ready ? undefined : "Resolving Online location…"}
        >
          ⇄ Transfer stock
        </button>
      </div>

      {ready && addOpen && (
        <Suspense fallback={null}>
          <AgregarStockModal
            abierto
            cerrar={() => setAddOpen(false)}
            tipo="van"
            ubicacionId={onlineVanId}
            onSuccess={onChanged}
          />
        </Suspense>
      )}

      {ready && transferOpen && (
        <Suspense fallback={null}>
          <ModalTraspasoStock
            abierto
            cerrar={() => setTransferOpen(false)}
            ubicaciones={[WAREHOUSE_LOCATION, onlineLocation]}
            ubicacionActual={WAREHOUSE_LOCATION}
            onSuccess={onChanged}
          />
        </Suspense>
      )}
    </>
  );
}
