import { beforeEach, describe, expect, it } from "vitest";
import {
  getStoreDeviceId,
  getStoreRegisterName,
  getStoredStoreCashSessionId,
  setStoreRegisterName,
  setStoredStoreCashSessionId,
  selectManagedStoreCashSession,
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

describe("physical store shift recovery", () => {
  const sessions = [
    { id: "own-remote", status: "open", cashier_id: "cashier-a", device_id: "computer-a" },
    { id: "other-local", status: "open", cashier_id: "cashier-b", device_id: "computer-b" },
    { id: "closed", status: "closed", cashier_id: "cashier-a", device_id: "computer-b" },
  ];

  it("recovers the cashier's unfinished shift from another computer", () => {
    expect(selectManagedStoreCashSession(sessions, {
      deviceId: "computer-b",
      cashierId: "cashier-a",
    })?.id).toBe("own-remote");
  });

  it("does not expose another cashier's shift to a regular user", () => {
    expect(selectManagedStoreCashSession([sessions[1]], {
      deviceId: "computer-b",
      cashierId: "cashier-a",
    })).toBeNull();
  });

  it("lets a supervisor explicitly review another cashier's shift", () => {
    expect(selectManagedStoreCashSession(sessions, {
      deviceId: "computer-c",
      cashierId: "supervisor",
      reviewSessionId: "own-remote",
      privileged: true,
    })?.id).toBe("own-remote");
  });

  it("prioritizes the current register over a reviewed remote shift", () => {
    const current = { id: "current", status: "open", cashier_id: "cashier-a", device_id: "computer-b" };
    expect(selectManagedStoreCashSession([...sessions, current], {
      deviceId: "computer-b",
      cashierId: "cashier-a",
      reviewSessionId: "other-local",
      privileged: true,
    })?.id).toBe("current");
  });
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
