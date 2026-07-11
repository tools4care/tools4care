import { describe, it, expect, vi } from "vitest";
import { createSubmitGuard, guardAsync } from "./submitGuard";

describe("createSubmitGuard — priority 5: evitar venta duplicada por doble click", () => {
  it("acquires on the first call and blocks a second call before release", () => {
    const guard = createSubmitGuard();
    expect(guard.tryAcquire()).toBe(true);
    expect(guard.tryAcquire()).toBe(false); // simulates the second click while the first is in flight
    expect(guard.isBusy).toBe(true);
  });

  it("allows re-acquiring after release", () => {
    const guard = createSubmitGuard();
    guard.tryAcquire();
    guard.release();
    expect(guard.tryAcquire()).toBe(true);
  });
});

describe("guardAsync — simulating a real double-click on 'Guardar venta'", () => {
  it("runs the underlying save exactly once when two clicks fire nearly simultaneously", async () => {
    const saveSale = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ventaId: "v1" };
    });
    const guardedSave = guardAsync(saveSale);

    // Promise.all fires both calls before either has a chance to finish —
    // exactly what happens on a fast double-click/double-tap.
    const results = await Promise.allSettled([guardedSave(), guardedSave()]);

    expect(saveSale).toHaveBeenCalledTimes(1); // the real bug today: this would be 2
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(results[1].reason.message).toBe("DUPLICATE_SUBMIT_BLOCKED");
  });

  it("allows a second, separate sale after the first one completes", async () => {
    const saveSale = vi.fn(async () => ({ ventaId: "v1" }));
    const guardedSave = guardAsync(saveSale);

    await guardedSave();
    await guardedSave();

    expect(saveSale).toHaveBeenCalledTimes(2);
  });

  it("releases the guard even if the underlying save throws", async () => {
    const failingSave = vi.fn(async () => {
      throw new Error("network error");
    });
    const guardedSave = guardAsync(failingSave);

    await expect(guardedSave()).rejects.toThrow("network error");
    // guard must be released so a retry after a real failure is not permanently blocked
    await expect(guardedSave()).rejects.toThrow("network error");
    expect(failingSave).toHaveBeenCalledTimes(2);
  });
});
