import { describe, expect, it } from "vitest";
import {
  clearConfirmedLocation,
  loadConfirmedLocation,
  locationSessionKey,
  persistConfirmedLocation,
} from "./locationSession";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

describe("location session confirmation", () => {
  it("does not restore a saved location in a new browser session", () => {
    const persistent = memoryStorage();
    const session = memoryStorage();
    persistent.setItem("tools4care_selected_van", JSON.stringify({ id: "van-a", nombre: "VAN A" }));

    expect(loadConfirmedLocation("user-a", persistent, session)).toBeNull();
  });

  it("restores only the location confirmed by the same user in this session", () => {
    const persistent = memoryStorage();
    const session = memoryStorage();
    persistConfirmedLocation("user-a", { id: "store-a", nombre: "Physical Store" }, persistent, session);

    expect(loadConfirmedLocation("user-a", persistent, session)?.id).toBe("store-a");
    expect(loadConfirmedLocation("user-b", persistent, session)).toBeNull();
    expect(session.getItem(locationSessionKey("user-a"))).toBe("store-a");
  });

  it("clears both current and legacy saved selections", () => {
    const persistent = memoryStorage();
    const session = memoryStorage();
    persistConfirmedLocation("user-a", { id: "van-a" }, persistent, session);
    clearConfirmedLocation("user-a", persistent, session);

    expect(persistent.getItem("tools4care_selected_van")).toBeNull();
    expect(persistent.getItem("van")).toBeNull();
    expect(session.getItem(locationSessionKey("user-a"))).toBeNull();
  });
});
