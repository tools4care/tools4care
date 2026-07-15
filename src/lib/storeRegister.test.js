import { beforeEach, describe, expect, it } from "vitest";
import {
  getStoreDeviceId,
  getStoreRegisterName,
  getStoredStoreCashSessionId,
  setStoreRegisterName,
  setStoredStoreCashSessionId,
} from "./storeRegister";

beforeEach(() => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
});

describe("physical store register identity", () => {
  it("keeps one stable device id for the computer", () => {
    const first = getStoreDeviceId();
    expect(first.length).toBeGreaterThan(6);
    expect(getStoreDeviceId()).toBe(first);
  });

  it("stores the friendly register name", () => {
    expect(getStoreRegisterName()).toBe("Main Register");
    setStoreRegisterName("Front Counter");
    expect(getStoreRegisterName()).toBe("Front Counter");
  });

  it("isolates the active session by store location", () => {
    setStoredStoreCashSessionId("store-a", "session-a");
    setStoredStoreCashSessionId("store-b", "session-b");
    expect(getStoredStoreCashSessionId("store-a")).toBe("session-a");
    expect(getStoredStoreCashSessionId("store-b")).toBe("session-b");
    setStoredStoreCashSessionId("store-a", null);
    expect(getStoredStoreCashSessionId("store-a")).toBeNull();
  });
});
