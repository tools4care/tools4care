import { describe, expect, it } from "vitest";
import {
  LOCATION_TYPES,
  getLocationLabel,
  getLocationType,
  isOnlineLocation,
  isStoreLocation,
  isVanLocation,
} from "./locationTypes";

describe("locationTypes", () => {
  it("prefers the explicit database type", () => {
    expect(getLocationType({ nombre: "Anything", tipo: "store" })).toBe(LOCATION_TYPES.STORE);
  });

  it("keeps old records compatible while the migration rolls out", () => {
    expect(isOnlineLocation({ nombre: "Online Store" })).toBe(true);
    expect(isStoreLocation({ nombre_van: "Physical Store" })).toBe(true);
    expect(isVanLocation({ nombre: "X86-796" })).toBe(true);
  });

  it("uses clear workspace labels", () => {
    expect(getLocationLabel({ tipo: "store" })).toBe("Physical Store");
    expect(getLocationLabel({ tipo: "online" })).toBe("Online Store");
    expect(getLocationLabel({ tipo: "van" })).toBe("VAN / Route");
  });
});
