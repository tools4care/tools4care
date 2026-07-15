import { isStoreLocation } from "./locationTypes";

export function getCloseoutLocationCopy(location) {
  const store = isStoreLocation(location);
  const name = location?.nombre || location?.nombre_van || location?.alias || (store ? "Store" : "VAN");

  return {
    store,
    name,
    typeLabel: store ? "STORE" : "VAN",
    closeoutTitle: store ? "Store Closeout" : "Van Closeout",
    reportTitle: store ? "Store Closeout Report" : "Van Closure Report",
    filenamePrefix: store ? "StoreCloseout" : "VanClosure",
    precloseFilenamePrefix: store ? "StorePreClose" : "PreClosure",
    expenseLabel: store ? "Store Expenses" : "Driver Expenses",
    countedByLabel: store ? "cashier/admin" : "driver/admin",
  };
}
