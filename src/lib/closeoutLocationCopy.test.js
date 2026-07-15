import { describe, expect, it } from "vitest";
import { getCloseoutLocationCopy } from "./closeoutLocationCopy";

describe("closeout location copy", () => {
  it("uses store terminology for the physical store", () => {
    expect(getCloseoutLocationCopy({ tipo: "store", nombre: "Physical Store" })).toMatchObject({
      typeLabel: "STORE",
      reportTitle: "Store Closeout Report",
      expenseLabel: "Store Expenses",
      countedByLabel: "cashier/admin",
    });
  });

  it("keeps existing van terminology", () => {
    expect(getCloseoutLocationCopy({ tipo: "van", nombre: "X86-796" })).toMatchObject({
      typeLabel: "VAN",
      reportTitle: "Van Closure Report",
      expenseLabel: "Driver Expenses",
      countedByLabel: "driver/admin",
    });
  });
});
